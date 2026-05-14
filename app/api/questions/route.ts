import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAdminReq } from "@/lib/auth";

// GET ?roundId=... → list câu hỏi của round
export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) return NextResponse.json({ ok: false, error: "missing roundId" }, { status: 400 });
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("gm_question")
    .select("*")
    .eq("round_id", roundId)
    .order("display_order");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

// POST → tạo hoặc thay thế toàn bộ câu hỏi của round (admin)
// Body: { roundId, replace: boolean, questions: QSeed[] }
export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { roundId, replace, questions } = await req.json();
  if (!roundId || !Array.isArray(questions)) {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  const sb = getServiceClient();
  if (replace) {
    await sb.from("gm_question").delete().eq("round_id", roundId);
  }
  const { count } = await sb
    .from("gm_question")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  const start = (count ?? 0) + 1;
  const rows = questions.map((q: any, i: number) => ({
    round_id: roundId,
    display_order: q.display_order ?? start + i,
    prompt: String(q.prompt ?? "").trim(),
    option_a: q.option_a ?? null,
    option_b: q.option_b ?? null,
    option_c: q.option_c ?? null,
    option_d: q.option_d ?? null,
    correct_option: String(q.correct_option || "A").toUpperCase(),
  }));
  const invalid = rows.find((r) => !["A", "B", "C", "D"].includes(r.correct_option));
  if (invalid) {
    return NextResponse.json({ ok: false, error: "correct_option phải là A/B/C/D" }, { status: 400 });
  }
  const { error } = await sb.from("gm_question").insert(rows);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}

// DELETE ?id=...
export async function DELETE(req: NextRequest) {
  if (!isAdminReq(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  const sb = getServiceClient();
  const { error } = await sb.from("gm_question").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
