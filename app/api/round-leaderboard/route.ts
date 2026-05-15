import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { computeLeaderboard } from "@/lib/round-scoring";

/**
 * GET /api/round-leaderboard?roundId=...
 * Trả BXH có 2 cột: round_score + cumulative_score (tích lũy từ đầu group đến vòng này).
 * Public — anyone can read.
 */
export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });
  const sb = getServiceClient();
  try {
    const rows = await computeLeaderboard(sb, roundId);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
