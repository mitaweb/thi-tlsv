/**
 * Drop view gm_leaderboard (cũ, không còn dùng).
 * Đã thay thế bằng /api/round-leaderboard tính trực tiếp trong code.
 *
 * Supabase báo lỗi 'Security Definer View' cho view này vì có thuộc tính
 * SECURITY DEFINER mặc định → bypass RLS. View không còn ai dùng nên xóa luôn.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!password || !ref) { console.error("Thiếu env"); process.exit(1); }

async function main() {
  const client = new Client({
    host: "aws-1-ap-south-1.pooler.supabase.com",
    port: 6543,
    user: `postgres.${ref}`,
    password: password!,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("DROP VIEW IF EXISTS public.gm_leaderboard CASCADE");
    console.log("✓ Đã drop view gm_leaderboard");
  } catch (e: any) {
    console.error("× Error:", e.message);
  } finally {
    await client.end();
  }
}
main();
