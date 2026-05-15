/**
 * Tính điểm cho từng vòng theo `round.kind` + điểm tích lũy (cumulative).
 *
 * Dùng chung cho:
 *   - /api/round-leaderboard (BXH 2 cột: vòng + tổng)
 *   - /api/contestant-totals (header thí sinh hiển thị tổng tích lũy)
 *   - PanelRoundControl / màn /screen
 *
 * Quy tắc tính `round_score`:
 *   - kind='quiz':   SUM(gm_answer.points_awarded) WHERE locked=true
 *   - kind='panel':
 *       - bgk_avg = round(avg(scores của BGK đã submit))
 *       - council_avg (nếu enabled) = round(avg(scores của Hội đồng SV đã submit))
 *       - round_score = bgk_avg + council_avg
 *   - kind='debate': giống panel (chỉ BGK)
 *
 * Cumulative = SUM(round_score của tất cả vòng cùng group có display_order ≤ vòng hiện tại).
 *
 * Tối ưu: tất cả compute đều BATCH 5-6 query song song (không loop, không embedded join)
 * để tránh chậm khi nhiều thí sinh + nhiều vòng.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundKind, RoundLeaderboardRow } from "./types";

interface RoundMeta {
  id: string;
  group_id: string | null;
  kind: RoundKind;
  display_order: number;
  scoring_config: any;
  name?: string;
}

interface BatchedData {
  rounds: RoundMeta[];                    // tất cả vòng liên quan (current + prior in group)
  contestants: Array<{
    id: string;
    display_order: number;
    full_name: string;
    organization: string | null;
  }>;
  panelScores: Array<{ round_id: string; contestant_id: string; judge_id: string; score: number }>;
  submittedJudgesByRound: Map<string, Set<string>>;  // round_id → Set<judge_id đã submit>
  judgeRole: Map<string, "bgk" | "sv_council">;       // judge_id → role
  quizPoints: Map<string, number>;                    // "round_id|contestant_id" → sum points
}

/** Load 1 lần tất cả data cần thiết cho computeLeaderboard / computeCumulative. */
async function loadBatch(sb: SupabaseClient, roundId: string): Promise<BatchedData | null> {
  // 1. Get current round meta
  const { data: round } = await sb
    .from("gm_round")
    .select("id, group_id, kind, display_order, scoring_config, name")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return null;

  // 2. Get all rounds in same group với display_order ≤ current (parallel với contestants + judges)
  const groupFilter = (q: any) => round.group_id ? q.eq("group_id", round.group_id) : q.eq("id", roundId);

  const [roundsRes, contestantsRes, judgesRes] = await Promise.all([
    groupFilter(
      sb.from("gm_round").select("id, group_id, kind, display_order, scoring_config, name").lte("display_order", round.display_order)
    ),
    groupFilter(
      sb.from("gm_contestant").select("id, display_order, full_name, organization, group_id, round_id").order("display_order")
    ),
    sb.from("gm_judge").select("id, role"),
  ]);

  const allRounds = (roundsRes.data ?? []) as RoundMeta[];
  let contestants = (contestantsRes.data ?? []) as any[];
  const judges = (judgesRes.data ?? []) as any[];

  // Fallback: nếu group filter trả empty contestants (data chưa migrate group_id), lấy theo round_id của quiz round
  if (contestants.length === 0 && round.group_id) {
    const quizRound = allRounds.find((r) => r.kind === "quiz");
    if (quizRound) {
      const { data } = await sb
        .from("gm_contestant")
        .select("id, display_order, full_name, organization, group_id, round_id")
        .eq("round_id", quizRound.id)
        .order("display_order");
      contestants = data ?? [];
    }
  }

  const roundIds = allRounds.map((r) => r.id);
  if (roundIds.length === 0) {
    return {
      rounds: allRounds, contestants,
      panelScores: [], submittedJudgesByRound: new Map(),
      judgeRole: new Map(), quizPoints: new Map(),
    };
  }

  // 3. Batch fetch panel_score + panel_submission + gm_answer (parallel)
  const [scoresRes, subsRes, answersRes] = await Promise.all([
    sb.from("gm_panel_score").select("round_id, contestant_id, judge_id, score").in("round_id", roundIds),
    sb.from("gm_panel_submission").select("round_id, judge_id").in("round_id", roundIds),
    sb.from("gm_answer").select("round_id, contestant_id, points_awarded").in("round_id", roundIds).eq("locked", true),
  ]);

  const panelScores = (scoresRes.data ?? []) as any[];
  const submissions = (subsRes.data ?? []) as any[];
  const answers = (answersRes.data ?? []) as any[];

  // Build maps
  const judgeRole = new Map<string, "bgk" | "sv_council">();
  for (const j of judges) judgeRole.set(j.id, j.role);

  const submittedJudgesByRound = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (!submittedJudgesByRound.has(s.round_id)) submittedJudgesByRound.set(s.round_id, new Set());
    submittedJudgesByRound.get(s.round_id)!.add(s.judge_id);
  }

  const quizPoints = new Map<string, number>();
  for (const a of answers) {
    const key = `${a.round_id}|${a.contestant_id}`;
    quizPoints.set(key, (quizPoints.get(key) ?? 0) + (a.points_awarded ?? 0));
  }

  return { rounds: allRounds, contestants, panelScores, submittedJudgesByRound, judgeRole, quizPoints };
}

