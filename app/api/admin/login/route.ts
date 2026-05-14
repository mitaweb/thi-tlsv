import { NextRequest, NextResponse } from "next/server";
import { setAdminCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Sai mật khẩu" }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
