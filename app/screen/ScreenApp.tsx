"use client";
import { useEffect, useRef, useState } from "react";
import type { Round, RoundLeaderboardRow, Contestant } from "@/lib/types";
import { useRoundState, useCountdown, useDebateCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";

const DEBATE_PHASE_LABELS: Record<string, string> = {
  thinking: "🧠 Suy nghĩ",
  presenting: "🎤 Trình bày",
  rebutting: "💬 Phản biện",
  responding: "↩ Trả lời phản biện",
};

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; debate_title: string | null } | null;
}

export default function ScreenApp() {
  const [rounds, setRounds] = useState<RoundWithGroup[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  // Fetch rounds
  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => j.ok && setRounds(j.data));
  }, []);

  // Subscribe gm_display_state → tự follow vòng admin đang chiếu
  // Cập nhật roundId KỂ CẢ khi current_round_id = null (admin ẩn BXH panel)
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("current_round_id").eq("id", 1).maybeSingle().then(({ data }) => {
        const rid = (data as any)?.current_round_id ?? null;
        setRoundId(rid);
      });
    fetchDs();
    const ch = sb
      .channel("screen-display-state")
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_display_state" }, fetchDs)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  if (!audioReady) {
    return (
      <main className="ocean-bg flex items-center justify-center min-h-screen">
        <div className="card text-center max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-ocean-800">Màn hình trình chiếu</h1>
          <p className="text-ocean-700">Bấm "Bật" để kích hoạt âm thanh đồng hồ đếm ngược.</p>
          <p className="text-xs text-ocean-600">
            Sau khi bật, màn hình sẽ tự động theo vòng admin chọn (không cần chọn vòng ở đây).
          </p>
          <button className="btn-primary w-full text-lg" onClick={() => setAudioReady(true)}>
            🔊 Bật trình chiếu
          </button>
        </div>
      </main>
    );
  }

  const round = rounds.find((r) => r.id === roundId);
  if (!round) {
    return (
      <main className="ocean-bg flex items-center justify-center min-h-screen">
        <div className="card text-center max-w-md text-ocean-700">
          <h2 className="text-xl font-bold mb-2">Chưa có vòng nào đang chiếu</h2>
          <p>Đợi admin chọn vòng để bắt đầu.</p>
        </div>
      </main>
    );
  }

  // Render theo round.kind
  if (round.kind === "quiz") {
    return <ScreenStage roundId={round.id} round={round} />;
  }
  if (round.kind === "panel") {
    return <PanelLeaderboardScreen round={round} />;
  }
  // debate
  return <DebateScreen round={round} />;
}

/**
 * Màn chiếu vòng phản biện — background.png + title + đồng hồ đếm ngược.
 * Khi show_scoreboard = true → chiếu BXH thay vì timer (tái sử dụng PanelLeaderboardScreen).
 */
