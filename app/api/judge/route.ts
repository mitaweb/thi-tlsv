import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

/**
 * GET /api/judge?code=...
 * Trả thông tin judge từ access_code (public, không cần auth admin — judge dùng link).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ ok: false, error: "missing code" }, { status: 400 });
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("gm_judge")
    .select("id, display_name, role, display_order, active")
    .eq("access_code", code)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || !data.active) return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 401 });
  return NextResponse.json({ ok: true, data });
}
