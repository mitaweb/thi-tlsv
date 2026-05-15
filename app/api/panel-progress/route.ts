import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * GET /api/panel-progress?roundId=...
 * Admin xem tiến độ chấm: ai đã submit, ai chưa.
 * Trả về:
 *   {
 *     judges: [{id, display_name, role, submitted: boolean, submittedAt}],
 *     bgkCount, bgkSubmitted, councilCount, councilSubmitted
 *   }
 */
export async function GET(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });

  const sb = getServiceClient();
  const [judgesRes, subsRes] = await Promise.all([
    sb.from("gm_judge").select("id, display_name, role, display_order, active").eq("active", true).order("role").order("display_order"),
    sb.from("gm_panel_submission").select("judge_id, submitted_at").eq("round_id", roundId),
  ]);
  const subMap = new Map<string, string>();
  for (const s of (subsRes.data ?? [])) {
    subMap.set((s as any).judge_id, (s as any).submitted_at);
  }
  const judges = (judgesRes.data ?? []).map((j: any) => ({
    id: j.id,
    display_name: j.display_name,
    role: j.role,
    display_order: j.display_order,
    submitted: subMap.has(j.id),
    submittedAt: subMap.get(j.id) ?? null,
  }));
  const bgkAll = judges.filter((j) => j.role === "bgk");
  const councilAll = judges.filter((j) => j.role === "sv_council");
  return NextResponse.json({
    ok: true,
    judges,
    bgkCount: bgkAll.length,
    bgkSubmitted: bgkAll.filter((j) => j.submitted).length,
    councilCount: councilAll.length,
    councilSubmitted: councilAll.filter((j) => j.submitted).length,
  });
}
