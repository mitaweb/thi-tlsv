/**
 * Cho phép question_id = NULL trong gm_powerup_use
 * (power-up "pending" cho câu tiếp theo)
 * Chạy: npx tsx scripts/apply-powerup-nullable.ts
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

const sql = readFileSync(new URL("../supabase/powerup-nullable.sql", import.meta.url), "utf-8");

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
    console.log("✓ question_id là nullable. Power-up sẽ tính cho câu tiếp theo.");
  } catch (e: any) {
    console.error("× Error:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
