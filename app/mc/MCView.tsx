"use client";
import { useEffect, useMemo, useState } from "react";
import { useRoundState, useCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";
import type { Round, Contestant, Answer } from "@/lib/types";

export default function MCView() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState<string>("");

  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data.length) {
          setRounds(j.data);
          setRoundId(j.data[0].id);
        }
      });
  }, []);

  if (!roundId) {
    return (
      <main className="ocean-bg min-h-screen p-4 flex items-center justify-center">
        <div className="card">Đang tải...</div>
      </main>
    );
  }

  const round = rounds.find((r) => r.id === roundId)!;
  return <MCStage round={round} rounds={rounds} onRoundChange={setRoundId} />;
}

function MCStage({
  round,
  rounds,
  onRoundChange,
}: {
  round: Round;
  rounds: Round[];
  onRoundChange: (id: string) => void;
}) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(round.id);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  // Fetch danh sách thí sinh
  useEffect(() => {
    const sb = getBrowserClient();
    sb.from("gm_contestant")
      .select("*")
      .eq("round_id", round.id)
      .order("display_order")
      .then(({ data }) => {
        setContestants((data ?? []) as Contestant[]);
      });
  }, [round.id]);

  // Fetch + subscribe answers cho câu hiện tại
  useEffect(() => {
    const qid = state?.current_question_id;
    if (!qid) {
      setAnswers({});
      return;
    }
    const sb = getBrowserClient();
    const fetchAns = () =>
      sb.from("gm_answer")
        .select("*")
        .eq("question_id", qid)
        .then(({ data }) => {
          const map: Record<string, Answer> = {};
          for (const a of (data ?? []) as Answer[]) {
            map[a.contestant_id] = a;
          }
          setAnswers(map);
        });
    fetchAns();
    const ch = sb
      .channel(`mc-ans-${qid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gm_answer", filter: `question_id=eq.${qid}` },
        fetchAns
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [state?.current_question_id]);

  const phase = state?.phase ?? "idle";
  const isReveal = phase === "reveal" || phase === "leaderboard";
  const questionNo = state?.question_no ?? 0;

  const submittedCount = useMemo(
    () => Object.values(answers).filter((a) => a.locked).length,
    [answers]
  );

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <header className="card flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ocean-600 font-semibold">📺 Màn hình MC</div>
            <h1 className="text-2xl font-bold text-ocean-900">{round.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            {rounds.length > 1 && (
              <select
                className="p-2 rounded-lg border border-ocean-300 text-sm"
                value={round.id}
                onChange={(e) => onRoundChange(e.target.value)}
              >
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
            <div className="text-right">
              <div className="text-xs text-ocean-600">Phase</div>
              <div className="font-bold text-ocean-800 text-sm">
                {phase === "idle"
                  ? "⏸ Chờ"
                  : phase === "running"
                  ? remaining > 0
                    ? `⏱ ${Math.ceil(remaining)}s`
                    : "⏰ Hết giờ"
                  : phase === "reveal"
                  ? "✅ Công bố"
                  : phase === "leaderboard"
                  ? "🏆 BXH"
                  : phase}
              </div>
            </div>
          </div>
        </header>

        {/* Câu hỏi hiện tại */}
        <section className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-ocean-900">Câu hỏi hiện tại</h2>
              <div className="text-sm text-ocean-700">
                Hoàn thành: <b>{questionNo > 0 ? questionNo : 0}</b> câu
                {round.questions_to_play ? ` / ${round.questions_to_play}` : ""}
              </div>
            </div>
            {currentQuestion && (
              <div className="text-sm font-semibold text-ocean-700">
                Câu {questionNo > 0 ? questionNo : currentQuestion.display_order}
                {round.questions_to_play ? ` / ${round.questions_to_play}` : ""}
              </div>
            )}
          </div>

          {currentQuestion ? (
            <>
              <h3 className="text-xl font-bold text-ocean-900 mb-3">{currentQuestion.prompt}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(["A", "B", "C", "D"] as const).map((k) => {
                  const text = (currentQuestion as any)["option_" + k.toLowerCase()];
                  if (!text) return null;
                  const isCorrect = currentQuestion.correct_option === k;
                  return (
                    <div
                      key={k}
                      className={`p-3 rounded-lg border-2 ${
                        isCorrect
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-ocean-200 bg-white"
                      }`}
                    >
                      <span className="font-bold text-ocean-800 mr-2">{k}.</span>
                      {text}
                      {isCorrect && (
                        <span className="ml-2 text-emerald-700 font-bold text-xs">(đáp án đúng)</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-ocean-600 italic">Chưa có câu nào đang chạy.</div>
          )}
        </section>

        {/* Tiến trình thí sinh */}
        <section className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-ocean-900">
              Tiến trình thí sinh ở câu hiện tại
            </h2>
            <div className="text-sm text-ocean-700">
              Đã chốt: <b className="text-emerald-700">{submittedCount}</b> / {contestants.length}
            </div>
          </div>

          {contestants.length === 0 ? (
            <div className="text-ocean-600 italic">Chưa có thí sinh.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {contestants.map((c) => {
                const ans = answers[c.id];
                const hasSelected = !!ans?.selected_option;
                const hasSubmitted = !!ans?.locked;
                // Trước khi công bố: chỉ hiện màu xanh nước (đã chốt) hoặc trắng (chưa)
                // Sau công bố: xanh lá (đúng) / hồng (sai) / xám (không trả lời)
                const cardCls = isReveal
                  ? ans?.selected_option == null
                    ? "border-ocean-200 bg-ocean-50/40 opacity-70"
                    : ans?.is_correct
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-rose-400 bg-rose-50"
                  : hasSubmitted
                  ? "border-ocean-400 bg-ocean-50"
                  : hasSelected
                  ? "border-ocean-200 bg-white"
                  : "border-ocean-200 bg-white opacity-80";

                return (
                  <div key={c.id} className={`p-3 rounded-lg border-2 transition ${cardCls}`}>
                    <div className="font-bold text-ocean-900">
                      {c.display_order}. {c.full_name}
                    </div>
                    <div className="text-sm text-ocean-700 mt-1">
                      {!hasSelected ? (
                        <span className="text-ocean-500 italic">Chưa chọn</span>
                      ) : hasSubmitted ? (
                        <>
                          Đã chốt: <b>{ans!.selected_option}</b>
                          {isReveal && (
                            <span className="ml-1 font-mono font-bold">
                              ({ans!.points_awarded}đ)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ocean-600">
                          Đang chọn: <b>{ans!.selected_option}</b>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
