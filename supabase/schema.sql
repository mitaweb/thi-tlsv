-- =====================================================
-- Schema cho phần mềm thi Thủ lĩnh Sinh viên
-- Tất cả bảng prefix gm_ (game)
-- Chạy file này trong Supabase SQL Editor
-- =====================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- =====================================================
-- 1. Vòng thi (round)
-- =====================================================
create table if not exists gm_round (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,           -- 'SV' (Thủ lĩnh chinh phục), 'THPT' (Trí tuệ thủ lĩnh)
  name text not null,
  question_seconds int not null default 30,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 2. Thí sinh
-- =====================================================
create table if not exists gm_contestant (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references gm_round(id) on delete cascade,
  display_order int not null,
  full_name text not null,
  organization text,
  access_code text unique not null,    -- link đăng nhập: /play/<access_code>
  created_at timestamptz not null default now()
);
create index if not exists gm_contestant_round_idx on gm_contestant(round_id);

-- =====================================================
-- 3. Câu hỏi
-- =====================================================
create table if not exists gm_question (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references gm_round(id) on delete cascade,
  display_order int not null,
  prompt text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option char(1) not null check (correct_option in ('A','B','C','D')),
  created_at timestamptz not null default now()
);
create index if not exists gm_question_round_idx on gm_question(round_id, display_order);

-- =====================================================
-- 4. State của vòng thi (1 row / round) - đồng bộ realtime
-- =====================================================
create table if not exists gm_round_state (
  round_id uuid primary key references gm_round(id) on delete cascade,
  current_question_id uuid references gm_question(id) on delete set null,
  -- phase: 'idle' | 'armed' | 'running' | 'reveal' | 'leaderboard'
  phase text not null default 'idle',
  question_started_at timestamptz,    -- server-authoritative timer start
  show_scoreboard boolean not null default false,
  updated_at timestamptz not null default now()
);

-- =====================================================
-- 5. Lượt trả lời của thí sinh
-- =====================================================
create table if not exists gm_answer (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references gm_round(id) on delete cascade,
  question_id uuid not null references gm_question(id) on delete cascade,
  contestant_id uuid not null references gm_contestant(id) on delete cascade,
  selected_option char(1) check (selected_option in ('A','B','C','D')),
  submitted_at timestamptz not null default now(),
  elapsed_ms int not null,             -- ms từ lúc câu hỏi bắt đầu đến lúc submit
  is_correct boolean not null,
  points_awarded int not null default 0,
  locked boolean not null default false, -- true sau khi reveal, không sửa được
  created_at timestamptz not null default now(),
  unique (question_id, contestant_id)
);
create index if not exists gm_answer_q_idx on gm_answer(question_id);
create index if not exists gm_answer_c_idx on gm_answer(contestant_id);

-- =====================================================
-- 6. Log thao tác (audit) - cho kiện cáo
-- =====================================================
create table if not exists gm_activity_log (
  id bigserial primary key,
  round_id uuid references gm_round(id) on delete set null,
  question_id uuid references gm_question(id) on delete set null,
  contestant_id uuid references gm_contestant(id) on delete set null,
  actor text not null,                 -- 'admin' | 'contestant' | 'screen' | 'system'
  action text not null,                -- 'select_option' | 'submit' | 'change_option' | 'phase_change' | ...
  payload jsonb,
  elapsed_ms int,
  created_at timestamptz not null default now()
);
create index if not exists gm_log_round_idx on gm_activity_log(round_id, created_at desc);
create index if not exists gm_log_contestant_idx on gm_activity_log(contestant_id, created_at desc);

-- =====================================================
-- View tính bảng xếp hạng
-- =====================================================
create or replace view gm_leaderboard as
select
  c.id as contestant_id,
  c.round_id,
  c.display_order,
  c.full_name,
  c.organization,
  coalesce(sum(a.points_awarded), 0)::int as total_points,
  count(a.id) filter (where a.is_correct) as correct_count,
  count(a.id) as answered_count
from gm_contestant c
left join gm_answer a on a.contestant_id = c.id and a.locked = true
group by c.id;

-- =====================================================
-- RLS: bật RLS, cho phép anon đọc public, ghi qua service_role
-- (Tất cả mutation đi qua API route server, dùng service key)
-- =====================================================
alter table gm_round enable row level security;
alter table gm_contestant enable row level security;
alter table gm_question enable row level security;
alter table gm_round_state enable row level security;
alter table gm_answer enable row level security;
alter table gm_activity_log enable row level security;

-- Drop & recreate read policies (idempotent)
do $$ begin
  drop policy if exists "read all" on gm_round;
  drop policy if exists "read all" on gm_contestant;
  drop policy if exists "read all" on gm_question;
  drop policy if exists "read all" on gm_round_state;
  drop policy if exists "read all" on gm_answer;
end $$;

create policy "read all" on gm_round for select using (true);
create policy "read all" on gm_contestant for select using (true);
create policy "read all" on gm_question for select using (true);
create policy "read all" on gm_round_state for select using (true);
create policy "read all" on gm_answer for select using (true);

-- =====================================================
-- Bật Realtime cho các bảng cần đồng bộ
-- =====================================================
alter publication supabase_realtime add table gm_round_state;
alter publication supabase_realtime add table gm_answer;
