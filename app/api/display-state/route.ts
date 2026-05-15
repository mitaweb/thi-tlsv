import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * GET /api/display-state — public, đọc state chiếu hiện tại
 * POST /api/display-state — admin only, set current_round_id + show_scoreboard
 *   Body: { roundId?: string | null, showScoreboard?: boolean }
 *
 * Singleton: row id=1. Màn /screen subscribe để tự động chuyển vòng.
 */
export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await sb.from("gm_display_state").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { roundId, showScoreboard, showTop3 } = body as {
    roundId?: string | null;
    showScoreboard?: boolean;
    showTop3?: boolean;
  };

  const sb = getServiceClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (roundId !== undefined) patch.current_round_id = roundId;
  if (showScoreboard !== undefined) patch.show_scoreboard = showScoreboard;
  if (showTop3 !== undefined) {
    patch.show_top3 = showTop3;
    // Khi bật top3 → mặc định bật cả BXH (cần leaderboard data)
    if (showTop3 === true && showScoreboard === undefined) {
      patch.show_scoreboard = true;
    }
  }

  const { error } = await sb.from("gm_display_state").update(patch).eq("id", 1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Ghi log
  await sb.from("gm_activity_log").insert({
    round_id: roundId ?? null,
    actor: "admin",
    action: "display_state_change",
    payload: { roundId, showScoreboard, showTop3 },
  });

  return NextResponse.json({ ok: true });
}
