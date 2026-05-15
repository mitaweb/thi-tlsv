import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

/**
 * POST /api/panel-score
 * Body: { accessCode, roundId, scores: { contestantId: number, ... } }
 *
 * Giám khảo submit TOÀN BỘ điểm cho 1 vòng (1 lần duy nhất).
 * Validate:
 *   - Judge exists & active
 *   - Round exists, kind in ('panel','debate')
 *   - Council judge chỉ chấm vòng có scoring_config.council.enabled=true
 *   - Có đủ điểm cho TẤT CẢ thí sinh trong group
 *   - Mỗi điểm là integer 0 ≤ score ≤ max (theo role)
 *   - Judge chưa submit vòng này (gm_panel_submission)
 *
 * Hành động:
 *   - Insert/upsert vào gm_panel_score (locked=true)
 *   - Insert gm_panel_submission
 *   - Insert N+1 log entries (1 judge_submit + N judge_score)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { accessCode, roundId, scores } = body as {
    accessCode?: string;
    roundId?: string;
    scores?: Record<string, number>;
  };

  if (!accessCode || !roundId || !scores || typeof scores !== "object") {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  const sb = getServiceClient();

  // 1. Validate judge
  const { data: judge } = await sb
    .from("gm_judge")
    .select("id, display_name, role, active")
    .eq("access_code", accessCode)
    .maybeSingle();
  if (!judge || !judge.active) {
    return NextResponse.json({ ok: false, error: "invalid_access_code" }, { status: 401 });
  }

  // 2. Validate round + scoring config
  const { data: round } = await sb
    .from("gm_round")
    .select("id, name, kind, group_id, scoring_config")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ ok: false, error: "round_not_found" }, { status: 404 });
  if (round.kind !== "panel" && round.kind !== "debate") {
    return NextResponse.json({ ok: false, error: "round_not_scorable" }, { status: 400 });
  }

  const cfg = round.scoring_config ?? {};
  const isBgk = judge.role === "bgk";
  const isCouncil = judge.role === "sv_council";
  const councilEnabled = !!cfg.council?.enabled;

  if (isCouncil && !councilEnabled) {
    return NextResponse.json({ ok: false, error: "council_not_allowed_in_round" }, { status: 403 });
  }
  const maxScore = isBgk ? (cfg.bgk?.max ?? 100) : (cfg.council?.max ?? 30);

  // 3. Check chưa submit
  const { data: existingSub } = await sb
    .from("gm_panel_submission")
    .select("round_id")
    .eq("round_id", roundId)
    .eq("judge_id", judge.id)
    .maybeSingle();
  if (existingSub) {
    return NextResponse.json({ ok: false, error: "already_submitted" }, { status: 409 });
  }

  // 4. Lấy danh sách thí sinh trong group (debate: chỉ 3 thí sinh đầu)
  let contestantQuery = sb.from("gm_contestant").select("id, full_name, display_order");
  if (round.group_id) contestantQuery = contestantQuery.eq("group_id", round.group_id);
  else contestantQuery = contestantQuery.eq("round_id", roundId);
  const { data: rawContestants } = await contestantQuery.order("display_order");
  let contestants = rawContestants ?? [];
  if (round.kind === "debate") contestants = contestants.slice(0, 3);

  if (!contestants.length) {
    return NextResponse.json({ ok: false, error: "no_contestants" }, { status: 500 });
  }

  // 5. Validate đủ điểm cho TẤT CẢ thí sinh
  for (const c of contestants) {
    const s = scores[c.id];
    if (s === undefined || s === null) {
      return NextResponse.json({ ok: false, error: `missing_score_for_${c.full_name}` }, { status: 400 });
    }
    if (!Number.isInteger(s)) {
      return NextResponse.json({ ok: false, error: `score_not_integer_for_${c.full_name}` }, { status: 400 });
    }
    if (s < 0 || s > maxScore) {
      return NextResponse.json({ ok: false, error: `score_out_of_range_${s}_for_${c.full_name}` }, { status: 400 });
    }
  }

  // 6. Insert scores + submission + logs (parallel)
  const submittedAt = new Date().toISOString();
  const scoreRows = contestants.map((c) => ({
    round_id: roundId,
    contestant_id: c.id,
    judge_id: judge.id,
    score: scores[c.id],
    locked: true,
    submitted_at: submittedAt,
  }));

  const logRows = contestants.map((c) => ({
    round_id: roundId,
    contestant_id: c.id,
    actor: "judge",
    action: "judge_score",
    payload: {
      judgeId: judge.id,
      judgeName: judge.display_name,
      role: judge.role,
      score: scores[c.id],
      maxScore,
    },
  }));

  const [scoreRes, subRes] = await Promise.all([
    sb.from("gm_panel_score").upsert(scoreRows, { onConflict: "round_id,contestant_id,judge_id" }),
    sb.from("gm_panel_submission").insert({ round_id: roundId, judge_id: judge.id, submitted_at: submittedAt }),
  ]);

  if (scoreRes.error) return NextResponse.json({ ok: false, error: scoreRes.error.message }, { status: 500 });
  if (subRes.error) return NextResponse.json({ ok: false, error: subRes.error.message }, { status: 500 });

  // Log summary + per-contestant (fire & forget để đỡ chặn response)
  sb.from("gm_activity_log").insert([
    {
      round_id: roundId,
      actor: "judge",
      action: "judge_submit",
      payload: {
        judgeId: judge.id,
        judgeName: judge.display_name,
        role: judge.role,
        count: contestants.length,
      },
    },
    ...logRows,
  ]).then(() => {});

  return NextResponse.json({ ok: true });
}
