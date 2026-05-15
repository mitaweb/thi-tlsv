/**
 * Seed 4 BGK + 30 Hội đồng SV với access_code random.
 * Ghi ra file `judges.txt` để admin copy link cho từng người.
 * Idempotent: nếu đã có judges thì giữ nguyên, không tạo lại.
 *
 * Chạy: npx tsx scripts/seed-judges.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !service) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  process.exit(1);
}
const sb = createClient(url, service, { auth: { persistSession: false } });

function randomCode(prefix: string): string {
  // 8 ký tự hex random → 4 tỉ tổ hợp
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

async function main() {
  const judges: Array<{ access_code: string; display_name: string; role: "bgk" | "sv_council"; display_order: number }> = [];

  // 4 BGK
  for (let i = 1; i <= 4; i++) {
    judges.push({
      access_code: randomCode("bgk"),
      display_name: `Giám khảo ${i}`,
      role: "bgk",
      display_order: i,
    });
  }

  // 30 Hội đồng SV
  for (let i = 1; i <= 30; i++) {
    judges.push({
      access_code: randomCode("sv"),
      display_name: `Hội đồng SV ${i}`,
      role: "sv_council",
      display_order: i,
    });
  }

  // Kiểm tra đã có chưa
  const { data: existing } = await sb.from("gm_judge").select("role").limit(1);
  if (existing && existing.length > 0) {
    console.log("✓ Đã có judges trong DB. Bỏ qua seed.");
    console.log("  Nếu muốn tạo lại: TRUNCATE gm_judge CASCADE trong Supabase SQL editor.");
    // Vẫn xuất file judges.txt từ DB
    const { data: all } = await sb.from("gm_judge").select("*").order("role").order("display_order");
    if (all) exportFile(all);
    return;
  }

  const { error } = await sb.from("gm_judge").insert(judges);
  if (error) {
    console.error("Lỗi insert:", error.message);
    process.exit(1);
  }

  console.log("✓ Đã tạo 4 BGK + 30 Hội đồng SV.");
  const { data: all } = await sb.from("gm_judge").select("*").order("role").order("display_order");
  if (all) exportFile(all);
}

function exportFile(judges: any[]) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://your-site.example.com";
  const lines: string[] = [];
  lines.push("=================================================");
  lines.push("  DANH SÁCH LINK CHẤM ĐIỂM - HỘI THI THỦ LĨNH");
  lines.push("=================================================");
  lines.push("");
  lines.push("⚠ TUYỆT MẬT: Mỗi link chỉ gửi cho 1 người duy nhất.");
  lines.push("");

  lines.push("--- BAN GIÁM KHẢO (4 người) ---");
  lines.push("Dùng xuyên suốt mọi vòng chấm điểm.");
  lines.push("");
  for (const j of judges.filter((x) => x.role === "bgk")) {
    lines.push(`${j.display_name}: ${baseUrl}/judge/${j.access_code}`);
  }
  lines.push("");

  lines.push("--- HỘI ĐỒNG SINH VIÊN (30 người) ---");
  lines.push("Chỉ chấm vòng SV - Chân dung thủ lĩnh (max 30đ/thí sinh).");
  lines.push("");
  for (const j of judges.filter((x) => x.role === "sv_council")) {
    lines.push(`${j.display_name}: ${baseUrl}/judge/${j.access_code}`);
  }
  lines.push("");

  writeFileSync("judges.txt", lines.join("\n"), "utf-8");
  console.log("✓ Đã xuất file judges.txt ở root project.");
  console.log("  Mở file để copy link gửi từng giám khảo.");
}

main();
