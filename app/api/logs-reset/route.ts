import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/logs-reset
 * Body: { roundId?: string }
 *   - Có roundId → chỉ xóa log của vòng đó
 *   - Không có roundId → xóa TOÀN BỘ log
 *
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { roundId } = body as { roundId?: string };

  const sb = getServiceClient();
  let q = sb.from("gm_activity_log").delete();
  if (roundId) {
    q = q.eq("round_id", roundId);
  } else {
    // DELETE WHERE TRUE — Supabase yêu cầu filter, dùng .neq id trống để bắt mọi row
    q = q.gte("id", 0); // bigserial luôn ≥ 0
  }
  const { error, count } = await q;

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: count ?? null });
}
