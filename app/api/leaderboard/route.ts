import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("gm_leaderboard")
    .select("*")
    .eq("round_id", roundId)
    .order("total_points", { ascending: false })
    .order("display_order");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
