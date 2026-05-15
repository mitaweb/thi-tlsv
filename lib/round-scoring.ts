/**
 * Hàm tính điểm cho từng vòng theo `round.kind` + điểm tích lũy (cumulative).
 * Dùng chung cho:
 *   - /api/round-leaderboard (BXH với cột "vòng" + "tổng")
 *   - /api/contestant-totals (header thí sinh hiển thị tổng tích lũy)
 *   - PanelRoundControl trong admin
 *
 * Quy tắc:
 *   - kind='quiz':   SUM(gm_answer.points_awarded) WHERE locked=true
 *   - kind='panel':
 *       - bgk_avg = avg(scores của BGK đã submit) — làm tròn integer
 *       - council_avg (nếu enabled) = avg(scores của SV council đã submit)
 *       - round_score = bgk_avg + council_avg
 *   - kind='debate': giống panel (chỉ BGK, không council)
 *
 * Cumulative = SUM(round_score của tất cả vòng trong group có display_order ≤ vòng hiện tại)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundKind, RoundLeaderboardRow } from "./types";

interface RoundMeta {
  id: string;
  group_id: string | null;
  kind: RoundKind;
  display_order: number;
  scoring_config: any;
}

/** Lấy meta của vòng (id, group_id, kind, display_order, scoring_config) */
async function getRoundMeta(sb: SupabaseClient, roundId: string): Promise<RoundMeta | null> {
  const { data } = await sb
    .from("gm_round")
    .select("id, group_id, kind, display_order, scoring_config")
    .eq("id", roundId)
    .maybeSingle();
  return (data as RoundMeta | null) ?? null;
}

/** Lấy tất cả thí sinh trong cùng group (fallback: cùng round_id nếu group_id null) */
export async function getContestantsForRound(sb: SupabaseClient, roundId: string) {
  const round = await getRoundMeta(sb, roundId);
  if (!round) return [];
  let query = sb.from("gm_contestant").select("id, display_order, full_name, organization, group_id, round_id");
  if (round.group_id) {
    query = query.eq("group_id", round.group_id);
  } else {
    query = query.eq("round_id", roundId);
  }
  const { data } = await query.order("display_order");
  return data ?? [];
}

/** Tính điểm 1 vòng cho 1 thí sinh (theo kind) */
export async function computeRoundScore(
  sb: SupabaseClient,
  roundId: string,
  contestantId: string,
): Promise<number> {
  const round = await getRoundMeta(sb, roundId);
  if (!round) return 0;
  if (round.kind === "quiz") {
    return computeQuizScore(sb, roundId, contestantId);
  }
  // panel + debate dùng chung logic chấm điểm
  return computePanelScore(sb, round, contestantId);
}

/** Quiz: tổng điểm các câu trả lời đã locked */
async function computeQuizScore(sb: SupabaseClient, roundId: string, contestantId: string): Promise<number> {
  const { data } = await sb
    .from("gm_answer")
    .select("points_awarded")
    .eq("round_id", roundId)
    .eq("contestant_id", contestantId)
    .eq("locked", true);
  return (data ?? []).reduce((s, a: any) => s + (a.points_awarded ?? 0), 0);
}

/** Panel/Debate: avg BGK + avg council (chỉ tính judge đã submit) */
async function computePanelScore(sb: SupabaseClient, round: RoundMeta, contestantId: string): Promise<number> {
  // Lấy danh sách judge đã submit cho vòng này
  const { data: submissions } = await sb
    .from("gm_panel_submission")
    .select("judge_id")
    .eq("round_id", round.id);
  const submittedJudgeIds = new Set((submissions ?? []).map((s: any) => s.judge_id));
  if (submittedJudgeIds.size === 0) return 0;

  // Lấy scores của các judge đã submit
  const { data: scores } = await sb
    .from("gm_panel_score")
    .select("score, judge_id, gm_judge!inner(role)")
    .eq("round_id", round.id)
    .eq("contestant_id", contestantId)
    .in("judge_id", Array.from(submittedJudgeIds));

  const bgkScores: number[] = [];
  const councilScores: number[] = [];
  for (const s of (scores ?? [])) {
    const role = (s as any).gm_judge?.role;
    if (role === "bgk") bgkScores.push((s as any).score ?? 0);
    else if (role === "sv_council") councilScores.push((s as any).score ?? 0);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const bgkAvg = Math.round(avg(bgkScores));
  const councilEnabled = !!round.scoring_config?.council?.enabled;
  const councilAvg = councilEnabled ? Math.round(avg(councilScores)) : 0;

  return bgkAvg + councilAvg;
}

/** Tính điểm tích lũy đến HẾT vòng hiện tại (bao gồm vòng đó) */
export async function computeCumulativeScore(
  sb: SupabaseClient,
  roundId: string,
  contestantId: string,
): Promise<number> {
  const round = await getRoundMeta(sb, roundId);
  if (!round || !round.group_id) {
    // Không có group → chỉ tính vòng này
    return computeRoundScore(sb, roundId, contestantId);
  }
  const { data: rounds } = await sb
    .from("gm_round")
    .select("id, display_order")
    .eq("group_id", round.group_id)
    .lte("display_order", round.display_order);

  let total = 0;
  for (const r of (rounds ?? [])) {
    total += await computeRoundScore(sb, (r as any).id, contestantId);
  }
  return total;
}

/** Tính điểm tích lũy TRƯỚC vòng hiện tại (không bao gồm vòng đó) — dùng cho "tổng xuất phát" của thí sinh */
export async function computeCumulativeBefore(
  sb: SupabaseClient,
  roundId: string,
  contestantId: string,
): Promise<{ total: number; breakdown: Array<{ round_id: string; round_name: string; score: number }> }> {
  const round = await getRoundMeta(sb, roundId);
  if (!round || !round.group_id) return { total: 0, breakdown: [] };

  const { data: rounds } = await sb
    .from("gm_round")
    .select("id, name, display_order")
    .eq("group_id", round.group_id)
    .lt("display_order", round.display_order)
    .order("display_order");

  let total = 0;
  const breakdown: Array<{ round_id: string; round_name: string; score: number }> = [];
  for (const r of (rounds ?? [])) {
    const s = await computeRoundScore(sb, (r as any).id, contestantId);
    total += s;
    breakdown.push({ round_id: (r as any).id, round_name: (r as any).name, score: s });
  }
  return { total, breakdown };
}

/** BXH 1 vòng: trả về [{round_score, cumulative_score, ...}] cho tất cả thí sinh trong group */
export async function computeLeaderboard(sb: SupabaseClient, roundId: string): Promise<RoundLeaderboardRow[]> {
  const contestants = await getContestantsForRound(sb, roundId);
  const rows: RoundLeaderboardRow[] = [];
  for (const c of contestants) {
    const round_score = await computeRoundScore(sb, roundId, (c as any).id);
    const cumulative_score = await computeCumulativeScore(sb, roundId, (c as any).id);
    rows.push({
      contestant_id: (c as any).id,
      display_order: (c as any).display_order,
      full_name: (c as any).full_name,
      organization: (c as any).organization,
      round_score,
      cumulative_score,
    });
  }
  // Sort theo cumulative DESC, fallback display_order
  rows.sort((a, b) => b.cumulative_score - a.cumulative_score || a.display_order - b.display_order);
  return rows;
}
