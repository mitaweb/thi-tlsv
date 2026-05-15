import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getTop3ForDebate } from "@/lib/round-scoring";

/**
 * GET /api/debate-contestants?roundId=<debate_round_id>
 * Trả top 3 thí sinh tham gia phản biện (theo cumulative qua vòng liền kề trước).
 * Public — judge, screen, admin đều dùng được.
 *
 * Trả:
 *   [{ contestant_id, display_order, full_name, organization, cumulative_score }]
 */
export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });

  const sb = getServiceClient();
  try {
    const top3 = await getTop3ForDebate(sb, roundId);
    return NextResponse.json({ ok: true, data: top3 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
