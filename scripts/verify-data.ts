/**
 * Kiểm tra data sau migration: contestants có group_id chưa, panel_score có data không.
 * Chạy: npx tsx scripts/verify-data.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, service, { auth: { persistSession: false } });

async function main() {
  console.log("=== gm_group ===");
  const { data: groups } = await sb.from("gm_group").select("*");
  for (const g of groups ?? []) console.log(`  ${g.code}: id=${g.id.slice(0, 8)}`);

  console.log("\n=== gm_round ===");
  const { data: rounds } = await sb.from("gm_round").select("id, code, kind, group_id, display_order");
  for (const r of rounds ?? []) {
    console.log(`  ${r.code} (kind=${r.kind}, order=${r.display_order}): group_id=${r.group_id?.slice(0, 8) ?? "NULL"}`);
  }

  console.log("\n=== gm_contestant (group_id check) ===");
  const { data: contestants } = await sb.from("gm_contestant").select("id, full_name, round_id, group_id");
  let withGroup = 0, withoutGroup = 0;
  for (const c of contestants ?? []) {
    if (c.group_id) withGroup++;
    else {
      withoutGroup++;
      console.log(`  ⚠ MISSING group_id: ${c.full_name} (round_id=${c.round_id?.slice(0, 8)})`);
    }
  }
  console.log(`  Tổng: ${contestants?.length ?? 0} thí sinh — có group_id: ${withGroup}, không có: ${withoutGroup}`);

  console.log("\n=== gm_panel_submission (đã chốt) ===");
  const { data: subs } = await sb.from("gm_panel_submission").select("round_id, judge_id");
  console.log(`  Total: ${subs?.length ?? 0} submissions`);
  const byRound: Record<string, number> = {};
  for (const s of subs ?? []) {
    byRound[s.round_id] = (byRound[s.round_id] ?? 0) + 1;
  }
  for (const [rid, count] of Object.entries(byRound)) {
    const r = rounds?.find((x: any) => x.id === rid);
    console.log(`  Round ${r?.code ?? rid.slice(0, 8)}: ${count} giám khảo đã chốt`);
  }

  console.log("\n=== gm_panel_score ===");
  const { data: scores } = await sb.from("gm_panel_score").select("round_id");
  const byRoundScore: Record<string, number> = {};
  for (const s of scores ?? []) {
    byRoundScore[s.round_id] = (byRoundScore[s.round_id] ?? 0) + 1;
  }
  for (const [rid, count] of Object.entries(byRoundScore)) {
    const r = rounds?.find((x: any) => x.id === rid);
    console.log(`  Round ${r?.code ?? rid.slice(0, 8)}: ${count} điểm`);
  }

  // Fix nếu thiếu
  if (withoutGroup > 0) {
    console.log("\n=== FIX: Cập nhật group_id cho contestants ===");
    for (const c of contestants ?? []) {
      if (c.group_id) continue;
      const r = rounds?.find((x: any) => x.id === c.round_id);
      if (r?.group_id) {
        await sb.from("gm_contestant").update({ group_id: r.group_id }).eq("id", c.id);
        console.log(`  ✓ ${c.full_name} → group_id=${r.group_id.slice(0, 8)}`);
      }
    }
  } else {
    console.log("\n✓ Tất cả contestants đã có group_id.");
  }
}
main();
