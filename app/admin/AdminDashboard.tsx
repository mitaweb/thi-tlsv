"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Round, Contestant, Question, LeaderboardRow } from "@/lib/types";
import { useRoundState, useCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";

export default function AdminDashboard() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setRounds(j.data);
          if (j.data.length && !activeRoundId) setActiveRoundId(j.data[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-ocean-900">Bảng điều khiển – Hội thi Thủ lĩnh Sinh viên</h1>
        <div className="flex gap-2 items-center">
          <Link href="/admin/questions" className="btn-secondary">Quản lý câu hỏi</Link>
          <Link href="/admin/logs" className="btn-secondary">📋 Xem log</Link>
          <Link href="/screen" target="_blank" className="btn-secondary">Mở màn trình chiếu</Link>
          <form action="/api/admin/logout" method="post" onSubmit={(e) => { e.preventDefault(); fetch("/api/admin/logout", { method: "POST" }).then(() => location.reload()); }}>
            <button className="btn-ghost text-rose-700">Đăng xuất</button>
          </form>
        </div>
      </header>

      <div className="flex gap-2">
        {rounds.map((r) => (
          <button
            key={r.id}
            onClick={() => setActiveRoundId(r.id)}
            className={`px-4 py-2 rounded-lg font-semibold border-2 ${
              activeRoundId === r.id ? "bg-ocean-600 text-white border-ocean-700" : "bg-white text-ocean-700 border-ocean-200"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {activeRoundId && <RoundControl roundId={activeRoundId} round={rounds.find((r) => r.id === activeRoundId)!} />}
    </main>
  );
}

function RoundControl({ roundId, round }: { roundId: string; round: Round }) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(roundId);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<any[]>([]);
  // Câu đã hoàn thành (có locked answer) và câu bị hủy
  const [completedQIds, setCompletedQIds] = useState<Set<string>>(new Set());
  const [voidedQIds, setVoidedQIds] = useState<Set<string>>(new Set());
  // Nhớ index câu cuối cùng để "Câu kế" không nhảy về đầu sau khi hủy
  const lastQIdxRef = useRef<number>(-1);

  useEffect(() => {
    fetch(`/api/questions?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setQuestions(j.data));
    fetch(`/api/contestants?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setContestants(j.data));
  }, [roundId]);

  // Khôi phục câu đã hủy từ activity_log (để reload trang vẫn nhớ)
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

  // Theo dõi câu đã hoàn thành (có ít nhất 1 locked answer)
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDone = () =>
      sb.from("gm_answer").select("question_id").eq("round_id", roundId).eq("locked", true)
        .then(({ data }) => setCompletedQIds(new Set((data ?? []).map((a: any) => a.question_id))));
    fetchDone();
    const i = setInterval(fetchDone, 4000);
    return () => clearInterval(i);
  }, [roundId]);

  const refreshLb = () => fetch(`/api/leaderboard?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setLeaderboard(j.data));
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
      // Xóa khỏi completedQIds nếu có
      setCompletedQIds((prev) => { const s = new Set(prev); s.delete(questionId); return s; });
    } else {
      alert("Lỗi: " + j.error);
    }
  }

  const phase = state?.phase ?? "idle";
  const currentIdx = questions.findIndex((q) => q.id === state?.current_question_id);

  // Cập nhật vị trí câu cuối khi có câu đang chạy
  if (currentIdx >= 0) lastQIdxRef.current = currentIdx;

  // Câu kế: tìm câu chưa bị hủy tiếp theo, bắt đầu từ sau câu cuối biết được
  const baseIdx = currentIdx >= 0 ? currentIdx : lastQIdxRef.current;
  const nextQ = questions.slice(baseIdx + 1).find((q) => !voidedQIds.has(q.id));

  // Số câu hoàn thành thực tế (không tính câu bị hủy)
  const doneCount = [...completedQIds].filter((id) => !voidedQIds.has(id)).length;

  // Auto-reveal khi đồng hồ về 0
  const autoRevealedRef = useRef<string | null>(null);
  useEffect(() => {
    const qid = state?.current_question_id;
    if (phase === "running" && remaining <= 0 && qid && autoRevealedRef.current !== qid) {
      autoRevealedRef.current = qid;
      dispatch("reveal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase, state?.current_question_id]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Cột giữa: điều khiển + câu hiện tại */}
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
            <button className="btn-secondary" onClick={() => dispatch("toggle_scoreboard")}>
              {state?.show_scoreboard ? "Ẩn" : "Hiện"} BXH trình chiếu
            </button>
            <button className="btn-ghost" onClick={() => dispatch("idle")}>↺ Idle</button>
            <button
              className="btn-danger ml-auto"
              onClick={async () => {
                if (!confirm(`Xóa toàn bộ điểm và câu trả lời của vòng thi này?\n\nThao tác không thể hoàn tác.`)) return;
                const r = await fetch("/api/reset", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ roundId }),
                });
                const j = await r.json();
                if (j.ok) alert("✓ Đã xóa dữ liệu. Hệ thống đã về trạng thái ban đầu.");
                else alert("Lỗi: " + j.error);
              }}
            >
              🗑 Reset dữ liệu
            </button>
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

      {/* Cột phải: BXH + thí sinh */}
      <div className="space-y-4">
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">🏆 Bảng xếp hạng</h2>
          <ol className="space-y-1">
            {leaderboard.map((r, i) => (
              <li key={r.contestant_id} className="flex justify-between items-center p-2 rounded-lg bg-white/70">
                <div>
                  <span className="font-bold mr-2">{i + 1}.</span>
                  <span>{r.full_name}</span>
                </div>
                <span className="font-mono font-bold text-ocean-700">{r.total_points}đ</span>
              </li>
            ))}
          </ol>
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
