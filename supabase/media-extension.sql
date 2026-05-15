-- =====================================================
-- Migration: thêm media cho câu hỏi + show_top3 cho display state
-- =====================================================

-- 1. Media URL + type cho từng câu hỏi (ảnh hoặc video)
ALTER TABLE gm_question
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text CHECK (media_type IN ('image', 'video'));

-- 2. Cờ chiếu Top 3 trong display state (singleton)
ALTER TABLE gm_display_state
  ADD COLUMN IF NOT EXISTS show_top3 boolean NOT NULL DEFAULT false;

-- 3. Fix data: THPT round powerup phải là ⭐ Ngôi sao hi vọng (không phải bồ câu)
UPDATE gm_round
   SET powerup_icon = '⭐', powerup_name = 'Ngôi sao hi vọng'
 WHERE code = 'THPT' AND powerup_icon = '🕊️';
