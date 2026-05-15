import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { computeCumulativeBefore } from "@/lib/round-scoring";

/**
 * GET /api/contestant-totals?contestantId=...&beforeRoundId=...
 * Trả tổng điểm tích lũy TRƯỚC khi vào `beforeRoundId` + breakdown từng vòng.
 * Dùng cho ContestantApp hiển thị "Tổng xuất phát: 65đ".
 */
export async function GET(req: NextRequest) {
  const contestantId = req.nextUrl.searchParams.get("contestantId");
  const beforeRoundId = req.nextUrl.searchParams.get("beforeRoundId");
  if (!contestantId || !beforeRoundId) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }
  const sb = getServiceClient();
  try {
    const result = await computeCumulativeBefore(sb, beforeRoundId, contestantId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
