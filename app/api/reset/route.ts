import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/reset
 * Body: { roundId: string }
 * Xóa toàn bộ answer của vòng thi + đặt lại round_state về idle.
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

  // Xóa toàn bộ answers của vòng này
  const { error: e1 } = await sb.from("gm_answer").delete().eq("round_id", roundId);
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

  // Xóa toàn bộ power-up đã kích hoạt (để thí sinh được dùng lại từ đầu)
  const { error: e3 } = await sb.from("gm_powerup_use").delete().eq("round_id", roundId);
  if (e3) return NextResponse.json({ ok: false, error: e3.message }, { status: 500 });

  // Đặt lại round state (phase, câu hiện tại, số thứ tự câu)
  const { error: e2 } = await sb.from("gm_round_state").update({
    phase: "idle",
    current_question_id: null,
    question_started_at: null,
    question_no: 0,
    show_scoreboard: false,
    updated_at: new Date().toISOString(),
  }).eq("round_id", roundId);
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

  // Ghi log
  await sb.from("gm_activity_log").insert({
    round_id: roundId,
    actor: "admin",
    action: "reset_round",
    payload: { roundId },
  });

  return NextResponse.json({ ok: true });
}
