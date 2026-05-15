import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/reset
 * Body: { roundId: string }
 *
 * Reset toàn bộ điểm + trạng thái của 1 vòng. Xử lý theo `round.kind`:
 *   - quiz:   xóa gm_answer, gm_powerup_use, reset gm_round_state (phase=idle, question_no=0, current_question_id=null)
 *   - panel:  xóa gm_panel_score, gm_panel_submission, reset gm_round_state về idle
 *   - debate: xóa gm_panel_score, gm_panel_submission, reset gm_round_state (kể cả debate_*)
 *
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { roundId } = body as { roundId?: string };
  if (!roundId) {
    return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });
  }

  const sb = getServiceClient();

  // Lấy kind của vòng
  const { data: round } = await sb.from("gm_round").select("id, name, kind").eq("id", roundId).maybeSingle();
  if (!round) return NextResponse.json({ ok: false, error: "round_not_found" }, { status: 404 });

  const kind = round.kind;
  const ops: any[] = [];

  if (kind === "quiz") {
    ops.push(sb.from("gm_answer").delete().eq("round_id", roundId).then((r) => r));
    ops.push(sb.from("gm_powerup_use").delete().eq("round_id", roundId).then((r) => r));
  } else if (kind === "panel" || kind === "debate") {
    ops.push(sb.from("gm_panel_score").delete().eq("round_id", roundId).then((r) => r));
    ops.push(sb.from("gm_panel_submission").delete().eq("round_id", roundId).then((r) => r));
  }

  // Reset gm_round_state
  const stateReset: Record<string, unknown> = {
    phase: "idle",
    current_question_id: null,
    question_started_at: null,
    question_no: 0,
    show_scoreboard: false,
    updated_at: new Date().toISOString(),
  };
  if (kind === "debate") {
    stateReset.debate_match = null;
    stateReset.debate_phase = null;
    stateReset.debate_started_at = null;
    stateReset.debate_duration_sec = null;
  }
  ops.push(sb.from("gm_round_state").update(stateReset).eq("round_id", roundId).then((r) => r));

  const results = await Promise.all(ops);
  for (const r of results) {
    if (r?.error) {
      return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
    }
  }

  // Ghi log
  await sb.from("gm_activity_log").insert({
    round_id: roundId,
    actor: "admin",
    action: "reset_round",
    payload: { roundId, roundName: round.name, kind },
  });

  return NextResponse.json({ ok: true, kind, roundName: round.name });
}
