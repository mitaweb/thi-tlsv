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

  // Init audio context khi mount
  useEffect(() => {
    audioCtxRef.current = new AudioContext();
    return () => { audioCtxRef.current?.close(); };
  }, []);

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
    <main className="ocean-bg min-h-screen p-8 flex flex-col">
      <header className="text-center mb-6">
        <h1 className="text-3xl md:text-5xl font-bold text-ocean-900 drop-shadow">{round.name}</h1>
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
                    ? "border-emerald-500 bg-emerald-200 text-emerald-900"
                    : "border-ocean-200 bg-white/70 opacity-60"
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
      {phase === "running" ? Math.max(0, remaining).toFixed(1) : "—"}
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="card flex-1 max-w-4xl mx-auto w-full">
      <h2 className="text-4xl md:text-5xl font-bold text-center text-ocean-900 mb-6">🏆 Bảng xếp hạng</h2>
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={r.contestant_id}
            className={`flex justify-between items-center px-6 py-4 rounded-xl text-2xl ${
              i === 0
                ? "bg-amber-200 border-2 border-amber-400"
                : i === 1
                ? "bg-slate-200 border-2 border-slate-400"
                : i === 2
                ? "bg-orange-200 border-2 border-orange-400"
                : "bg-white/85"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-3xl text-ocean-700 w-12">{i + 1}.</span>
              <div>
                <div className="font-bold text-ocean-900">{r.full_name}</div>
                {r.organization && <div className="text-sm text-ocean-700">{r.organization}</div>}
              </div>
            </div>
            <span className="font-mono font-extrabold text-3xl text-ocean-800">{r.total_points}</span>
          </li>
        ))}
      </ol>
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
