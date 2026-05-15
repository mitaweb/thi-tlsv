/**
 * Xóa các bảng KHÔNG thuộc project TLSV (prefix gk_*, từ project cũ).
 * Chạy: npx tsx scripts/cleanup-foreign-tables.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!password || !ref) { console.error("Thiếu env"); process.exit(1); }

const foreignTables = [
  "gk_contestants",
  "gk_judges",
  "gk_phienban_sv",
  "gk_scores",
  "gk_logs",
  "gk_admin_settings",
  "gk_hsv_votes",
  "gk_hsv_scores",
];

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
      console.log(`✓ Connected via ${host}\n`);
      break;
    } catch (e: any) {
      client = null;
    }
  }
  if (!client) { console.error("Không kết nối được"); process.exit(1); }

  try {
    for (const t of foreignTables) {
      try {
        await client.query(`DROP TABLE IF EXISTS public.${t} CASCADE`);
        console.log(`  ✓ Dropped ${t}`);
      } catch (e: any) {
        console.log(`  × ${t}: ${e.message}`);
      }
    }

    // Cũng xóa các function không thuộc project (từ project cũ)
    const foreignFuncs = [
      "public.admin_action(text, integer, uuid, integer, uuid)",
      "public.get_game_state()",
      "public.submit_answer(uuid, uuid, uuid, text, integer)",
    ];
    console.log("\n=== Drop functions không thuộc project ===");
    for (const f of foreignFuncs) {
      try {
        await client.query(`DROP FUNCTION IF EXISTS ${f} CASCADE`);
        console.log(`  ✓ Dropped ${f}`);
      } catch (e: any) {
        console.log(`  × ${f.split("(")[0]}: ${e.message}`);
      }
    }
    console.log("\n(Giữ lại handle_new_user, rls_auto_enable — có thể là Supabase utility)");

    console.log("\n✓ Cleanup xong. DB chỉ còn các bảng gm_* của project.");
  } catch (e: any) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}
main();
