import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE = "tlsv_admin";

export async function setAdminCookie() {
  const jar = await cookies();
  jar.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value === "1";
}

export function isAdminReq(req: NextRequest): boolean {
  return req.cookies.get(COOKIE)?.value === "1";
}