function DebateScreen({ round }: { round: RoundWithGroup }) {
  const { state, serverOffsetMs } = useRoundState(round.id);
  const remaining = useDebateCountdown(state, serverOffsetMs);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef<number>(-1);
  const finalPlayedRef = useRef<string | null>(null);

  // Init audio
  useEffect(() => {
    audioCtxRef.current = new AudioContext();
    return () => { audioCtxRef.current?.close(); };
  }, []);

  // Fetch contestants in group (lấy 3 thí sinh đầu cho debate)
  useEffect(() => {
    const sb = getBrowserClient();
    let q = sb.from("gm_contestant").select("*");
    if (round.group_id) q = q.eq("group_id", round.group_id);
    q.order("display_order").then(({ data }) => {
      setContestants(((data ?? []) as Contestant[]).slice(0, 3));
    });
  }, [round.group_id]);

  // Phát tic-tac 10s cuối cùng
  useEffect(() => {
    if (state?.phase !== "running") {
      lastTickRef.current = -1;
      return;
    }
    const sec = Math.ceil(remaining);
    if (sec <= 10 && sec >= 1 && sec !== lastTickRef.current) {
      lastTickRef.current = sec;
      playTick(audioCtxRef.current);
    }
    if (sec <= 0 && finalPlayedRef.current !== state.debate_started_at) {
      finalPlayedRef.current = state.debate_started_at;
      playFinal(audioCtxRef.current);
    }
  }, [remaining, state?.phase, state?.debate_started_at]);

  // Nếu admin bật BXH → render leaderboard panel (chấm sau debate)
  if (state?.show_scoreboard) {
    return <PanelLeaderboardScreen round={round} />;
  }

  const matchNo = state?.debate_match;
  const matchPair = matchNo ? getMatchPair(contestants, matchNo) : null;
  const phase = state?.debate_phase;
  const phaseLabel = phase ? DEBATE_PHASE_LABELS[phase] ?? phase : null;
  const isUrgent = remaining > 0 && remaining <= 10 && state?.phase === "running";
  const totalSec = state?.debate_duration_sec ?? 0;

  return (
    <main className="debate-bg h-screen overflow-hidden flex flex-col items-center justify-center text-white px-8">
      <h1 className="text-5xl md:text-7xl font-extrabold tracking-wider drop-shadow-2xl text-center mb-8">
        {round.group?.debate_title ?? "PHẢN BIỆN"}
      </h1>

      {!matchNo ? (
        // Idle: chưa chọn match
        <div className="text-2xl text-white/80 italic">Đợi Ban Tổ chức bắt đầu phần thi...</div>
      ) : (
        <>
          {/* Match info */}
          <div className="text-center mb-6">
            <div className="text-2xl text-amber-200 font-bold uppercase tracking-wider mb-2">
              Cặp đấu số {matchNo}
            </div>
            {matchPair && (
              <div className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg">
                {matchPair[0].full_name}
                <span className="mx-4 text-amber-300">vs</span>
                {matchPair[1].full_name}
              </div>
            )}
          </div>

          {/* Phase label + countdown */}
          {phaseLabel && (
            <div className="text-3xl md:text-4xl text-white/95 font-bold mb-4 drop-shadow">
              {phaseLabel}
            </div>
          )}

          <div
            className={`text-9xl md:text-[12rem] font-mono font-extrabold px-12 py-6 rounded-3xl shadow-2xl ${
              isUrgent ? "debate-urgent text-white" : "bg-white/95 text-ocean-900"
            }`}
          >
            {state?.phase === "running" && remaining > 0 ? formatMMSS(remaining) : remaining <= 0 && totalSec > 0 ? "HẾT GIỜ" : "—"}
          </div>

          <div className="text-base text-white/70 mt-6">
            {totalSec > 0 && `Tối đa ${formatMMSS(totalSec)}`}
          </div>
        </>
      )}
    </main>
  );
}

function getMatchPair(contestants: Contestant[], match: number): [Contestant, Contestant] | null {
  if (contestants.length < 3) return null;
  // Match 1: 1-2, Match 2: 2-3, Match 3: 3-1
  const pairs: [number, number][] = [[0, 1], [1, 2], [2, 0]];
  const [a, b] = pairs[match - 1] ?? pairs[0];
  return [contestants[a], contestants[b]];
}

