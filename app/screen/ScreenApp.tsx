"use client";
import { useEffect, useRef, useState } from "react";
import type { Round, LeaderboardRow } from "@/lib/types";
import { useRoundState, useCountdown } from "@/lib/useRoundState";

export default function ScreenApp() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setRounds(j.data);
          // Auto-select round có phase != idle, hoặc round đầu
          if (j.data.length) setRoundId(j.data[0].id);
        }
      });
  }, []);

  if (!audioReady) {
    return (
      <main className="ocean-bg flex items-center justify-center min-h-screen">
        <div className="card text-center max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-ocean-800">Màn hình trình chiếu</h1>
          <p className="text-ocean-700">Bấm "Bật" để kích hoạt âm thanh đồng hồ đếm ngược.</p>
          {rounds.length > 1 && (
            <select
              className="w-full p-3 rounded-lg border border-ocean-300"
              value={roundId ?? ""}
              onChange={(e) => setRoundId(e.target.value)}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <button className="btn-primary w-full text-lg" onClick={() => setAudioReady(true)}>
            🔊 Bật trình chiếu
          </button>
        </div>
      </main>
    );
  }

  return roundId ? <ScreenStage roundId={roundId} round={rounds.find((r) => r.id === roundId)!} /> : null;
}

function ScreenStage({ roundId, round }: { roundId: string; round: Round }) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(roundId);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef<number>(-1);
  const prevPhaseRef = useRef<string | null>(null);

  // Init audio context khi mount
  useEffect(() => {
    audioCtxRef.current = new AudioContext();
    return () => { audioCtxRef.current?.close(); };
  }, []);

  // Phát âm thanh fanfare khi phase chuyển sang "reveal"
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const cur = state?.phase ?? null;
    if (prev !== "reveal" && cur === "reveal") {
      playReveal(audioCtxRef.current);
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

  // Refresh leaderboard
  useEffect(() => {
    const fetchLb = () =>
      fetch(`/api/leaderboard?roundId=${roundId}`)
        .then((r) => r.json())
        .then((j) => j.ok && setLeaderboard(j.data));
    fetchLb();
    const i = setInterval(fetchLb, 2000);
    return () => clearInterval(i);
  }, [roundId]);

  const phase = state?.phase ?? "idle";
  const showLb = phase === "leaderboard" || state?.show_scoreboard;

  return (
    <main className="ocean-bg h-screen overflow-hidden p-8 flex flex-col">
      <header className="text-center mb-4">
        <h1 className="text-4xl font-bold text-ocean-900 drop-shadow">{round.name}</h1>
      </header>

      {showLb ? (
        <Leaderboard rows={leaderboard} />
      ) : currentQuestion && phase !== "idle" ? (
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div className="text-2xl font-bold text-ocean-800 bg-white/70 px-4 py-2 rounded-xl">
              Câu {currentQuestion.display_order}
            </div>
            <CountdownBig remaining={remaining} phase={phase} />
          </div>

          <div className="card flex-1 flex flex-col gap-6">
            <h2 className="text-3xl md:text-5xl font-bold text-ocean-900 leading-snug">
              {currentQuestion.prompt}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
              {(["A", "B", "C", "D"] as const).map((k) => {
                const text = (currentQuestion as any)["option_" + k.toLowerCase()];
                if (!text) return null;
                const isAnswer = currentQuestion.correct_option === k;
                const reveal = phase === "reveal";
                const cls = reveal
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
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="card text-center text-2xl text-ocean-800 max-w-2xl">
            {phase === "idle" ? "Đang chờ bắt đầu..." : "..."}
          </div>
        </div>
      )}
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
      {phase === "running" ? Math.ceil(Math.max(0, remaining)) : "—"}
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
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
            className={`flex-1 min-h-0 flex justify-between items-center px-10 rounded-2xl border-4 ${
              i === 0
                ? "bg-amber-100 border-amber-400"
                : i === 1
                ? "bg-slate-100 border-slate-400"
                : i === 2
                ? "bg-orange-100 border-orange-400"
                : "bg-white/85 border-ocean-200"
            }`}
          >
            <div className="flex items-center gap-6">
              <span className="font-extrabold text-5xl w-20 text-center shrink-0">
                {i < 3 ? medals[i] : `${i + 1}.`}
              </span>
              <div>
                <div className="font-bold text-3xl text-ocean-900 leading-tight">{r.full_name}</div>
                {r.organization && (
                  <div className="text-xl text-ocean-600 mt-0.5">{r.organization}</div>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="font-mono font-extrabold text-5xl text-ocean-800">{r.total_points}</span>
              <span className="text-2xl font-semibold text-ocean-600 ml-2">điểm</span>
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
