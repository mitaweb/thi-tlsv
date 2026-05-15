import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/void-question
 * Body: { roundId, questionId }
 *
 * Hủy kết quả 1 câu hỏi (do lỗi kỹ thuật):
 *  - Xóa toàn bộ gm_answer của câu đó
 *  - Đặt lại round_state về idle (để admin chọn câu thay thế)
 *  - Ghi log
 */
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { roundId, questionId } = body as { roundId?: string; questionId?: string };

  if (!roundId || !questionId) {
    return NextResponse.json({ ok: false, error: "missing roundId or questionId" }, { status: 400 });
  }

  const sb = getServiceClient();

  // Xóa tất cả answers của câu này (kể cả locked)
  const { error: e1 } = await sb
    .from("gm_answer")
    .delete()
    .eq("round_id", roundId)
    .eq("question_id", questionId);

  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

  // Xóa powerup activations của câu này → thí sinh được dùng lại bồ câu ở câu khác
  // (unique constraint round_id+contestant_id mở ra sau khi delete)
  const { error: ePu } = await sb
    .from("gm_powerup_use")
    .delete()
    .eq("round_id", roundId)
    .eq("question_id", questionId);

  if (ePu) return NextResponse.json({ ok: false, error: ePu.message }, { status: 500 });

  // Đọc question_no hiện tại để giảm đi 1
  const { data: curState } = await sb
    .from("gm_round_state")
    .select("question_no")
    .eq("round_id", roundId)
    .single();

  // Trả state về idle, bỏ current_question_id, giảm question_no
  const { error: e2 } = await sb
    .from("gm_round_state")
    .update({
      phase: "idle",
      current_question_id: null,
      question_started_at: null,
      question_no: Math.max(0, (curState?.question_no ?? 1) - 1),
      updated_at: new Date().toISOString(),
    })
    .eq("round_id", roundId);

  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

  // Ghi log
  await sb.from("gm_activity_log").insert({
    round_id: roundId,
    question_id: questionId,
    actor: "admin",
    action: "void_question",
    payload: { questionId },
  });

  return NextResponse.json({ ok: true });
}
