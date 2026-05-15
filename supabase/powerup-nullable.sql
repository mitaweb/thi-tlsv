-- Migration: cho phép question_id = NULL trong gm_powerup_use
-- Ý nghĩa: NULL = "đã kích hoạt, chờ câu tiếp theo"
-- Server sẽ gán question_id khi IT bấm "Câu kế tiếp" (goto action)
ALTER TABLE gm_powerup_use
  ALTER COLUMN question_id DROP NOT NULL;
