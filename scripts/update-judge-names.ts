/**
 * Update tên 4 BGK chính theo danh sách thật.
 * Chạy: npx tsx scripts/update-judge-names.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const names: Record<number, string> = {
  1: "TS. Mai Mỹ Hạnh",
  2: "Nguyễn Đăng Khoa",
  3: "Nguyễn Kim Luyện",
  4: "Phạm Thanh Sơn",
};

async function main() {
  for (const [orderStr, name] of Object.entries(names)) {
    const order = parseInt(orderStr, 10);
    const { error } = await sb
      .from("gm_judge")
      .update({ display_name: name })
      .eq("role", "bgk")
      .eq("display_order", order);
    if (error) {
      console.log(`  × Lỗi update BGK ${order}: ${error.message}`);
    } else {
      console.log(`  ✓ BGK ${order} → ${name}`);
    }
  }

  // Verify
  const { data } = await sb.from("gm_judge").select("display_order, display_name, access_code").eq("role", "bgk").order("display_order");
  console.log("\n=== Tên BGK sau update ===");
  for (const j of data ?? []) {
    console.log(`  ${j.display_order}. ${j.display_name}  →  /judge/${j.access_code}`);
  }
}
main();
