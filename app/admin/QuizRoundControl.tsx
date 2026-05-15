"use client";
import { useEffect, useRef, useState } from "react";
import type { Round, Contestant, Question, RoundLeaderboardRow } from "@/lib/types";
import { useRoundState, useCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";

/**
 * Điều khiển vòng quiz (Thủ lĩnh chinh phục / Trí tuệ thủ lĩnh).
 * Chuyển từ logic cũ của RoundControl trong AdminDashboard.
 * BXH hiện 2 cột: Điểm vòng + Tổng tích lũy.
 */
export default function QuizRoundControl({ roundId, round }: { roundId: string; round: Round }) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(roundId);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [leaderboard, setLeaderboard] = useState<RoundLeaderboardRow[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<any[]>([]);
  const [completedQIds, setCompletedQIds] = useState<Set<string>>(new Set());
  const [voidedQIds, setVoidedQIds] = useState<Set<string>>(new Set());
  const lastQIdxRef = useRef<number>(-1);

  useEffect(() => {
    fetch(`/api/questions?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setQuestions(j.data));
    fetch(`/api/contestants?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setContestants(j.data));
  }, [roundId]);

  // Khôi phục câu đã hủy từ activity_log
  useEffect(() => {
    const sb = getBrowserClient();
    sb.from("gm_activity_log")
      .select("question_id")
      .eq("round_id", roundId)
      .eq("action", "void_question")
      .then(({ data }) => {
        const ids = new Set((data ?? []).map((l: any) => l.question_id).filter(Boolean) as string[]);
        if (ids.size) setVoidedQIds(ids);
      });
  }, [roundId]);

  // Câu đã hoàn thành (có locked answer)
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDone = () =>
      sb.from("gm_answer").select("question_id").eq("round_id", roundId).eq("locked", true)
        .then(({ data }) => setCompletedQIds(new Set((data ?? []).map((a: any) => a.question_id))));
    fetchDone();
    const i = setInterval(fetchDone, 4000);
    return () => clearInterval(i);
  }, [roundId]);

  const refreshLb = () =>
    fetch(`/api/round-leaderboard?roundId=${roundId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setLeaderboard(j.data));
  useEffect(() => {
    refreshLb();
    const i = setInterval(refreshLb, 3000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // Subscribe answers cho câu hiện tại
  useEffect(() => {
    const qid = state?.current_question_id;
    if (!qid) return;
    const sb = getBrowserClient();
    sb.from("gm_answer").select("*").eq("question_id", qid).then(({ data }) => setCurrentAnswers(data ?? []));
    const ch = sb
      .channel(`admin-ans-${qid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_answer", filter: `question_id=eq.${qid}` }, () => {
        sb.from("gm_answer").select("*").eq("question_id", qid).then(({ data }) => setCurrentAnswers(data ?? []));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [state?.current_question_id]);

  async function dispatch(action: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, action, ...extra }),
    });
    if (!r.ok) alert("Lỗi: " + (await r.text()));
  }

  async function voidQuestion(questionId: string, displayOrder: number) {
    if (!confirm(`Hủy kết quả câu ${displayOrder}?\n\nToàn bộ điểm câu này sẽ bị xóa. Thí sinh sẽ thi câu thay thế.\nThao tác không thể hoàn tác.`)) return;
    const r = await fetch("/api/void-question", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, questionId }),
    });
    const j = await r.json();
    if (j.ok) {
      setVoidedQIds((prev) => new Set([...prev, questionId]));
      setCompletedQIds((prev) => { const s = new Set(prev); s.delete(questionId); return s; });
    } else {
      alert("Lỗi: " + j.error);
    }
  }

  // Track show_top3 từ display_state
  const [showTop3, setShowTop3] = useState(false);
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("show_top3").eq("id", 1).maybeSingle().then(({ data }) => {
        setShowTop3((data as any)?.show_top3 === true);
      });
    fetchDs();
    const ch = sb
      .channel(`qr-ds-${roundId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_display_state" }, fetchDs)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [roundId]);

  async function toggleProjection() {
    // Set gm_display_state.current_round_id = this round, toggle show_scoreboard
    const isShowing = (await getDisplayState()) === roundId && state?.show_scoreboard;
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, showScoreboard: !isShowing, showTop3: false }),
    });
    await dispatch("toggle_scoreboard");
  }

  async function toggleTop3() {
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, showTop3: !showTop3, showScoreboard: true }),
    });
    if (!state?.show_scoreboard) await dispatch("toggle_scoreboard");
  }

  async function getDisplayState(): Promise<string | null> {
    const r = await fetch("/api/display-state").then((x) => x.json()).catch(() => null);
    return r?.data?.current_round_id ?? null;
  }

  const phase = state?.phase ?? "idle";
  const currentIdx = questions.findIndex((q) => q.id === state?.current_question_id);
  if (currentIdx >= 0) lastQIdxRef.current = currentIdx;
  const baseIdx = currentIdx >= 0 ? currentIdx : lastQIdxRef.current;
  const nextQ = questions.slice(baseIdx + 1).find((q) => !voidedQIds.has(q.id));
  const doneCount = [...completedQIds].filter((id) => !voidedQIds.has(id)).length;

  // Auto-reveal sau 3 giây khi hết giờ
  const autoRevealedRef = useRef<string | null>(null);
  useEffect(() => {
    const qid = state?.current_question_id;
    if (phase === "running" && remaining <= 0 && qid && autoRevealedRef.current !== qid) {
      autoRevealedRef.current = qid;
      const t = setTimeout(() => dispatch("reveal"), 3000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase, state?.current_question_id]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        <div className="card space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-ocean-700">Giai đoạn</div>
              <div className="text-xl font-bold text-ocean-900">{phaseLabel(phase)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-ocean-700">Thời gian còn lại</div>
              <div className={`text-4xl font-mono font-bold ${remaining <= 5 ? "text-rose-600" : "text-ocean-900"}`}>
                {Math.ceil(remaining)}s
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={phase === "running"}
              onClick={() => dispatch("start")}
            >
              ▶ Bắt đầu đếm giờ
            </button>
            <button className="btn-secondary" disabled={phase !== "running" && phase !== "armed"} onClick={() => dispatch("reveal")}>
              👁 Hiện đáp án
            </button>
            <button className="btn-secondary" onClick={toggleProjection}>
              {state?.show_scoreboard ? "Ẩn" : "🏆 Chiếu"} BXH lên trình chiếu
            </button>
            <button
              className={showTop3 ? "btn-danger" : "btn-secondary"}
              onClick={toggleTop3}
            >
              {showTop3 ? "Ẩn Top 3" : "🥇 Chiếu Top 3"}
            </button>
            <button className="btn-ghost" onClick={() => dispatch("idle")}>↺ Idle</button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-ocean-800">Câu hỏi hiện tại</h2>
              <div className="text-xs text-ocean-600 mt-0.5">
                Hoàn thành: <span className="font-bold text-ocean-800">{doneCount}</span> câu
                {voidedQIds.size > 0 && <span className="ml-2 text-rose-600">(bỏ: {voidedQIds.size})</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {currentQuestion && (
                <button
                  className="btn-danger text-sm"
                  onClick={() => voidQuestion(currentQuestion.id, currentQuestion.display_order)}
                >
                  🚫 Hủy câu {currentQuestion.display_order}
                </button>
              )}
              {nextQ && (
                <button className="btn-primary" onClick={() => dispatch("goto", { questionId: nextQ.id })}>
                  → Câu kế ({nextQ.display_order})
                </button>
              )}
            </div>
          </div>
          {currentQuestion ? (
            <div className="space-y-2">
              <div className="text-sm text-ocean-700">Câu {currentQuestion.display_order} / {questions.length}</div>
              <div className="text-lg font-semibold text-ocean-900">{currentQuestion.prompt}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                {(["A", "B", "C", "D"] as const).map((k) => {
                  const text = (currentQuestion as any)["option_" + k.toLowerCase()];
                  if (!text) return null;
                  const isAnswer = currentQuestion.correct_option === k;
                  return (
                    <div key={k} className={`p-3 rounded-lg border-2 ${isAnswer ? "border-emerald-500 bg-emerald-50" : "border-ocean-200 bg-white"}`}>
                      <span className="font-bold mr-2">{k}.</span>{text}
                      {isAnswer && <span className="ml-2 text-emerald-700 text-xs font-bold">(đáp án đúng)</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-ocean-700">Chưa chọn câu hỏi. Bấm vào câu bên dưới để bắt đầu.</p>
          )}
        </div>

        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">Tiến trình thí sinh ở câu hiện tại</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {contestants.map((c) => {
              const a = currentAnswers.find((x: any) => x.contestant_id === c.id);
              const cls = !a
                ? "bg-white border-ocean-200"
                : a.locked
                ? a.is_correct
                  ? "bg-emerald-100 border-emerald-400"
                  : "bg-rose-100 border-rose-400"
                : "bg-amber-100 border-amber-400";
              return (
                <div key={c.id} className={`p-2 rounded-lg border-2 ${cls}`}>
                  <div className="text-sm font-semibold">{c.display_order}. {c.full_name}</div>
                  <div className="text-xs">
                    {!a ? "Chưa trả lời" : a.locked ? `Đã chốt: ${a.selected_option ?? "—"} (${a.points_awarded}đ)` : `Đang chọn: ${a.selected_option ?? "—"}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-ocean-800">Danh sách câu hỏi</h2>
            <div className="flex items-center gap-3 text-xs text-ocean-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-400 inline-block" /> Hoàn thành</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-100 border border-rose-400 inline-block" /> Đã hủy</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-ocean-100 border border-ocean-600 inline-block" /> Đang thi</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {questions.map((q) => {
              const active = q.id === state?.current_question_id;
              const voided = voidedQIds.has(q.id);
              const done = completedQIds.has(q.id) && !voided;
              const cls = active
                ? "border-ocean-600 bg-ocean-100"
                : voided
                ? "border-rose-400 bg-rose-50 opacity-60"
                : done
                ? "border-emerald-400 bg-emerald-50"
                : "border-ocean-200 bg-white hover:bg-ocean-50";
              return (
                <button
                  key={q.id}
                  onClick={() => dispatch("goto", { questionId: q.id })}
                  className={`p-2 rounded-lg border-2 text-sm text-left ${cls}`}
                >
                  <div className="font-bold flex items-center gap-1">
                    Câu {q.display_order}
                    {voided && <span className="text-rose-600 text-xs">✗ Hủy</span>}
                    {done && <span className="text-emerald-600 text-xs">✓</span>}
                  </div>
                  <div className="text-xs line-clamp-2 text-ocean-700">{q.prompt}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cột phải: BXH (2 cột vòng + tổng) + thí sinh */}
      <div className="space-y-4">
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">🏆 Bảng xếp hạng</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ocean-600">
                <th className="text-left py-1">#</th>
                <th className="text-left">Thí sinh</th>
                <th className="text-right">Vòng</th>
                <th className="text-right">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r, i) => (
                <tr key={r.contestant_id} className="border-t border-ocean-100">
                  <td className="py-1.5 font-bold">{i + 1}</td>
                  <td className="py-1.5">{r.full_name}</td>
                  <td className="text-right font-mono text-ocean-700">{r.round_score}</td>
                  <td className="text-right font-mono font-bold text-ocean-800">{r.cumulative_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">Link thi thí sinh</h2>
          <p className="text-xs text-ocean-700 mb-2">Chia sẻ link riêng cho từng thí sinh:</p>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {contestants.map((c) => (
              <div key={c.id} className="text-xs p-2 bg-white/70 rounded-lg">
                <div className="font-semibold">{c.display_order}. {c.full_name}</div>
                <code
                  onClick={() => {
                    const url = `${location.origin}/play/${c.access_code}`;
                    navigator.clipboard.writeText(url);
                    alert("Đã copy: " + url);
                  }}
                  className="cursor-pointer text-ocean-700 break-all hover:underline"
                >
                  /play/{c.access_code}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function phaseLabel(p: string) {
  switch (p) {
    case "idle": return "Nghỉ";
    case "armed": return "Sẵn sàng";
    case "running": return "ĐANG THI";
    case "reveal": return "Hiện đáp án";
    case "leaderboard": return "Bảng xếp hạng";
    default: return p;
  }
}
