/**
 * Seed dữ liệu ban đầu vào Supabase.
 * Chạy:  npm run seed
 *
 * - Tạo 2 vòng: SV (Thủ lĩnh chinh phục), THPT (Trí tuệ thủ lĩnh)
 * - Insert thí sinh
 * - Insert câu hỏi mẫu từ mô tả
 *
 * Idempotent: nếu round/code đã tồn tại sẽ bỏ qua phần đó.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supa = createClient(url, service, { auth: { persistSession: false } });

type QSeed = { prompt: string; a?: string; b?: string; c?: string; d?: string; correct: "A" | "B" | "C" | "D" };

const svContestants = [
  { name: "Lê Quang Thạch Anh", org: "Học viện Cán bộ TP. Hồ Chí Minh" },
  { name: "Nguyễn Thành Thái Bảo", org: "Trường Đại học Sư phạm TP. Hồ Chí Minh" },
  { name: "Hà Đức Cường", org: "Trường Đại học Luật TP. Hồ Chí Minh" },
  { name: "Phạm Hoàng Tấn Lộc", org: "Phân hiệu Học viện Hành chính và Quản trị công tại TP. HCM" },
  { name: "Trần Thị Ngân Phúc", org: "Học viện Hàng không Việt Nam" },
  { name: "Trần Duy Tân", org: "Trường Cao đẳng Kỹ thuật Cao Thắng" },
  { name: "Trần Công Thành", org: "Trường Đại học Công nghiệp TP. Hồ Chí Minh" },
];

const thptContestants = [
  { name: "Phạm Nguyễn Bảo Hân", org: "" },
  { name: "Lương Nguyễn Hiền Trinh", org: "" },
  { name: "Nguyễn Ngọc Khải Vy", org: "" },
  { name: "Lê Phan Bảo Phúc", org: "" },
  { name: "Lê Hoàng Duy", org: "" },
  { name: "Trần Huỳnh Như", org: "" },
];

// 27 câu hỏi Đề thủ lĩnh sinh viên
const svQuestions: QSeed[] = [
  {
    prompt: `Theo Nghị quyết Đại hội đại biểu toàn quốc lần thứ XIV của Đảng, "mục tiêu đến năm 2045" của nước ta là trở thành nước phát triển, thu nhập cao vì một nước Việt Nam?`,
    a: "Hoà bình, độc lập, dân chủ, giàu mạnh, phồn vinh, văn minh, hạnh phúc, vững bước đi lên chủ nghĩa xã hội",
    b: "Hùng cường, thịnh vượng, văn minh, hạnh phúc",
    c: "Dân giàu, nước mạnh, dân chủ, công bằng, văn minh",
    d: "Có vị thế cao trong cộng đồng quốc tế và thu nhập đầu người vượt ngưỡng 20.000 USD",
    correct: "A",
  },
  {
    prompt: `Nghị quyết Đại hội đại biểu toàn quốc lần thứ XIV của Đảng xác định yếu tố nào là "nhân tố hàng đầu quyết định mọi thắng lợi của cách mạng Việt Nam" qua 40 năm đổi mới?`,
    a: "Sự đồng lòng của toàn dân và sức mạnh khối đại đoàn kết.",
    b: "Sự kết hợp nhuần nhuyễn giữa sự lãnh đạo của Đảng, sức mạnh dân tộc và sức mạnh thời đại.",
    c: "Sự lãnh đạo của Đảng, sức mạnh to lớn của Nhân dân và khối đại đoàn kết toàn dân tộc.",
    d: "Đường lối đổi mới đúng đắn, sáng tạo của Đảng.",
    correct: "C",
  },
  {
    prompt: "Nghị quyết Đại hội đại biểu toàn quốc lần thứ XIV của Đảng yêu cầu xây dựng nền giáo dục quốc dân hiện đại, công bằng theo hướng nào (đủ 5 thành tố)?",
    a: "Chuẩn hoá, hiện đại hoá, dân chủ hoá, xã hội hoá và hội nhập quốc tế.",
    b: "Chuẩn hóa, hiện đại hóa, xã hội hóa, số hóa và hội nhập quốc tế.",
    c: "Dân chủ hóa, chuẩn hóa, hiện đại hóa, quốc tế hóa và xã hội hóa.",
    d: "Chuẩn hóa, hiện đại hóa, dân chủ hóa, xã hội hóa và chuyên nghiệp hóa.",
    correct: "A",
  },
  {
    prompt: `Nghị quyết Đại hội đại biểu toàn quốc lần thứ XIV của Đảng xác định chỉ tiêu "Tỉ lệ lao động qua đào tạo có bằng cấp, chứng chỉ" đến năm 2030 phải đạt:`,
    a: "30 - 35%.",
    b: "35% - 40%.",
    c: "45% - 50%.",
    d: "Trên 60%.",
    correct: "B",
  },
  {
    prompt: "Nghị quyết số 57-NQ/TW của Bộ Chính trị tập trung vào nội dung nào sau đây?",
    a: "Phát triển nông nghiệp bền vững",
    b: "Đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia",
    c: "Cải cách hành chính nhà nước",
    d: "Phát triển du lịch quốc gia",
    correct: "B",
  },
  {
    prompt: "Một trong những quan điểm xuyên suốt của Nghị quyết 57-NQ/TW là gì?",
    a: "Khoa học công nghệ chỉ phục vụ sản xuất công nghiệp",
    b: "Đổi mới sáng tạo là trách nhiệm riêng của doanh nghiệp",
    c: "Khoa học, công nghệ và đổi mới sáng tạo là động lực chính của phát triển",
    d: "Chuyển đổi số chỉ áp dụng trong khu vực công",
    correct: "C",
  },
  {
    prompt: "Theo Luật Thanh niên, thanh niên được xác định là:",
    a: "Nhóm yếu thế",
    b: "Lực lượng xã hội to lớn, xung kích, sáng tạo",
    c: "Nhóm phụ thuộc",
    d: "Nhóm không ổn định",
    correct: "B",
  },
  {
    prompt: "Chuyển đổi số quốc gia hiện nay được xác định là một trong những động lực quan trọng nhằm:",
    a: "Giảm vai trò của công nghệ",
    b: "Thúc đẩy tăng trưởng kinh tế, nâng cao năng suất và năng lực cạnh tranh quốc gia",
    c: "Giảm hội nhập quốc tế",
    d: "Hạn chế đổi mới sáng tạo",
    correct: "B",
  },
  {
    prompt: "Một trong những định hướng quan trọng trong chiến lược phát triển bền vững của Việt Nam hiện nay là:",
    a: "Phát triển kinh tế nặng là chủ yếu",
    b: "Giảm đầu tư vào năng lượng tái tạo",
    c: "Tăng khai thác tài nguyên thiên nhiên",
    d: "Phát triển kinh tế xanh và kinh tế tuần hoàn",
    correct: "D",
  },
  {
    prompt: "Trong bối cảnh hội nhập quốc tế, sinh viên Việt Nam cần chú trọng điều gì?",
    a: "Chỉ học trong nước",
    b: "Nâng cao năng lực ngoại ngữ và kỹ năng toàn cầu",
    c: "Hạn chế giao lưu quốc tế",
    d: "Tránh tham gia các chương trình trao đổi",
    correct: "B",
  },
  {
    prompt: "Khẩu hiệu hành động của Đại hội đại biểu Hội Sinh viên Việt Nam TP. Hồ Chí Minh lần thứ VII là gì?",
    a: "Sinh viên Thành phố Hồ Chí Minh sáng tri thức, vững kỹ năng, tiên phong hội nhập",
    b: "Sinh viên Thành phố Hồ Chí Minh: Bản lĩnh - Sáng tạo - Khát vọng - Hội nhập",
    c: "Sinh viên Thành phố Hồ Chí Minh phấn đấu là sinh viên 5 tốt, rèn luyện tốt",
    d: "Sinh viên Thành phố Hồ Chí Minh vun đắp lý tưởng, rèn đức luyện tài",
    correct: "A",
  },
  {
    prompt: `Với tinh thần "Trong nghị, ngoài hội", Hội Sinh viên Thành phố phối hợp Nhà Văn hóa Sinh viên tổ chức hoạt động nào?`,
    a: "Ngày hội Sinh viên TP. Hồ Chí Minh",
    b: "Ngày hội Sức trẻ sinh viên Thành phố Hồ Chí Minh",
    c: "Lễ hội Thanh niên - Youth Fest",
    d: "Ngày hội Tân Sinh viên TP. Hồ Chí Minh",
    correct: "A",
  },
  {
    prompt: "Cấp Liên chi hội và Chi hội phải tổ chức ít nhất bao nhiêu hoạt động tình nguyện trong một học kỳ?",
    a: "Ít nhất 01 hoạt động",
    b: "Ít nhất 02 hoạt động",
    c: "Ít nhất 03 hoạt động",
    d: "Ít nhất 04 hoạt động",
    correct: "A",
  },
  {
    prompt: "Hội Sinh viên Việt Nam hoạt động dưới sự lãnh đạo trực tiếp của tổ chức nào?",
    a: "Mặt trận Tổ quốc Việt Nam",
    b: "Đảng Cộng sản Việt Nam",
    c: "Bộ Giáo dục và Đào tạo",
    d: "Hội Liên hiệp Thanh niên Việt Nam",
    correct: "B",
  },
  {
    prompt: "Hội viên có quyền gì đối với việc hình thành các cơ quan lãnh đạo của Hội?",
    a: "Được quyền bổ nhiệm nhân sự Hội các cấp",
    b: "Được bàn bạc, giám sát các công việc của Hội, được ứng cử và đề cử vào cơ quan lãnh đạo các cấp của Hội",
    c: "Được luân phiên giữ các chức vụ trong Hội",
    d: "Chỉ được đề cử, không được quyền ứng cử",
    correct: "B",
  },
  {
    prompt: "Sau khi có ý kiến công nhận BCH lâm thời, chậm nhất sau thời gian bao lâu BCH lâm thời phải tiến hành Đại hội lần thứ nhất?",
    a: "3 tháng",
    b: "6 tháng",
    c: "9 tháng",
    d: "12 tháng",
    correct: "B",
  },
  {
    prompt: "Một trong những đặc điểm nổi bật của phong trào học sinh - sinh viên đô thị Sài Gòn là:",
    a: "Hoạt động đơn lẻ",
    b: "Tự phát",
    c: "Có tổ chức, gắn với phong trào cách mạng",
    d: "Không có định hướng",
    correct: "C",
  },
  {
    prompt: "Một trong những giá trị cốt lõi của phong trào học sinh - sinh viên là:",
    a: "Yêu nước và trách nhiệm xã hội",
    b: "Cá nhân",
    c: "Kinh tế",
    d: "Cạnh tranh",
    correct: "A",
  },
  {
    prompt: "Sự phát triển của phong trào sinh viên TP.HCM trong giai đoạn mới phản ánh xu hướng nào sau đây?",
    a: "Giảm vai trò của tổ chức Đoàn - Hội",
    b: "Tách rời khỏi nhiệm vụ phát triển đất nước",
    c: "Gắn với hội nhập quốc tế, đổi mới sáng tạo và trách nhiệm xã hội",
    d: "Chỉ tập trung học thuật",
    correct: "C",
  },
  {
    prompt: "Đại thắng mùa Xuân năm 1975 có ý nghĩa lịch sử:",
    a: "Chấm dứt chiến tranh thế giới",
    b: "Hoàn thành thống nhất đất nước",
    c: "Thành lập Đảng",
    d: "Bắt đầu đổi mới",
    correct: "B",
  },
  {
    prompt: "TP.HCM là trung tâm tài chính:",
    a: "Duy nhất của Việt Nam",
    b: "Lớn của cả nước",
    c: "Của khu vực phía Nam",
    d: "Của thế giới",
    correct: "B",
  },
  {
    prompt: "Một trong những yêu cầu đặt ra đối với TP.HCM sau sáp nhập trong quản lý đô thị là:",
    a: "Giảm quy mô quản lý",
    b: "Phân tán quyền lực",
    c: "Tăng cường quản trị đô thị thông minh, hiện đại",
    d: "Giảm ứng dụng công nghệ",
    correct: "C",
  },
  {
    prompt: "Chi hội A có 25 hội viên, đơn vị thực hiện Đại hội Chi hội năm học 2025 - 2026 để thực hiện các nhiệm vụ theo Điều lệ Hội, trong đó có hiệp thương Ban Chấp hành Chi hội khóa mới. Để 1 ứng cử viên đảm bảo điều kiện tối thiểu được hiệp thương tham gia Ban Chấp hành Chi hội cần tối thiểu bao nhiêu ý kiến tán thành?",
    a: "8 nhân sự tán thành",
    b: "9 nhân sự tán thành",
    c: "10 nhân sự tán thành",
    d: "11 nhân sự tán thành",
    correct: "B",
  },
  {
    prompt: "Cương lĩnh chính trị đầu tiên của Đảng xác định nhiệm vụ chủ yếu của cách mạng Việt Nam là:",
    a: "Phát triển kinh tế",
    b: "Đánh đổ đế quốc và phong kiến, giành độc lập dân tộc",
    c: "Xây dựng chủ nghĩa xã hội ngay lập tức",
    d: "Phát triển giáo dục",
    correct: "B",
  },
  {
    prompt: "Một trong những nội dung cốt lõi của tư tưởng Hồ Chí Minh là:",
    a: "Phát triển kinh tế thị trường",
    b: "Độc lập dân tộc gắn liền với chủ nghĩa xã hội",
    c: "Phát triển công nghiệp nặng",
    d: "Tăng trưởng kinh tế",
    correct: "B",
  },
  {
    prompt: "Phong trào học sinh - sinh viên Sài Gòn trước 1975 góp phần vào:",
    a: "Cách mạng tháng Tám",
    b: "Đổi mới",
    c: "Kháng chiến chống Mỹ",
    d: "Công nghiệp hóa",
    correct: "C",
  },
  {
    prompt: "Vào ngày 09/01/1950, tại Sài Gòn đã diễn ra sự kiện lịch sử tiêu biểu nào của phong trào học sinh, sinh viên?",
    a: "Xe tăng 843 và 390 của Lữ đoàn 203 (Quân đoàn 2) đã húc đổ cổng Dinh Độc Lập",
    b: "Cuộc biểu tình, xuống đường đấu tranh lớn của học sinh, sinh viên và quần chúng nhân dân Sài Gòn - Chợ Lớn",
    c: "Hòa thượng Thích Quảng Đức tự thiêu",
    d: "Phát thẻ hội viên",
    correct: "B",
  },
];

// 10 câu hỏi Đề thi THPT
const thptQuestions: QSeed[] = [
  {
    prompt: `Trong kháng chiến chống Mỹ, tổ chức nào được coi là "hạt nhân" bí mật lãnh đạo phong trào học sinh, sinh viên tại nội thành Sài Gòn - Gia Định?`,
    a: "Ban Thanh vận Trung ương Cục miền Nam.",
    b: "Khu Đoàn Sài Gòn - Gia Định.",
    c: "Thành Đoàn Thành phố Hồ Chí Minh.",
    d: "Hội Liên hiệp Thanh niên Giải phóng miền Nam.",
    correct: "B",
  },
  {
    prompt: "Đại hội Đoàn toàn quốc lần thứ mấy đã quyết định lấy ngày 26/03 hằng năm được lấy làm ngày kỷ niệm thành lập Đoàn TNCS Hồ Chí Minh?",
    a: "Đại hội lần I (T2/1950)",
    b: "Đại hội lần II (T11/1950)",
    c: "Đại hội lần III (T3/1961)",
    d: "Đại hội lần IV (T11/1980)",
    correct: "C",
  },
  {
    prompt: "Đảng Cộng sản Việt Nam lấy chủ nghĩa, tư tưởng nào làm nền tảng tư tưởng và kim chỉ nam cho hành động?",
    a: "Chủ nghĩa yêu nước và truyền thống dân tộc",
    b: "Tư tưởng Hồ Chí Minh",
    c: "Chủ nghĩa Mác-Lênin và tư tưởng Hồ Chí Minh",
    d: "Chủ nghĩa hiện thực và tư duy đổi mới",
    correct: "C",
  },
  {
    prompt: "Vào năm 1698, nhân vật lịch sử nào đã được chúa Nguyễn cử vào kinh lược miền Nam và lập ra phủ Gia Định?",
    a: "Nguyễn Ánh",
    b: "Nguyễn Huệ",
    c: "Nguyễn Phúc Chu",
    d: "Nguyễn Hữu Cảnh",
    correct: "D",
  },
  {
    prompt: "Theo nguyên tắc tập trung dân chủ, các cơ quan lãnh đạo của Đoàn thực hiện nguyên tắc lãnh đạo như thế nào?",
    a: "Cơ chế thủ trưởng",
    b: "Cá nhân quyết định, tập thể thực hiện",
    c: "Tập thể lãnh đạo, cá nhân phụ trách",
    d: "Cấp trên chỉ định, cấp dưới chấp hành",
    correct: "C",
  },
  {
    prompt: `Chương trình "Bình dân học vụ số" của Đoàn TNCS Hồ Chí Minh TP. Hồ Chí Minh tập trung vào lĩnh vực nào?`,
    a: "Phổ cập tri thức về chuyển đổi số và kỹ năng số cho thanh thiếu nhi",
    b: "Xóa mù chữ cho trẻ em vùng cao",
    c: "Dạy tiếng Anh miễn phí cho con em thanh niên công nhân",
    d: "Đào tạo tin học văn phòng cho thanh thiếu nhi",
    correct: "A",
  },
  {
    prompt: "Ngày truyền thống phong trào học sinh, sinh viên và Hội Sinh viên Việt Nam là ngày nào?",
    a: "Ngày 10/10",
    b: "Ngày 09/01",
    c: "Ngày 03/02",
    d: "Ngày 15/10",
    correct: "B",
  },
  {
    prompt: "Theo Nghị quyết số 57-NQ/TW ngày 22/12/2024 của Bộ Chính trị về đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia, yếu tố nào được xác định là đột phá quan trọng hàng đầu để đưa đất nước phát triển mạnh mẽ trong kỷ nguyên mới?",
    a: "Phát triển du lịch và dịch vụ chất lượng cao.",
    b: "Đẩy mạnh xuất khẩu nông sản và tài nguyên thiên nhiên.",
    c: "Phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia.",
    d: "Phát triển du lịch và dịch vụ chất lượng cao, khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia",
    correct: "D",
  },
  {
    prompt: "Đây là địa danh nào hiện nay: tòa nhà là trụ sở làm việc của Hội đồng nhân dân và Ủy ban nhân dân",
    a: "Bưu điện Thành phố",
    b: "Trụ sở làm việc của Hội đồng nhân dân và Ủy ban nhân dân Thành phố Hồ Chí Minh",
    c: "Bảo tàng Thành phố Hồ Chí Minh",
    d: "Nhà hát lớn Thành phố Hồ Chí Minh",
    correct: "B",
  },
  {
    prompt: "[TODO - Anh sửa lại nội dung câu hỏi này trong Admin → Quản lý câu hỏi]",
    a: "Hát cho dân tôi nghe",
    b: "Hát cho đồng bào tôi nghe",
    c: "Người đợi người",
    d: "Tiếng hát cho dân tôi",
    correct: "A",
  },
];

function rndCode(prefix: string, i: number) {
  return `${prefix}${String(i).padStart(2, "0")}-${randomUUID().slice(0, 4)}`;
}

async function upsertRound(code: string, name: string) {
  const { data: existing } = await supa.from("gm_round").select("*").eq("code", code).maybeSingle();
  if (existing) {
    console.log(`✓ round ${code} đã tồn tại (${existing.id})`);
    return existing as { id: string; code: string; name: string };
  }
  const { data, error } = await supa
    .from("gm_round")
    .insert({ code, name, question_seconds: 30 })
    .select()
    .single();
  if (error) throw error;
  console.log(`+ round ${code} created`);
  return data as { id: string; code: string; name: string };
}

async function seedContestants(roundId: string, code: string, list: { name: string; org: string }[]) {
  const { count } = await supa
    .from("gm_contestant")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  if ((count ?? 0) > 0) {
    console.log(`  · ${code} đã có ${count} thí sinh, skip`);
    return;
  }
  const rows = list.map((c, i) => ({
    round_id: roundId,
    display_order: i + 1,
    full_name: c.name,
    organization: c.org || null,
    access_code: rndCode(code, i + 1),
  }));
  const { error } = await supa.from("gm_contestant").insert(rows);
  if (error) throw error;
  console.log(`  + inserted ${rows.length} thí sinh ${code}`);
}

async function seedQuestions(roundId: string, code: string, list: QSeed[]) {
  const { count } = await supa
    .from("gm_question")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  if ((count ?? 0) > 0) {
    console.log(`  · ${code} đã có ${count} câu hỏi, skip`);
    return;
  }
  const rows = list.map((q, i) => ({
    round_id: roundId,
    display_order: i + 1,
    prompt: q.prompt,
    option_a: q.a ?? null,
    option_b: q.b ?? null,
    option_c: q.c ?? null,
    option_d: q.d ?? null,
    correct_option: q.correct,
  }));
  const { error } = await supa.from("gm_question").insert(rows);
  if (error) throw error;
  console.log(`  + inserted ${rows.length} câu hỏi ${code}`);
}

async function ensureRoundState(roundId: string) {
  const { data } = await supa.from("gm_round_state").select("round_id").eq("round_id", roundId).maybeSingle();
  if (data) return;
  const { error } = await supa.from("gm_round_state").insert({ round_id: roundId, phase: "idle" });
  if (error) throw error;
}

async function main() {
  console.log("→ Connecting to", url);
  const sv = await upsertRound("SV", "Thủ lĩnh chinh phục");
  await seedContestants(sv.id, "SV", svContestants);
  await seedQuestions(sv.id, "SV", svQuestions);
  await ensureRoundState(sv.id);

  const thpt = await upsertRound("THPT", "Trí tuệ thủ lĩnh");
  await seedContestants(thpt.id, "THPT", thptContestants);
  await seedQuestions(thpt.id, "THPT", thptQuestions);
  await ensureRoundState(thpt.id);

  console.log("✓ Seed xong.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
