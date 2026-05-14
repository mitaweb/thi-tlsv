"use client";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch(`/api/questions?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setQuestions(j.data));
    fetch(`/api/contestants?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setContestants(j.data));
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

  const phase = state?.phase ?? "idle";
  const currentIdx = questions.findIndex((q) => q.id === state?.current_question_id);
  const nextQ = questions[currentIdx + 1];

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
                {remaining.toFixed(1)}s
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
            <button className="btn-secondary" onClick={() => dispatch("leaderboard")}>
              🏆 Công bố BXH
            </button>
            <button className="btn-secondary" onClick={() => dispatch("toggle_scoreboard")}>
              {state?.show_scoreboard ? "Ẩn" : "Hiện"} BXH trình chiếu
            </button>
            <button className="btn-ghost" onClick={() => dispatch("idle")}>↺ Idle</button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-ocean-800">Câu hỏi hiện tại</h2>
            {nextQ && (
              <button className="btn-primary" onClick={() => dispatch("goto", { questionId: nextQ.id })}>
                → Chuyển câu kế ({nextQ.display_order})
              </button>
            )}
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
          <h2 className="font-bold text-ocean-800 mb-2">Danh sách câu hỏi</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {questions.map((q) => {
              const active = q.id === state?.current_question_id;
              return (
                <button
                  key={q.id}
                  onClick={() => dispatch("goto", { questionId: q.id })}
                  className={`p-2 rounded-lg border-2 text-sm text-left ${
                    active ? "border-ocean-600 bg-ocean-100" : "border-ocean-200 bg-white hover:bg-ocean-50"
                  }`}
                >
                  <div className="font-bold">Câu {q.display_order}</div>
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
