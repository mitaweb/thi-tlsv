import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

/**
 * POST /api/powerup
 * Body: { accessCode, questionId }
 *
 * Thí sinh kích hoạt "Bồ câu / Ngôi sao hi vọng" cho câu hỏi hiện tại.
 * - Chỉ được dùng 1 lần / vòng thi (unique constraint)
 * - Chỉ hợp lệ khi phase=running và câu đang hoạt động
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { accessCode, questionId } = body as { accessCode?: string; questionId?: string };

  if (!accessCode || !questionId) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  const sb = getServiceClient();

  // Xác thực thí sinh
  const { data: contestant } = await sb
    .from("gm_contestant")
    .select("id, round_id")
    .eq("access_code", accessCode)
    .single();
  if (!contestant) {
    return NextResponse.json({ ok: false, error: "invalid access code" }, { status: 401 });
  }

  // Kiểm tra phase đang running và câu đúng
  const { data: state } = await sb
    .from("gm_round_state")
    .select("phase, current_question_id")
    .eq("round_id", contestant.round_id)
    .single();
  if (!state || state.phase !== "running" || state.current_question_id !== questionId) {
    return NextResponse.json({ ok: false, error: "question not active" }, { status: 409 });
  }

  // Thêm vào DB (unique constraint sẽ báo lỗi nếu đã dùng rồi)
  const { error } = await sb.from("gm_powerup_use").insert({
    round_id: contestant.round_id,
    contestant_id: contestant.id,
    question_id: questionId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
