-- =====================================================
-- Migration: Mở rộng cho các phần thi sân khấu
-- - gm_group: nhóm thi (SV / THPT)
-- - gm_round: thêm group_id, kind, display_order, total_points, scoring_config
-- - gm_contestant: thêm group_id
-- - gm_judge: giám khảo (BGK + Hội đồng SV)
-- - gm_panel_score: điểm chấm từng giám khảo cho từng thí sinh
-- - gm_panel_submission: tracking giám khảo đã chốt vòng nào
-- - gm_round_state: thêm các trường cho debate timer
-- - gm_display_state: global broadcast cho màn /screen
-- Idempotent: chạy nhiều lần không lỗi.
-- =====================================================

-- =====================================================
-- 1. gm_group
-- =====================================================
CREATE TABLE IF NOT EXISTS gm_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,           -- 'SV' | 'THPT'
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  debate_title text,                   -- 'XỨNG DANH THỦ LĨNH SINH VIÊN'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gm_group ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "read all" ON gm_group;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
CREATE POLICY "read all" ON gm_group FOR SELECT USING (true);

-- Seed 2 groups
INSERT INTO gm_group (code, name, display_order, debate_title)
VALUES
  ('SV',   'Sinh Viên', 1, 'XỨNG DANH THỦ LĨNH SINH VIÊN'),
  ('THPT', 'THPT',      2, 'XỨNG DANH THỦ LĨNH THPT')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order,
      debate_title = EXCLUDED.debate_title;

-- =====================================================
-- 2. gm_round: thêm cột
-- =====================================================
ALTER TABLE gm_round
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES gm_group(id),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'quiz' CHECK (kind IN ('quiz','panel','debate')),
  ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_points int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Migrate 2 vòng cũ vào nhóm tương ứng
UPDATE gm_round r
   SET group_id = g.id,
       kind = 'quiz',
       display_order = 2,           -- vòng 2 trong group (vì sẽ thêm Chân dung là vòng 1)
       total_points = 100
  FROM gm_group g
 WHERE r.code = 'SV' AND g.code = 'SV' AND r.group_id IS NULL;

UPDATE gm_round r
   SET group_id = g.id,
       kind = 'quiz',
       display_order = 2,
       total_points = 100
  FROM gm_group g
 WHERE r.code = 'THPT' AND g.code = 'THPT' AND r.group_id IS NULL;

-- =====================================================
-- 3. gm_contestant: thêm group_id
-- =====================================================
ALTER TABLE gm_contestant
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES gm_group(id);

UPDATE gm_contestant c
   SET group_id = r.group_id
  FROM gm_round r
 WHERE c.round_id = r.id AND c.group_id IS NULL;

-- =====================================================
-- 4. Seed 5 vòng mới (Chân dung, Nhạy bén, Phản biện cho SV + THPT)
-- =====================================================
-- SV - Chân dung (vòng 1): 70 BGK + 30 council = 100
INSERT INTO gm_round (code, name, group_id, kind, display_order, total_points, scoring_config, question_seconds)
SELECT 'SV_CHANDUNG', 'Chân dung thủ lĩnh', g.id, 'panel', 1, 100,
       '{"bgk": {"max": 70}, "council": {"enabled": true, "max": 30}}'::jsonb, 30
  FROM gm_group g WHERE g.code = 'SV'
ON CONFLICT (code) DO NOTHING;

-- SV - Nhạy bén (vòng 3): 100 BGK
INSERT INTO gm_round (code, name, group_id, kind, display_order, total_points, scoring_config, question_seconds)
SELECT 'SV_NHAYBEN', 'Thủ lĩnh nhạy bén', g.id, 'panel', 3, 100,
       '{"bgk": {"max": 100}}'::jsonb, 30
  FROM gm_group g WHERE g.code = 'SV'
ON CONFLICT (code) DO NOTHING;

-- SV - Phản biện (vòng 4): 100 BGK + debate UI
INSERT INTO gm_round (code, name, group_id, kind, display_order, total_points, scoring_config, question_seconds)
SELECT 'SV_PHANBIEN', 'Phản biện', g.id, 'debate', 4, 100,
       '{"bgk": {"max": 100}, "is_debate": true}'::jsonb, 30
  FROM gm_group g WHERE g.code = 'SV'
