import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { scoreFromElapsed } from "@/lib/scoring";

/**
 * POST /api/answer
 * Thí sinh submit / chọn / đổi đáp án.
 * Body:
 *   accessCode: string
 *   questionId: string
 *   selectedOption: 'A'|'B'|'C'|'D'
 *   action: 'select' | 'submit'  (select = lưu nháp, submit = chốt)
 *
 * Server tự tính elapsed_ms từ question_started_at để chống cheat client clock.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { accessCode, questionId, selectedOption, action } = body as {
    accessCode?: string;
    questionId?: string;
    selectedOption?: "A" | "B" | "C" | "D";
    action?: "select" | "submit";
  };
  if (!accessCode || !questionId || !selectedOption || !action) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }
  if (!["A", "B", "C", "D"].includes(selectedOption)) {
    return NextResponse.json({ ok: false, error: "bad option" }, { status: 400 });
  }

  const sb = getServiceClient();
  const { data: contestant } = await sb
    .from("gm_contestant")
    .select("id, round_id, full_name")
    .eq("access_code", accessCode)
    .single();
  if (!contestant) return NextResponse.json({ ok: false, error: "invalid access code" }, { status: 401 });

  const { data: question } = await sb
    .from("gm_question")
    .select("id, round_id, correct_option")
    .eq("id", questionId)
    .single();
  if (!question || question.round_id !== contestant.round_id) {
    return NextResponse.json({ ok: false, error: "question mismatch" }, { status: 400 });
  }

  const { data: state } = await sb
    .from("gm_round_state")
    .select("question_started_at, current_question_id, phase")
    .eq("round_id", contestant.round_id)
    .single();
  if (!state || state.current_question_id !== questionId || state.phase !== "running") {
    return NextResponse.json({ ok: false, error: "question not active" }, { status: 409 });
  }

  const startedAt = state.question_started_at ? new Date(state.question_started_at).getTime() : Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const totalMs = 30_000;
  if (elapsedMs > totalMs + 500) {
    return NextResponse.json({ ok: false, error: "time over" }, { status: 409 });
  }
  const isCorrect = selectedOption === question.correct_option;
  const points = action === "submit" ? scoreFromElapsed(elapsedMs, isCorrect) : 0;

  // Check existing answer (locked = không sửa)
  const { data: existing } = await sb
    .from("gm_answer")
    .select("id, locked, selected_option")
    .eq("question_id", questionId)
    .eq("contestant_id", contestant.id)
    .maybeSingle();
  if (existing?.locked) {
    return NextResponse.json({ ok: false, error: "locked" }, { status: 409 });
  }

  if (existing) {
    await sb
      .from("gm_answer")
      .update({
        selected_option: selectedOption,
        elapsed_ms: elapsedMs,
        is_correct: isCorrect,
        points_awarded: points,
        locked: action === "submit",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await sb.from("gm_answer").insert({
      round_id: contestant.round_id,
      question_id: questionId,
      contestant_id: contestant.id,
      selected_option: selectedOption,
      elapsed_ms: elapsedMs,
      is_correct: isCorrect,
      points_awarded: points,
      locked: action === "submit",
    });
  }

  await sb.from("gm_activity_log").insert({
    round_id: contestant.round_id,
    question_id: questionId,
    contestant_id: contestant.id,
    actor: "contestant",
    action: action === "submit" ? "submit" : existing ? "change_option" : "select_option",
    payload: {
      selectedOption,
      isCorrect,
      previous: existing?.selected_option ?? null,
      points: action === "submit" ? points : null,
    },
    elapsed_ms: elapsedMs,
  });

  return NextResponse.json({
    ok: true,
    submitted: action === "submit",
    elapsedMs,
    points,
    isCorrect: action === "submit" ? isCorrect : undefined,
  });
}
