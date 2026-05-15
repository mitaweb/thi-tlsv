"use client";
import { useEffect, useMemo, useState } from "react";
import { useRoundState, useCountdown, useDebateCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";
import type { Round, Contestant, Answer, RoundLeaderboardRow, Judge, RoundState, Question } from "@/lib/types";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; debate_title: string | null } | null;
}

interface JudgeProgress extends Judge {
  submitted: boolean;
  submittedAt: string | null;
}

const DEBATE_PHASE_LABELS: Record<string, string> = {
  thinking: "🧠 Suy nghĩ",
  presenting: "🎤 Trình bày",
  rebutting: "💬 Phản biện",
  responding: "↩ Trả lời",
};

const MATCH_PAIRS: Record<number, [number, number]> = {
  1: [0, 1],
  2: [0, 2],
  3: [2, 1],
};

/**
 * MC view — read-only, auto-follow vòng admin đang chiếu (qua gm_display_state).
 * Render khác nhau theo round.kind: quiz / panel / debate.
 */
export default function MCView() {
  const [rounds, setRounds] = useState<RoundWithGroup[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);

  // Fetch all rounds (cần cho lookup)
  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => j.ok && setRounds(j.data));
  }, []);

  // Auto-follow display_state.current_round_id
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("current_round_id").eq("id", 1).maybeSingle().then(({ data }) => {
        const rid = (data as any)?.current_round_id ?? null;
        setRoundId(rid);
      });
    fetchDs();
    const ch = sb
      .channel("mc-display-state")
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_display_state" }, fetchDs)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  if (rounds.length === 0) {
    return (
      <main className="ocean-bg min-h-screen p-4 flex items-center justify-center">
        <div className="card">Đang tải...</div>
      </main>
    );
  }

  const round = roundId ? rounds.find((r) => r.id === roundId) : null;

  if (!round) {
    return (
      <main className="ocean-bg min-h-screen p-4 flex items-center justify-center">
        <div className="card text-center max-w-md">
          <h1 className="text-2xl font-bold text-ocean-800 mb-2">📺 Màn hình MC</h1>
          <p className="text-ocean-700">Đang chờ admin chọn vòng để bắt đầu.</p>
          <p className="text-xs text-ocean-600 mt-2">
            Màn hình này tự động chuyển sang vòng admin đang điều khiển — không cần chọn thủ công.
          </p>
        </div>
      </main>
    );
  }

  return <MCStage round={round} />;
}

function MCStage({ round }: { round: RoundWithGroup }) {
  // Hoist useRoundState ở 1 nơi duy nhất, pass state xuống children.
  // Tránh lỗi 'cannot add postgres_changes after subscribe' do nhiều component
  // cùng subscribe channel `round-state-{roundId}`.
  const { state, currentQuestion, serverOffsetMs } = useRoundState(round.id);

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <MCHeader round={round} state={state} serverOffsetMs={serverOffsetMs} />
        {round.kind === "quiz" ? (
          <QuizMC round={round} state={state} currentQuestion={currentQuestion} />
        ) : round.kind === "panel" ? (
          <PanelMC round={round} />
        ) : (
          <DebateMC round={round} state={state} serverOffsetMs={serverOffsetMs} />
        )}
      </div>
    </main>
  );
}

/* ============== HEADER ================ */
function MCHeader({
  round,
  state,
  serverOffsetMs,
}: {
  round: RoundWithGroup;
  state: RoundState | null;
  serverOffsetMs: number;
}) {
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const debateRemaining = useDebateCountdown(state, serverOffsetMs);
  const phase = state?.phase ?? "idle";

  let phaseDisplay = "⏸ Chờ";
  if (round.kind === "quiz") {
    if (phase === "running") phaseDisplay = remaining > 0 ? `⏱ ${Math.ceil(remaining)}s` : "⏰ Hết giờ";
    else if (phase === "reveal") phaseDisplay = "✅ Công bố";
    else if (phase === "leaderboard") phaseDisplay = "🏆 BXH";
  } else if (round.kind === "debate") {
    if (phase === "running") phaseDisplay = debateRemaining > 0 ? `⏱ ${formatMMSS(debateRemaining)}` : "⏰ Hết giờ";
    else if (state?.show_scoreboard) phaseDisplay = "🏆 BXH";
  } else {
    if (state?.show_scoreboard) phaseDisplay = "🏆 BXH";
    else phaseDisplay = "📝 Đang chấm";
  }

  return (
    <header className="card flex items-center justify-between flex-wrap gap-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-ocean-600 font-semibold">
          📺 Màn hình MC · {round.group?.name ?? "—"} · {kindLabel(round.kind)}
        </div>
        <h1 className="text-2xl font-bold text-ocean-900">{round.name}</h1>
      </div>
      <div className="text-right">
        <div className="text-xs text-ocean-600">Trạng thái</div>
        <div className="font-bold text-ocean-800 text-lg">{phaseDisplay}</div>
      </div>
    </header>
  );
}

