import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";
import { scoreFromElapsed } from "@/lib/scoring";

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
      // Chỉ tăng question_no nếu chuyển sang câu khác (tránh double-count nếu bấm lại câu cũ)
      const prevQId = cur?.current_question_id;
      const newQNo = prevQId === questionId
        ? (cur?.question_no ?? 1)
        : (cur?.question_no ?? 0) + 1;
      patch = {
        ...patch,
        current_question_id: questionId,
        phase: "running",
        question_started_at: new Date().toISOString(),
        question_no: newQNo,
      };
      // Gán power-up đang pending (question_id = null) vào câu mới này
      // Thí sinh đã kích hoạt trước đó sẽ được nhân điểm ở câu này
      await sb
        .from("gm_powerup_use")
        .update({ question_id: questionId })
        .eq("round_id", roundId)
        .is("question_id", null);
      break;
    case "start":
      patch = { ...patch, phase: "running", question_started_at: new Date().toISOString() };
      break;
    case "reveal": {
      patch = { ...patch, phase: "reveal" };
      const state = cur ?? (await sb.from("gm_round_state").select("*").eq("round_id", roundId).single()).data;
      const qid = state?.current_question_id;
      if (qid) {
        const { data: q } = await sb.from("gm_question").select("correct_option").eq("id", qid).single();
        const { data: contestants } = await sb.from("gm_contestant").select("id").eq("round_id", roundId);
        const { data: answered } = await sb.from("gm_answer").select("contestant_id").eq("question_id", qid);
        const answeredSet = new Set((answered ?? []).map((a) => a.contestant_id));

        // Auto-insert câu trả lời trống cho thí sinh chưa submit
        const missing = (contestants ?? [])
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
          }));
        if (missing.length) await sb.from("gm_answer").insert(missing);

        // Lock tất cả answer của câu này
        await sb.from("gm_answer").update({ locked: true }).eq("question_id", qid);

        // ── FIX race condition ──────────────────────────────────────────────
        // Nếu thí sinh chỉ kịp "select" (không submit) trước khi hết giờ,
        // row có is_correct=true nhưng points_awarded=0 → tính lại điểm.
        const { data: zeroCorrect } = await sb
          .from("gm_answer")
          .select("id, elapsed_ms")
          .eq("question_id", qid)
          .eq("is_correct", true)
          .eq("points_awarded", 0)
          .not("selected_option", "is", null);

        for (const row of (zeroCorrect ?? [])) {
          const pts = scoreFromElapsed(row.elapsed_ms, true);
          await sb.from("gm_answer").update({ points_awarded: pts }).eq("id", row.id);
        }
        // ───────────────────────────────────────────────────────────────────

        // Áp dụng power-up bonus cho những thí sinh đã kích hoạt
        const { data: powerups } = await sb
          .from("gm_powerup_use")
          .select("contestant_id")
          .eq("question_id", qid);

        if (powerups?.length) {
          // Lấy lại sau bước fix để có points chính xác
          const { data: allAnswers } = await sb
            .from("gm_answer")
            .select("contestant_id, is_correct, points_awarded")
            .eq("question_id", qid);

          for (const pu of powerups) {
            const ans = allAnswers?.find((a) => a.contestant_id === pu.contestant_id);
            if (ans) {
              // Đúng: nhân 2 | Sai: trừ 5
              const newPoints = ans.is_correct ? ans.points_awarded * 2 : -5;
              await sb
                .from("gm_answer")
                .update({ points_awarded: newPoints })
                .eq("question_id", qid)
                .eq("contestant_id", pu.contestant_id);
            }
          }
        }

        // Ghi log
        await sb.from("gm_activity_log").insert({
          round_id: roundId,
          question_id: qid,
          actor: "admin",
          action: "reveal",
          payload: { correct: q?.correct_option, powerup_count: powerups?.length ?? 0 },
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
