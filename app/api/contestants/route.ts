import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");
  const sb = getServiceClient();
  let q = sb.from("gm_contestant").select("*").order("display_order");
  if (roundId) q = q.eq("round_id", roundId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