function formatMMSS(sec: number): string {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Màn chiếu BXH cho vòng panel (Chân dung, Nhạy bén) — 2 cột "Vòng" + "Tổng".
 * Subscribe gm_panel_score realtime để cập nhật khi BGK gửi điểm.
 */
function PanelLeaderboardScreen({ round }: { round: RoundWithGroup }) {
  const [rows, setRows] = useState<RoundLeaderboardRow[]>([]);

  useEffect(() => {
    const fetchLb = () =>
      fetch(`/api/round-leaderboard?roundId=${round.id}`)
        .then((r) => r.json())
        .then((j) => j.ok && setRows(j.data));
    fetchLb();
    const sb = getBrowserClient();
    const ch = sb
      .channel(`screen-panel-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission", filter: `round_id=eq.${round.id}` }, fetchLb)
      .subscribe();
    const i = setInterval(fetchLb, 4000);
    return () => { sb.removeChannel(ch); clearInterval(i); };
  }, [round.id]);

  const medals = ["🥇", "🥈", "🥉"];
  return (
    <main className="ocean-bg h-screen overflow-hidden p-8 flex flex-col">
      <header className="text-center mb-4">
        <h1 className="text-4xl font-bold text-ocean-900 drop-shadow">
          {round.group?.name ?? "—"} – {round.name}
        </h1>
        <div className="text-lg text-ocean-700">Bảng xếp hạng vòng này / Tổng tích lũy</div>
      </header>
      <div className="flex-1 glass rounded-2xl px-10 py-6 flex flex-col min-h-0">
        <div className="grid grid-cols-12 gap-4 px-6 pb-3 border-b-4 border-ocean-300 text-2xl font-bold text-ocean-700 shrink-0">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-6">Thí sinh</div>
          <div className="col-span-2 text-right">Vòng này</div>
          <div className="col-span-3 text-right">Tổng tích lũy</div>
        </div>
        <div className="flex-1 flex flex-col gap-2 min-h-0 mt-3 overflow-y-auto">
          {rows.map((r, i) => (
            <div
              key={r.contestant_id}
              className={`grid grid-cols-12 gap-4 items-center px-6 py-3 rounded-2xl border-4 ${
                i === 0 ? "bg-amber-100 border-amber-400"
                : i === 1 ? "bg-slate-100 border-slate-400"
                : i === 2 ? "bg-orange-100 border-orange-400"
                : "bg-white/85 border-ocean-200"
              }`}
            >
              <div className="col-span-1 text-center font-extrabold text-3xl">
                {i < 3 ? medals[i] : `${i + 1}`}
              </div>
              <div className="col-span-6">
                <div className="font-bold text-2xl text-ocean-900">{r.full_name}</div>
                {r.organization && <div className="text-base text-ocean-600">{r.organization}</div>}
              </div>
              <div className="col-span-2 text-right font-mono text-2xl text-ocean-700">{r.round_score}đ</div>
              <div className="col-span-3 text-right font-mono font-extrabold text-3xl text-ocean-800">
                {r.cumulative_score}đ
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="text-center text-ocean-700 text-xl pt-12">
              Đang chờ giám khảo chấm điểm...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function ScreenStage({ roundId, round }: { roundId: string; round: Round }) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(roundId);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [leaderboard, setLeaderboard] = useState<RoundLeaderboardRow[]>([]);
  const [powerupUsers, setPowerupUsers] = useState<{ contestant_id: string; full_name: string }[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef<number>(-1);
  const prevPhaseRef = useRef<string | null>(null);
  // Track question ID đã phát fanfare để tránh phát 2 lần
  const revealPlayedRef = useRef<string | null>(null);

  // Init audio context khi mount
  useEffect(() => {
    audioCtxRef.current = new AudioContext();
    return () => { audioCtxRef.current?.close(); };
  }, []);

  // Phát fanfare NGAY KHI hết giờ (không đợi Realtime từ server)
  useEffect(() => {
    const qid = state?.current_question_id;
    if (state?.phase === "running" && remaining <= 0 && qid && revealPlayedRef.current !== qid) {
      revealPlayedRef.current = qid;
      playReveal(audioCtxRef.current);
    }
  }, [remaining, state?.phase, state?.current_question_id]);

  // Fallback: phát fanfare nếu server reveal sớm hơn timer (admin bấm tay)
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const cur = state?.phase ?? null;
    if (prev !== "reveal" && cur === "reveal") {
      const qid = state?.current_question_id ?? null;
      if (revealPlayedRef.current !== qid) {
        revealPlayedRef.current = qid;
        playReveal(audioCtxRef.current);
      }
    }
    prevPhaseRef.current = cur;
  }, [state?.phase]);

  // Phát tic-tac mỗi giây nguyên khi remaining ≤ 5
  useEffect(() => {
    if (state?.phase !== "running") {
      lastTickRef.current = -1;
      return;
    }
    const sec = Math.ceil(remaining);
    if (sec <= 5 && sec >= 1 && sec !== lastTickRef.current) {
      lastTickRef.current = sec;
      playTick(audioCtxRef.current);
    }
    if (sec <= 0 && lastTickRef.current !== 0) {
      lastTickRef.current = 0;
      playFinal(audioCtxRef.current);
    }
  }, [remaining, state?.phase]);

  // Refresh leaderboard (dùng /api/round-leaderboard để có cumulative)
  useEffect(() => {
    const fetchLb = () =>
      fetch(`/api/round-leaderboard?roundId=${roundId}`)
        .then((r) => r.json())
        .then((j) => j.ok && setLeaderboard(j.data));
    fetchLb();
    const i = setInterval(fetchLb, 2000);
    return () => clearInterval(i);
  }, [roundId]);

  // Subscribe power-up activations cho câu hiện tại (Realtime theo round)
  // Khi IT bấm "câu kế", server cập nhật question_id từ null → qid → cần listen UPDATE
  useEffect(() => {
    const qid = state?.current_question_id;
    if (!qid) { setPowerupUsers([]); return; }
    const sb = getBrowserClient();
    const fetchPu = () =>
      sb.from("gm_powerup_use")
        .select("contestant_id, gm_contestant!inner(full_name, display_order)")
        .eq("question_id", qid)
        .then(({ data }) =>
          setPowerupUsers(
            (data ?? []).map((d: any) => ({
              contestant_id: d.contestant_id,
              full_name: d.gm_contestant?.full_name ?? "?",
            }))
          )
        );
    fetchPu();
    const ch = sb
      .channel(`pu-screen-${roundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_powerup_use", filter: `round_id=eq.${roundId}` }, fetchPu)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.current_question_id]);

  const phase = state?.phase ?? "idle";
  const showLb = phase === "leaderboard" || state?.show_scoreboard;
  // Hiển thị đáp án ngay khi hết giờ (không đợi Realtime phase=reveal)
  const effectiveReveal = phase === "reveal" || (phase === "running" && remaining <= 0);

  return (
    <main className="ocean-bg h-screen overflow-hidden p-8 flex flex-col">
      <header className="text-center mb-4">
        <h1 className="text-4xl font-bold text-ocean-900 drop-shadow">{round.name}</h1>
      </header>

      <div className="relative flex-1 flex flex-col min-h-0">
        {/* Câu hỏi — LUÔN render khi có câu, ẩn bằng visibility khi bật BXH.
            Không dùng unmount/display:none để CSS animation `correct-reveal`
            không chạy lại khi IT toggle BXH. */}
        {currentQuestion && phase !== "idle" && (
          <div className={`flex-1 flex flex-col min-h-0 ${showLb ? "invisible" : ""}`}>
            {/* Hàng trên: số câu + countdown */}
            <div className="flex justify-between items-center mb-2">
              <div className="text-2xl font-bold text-ocean-800 bg-white/70 px-4 py-2 rounded-xl">
                Câu {(state?.question_no ?? 0) > 0 ? state!.question_no : currentQuestion.display_order}
                <span className="text-lg font-semibold text-ocean-600"> / {round.questions_to_play}</span>
              </div>
              <CountdownBig remaining={remaining} phase={phase} />
            </div>

            {/* Thanh power-up: hiển thị ai đã kích hoạt */}
            {powerupUsers.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap bg-amber-100/90 backdrop-blur border-2 border-amber-400 rounded-xl px-5 py-2 mb-3">
                <span className="text-2xl font-bold text-amber-800 shrink-0">
                  {round.powerup_icon} {round.powerup_name}:
                </span>
                <div className="flex flex-wrap gap-2">
                  {powerupUsers.map((u) => (
                    <span key={u.contestant_id} className="bg-amber-200 text-amber-900 px-4 py-1 rounded-full text-xl font-semibold">
                      {u.full_name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="card flex-1 flex flex-col gap-6 min-h-0">
              <h2 className="text-3xl md:text-5xl font-bold text-ocean-900 leading-snug">
                {currentQuestion.prompt}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
                {(["A", "B", "C", "D"] as const).map((k) => {
                  const text = (currentQuestion as any)["option_" + k.toLowerCase()];
                  if (!text) return null;
                  const isAnswer = currentQuestion.correct_option === k;
                  const cls = effectiveReveal
                    ? isAnswer
                      ? "border-emerald-500 bg-emerald-200 text-emerald-900 correct-reveal"
                      : "border-ocean-200 bg-white/70 opacity-50"
                    : "border-ocean-300 bg-white/85";
                  return (
                    <div key={k} className={`p-5 rounded-2xl border-4 text-2xl md:text-3xl font-semibold ${cls}`}>
                      <span className="font-extrabold mr-3 text-ocean-700">{k}.</span>
                      {text}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bảng xếp hạng — overlay tuyệt đối khi bật */}
        {showLb && (
          <div className="absolute inset-0 flex flex-col">
            <Leaderboard rows={leaderboard} />
          </div>
        )}

        {/* Trạng thái idle (chưa có câu nào) */}
        {(!currentQuestion || phase === "idle") && !showLb && (
          <div className="flex-1 flex items-center justify-center">
            <div className="card text-center text-2xl text-ocean-800 max-w-2xl">
              {phase === "idle" ? "Đang chờ bắt đầu..." : "..."}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CountdownBig({ remaining, phase }: { remaining: number; phase: string }) {
  const danger = remaining <= 5 && phase === "running";
  return (
    <div
      className={`text-6xl md:text-8xl font-mono font-extrabold px-8 py-4 rounded-2xl shadow-lg ${
        danger ? "bg-rose-500 text-white animate-pulse" : "bg-white/85 text-ocean-800"
      }`}
    >
      {phase === "running" && remaining > 0 ? Math.ceil(remaining) : "—"}
    </div>
  );
}

function Leaderboard({ rows }: { rows: RoundLeaderboardRow[] }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="flex-1 glass rounded-2xl px-10 py-6 flex flex-col min-h-0">
      <h2 className="text-5xl font-bold text-center text-ocean-900 mb-5 drop-shadow-md shrink-0">
        🏆 Bảng xếp hạng
      </h2>
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {rows.map((r, i) => (
          <div
            key={r.contestant_id}
            className={`flex-1 min-h-0 grid grid-cols-12 gap-4 items-center px-10 rounded-2xl border-4 ${
              i === 0
                ? "bg-amber-100 border-amber-400"
                : i === 1
                ? "bg-slate-100 border-slate-400"
                : i === 2
                ? "bg-orange-100 border-orange-400"
                : "bg-white/85 border-ocean-200"
            }`}
          >
            <div className="col-span-1 flex items-center justify-center">
              <span className="font-extrabold text-5xl shrink-0">
                {i < 3 ? medals[i] : `${i + 1}.`}
              </span>
            </div>
            <div className="col-span-6">
              <div className="font-bold text-3xl text-ocean-900 leading-tight">{r.full_name}</div>
              {r.organization && (
                <div className="text-xl text-ocean-600 mt-0.5">{r.organization}</div>
              )}
            </div>
            <div className="col-span-2 text-right">
              <div className="text-xs uppercase text-ocean-600 tracking-wide">Vòng</div>
              <div className="font-mono font-bold text-3xl text-ocean-700">{r.round_score}đ</div>
            </div>
            <div className="col-span-3 text-right">
              <div className="text-xs uppercase text-ocean-600 tracking-wide">Tổng</div>
              <div className="font-mono font-extrabold text-5xl text-ocean-800">{r.cumulative_score}đ</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function playTick(ctx: AudioContext | null) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 1000;
  o.type = "square";
  g.gain.setValueAtTime(0.001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.1);
}
function playFinal(ctx: AudioContext | null) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 600;
  o.type = "sine";
  g.gain.setValueAtTime(0.001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.55);
}

/** Fanfare C major arpeggio khi hiện đáp án đúng */
function playReveal(ctx: AudioContext | null) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, t: 0,    dur: 0.55 }, // C5
    { freq: 659.25, t: 0.15, dur: 0.55 }, // E5
    { freq: 783.99, t: 0.30, dur: 0.55 }, // G5
    { freq: 1046.5, t: 0.50, dur: 0.80 }, // C6
  ];
  notes.forEach(({ freq, t, dur }) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.001, now + t);
    g.gain.exponentialRampToValueAtTime(0.38, now + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(now + t);
    o.stop(now + t + dur + 0.05);
  });
}
