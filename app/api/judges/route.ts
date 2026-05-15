import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * GET /api/judges — Admin xem list judges + access_code (để copy link cho từng người).
 */
export async function GET(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("gm_judge")
    .select("*")
    .eq("active", true)
    .order("role")
    .order("display_order");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