ON CONFLICT (code) DO NOTHING;

-- THPT - Chân dung (vòng 1): 100 BGK
INSERT INTO gm_round (code, name, group_id, kind, display_order, total_points, scoring_config, question_seconds)
SELECT 'THPT_CHANDUNG', 'Chân dung thủ lĩnh', g.id, 'panel', 1, 100,
       '{"bgk": {"max": 100}}'::jsonb, 30
  FROM gm_group g WHERE g.code = 'THPT'
ON CONFLICT (code) DO NOTHING;

-- THPT - Phản biện (vòng 3): 100 BGK + debate UI
INSERT INTO gm_round (code, name, group_id, kind, display_order, total_points, scoring_config, question_seconds)
SELECT 'THPT_PHANBIEN', 'Phản biện', g.id, 'debate', 3, 100,
       '{"bgk": {"max": 100}, "is_debate": true}'::jsonb, 30
  FROM gm_group g WHERE g.code = 'THPT'
ON CONFLICT (code) DO NOTHING;

-- Tạo gm_round_state cho các vòng mới
INSERT INTO gm_round_state (round_id, phase)
SELECT id, 'idle' FROM gm_round WHERE code IN ('SV_CHANDUNG','SV_NHAYBEN','SV_PHANBIEN','THPT_CHANDUNG','THPT_PHANBIEN')
ON CONFLICT (round_id) DO NOTHING;

-- =====================================================
-- 5. gm_judge
-- =====================================================
CREATE TABLE IF NOT EXISTS gm_judge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('bgk','sv_council')),
  display_order int NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gm_judge_role_idx ON gm_judge(role, active);

ALTER TABLE gm_judge ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "read all" ON gm_judge;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
CREATE POLICY "read all" ON gm_judge FOR SELECT USING (true);

-- =====================================================
-- 6. gm_panel_score
-- =====================================================
CREATE TABLE IF NOT EXISTS gm_panel_score (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES gm_round(id) ON DELETE CASCADE,
  contestant_id uuid NOT NULL REFERENCES gm_contestant(id) ON DELETE CASCADE,
  judge_id uuid NOT NULL REFERENCES gm_judge(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 0),
  locked boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, contestant_id, judge_id)
);
CREATE INDEX IF NOT EXISTS gm_panel_score_round_idx ON gm_panel_score(round_id);
CREATE INDEX IF NOT EXISTS gm_panel_score_judge_idx ON gm_panel_score(judge_id, round_id);

ALTER TABLE gm_panel_score ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "read all" ON gm_panel_score;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
CREATE POLICY "read all" ON gm_panel_score FOR SELECT USING (true);

-- =====================================================
-- 7. gm_panel_submission
-- =====================================================
CREATE TABLE IF NOT EXISTS gm_panel_submission (
  round_id uuid NOT NULL REFERENCES gm_round(id) ON DELETE CASCADE,
  judge_id uuid NOT NULL REFERENCES gm_judge(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, judge_id)
);

ALTER TABLE gm_panel_submission ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "read all" ON gm_panel_submission;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
CREATE POLICY "read all" ON gm_panel_submission FOR SELECT USING (true);

-- =====================================================
-- 8. gm_round_state: thêm cột cho debate
-- =====================================================
ALTER TABLE gm_round_state
  ADD COLUMN IF NOT EXISTS debate_match int,
  ADD COLUMN IF NOT EXISTS debate_phase text,
  ADD COLUMN IF NOT EXISTS debate_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS debate_duration_sec int;

-- =====================================================
-- 9. gm_display_state: singleton bảng để broadcast vòng nào đang chiếu
-- =====================================================
CREATE TABLE IF NOT EXISTS gm_display_state (
  id int PRIMARY KEY DEFAULT 1,
  current_round_id uuid REFERENCES gm_round(id) ON DELETE SET NULL,
  show_scoreboard boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO gm_display_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE gm_display_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "read all" ON gm_display_state;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
CREATE POLICY "read all" ON gm_display_state FOR SELECT USING (true);

-- =====================================================
-- 10. Bật Realtime cho các bảng mới cần đồng bộ
-- =====================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE gm_panel_score;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE gm_panel_submission;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE gm_display_state;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
