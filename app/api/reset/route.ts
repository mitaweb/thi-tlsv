import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/reset
 * Body:
 *   - { roundId: string } → reset 1 vòng theo kind
 *   - { all: true }       → reset TOÀN BỘ hệ thống (giữ lại thí sinh + câu hỏi)
 *
 * Reset 1 vòng:
 *   - quiz:   xóa gm_answer, gm_powerup_use; reset gm_round_state về idle
 *   - panel:  xóa gm_panel_score, gm_panel_submission; reset gm_round_state về idle
 *   - debate: như panel + clear debate_*
 *   - luôn xóa activity log của vòng đó
 *
 * Reset toàn bộ:
 *   - Xóa tất cả gm_answer, gm_powerup_use, gm_panel_score, gm_panel_submission, gm_activity_log
 *   - Reset tất cả gm_round_state về idle (kể cả debate_*)
 *   - Clear gm_display_state.current_round_id
 *   - GIỮ LẠI: gm_round, gm_contestant, gm_question, gm_judge, gm_group
 *
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { roundId, all } = body as { roundId?: string; all?: boolean };

  const sb = getServiceClient();

  // ── Reset TOÀN BỘ ──────────────────────────────────────────────────────
  if (all) {
    const ops: any[] = [
      sb.from("gm_answer").delete().gte("created_at", "1970-01-01").then((r) => r),
      sb.from("gm_powerup_use").delete().gte("created_at", "1970-01-01").then((r) => r),
      sb.from("gm_panel_score").delete().gte("created_at", "1970-01-01").then((r) => r),
      sb.from("gm_panel_submission").delete().gte("submitted_at", "1970-01-01").then((r) => r),
      sb.from("gm_activity_log").delete().gte("id", 0).then((r) => r),
    ];
    const delResults = await Promise.all(ops);
    for (const r of delResults) {
      if (r?.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
    }

    // Reset tất cả gm_round_state về idle
    const { error: stErr } = await sb.from("gm_round_state").update({
      phase: "idle",
      current_question_id: null,
      question_started_at: null,
      question_no: 0,
      show_scoreboard: false,
      debate_match: null,
      debate_phase: null,
      debate_started_at: null,
      debate_duration_sec: null,
      updated_at: new Date().toISOString(),
    }).gte("updated_at", "1970-01-01");
    if (stErr) return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });

    // Clear màn chiếu hiện tại
    await sb.from("gm_display_state").update({
      current_round_id: null,
      show_scoreboard: false,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    return NextResponse.json({ ok: true, mode: "all" });
  }

  // ── Reset 1 vòng ───────────────────────────────────────────────────────
  if (!roundId) {
    return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });
  }

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

  // Xóa toàn bộ activity log của vòng này
  ops.push(sb.from("gm_activity_log").delete().eq("round_id", roundId).then((r) => r));

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
