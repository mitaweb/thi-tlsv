-- =====================================================
-- Migration: Power-up (Bồ câu / Ngôi sao hi vọng)
-- Chạy: npx tsx scripts/apply-powerup.ts
-- =====================================================

-- 1. Bảng lưu thí sinh đã kích hoạt power-up
create table if not exists gm_powerup_use (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references gm_round(id) on delete cascade,
  contestant_id uuid not null references gm_contestant(id) on delete cascade,
  question_id uuid not null references gm_question(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(round_id, contestant_id)   -- mỗi thí sinh chỉ dùng 1 lần / vòng thi
);
create index if not exists gm_powerup_round_q_idx on gm_powerup_use(round_id, question_id);

alter table gm_powerup_use enable row level security;
do $$ begin
  drop policy if exists "read all" on gm_powerup_use;
exception when undefined_table then null;
end $$;
create policy "read all" on gm_powerup_use for select using (true);

-- 2. Config power-up theo vòng thi (icon + tên + số câu cần thi)
alter table gm_round
  add column if not exists powerup_icon  text not null default '🕊️',
  add column if not exists powerup_name  text not null default 'Bồ câu',
  add column if not exists questions_to_play int not null default 10;

-- 3. Số thứ tự câu đang thi (tăng mỗi lần chuyển câu, giảm khi hủy)
alter table gm_round_state
  add column if not exists question_no int not null default 0;

-- Cập nhật vòng THPT (Trí tuệ thủ lĩnh) → Ngôi sao hi vọng
-- (chạy thủ công trong Supabase nếu muốn đổi icon cho từng vòng)
-- update gm_round set powerup_icon='⭐', powerup_name='Ngôi sao hi vọng'
--   where name ilike '%trí tuệ%' or name ilike '%thpt%';
