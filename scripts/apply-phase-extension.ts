/**
 * Áp dụng migration mở rộng cho phần thi sân khấu vào Supabase.
 * Chạy: npx tsx scripts/apply-phase-extension.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { Client } from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!password || !ref) {
  console.error("Thiếu SUPABASE_DB_PASSWORD hoặc NEXT_PUBLIC_SUPABASE_URL trong .env.local");
  process.exit(1);
}

const sql = readFileSync(new URL("../supabase/phase-extension.sql", import.meta.url), "utf-8");

const poolerHosts = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-1-ap-south-1.pooler.supabase.com",
  "aws-1-us-east-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];

async function main() {
  let client: Client | null = null;
  for (const host of poolerHosts) {
    try {
      client = new Client({
        host, port: 6543, user: `postgres.${ref}`, password: password!, database: "postgres",
        ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000,
      });
      await client.connect();
      console.log(`✓ Connected via ${host}`);
      break;
    } catch (e: any) {
      console.log(`× ${host}: ${e.message}`);
      client = null;
    }
  }
  if (!client) { console.error("Không kết nối được DB"); process.exit(1); }
  try {
    await client.query(sql);
    console.log("✓ Migration phase-extension đã áp dụng:");
    console.log("  • gm_group (SV + THPT)");
    console.log("  • gm_round mở rộng (kind, group_id, display_order, total_points, scoring_config)");
    console.log("  • gm_contestant.group_id");
    console.log("  • gm_judge, gm_panel_score, gm_panel_submission");
    console.log("  • gm_round_state mở rộng (debate_*)");
    console.log("  • gm_display_state (singleton)");
    console.log("  • Seed 5 vòng mới: SV-Chân dung, SV-Nhạy bén, SV-Phản biện, THPT-Chân dung, THPT-Phản biện");
    console.log("");
    console.log("Tiếp theo: npx tsx scripts/seed-judges.ts");
  } catch (e: any) {
    console.error("× Error:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