/** Tính round_score(rId, cId) từ batched data (pure in-memory) */
function roundScoreFromBatch(b: BatchedData, rId: string, cId: string): number {
  const r = b.rounds.find((x) => x.id === rId);
  if (!r) return 0;
  if (r.kind === "quiz") {
    return b.quizPoints.get(`${rId}|${cId}`) ?? 0;
  }
  // panel / debate
  const submitted = b.submittedJudgesByRound.get(rId) ?? new Set();
  if (submitted.size === 0) return 0;

  const relevant = b.panelScores.filter(
    (p) => p.round_id === rId && p.contestant_id === cId && submitted.has(p.judge_id),
  );
  const bgkScores: number[] = [];
  const councilScores: number[] = [];
  for (const p of relevant) {
    const role = b.judgeRole.get(p.judge_id);
    if (role === "bgk") bgkScores.push(p.score ?? 0);
    else if (role === "sv_council") councilScores.push(p.score ?? 0);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const bgkAvg = Math.round(avg(bgkScores));
  const councilEnabled = !!r.scoring_config?.council?.enabled;
  const councilAvg = councilEnabled ? Math.round(avg(councilScores)) : 0;
  return bgkAvg + councilAvg;
}

/** API: BXH cho 1 vòng với cumulative */
export async function computeLeaderboard(
  sb: SupabaseClient,
  roundId: string,
): Promise<RoundLeaderboardRow[]> {
  const batch = await loadBatch(sb, roundId);
  if (!batch) return [];

  // Cho vòng debate: chỉ lấy top 3 theo cumulative của vòng TRƯỚC liền kề
  const currentRound = batch.rounds.find((r) => r.id === roundId);
  let contestants = batch.contestants;
  if (currentRound?.kind === "debate") {
    const topIds = await getTop3IdsForDebate(sb, roundId);
    contestants = batch.contestants.filter((c) => topIds.includes(c.id));
  }

  const rows: RoundLeaderboardRow[] = contestants.map((c) => {
    const round_score = roundScoreFromBatch(batch, roundId, c.id);
    const cumulative_score = batch.rounds.reduce(
      (sum, r) => sum + roundScoreFromBatch(batch, r.id, c.id),
      0,
    );
    return {
      contestant_id: c.id,
      display_order: c.display_order,
      full_name: c.full_name,
      organization: c.organization,
      round_score,
      cumulative_score,
    };
  });

  // Debate sort theo round_score DESC, các vòng khác theo cumulative DESC
  if (currentRound?.kind === "debate") {
    rows.sort((a, b) => b.round_score - a.round_score || a.display_order - b.display_order);
  } else {
    rows.sort((a, b) => b.cumulative_score - a.cumulative_score || a.display_order - b.display_order);
  }
  return rows;
}

/**
 * Lấy IDs của top 3 thí sinh tham gia debate.
 * Top 3 = top 3 cumulative_score qua vòng LIỀN KỀ TRƯỚC debate.
 * Fallback: nếu không có vòng trước, lấy 3 thí sinh đầu theo display_order.
 */
export async function getTop3IdsForDebate(
  sb: SupabaseClient,
  debateRoundId: string,
): Promise<string[]> {
  const top = await getTop3ForDebate(sb, debateRoundId);
  return top.map((r) => r.contestant_id);
}

/** Lấy thông tin chi tiết top 3 (full_name, cumulative qua vòng trước) cho UI hiển thị. */
export async function getTop3ForDebate(
  sb: SupabaseClient,
  debateRoundId: string,
): Promise<RoundLeaderboardRow[]> {
  // Lấy meta vòng debate
  const { data: round } = await sb
    .from("gm_round")
    .select("group_id, display_order")
    .eq("id", debateRoundId)
    .maybeSingle();
  if (!round || !round.group_id) return [];

  // Tìm vòng liền kề trước
  const { data: priorRounds } = await sb
    .from("gm_round")
    .select("id, display_order")
    .eq("group_id", round.group_id)
    .lt("display_order", round.display_order)
    .order("display_order", { ascending: false })
    .limit(1);

  if (!priorRounds?.length) {
    // Fallback: chưa có vòng nào trước → 3 thí sinh đầu theo display_order
    const { data: cs } = await sb
      .from("gm_contestant")
      .select("id, display_order, full_name, organization")
      .eq("group_id", round.group_id)
      .order("display_order")
      .limit(3);
    return (cs ?? []).map((c: any) => ({
      contestant_id: c.id,
      display_order: c.display_order,
      full_name: c.full_name,
      organization: c.organization,
      round_score: 0,
      cumulative_score: 0,
    }));
  }

  // Lấy BXH vòng liền kề trước (cumulative qua vòng đó) → top 3
  const lb = await computeLeaderboard(sb, priorRounds[0].id);
  return lb.slice(0, 3);
}

/** API: tổng tích lũy TRƯỚC vòng hiện tại (không bao gồm vòng đó) + breakdown */
export async function computeCumulativeBefore(
  sb: SupabaseClient,
  roundId: string,
  contestantId: string,
): Promise<{ total: number; breakdown: Array<{ round_id: string; round_name: string; score: number }> }> {
  // Lấy meta vòng hiện tại
  const { data: round } = await sb
    .from("gm_round")
    .select("id, group_id, display_order")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || !round.group_id) return { total: 0, breakdown: [] };

  // Lấy các vòng TRƯỚC (display_order < current)
  const { data: priorRounds } = await sb
    .from("gm_round")
    .select("id, kind, display_order, scoring_config, name")
    .eq("group_id", round.group_id)
    .lt("display_order", round.display_order)
    .order("display_order");

  if (!priorRounds?.length) return { total: 0, breakdown: [] };

  const roundIds = priorRounds.map((r: any) => r.id);

  // Batch fetch
  const [scoresRes, subsRes, answersRes, judgesRes] = await Promise.all([
    sb.from("gm_panel_score").select("round_id, contestant_id, judge_id, score").in("round_id", roundIds).eq("contestant_id", contestantId),
    sb.from("gm_panel_submission").select("round_id, judge_id").in("round_id", roundIds),
    sb.from("gm_answer").select("round_id, points_awarded").in("round_id", roundIds).eq("contestant_id", contestantId).eq("locked", true),
    sb.from("gm_judge").select("id, role"),
  ]);

  const batch: BatchedData = {
    rounds: priorRounds as RoundMeta[],
    contestants: [],
    panelScores: (scoresRes.data ?? []) as any[],
    submittedJudgesByRound: new Map(),
    judgeRole: new Map(),
    quizPoints: new Map(),
  };
  for (const j of (judgesRes.data ?? []) as any[]) batch.judgeRole.set(j.id, j.role);
  for (const s of (subsRes.data ?? []) as any[]) {
    if (!batch.submittedJudgesByRound.has(s.round_id)) batch.submittedJudgesByRound.set(s.round_id, new Set());
    batch.submittedJudgesByRound.get(s.round_id)!.add(s.judge_id);
  }
  for (const a of (answersRes.data ?? []) as any[]) {
    const key = `${a.round_id}|${contestantId}`;
    batch.quizPoints.set(key, (batch.quizPoints.get(key) ?? 0) + (a.points_awarded ?? 0));
  }

  let total = 0;
  const breakdown: Array<{ round_id: string; round_name: string; score: number }> = [];
  for (const r of priorRounds as any[]) {
    const score = roundScoreFromBatch(batch, r.id, contestantId);
    total += score;
    breakdown.push({ round_id: r.id, round_name: r.name, score });
  }
  return { total, breakdown };
}
