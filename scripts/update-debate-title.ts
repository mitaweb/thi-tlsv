/**
 * Update title vòng phản biện cho cả 2 nhóm: 'BẢN LĨNH THỦ LĨNH' (bỏ hậu tố SV/THPT).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

(async () => {
  const { error } = await sb.from("gm_group").update({ debate_title: "BẢN LĨNH THỦ LĨNH" }).gte("display_order", 0);
  if (error) { console.error(error); return; }
  const { data } = await sb.from("gm_group").select("code, debate_title");
  console.log("✓ Updated debate_title:");
  for (const g of data ?? []) console.log(`  ${g.code} → ${g.debate_title}`);
})();
