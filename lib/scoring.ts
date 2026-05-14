/**
 * Tính điểm dựa trên thời gian còn lại khi thí sinh submit.
 * Quy tắc:
 *   30s - 21s còn lại  → 10 điểm
 *   20s - 16s còn lại  → 7  điểm
 *   15s - 11s còn lại  → 5  điểm
 *   ≤ 10s còn lại      → 3  điểm
 *   Sai                → 0  điểm
 *
 * Input: elapsedMs = số ms từ khi câu hỏi bắt đầu (server timestamp).
 * Total câu = 30s.
 */
export function scoreFromElapsed(
  elapsedMs: number,
  isCorrect: boolean,
  totalSeconds = 30
): number {
  if (!isCorrect) return 0;
  const elapsed = elapsedMs / 1000;
  const remaining = Math.max(0, totalSeconds - elapsed);
  if (remaining >= 21) return 10;
  if (remaining >= 16) return 7;
  if (remaining >= 11) return 5;
  return 3;
}
