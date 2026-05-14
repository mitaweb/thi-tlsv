# Phần mềm thi Thủ lĩnh Sinh viên

Next.js 15 + Supabase + Tailwind. Deploy trên Vercel.

## Cài đặt

```bash
npm install
```

## Bước 1 — Áp dụng schema Supabase

1. Đăng nhập https://supabase.com → mở project `kdcvccxurmoidwssvanc`.
2. Vào **SQL Editor → New query**.
3. Mở file `supabase/schema.sql`, copy toàn bộ nội dung và **Run**.
4. Vào **Database → Replication → supabase_realtime publication**, đảm bảo 2 bảng `gm_round_state` và `gm_answer` được bật (file SQL đã làm tự động).

## Bước 2 — Seed dữ liệu

```bash
npm run seed
```

Tạo 2 vòng (SV, THPT), 7+6 thí sinh, 27+10 câu hỏi.

## Bước 3 — Chạy local

```bash
npm run dev
```

Mở:
- `http://localhost:3000/admin` — Bảng điều khiển (password: `tlsv2026`)
- `http://localhost:3000/screen` — Màn trình chiếu (bấm "Bật" để kích hoạt tiếng tíc tắc 5s cuối)
- `http://localhost:3000/play/<access_code>` — Trang thí sinh (lấy link trong admin)

## Bước 4 — Ảnh nền

Lưu ảnh hội thi anh đã gửi vào `public/bg-hoithi.jpg` (1920×1080).

## Bước 5 — Deploy Vercel

```bash
npx vercel
```

Thêm các env vars trong Vercel project:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`

## Quy tắc tính điểm

| Thời gian còn lại | Điểm |
|---|---|
| 30 – 21s | 10 |
| 20 – 16s | 7 |
| 15 – 11s | 5 |
| ≤ 10s | 3 |
| Sai | 0 |

## Phase

- `idle` — đang chờ
- `armed` — chọn câu, chưa start
- `running` — đang đếm giờ
- `reveal` — hết giờ, hiện đáp án
- `leaderboard` — hiển thị BXH trên màn trình chiếu

## Log audit

Mọi thao tác chọn / đổi / submit / điều khiển admin đều ghi vào bảng `gm_activity_log` kèm `elapsed_ms` từ server → có lịch sử khi kiện cáo.

Query xem log của 1 thí sinh:

```sql
select * from gm_activity_log
where contestant_id = '...'
order by created_at;
```

## Upload câu hỏi qua Excel

Vào `/admin/questions` → tải template → điền các cột:
- `Prompt` — nội dung câu hỏi
- `A`, `B`, `C`, `D` — 4 đáp án
- `Correct` — A/B/C/D

Có 2 chế độ upload:
- **Giữ câu cũ**: append vào cuối
- **Thay thế toàn bộ**: xoá hết câu hỏi cũ của vòng đó trước
