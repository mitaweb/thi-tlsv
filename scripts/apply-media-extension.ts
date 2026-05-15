/**
 * Apply media-extension migration:
 *  - gm_question.media_url, media_type
 *  - gm_display_state.show_top3
 *  - Fix THPT powerup → ⭐ Ngôi sao hi vọng
 *
 * Chạy: npx tsx scripts/apply-media-extension.ts
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

const sql = readFileSync(new URL("../supabase/media-extension.sql", import.meta.url), "utf-8");

const poolerHosts = [
  "aws-1-ap-south-1.pooler.supabase.com",
  "aws-1-ap-southeast-1.pooler.supabase.com",
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
      client = null;
    }
  }
  if (!client) { console.error("Không kết nối được"); process.exit(1); }

  try {
    await client.query(sql);
    console.log("✓ Migration media-extension applied:");
    console.log("  • gm_question.media_url, media_type");
    console.log("  • gm_display_state.show_top3");
    console.log("  • THPT powerup → ⭐ Ngôi sao hi vọng");
  } catch (e: any) {
    console.error("× Error:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
