import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

/**
 * POST /api/debate-state
 * Body:
 *  - roundId (required)
 *  - action: 'start_phase' | 'stop' | 'reset'
 *  - match?: 1 | 2 | 3 (cho start_phase)
 *  - phase?: 'thinking' | 'presenting' | 'rebutting' | 'responding'
 *  - duration_sec?: number (60 / 180 / 120 / 120)
 *
 * Admin-only. Cập nhật gm_round_state.debate_* + tự broadcast lên màn /screen
 * qua gm_display_state.current_round_id.
 */
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { roundId, action, match, phase, duration_sec } = body as {
    roundId?: string;
    action?: string;
    match?: number;
    phase?: string;
    duration_sec?: number;
  };

  if (!roundId || !action) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  const sb = getServiceClient();

  // Verify round kind
  const { data: round } = await sb.from("gm_round").select("id, kind, name").eq("id", roundId).maybeSingle();
  if (!round) return NextResponse.json({ ok: false, error: "round_not_found" }, { status: 404 });
  if (round.kind !== "debate") {
    return NextResponse.json({ ok: false, error: "round_not_debate" }, { status: 400 });
  }

  let patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (action) {
    case "start_phase":
      if (!match || !phase || !duration_sec) {
        return NextResponse.json({ ok: false, error: "missing match/phase/duration" }, { status: 400 });
      }
      if (![1, 2, 3].includes(match)) {
        return NextResponse.json({ ok: false, error: "invalid_match" }, { status: 400 });
      }
      if (!["thinking", "presenting", "rebutting", "responding"].includes(phase)) {
        return NextResponse.json({ ok: false, error: "invalid_phase" }, { status: 400 });
      }
      patch = {
        ...patch,
        phase: "running",
        debate_match: match,
        debate_phase: phase,
        debate_started_at: new Date().toISOString(),
        debate_duration_sec: duration_sec,
      };
      break;

    case "select_match":
      // Chọn cặp đấu để show trên screen — không start timer
      if (!match || ![1, 2, 3].includes(match)) {
        return NextResponse.json({ ok: false, error: "invalid_match" }, { status: 400 });
      }
      patch = {
        ...patch,
        phase: "idle",
        debate_match: match,
        debate_phase: null,
        debate_started_at: null,
        debate_duration_sec: null,
      };
      break;

    case "stop":
      patch = {
        ...patch,
        phase: "idle",
        debate_started_at: null,
      };
      break;

    case "reset":
      patch = {
        ...patch,
        phase: "idle",
        debate_match: null,
        debate_phase: null,
        debate_started_at: null,
        debate_duration_sec: null,
      };
      break;

    default:
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  }

  const { error } = await sb.from("gm_round_state").update(patch).eq("round_id", roundId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Auto-broadcast: màn /screen tự switch sang vòng debate này
  await sb
    .from("gm_display_state")
    .update({ current_round_id: roundId, updated_at: new Date().toISOString() })
    .eq("id", 1);

  // Log
  await sb.from("gm_activity_log").insert({
    round_id: roundId,
    actor: "admin",
    action: `debate_${action}`,
    payload: { match, phase, duration_sec },
  });

  return NextResponse.json({ ok: true });
}