function kindLabel(k: string) {
  return k === "quiz" ? "trắc nghiệm" : k === "panel" ? "chấm điểm" : "phản biện";
}

/* ============== QUIZ MC ================ */
function QuizMC({
  round,
  state,
  currentQuestion,
}: {
  round: RoundWithGroup;
  state: RoundState | null;
  currentQuestion: Question | null;
}) {
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    const sb = getBrowserClient();
    sb.from("gm_contestant").select("*").eq("round_id", round.id).order("display_order").then(({ data }) => {
      setContestants((data ?? []) as Contestant[]);
    });
  }, [round.id]);

  useEffect(() => {
    const qid = state?.current_question_id;
    if (!qid) { setAnswers({}); return; }
    const sb = getBrowserClient();
    const fetchAns = () =>
      sb.from("gm_answer").select("*").eq("question_id", qid).then(({ data }) => {
        const map: Record<string, Answer> = {};
        for (const a of (data ?? []) as Answer[]) map[a.contestant_id] = a;
        setAnswers(map);
      });
    fetchAns();
    const ch = sb.channel(`mc-ans-${qid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_answer", filter: `question_id=eq.${qid}` }, fetchAns)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [state?.current_question_id]);

  const phase = state?.phase ?? "idle";
  const isReveal = phase === "reveal" || phase === "leaderboard";
  const questionNo = state?.question_no ?? 0;
  const submittedCount = useMemo(() => Object.values(answers).filter((a) => a.locked).length, [answers]);

  return (
    <>
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
                      isCorrect ? "border-emerald-500 bg-emerald-50" : "border-ocean-200 bg-white"
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

      <section className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-ocean-900">Tiến trình thí sinh ở câu hiện tại</h2>
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
                          <span className="ml-1 font-mono font-bold">({ans!.points_awarded}đ)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-ocean-600">Đang chọn: <b>{ans!.selected_option}</b></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

/* ============== PANEL MC (Chân dung, Nhạy bén) ================ */
function PanelMC({ round }: { round: RoundWithGroup }) {
  const [judges, setJudges] = useState<JudgeProgress[]>([]);

  useEffect(() => {
    const fetchProgress = () =>
      fetch(`/api/panel-progress?roundId=${round.id}`)
        .then((r) => r.json())
        .then((j) => j.ok && setJudges(j.judges));
    fetchProgress();
    const sb = getBrowserClient();
    const ch = sb.channel(`mc-panel-progress-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission", filter: `round_id=eq.${round.id}` }, fetchProgress)
      .subscribe();
    const i = setInterval(fetchProgress, 5000);
    return () => { sb.removeChannel(ch); clearInterval(i); };
  }, [round.id]);

  const bgkJudges = judges.filter((j) => j.role === "bgk");
  const councilJudges = judges.filter((j) => j.role === "sv_council");
  const bgkSubmitted = bgkJudges.filter((j) => j.submitted).length;
  const councilSubmitted = councilJudges.filter((j) => j.submitted).length;
  const bgkMax = round.scoring_config?.bgk?.max ?? 100;
  const councilEnabled = !!round.scoring_config?.council?.enabled;
  const councilMax = round.scoring_config?.council?.max ?? 30;

  return (
    <>
      <section className="card">
        <h2 className="text-lg font-bold text-ocean-900 mb-2">Tiến độ chấm điểm</h2>
        <div className="text-xs text-ocean-700 mb-3">
          BGK max {bgkMax}đ {councilEnabled ? `· Hội đồng SV max ${councilMax}đ` : ""} · Tổng {round.total_points}đ
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <span className="font-semibold text-ocean-800">Ban Giám khảo</span>
              <span className="font-mono text-sm">{bgkSubmitted}/{bgkJudges.length}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {bgkJudges.map((j) => (
                <div
                  key={j.id}
                  className={`p-2 rounded-lg border-2 text-sm ${
                    j.submitted ? "border-emerald-400 bg-emerald-50" : "border-ocean-200 bg-white"
                  }`}
                >
                  <div className="font-semibold">{j.display_name}</div>
                  <div className="text-xs">
                    {j.submitted ? "✓ Đã chốt" : "Đang chấm..."}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {councilEnabled && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-ocean-800">Hội đồng Sinh Viên</span>
                <span className="font-mono text-sm">{councilSubmitted}/{councilJudges.length}</span>
              </div>
              <div className="w-full h-3 bg-ocean-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{ width: `${(councilSubmitted / Math.max(1, councilJudges.length)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

    </>
  );
}

/* ============== DEBATE MC ================ */
function DebateMC({
  round,
  state,
  serverOffsetMs,
}: {
  round: RoundWithGroup;
  state: RoundState | null;
  serverOffsetMs: number;
}) {
  const remaining = useDebateCountdown(state, serverOffsetMs);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [judges, setJudges] = useState<JudgeProgress[]>([]);

  // Top 3
  useEffect(() => {
    const fetchTop3 = async () => {
      const r = await fetch(`/api/debate-contestants?roundId=${round.id}`).then((x) => x.json());
      if (!r.ok || !r.data?.length) { setContestants([]); return; }
      const ids = r.data.map((d: any) => d.contestant_id);
      const sb = getBrowserClient();
      const { data } = await sb.from("gm_contestant").select("*").in("id", ids);
      const ordered = ids
        .map((id: string) => (data ?? []).find((c: any) => c.id === id))
        .filter(Boolean) as Contestant[];
      setContestants(ordered);
    };
    fetchTop3();
    const sb = getBrowserClient();
    const ch = sb.channel(`mc-debate-top3-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission" }, fetchTop3)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [round.id]);

  // Tiến độ chấm BGK
  useEffect(() => {
    const fetchProgress = () =>
      fetch(`/api/panel-progress?roundId=${round.id}`)
        .then((r) => r.json())
        .then((j) => j.ok && setJudges(j.judges));
    fetchProgress();
    const sb = getBrowserClient();
    const ch = sb.channel(`mc-debate-progress-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission", filter: `round_id=eq.${round.id}` }, fetchProgress)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [round.id]);

  const bgkJudges = judges.filter((j) => j.role === "bgk");
  const bgkSubmitted = bgkJudges.filter((j) => j.submitted).length;
  const matchNo = state?.debate_match;
  const matchPair = matchNo && contestants.length >= 3 ? MATCH_PAIRS[matchNo] : null;
  const phase = state?.phase ?? "idle";
  const debatePhaseLabel = state?.debate_phase ? DEBATE_PHASE_LABELS[state.debate_phase] ?? state.debate_phase : null;

  return (
    <>
      {/* Top 3 + match info */}
      <section className="card">
        <h2 className="text-lg font-bold text-ocean-900 mb-2">🏆 Top 3 vào phản biện</h2>
        <p className="text-xs text-ocean-700 mb-3">
          Tự chọn theo điểm tích lũy qua vòng liền kề trước. Cập nhật khi BGK chốt vòng trước.
        </p>
        {contestants.length === 0 ? (
          <div className="text-ocean-600 italic">Chưa xác định được top 3.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {contestants.map((c, i) => (
              <div
                key={c.id}
                className={`p-3 rounded-lg border-2 ${
                  i === 0 ? "bg-amber-50 border-amber-300"
                  : i === 1 ? "bg-slate-50 border-slate-300"
                  : "bg-orange-50 border-orange-300"
                }`}
              >
                <div className="font-bold text-ocean-900">
                  {["🥇", "🥈", "🥉"][i] ?? i + 1} {c.full_name}
                </div>
                {c.organization && <div className="text-xs text-ocean-600">{c.organization}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cặp đấu hiện tại + timer */}
      <section className="card">
        <h2 className="text-lg font-bold text-ocean-900 mb-3">Cặp đấu hiện tại</h2>
        {!matchNo || !matchPair ? (
          <div className="text-ocean-600 italic">Chưa bắt đầu cặp đấu nào.</div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm text-amber-700 font-bold uppercase tracking-wide">
                Cặp đấu số {matchNo}
              </div>
              <div className="text-2xl font-bold text-ocean-900 mt-1">
                {contestants[matchPair[0]]?.full_name}
                <span className="mx-3 text-amber-600">vs</span>
                {contestants[matchPair[1]]?.full_name}
              </div>
              {debatePhaseLabel && (
                <div className="text-lg font-semibold text-ocean-800 mt-2">
                  {debatePhaseLabel}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-ocean-600">Thời gian còn lại</div>
              <div
                className={`text-5xl font-mono font-extrabold px-4 py-2 rounded-xl ${
                  remaining <= 10 && phase === "running"
                    ? "bg-rose-500 text-white animate-pulse"
                    : "bg-ocean-100 text-ocean-900"
                }`}
              >
                {phase === "running" && remaining > 0
                  ? formatMMSS(remaining)
                  : remaining <= 0 && state?.debate_duration_sec
                  ? "HẾT"
                  : "—"}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Tiến độ chấm BGK */}
      <section className="card">
        <h2 className="text-lg font-bold text-ocean-900 mb-2">Tiến độ chấm BGK</h2>
        <p className="text-xs text-ocean-700 mb-3">
          BGK chấm tổng 0-100đ cho mỗi thí sinh sau khi đấu xong cả 3 cặp.
        </p>
        <div className="flex justify-between mb-1 text-sm">
          <span className="font-semibold text-ocean-800">Ban Giám khảo</span>
          <span className="font-mono">{bgkSubmitted}/{bgkJudges.length}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {bgkJudges.map((j) => (
            <div
              key={j.id}
              className={`p-2 rounded-lg border-2 text-xs ${
                j.submitted ? "border-emerald-400 bg-emerald-50" : "border-ocean-200 bg-white"
              }`}
            >
              <div className="font-semibold">{j.display_name}</div>
              <div>{j.submitted ? "✓ Đã chốt" : "Đang chấm..."}</div>
            </div>
          ))}
        </div>
      </section>

    </>
  );
}

function formatMMSS(sec: number): string {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
