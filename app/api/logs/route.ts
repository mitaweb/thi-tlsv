import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * GET /api/logs?roundId=...&limit=300
 * Trả về log hoạt động của vòng thi (admin-only).
 */
export async function GET(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const roundId = searchParams.get("roundId");
  const limit = Math.min(Number(searchParams.get("limit") ?? "300"), 500);

  const sb = getServiceClient();

  // Build query — join contestant name via FK contestant_id
  let query = sb
    .from("gm_activity_log")
    .select(`
      id,
      round_id,
      question_id,
      contestant_id,
      actor,
      action,
      payload,
      elapsed_ms,
      created_at,
      gm_contestant ( full_name, display_order )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (roundId) query = query.eq("round_id", roundId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Flatten joined contestant info
  const enriched = (data ?? []).map((log: any) => {
    const c = log.gm_contestant;
    return {
      id: log.id,
      round_id: log.round_id,
      question_id: log.question_id,
      contestant_id: log.contestant_id,
      actor: log.actor,
      actor_name: c ? `#${c.display_order} ${c.full_name}` : log.actor,
      action: log.action,
      payload: log.payload,
      elapsed_ms: log.elapsed_ms,
      created_at: log.created_at,
    };
  });

  return NextResponse.json({ ok: true, data: enriched });
}
