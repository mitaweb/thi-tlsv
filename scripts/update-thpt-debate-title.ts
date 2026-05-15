import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

(async () => {
  await sb.from("gm_group").update({ debate_title: "XỨNG DANH THỦ LĨNH" }).eq("code", "THPT");
  const { data } = await sb.from("gm_group").select("code, debate_title");
  console.log("✓ Updated:");
  for (const g of data ?? []) console.log(`  ${g.code} → ${g.debate_title}`);
})();
