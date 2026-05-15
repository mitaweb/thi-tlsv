import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

/**
 * GET /api/rounds
 * Trả tất cả vòng, join group, sort theo group.display_order rồi round.display_order.
 */
export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("gm_round")
    .select("*, gm_group(id, code, name, display_order, debate_title)")
    .order("display_order");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Sort lại theo group.display_order, rồi round.display_order
  const sorted = (data ?? []).slice().sort((a: any, b: any) => {
    const ga = a.gm_group?.display_order ?? 99;
    const gb = b.gm_group?.display_order ?? 99;
    if (ga !== gb) return ga - gb;
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  });

  // Flatten group vào round.group cho client dễ dùng
  const out = sorted.map((r: any) => ({
    ...r,
    group: r.gm_group ?? null,
    gm_group: undefined,
  }));

  return NextResponse.json({ ok: true, data: out });
}
