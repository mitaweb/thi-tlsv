/**
 * Liệt kê tất cả bảng + view trong public schema để rà soát có bảng lạ không.
 * Chạy: npx tsx scripts/inspect-db.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!password || !ref) {
  console.error("Thiếu SUPABASE_DB_PASSWORD hoặc NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const poolerHosts = [
  "aws-1-ap-south-1.pooler.supabase.com",
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-1-us-east-1.pooler.supabase.com",
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
      console.log(`✓ Connected via ${host}\n`);
      break;
    } catch (e: any) {
      client = null;
    }
  }
  if (!client) { console.error("Không kết nối được DB"); process.exit(1); }

  try {
    // Tables trong public
    const tables = await client.query(`
      SELECT
        c.relname AS name,
        c.relkind AS kind,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
        pg_total_relation_size(c.oid) AS size_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'v', 'm')
      ORDER BY pg_total_relation_size(c.oid) DESC;
    `);
    console.log("=== Bảng/View trong public schema ===");
    for (const row of tables.rows) {
      const k = row.kind === "r" ? "TABLE" : row.kind === "v" ? "VIEW" : "MAT.VIEW";
      const known = row.name.startsWith("gm_") ? "✓ project" : "⚠ KHÔNG thuộc project";
      console.log(`  [${k}] ${row.name.padEnd(40)} ${String(row.size).padEnd(10)} ${known}`);
    }

    // Functions
    const funcs = await client.query(`
      SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname NOT LIKE 'pg_%'
      ORDER BY p.proname;
    `);
    if (funcs.rows.length > 0) {
      console.log("\n=== Functions trong public schema ===");
      for (const row of funcs.rows) {
        console.log(`  ${row.name}(${row.args})`);
      }
    } else {
      console.log("\n(Không có function nào trong public schema)");
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}
main();
