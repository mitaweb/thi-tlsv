/**
 * Áp dụng schema.sql vào Supabase Postgres trực tiếp.
 * Chạy: npx tsx scripts/apply-schema.ts
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

// Direct connection (IPv6) — nếu mạng không hỗ trợ IPv6 thì fallback pooler
const directHost = `db.${ref}.supabase.co`;
const poolerHosts = [
  // aws-1 prefix (newer projects)
  `aws-1-ap-southeast-1.pooler.supabase.com`,
  `aws-1-us-east-1.pooler.supabase.com`,
  `aws-1-us-east-2.pooler.supabase.com`,
  `aws-1-us-west-1.pooler.supabase.com`,
  `aws-1-eu-central-1.pooler.supabase.com`,
  `aws-1-eu-west-1.pooler.supabase.com`,
  `aws-1-ap-northeast-1.pooler.supabase.com`,
  `aws-1-ap-northeast-2.pooler.supabase.com`,
  `aws-1-ap-south-1.pooler.supabase.com`,
  `aws-1-sa-east-1.pooler.supabase.com`,
  `aws-1-ca-central-1.pooler.supabase.com`,
  // aws-0 prefix (older projects)
  `aws-0-ap-southeast-1.pooler.supabase.com`,
  `aws-0-ap-northeast-1.pooler.supabase.com`,
  `aws-0-ap-northeast-2.pooler.supabase.com`,
  `aws-0-us-east-1.pooler.supabase.com`,
  `aws-0-us-west-1.pooler.supabase.com`,
  `aws-0-eu-central-1.pooler.supabase.com`,
];

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf-8");

async function tryConnect(host: string, port: number, user: string, encodedPwd: string) {
  const client = new Client({
    host,
    port,
    user,
    password: encodedPwd,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  return client;
}

async function main() {
  console.log("→ Connecting to Supabase Postgres...");
  let client: Client | null = null;
  let lastErr: unknown = null;

  // Try direct first
  try {
    client = await tryConnect(directHost, 5432, "postgres", password!);
    console.log(`✓ Connected via direct: ${directHost}`);
  } catch (e: any) {
    lastErr = e;
    console.log(`× direct ${directHost} failed: ${e.message}`);
    for (const host of poolerHosts) {
      try {
        client = await tryConnect(host, 6543, `postgres.${ref}`, password!);
        console.log(`✓ Connected via pooler: ${host}`);
        break;
      } catch (e2: any) {
        console.log(`× pooler ${host} failed: ${e2.message}`);
        lastErr = e2;
      }
    }
  }
  if (!client) {
    console.error("Không kết nối được Postgres:", lastErr);
    process.exit(1);
  }

  console.log("→ Applying schema...");
  try {
    await client.query(sql);
    console.log("✓ Schema applied.");
  } catch (e: any) {
    // Một số lệnh (như alter publication) có thể fail nếu đã tồn tại — log nhưng không stop
    console.error("× Schema error:", e.message);
    console.error("Hint: nếu lỗi liên quan publication / extension đã tồn tại thì OK, có thể bỏ qua.");
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
