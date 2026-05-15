import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

/**
 * POST /api/powerup
 * Body: { accessCode }
 *
 * Thí sinh kích hoạt "Bồ câu / Ngôi sao hi vọng" bất kỳ lúc nào trong vòng thi.
 * - Chỉ được dùng 1 lần / vòng thi (unique constraint)
 * - question_id lưu null (pending) → server gán khi IT bấm câu tiếp theo
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { accessCode } = body as { accessCode?: string };

  if (!accessCode) {
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

  // Thêm vào DB với question_id = null (pending, sẽ được gán khi IT bấm câu kế)
  // Unique constraint (round_id, contestant_id) sẽ báo lỗi nếu đã dùng rồi
  const { error } = await sb.from("gm_powerup_use").insert({
    round_id: contestant.round_id,
    contestant_id: contestant.id,
    question_id: null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Lấy thông tin power-up của vòng để ghi log
  const { data: round } = await sb
    .from("gm_round")
    .select("powerup_name, powerup_icon")
    .eq("id", contestant.round_id)
    .single();

  // Lấy câu hiện tại để biết kích hoạt ở câu nào
  const { data: state } = await sb
    .from("gm_round_state")
    .select("current_question_id, question_no")
    .eq("round_id", contestant.round_id)
    .single();

  await sb.from("gm_activity_log").insert({
    round_id: contestant.round_id,
    contestant_id: contestant.id,
    actor: "contestant",
    action: "powerup_activate",
    payload: {
      powerup_name: round?.powerup_name ?? "Bồ câu",
      powerup_icon: round?.powerup_icon ?? "🕊️",
      activated_at_question_no: state?.question_no ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
