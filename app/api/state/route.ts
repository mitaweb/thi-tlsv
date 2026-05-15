import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/state
 * Body:
 *  - roundId (required)
 *  - action: 'goto' | 'start' | 'reveal' | 'leaderboard' | 'idle' | 'toggle_scoreboard'
 *  - questionId (cho action='goto')
 *
 * Admin-only (cookie).
 */
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { roundId, action, questionId } = body as {
    roundId: string;
    action: string;
    questionId?: string;
  };
  if (!roundId || !action) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  const sb = getServiceClient();
  const { data: cur } = await sb.from("gm_round_state").select("*").eq("round_id", roundId).maybeSingle();
  if (!cur) {
    await sb.from("gm_round_state").insert({ round_id: roundId, phase: "idle" });
  }

  let patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (action) {
    case "goto":
      if (!questionId) {
        return NextResponse.json({ ok: false, error: "missing questionId" }, { status: 400 });
      }
      patch = { ...patch, current_question_id: questionId, phase: "running", question_started_at: new Date().toISOString() };
      break;
    case "start":
      patch = { ...patch, phase: "running", question_started_at: new Date().toISOString() };
      break;
    case "reveal": {
      patch = { ...patch, phase: "reveal" };
      // Khi reveal: lock all answers cho câu hiện tại + auto-insert "no-answer" cho thí sinh chưa submit
      const state = cur ?? (await sb.from("gm_round_state").select("*").eq("round_id", roundId).single()).data;
      const qid = state?.current_question_id;
      if (qid) {
        const { data: q } = await sb.from("gm_question").select("correct_option").eq("id", qid).single();
        const { data: contestants } = await sb.from("gm_contestant").select("id").eq("round_id", roundId);
        const { data: answered } = await sb.from("gm_answer").select("contestant_id").eq("question_id", qid);
        const answeredSet = new Set((answered ?? []).map((a) => a.contestant_id));
        const missing =
          (contestants ?? [])
            .filter((c) => !answeredSet.has(c.id))
            .map((c) => ({
              round_id: roundId,
              question_id: qid,
              contestant_id: c.id,
              selected_option: null,
              elapsed_ms: 30_000,
              is_correct: false,
              points_awarded: 0,
              locked: true,
            })) ?? [];
        if (missing.length) await sb.from("gm_answer").insert(missing);
        // Lock tất cả answer của câu này
        await sb.from("gm_answer").update({ locked: true }).eq("question_id", qid);
        // Log
        await sb.from("gm_activity_log").insert({
          round_id: roundId,
          question_id: qid,
          actor: "admin",
          action: "reveal",
          payload: { correct: q?.correct_option },
        });
      }
      break;
    }
    case "leaderboard":
      patch = { ...patch, phase: "leaderboard", show_scoreboard: true };
      break;
    case "idle":
      patch = { ...patch, phase: "idle" };
      break;
    case "toggle_scoreboard":
      patch = { ...patch, show_scoreboard: !(cur?.show_scoreboard ?? false) };
      break;
    default:
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  }

  const { error } = await sb.from("gm_round_state").update(patch).eq("round_id", roundId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await sb.from("gm_activity_log").insert({
    round_id: roundId,
    actor: "admin",
    action: `phase_${action}`,
    payload: { patch },
  });

  return NextResponse.json({ ok: true });
}
