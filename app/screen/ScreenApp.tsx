"use client";
import { useEffect, useRef, useState } from "react";
import type { Round, RoundLeaderboardRow, Contestant } from "@/lib/types";
import { useRoundState, useCountdown, useDebateCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";
import UnifiedLeaderboard from "@/components/UnifiedLeaderboard";

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
  const [showScoreboard, setShowScoreboard] = useState<boolean>(false);
  const [showTop3, setShowTop3] = useState<boolean>(false);
  const [audioReady, setAudioReady] = useState(false);

  // Fetch rounds
  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => j.ok && setRounds(j.data));
  }, []);

  // Subscribe gm_display_state → tự follow vòng admin chọn + flag show_scoreboard/top3
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("current_round_id, show_scoreboard, show_top3").eq("id", 1).maybeSingle().then(({ data }) => {
        setRoundId((data as any)?.current_round_id ?? null);
        setShowScoreboard((data as any)?.show_scoreboard === true);
        setShowTop3((data as any)?.show_top3 === true);
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
    return <ScreenStage roundId={round.id} round={round} showTop3={showTop3} />;
  }
  if (round.kind === "panel") {
    // Panel: chỉ chiếu BXH khi admin bấm "Chiếu BXH". Mặc định hiện màn idle.
    if (!showScoreboard) return <RoundIdleScreen round={round} />;
    return <PanelLeaderboardScreen round={round} showTop3={showTop3} />;
  }
  // debate — pass showScoreboard từ display_state để chiếu BXH đồng nhất
  return <DebateScreen round={round} showTop3={showTop3} showScoreboard={showScoreboard} />;
}

/** Màn chờ chung cho panel (Chân dung, Nhạy bén) — hiện tên vòng to + ngữ cảnh nhóm */
function RoundIdleScreen({ round }: { round: RoundWithGroup }) {
  return (
    <main className="ocean-bg h-screen overflow-hidden flex items-center justify-center px-8">
      <div className="card text-center max-w-4xl px-12 py-10">
        {round.group?.name && (
          <div className="text-2xl text-ocean-700 mb-3 uppercase tracking-widest font-semibold">
            {round.group.name}
          </div>
        )}
        <h1 className="text-5xl md:text-6xl font-extrabold text-ocean-900 drop-shadow uppercase tracking-wide mb-6 whitespace-nowrap">
          {round.name}
        </h1>
        <div className="text-xl text-ocean-600 italic">
          Đang chờ Ban Tổ chức bắt đầu...
        </div>
      </div>
    </main>
  );
}

/**
 * Màn chiếu vòng phản biện — background.png + title + đồng hồ đếm ngược.
 * Khi show_scoreboard = true → chiếu BXH thay vì timer (tái sử dụng PanelLeaderboardScreen).
 */
function DebateScreen({ round, showTop3, showScoreboard }: { round: RoundWithGroup; showTop3: boolean; showScoreboard: boolean }) {
  const { state, serverOffsetMs } = useRoundState(round.id);
  const remaining = useDebateCountdown(state, serverOffsetMs);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Track timer key đã schedule audio để tránh schedule trùng
  const finalPlayedRef = useRef<string | null>(null);

  // Init audio
  useEffect(() => {
    audioCtxRef.current = new AudioContext();
    return () => { audioCtxRef.current?.close(); };
  }, []);

  // Top 3 thí sinh theo cumulative vòng liền kề trước
  useEffect(() => {
    const fetchTop3 = async () => {
      const r = await fetch(`/api/debate-contestants?roundId=${round.id}`).then((x) => x.json());
      if (!r.ok || !r.data?.length) {
        setContestants([]);
        return;
      }
      const ids = r.data.map((d: any) => d.contestant_id);
      const sb = getBrowserClient();
      const { data } = await sb.from("gm_contestant").select("*").in("id", ids);
      const ordered = ids
        .map((id: string) => (data ?? []).find((c: any) => c.id === id))
        .filter(Boolean) as Contestant[];
      setContestants(ordered);
    };
    fetchTop3();
    // Re-fetch khi panel_submission đổi (vòng trước chấm xong)
    const sb = getBrowserClient();
    const ch = sb
      .channel(`debate-screen-top3-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission" }, fetchTop3)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [round.id]);

  // Pre-schedule TẤT CẢ 10 tic-tac + bell cuối ngay khi timer bắt đầu.
  // Web Audio API có scheduling chính xác theo audio clock (không bị giật do
  // React re-render hay browser jank). Mọi event được lập lịch 1 lần duy nhất.
  useEffect(() => {
    if (state?.phase !== "running" || !state.debate_started_at || !state.debate_duration_sec) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Chỉ schedule 1 lần mỗi timer (key = started_at)
    const key = state.debate_started_at;
    if (finalPlayedRef.current === key) return;
    finalPlayedRef.current = key;

    const startedAtMs = new Date(state.debate_started_at).getTime();
    const endAtMs = startedAtMs + state.debate_duration_sec * 1000 - serverOffsetMs;
    const nowMs = Date.now();
    const audioNow = ctx.currentTime;

    // 10 tic-tac cuối: phát tại các mốc còn 10, 9, ..., 1 giây
    for (let secLeft = 10; secLeft >= 1; secLeft--) {
      const delayMs = (endAtMs - nowMs) - secLeft * 1000;
      if (delayMs > 0) {
        scheduleTick(ctx, audioNow + delayMs / 1000);
      }
    }
    // Chuông cuối tại thời điểm 0
    const bellDelay = endAtMs - nowMs;
    if (bellDelay > 0) {
      scheduleDebateBell(ctx, audioNow + bellDelay / 1000);
    }
  }, [state?.phase, state?.debate_started_at, state?.debate_duration_sec, serverOffsetMs]);

  // Nếu admin bật BXH (qua display_state) → chiếu BXH chấm sau debate
  if (showScoreboard) {
    return <PanelLeaderboardScreen round={round} showTop3={showTop3} />;
  }

  const matchNo = state?.debate_match;
  const matchPair = matchNo ? getMatchPair(contestants, matchNo) : null;
  const phase = state?.debate_phase;
  const phaseLabel = phase ? DEBATE_PHASE_LABELS[phase] ?? phase : null;
  const isUrgent = remaining > 0 && remaining <= 10 && state?.phase === "running";
  const totalSec = state?.debate_duration_sec ?? 0;

  return (
    // Đẩy nội dung lên cao — top margin ~20vh thay vì center vertical
    <main className="debate-bg h-screen overflow-hidden flex flex-col items-center text-ocean-900 px-4 md:px-8 pt-[15vh] md:pt-[20vh]">
      {/* Khung frosted glass — nhịp giãn rộng hơn cho dễ đọc */}
      <div className="bg-sky-100/85 backdrop-blur-md rounded-3xl shadow-2xl border-2 border-white/60 max-w-5xl w-full px-6 md:px-12 py-6 md:py-8 flex flex-col items-center gap-5 md:gap-7">
        {/* Title — gọn ở trên */}
        <h1 className="text-xl md:text-3xl font-extrabold tracking-wider whitespace-nowrap text-ocean-900">
          {round.group?.debate_title ?? "PHẢN BIỆN"}
        </h1>

        {!matchNo ? (
          <div className="text-xl md:text-2xl text-ocean-700 italic py-10">
            Đợi Ban Tổ chức bắt đầu...
          </div>
        ) : (
          <>
            {/* Badge cặp đấu */}
            <div className="bg-amber-200 border-2 border-amber-500 text-amber-900 px-5 py-1.5 rounded-full text-sm md:text-base font-bold uppercase tracking-widest shadow">
              Cặp đấu {matchNo}
            </div>

            {/* Tên 2 thí sinh — stack dọc, mỗi tên 1 hàng không bị wrap, VS pill giữa */}
            {matchPair && (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="text-3xl md:text-5xl font-extrabold text-ocean-900 leading-tight text-center whitespace-nowrap">
                  {matchPair[0].full_name}
                </div>
                <div className="bg-amber-500 text-white rounded-full px-5 py-1 text-lg md:text-xl font-extrabold shadow-lg uppercase tracking-widest">
                  vs
                </div>
                <div className="text-3xl md:text-5xl font-extrabold text-ocean-900 leading-tight text-center whitespace-nowrap">
                  {matchPair[1].full_name}
                </div>
              </div>
            )}

            {/* Phase label */}
            {phaseLabel && (
              <div className="text-xl md:text-2xl text-ocean-800 font-extrabold uppercase tracking-wider mt-1">
                {phaseLabel}
              </div>
            )}

            {/* HERO countdown — trung tâm. Khi hết giờ hiển thị 'HẾT GIỜ',
                font nhỏ hơn timer 1 chút để vừa box. */}
            {(() => {
              const isTimeUp = remaining <= 0 && totalSec > 0 && state?.phase === "running";
              const display = state?.phase === "running" && remaining > 0
                ? formatMMSS(remaining)
                : isTimeUp
                ? "HẾT GIỜ"
                : "—";
              const sizeClass = isTimeUp
                ? "text-6xl md:text-7xl"
                : "text-7xl md:text-8xl";
              return (
                <div
                  className={`font-mono font-extrabold rounded-3xl shadow-2xl py-3 md:py-4 px-10 md:px-16 whitespace-nowrap ${
                    isUrgent ? "debate-urgent text-white" : "bg-white text-ocean-900"
                  } ${sizeClass}`}
                >
                  {display}
                </div>
              );
            })()}

            <div className="text-xs md:text-sm text-ocean-600 -mt-1">
              {totalSec > 0 && `Tối đa ${formatMMSS(totalSec)}`}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function getMatchPair(contestants: Contestant[], match: number): [Contestant, Contestant] | null {
  if (contestants.length < 3) return null;
  // Cặp 1: Top1 vs Top2, Cặp 2: Top1 vs Top3, Cặp 3: Top3 vs Top2
  const pairs: [number, number][] = [[0, 1], [0, 2], [2, 1]];
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
function PanelLeaderboardScreen({ round, showTop3 }: { round: RoundWithGroup; showTop3: boolean }) {
  const [rows, setRows] = useState<RoundLeaderboardRow[]>([]);

  useEffect(() => {
    const fetchLb = () =>
      fetch(`/api/round-leaderboard?roundId=${round.id}`)
        .then((r) => r.json())
        .then((j) => j.ok && setRows(j.data));
    fetchLb();
    const sb = getBrowserClient();
    const ch = sb
      .channel(`screen-panel-${round.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission", filter: `round_id=eq.${round.id}` }, fetchLb)
      .subscribe();
    const i = setInterval(fetchLb, 4000);
    return () => { sb.removeChannel(ch); clearInterval(i); };
  }, [round.id]);

  return (
    <UnifiedLeaderboard
      rows={rows}
      mode={showTop3 ? "top3" : "full"}
      title={`${round.group?.name ?? ""} – ${round.name}`}
    />
  );
}

function ScreenStage({ roundId, round, showTop3 }: { roundId: string; round: Round; showTop3: boolean }) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(roundId);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [leaderboard, setLeaderboard] = useState<RoundLeaderboardRow[]>([]);
  const [powerupUsers, setPowerupUsers] = useState<{ contestant_id: string; full_name: string }[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
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

  // Pre-schedule TẤT CẢ tic-tac (5s cuối) + final beep ngay khi câu mới bắt đầu.
  // Tránh giật do polling/setState 10Hz và sync chính xác với audio clock.
  const scheduledForQidRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.phase !== "running" || !state.question_started_at) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const qid = state.current_question_id;
    if (!qid) return;
    // Tránh schedule lại cùng câu (mỗi câu chỉ 1 lần)
    const key = `${qid}|${state.question_started_at}`;
    if (scheduledForQidRef.current === key) return;
    scheduledForQidRef.current = key;

    const startedAtMs = new Date(state.question_started_at).getTime();
    const endAtMs = startedAtMs + round.question_seconds * 1000 - serverOffsetMs;
    const nowMs = Date.now();
    const audioNow = ctx.currentTime;
    // 5 tic-tac cuối
    for (let secLeft = 5; secLeft >= 1; secLeft--) {
      const delayMs = (endAtMs - nowMs) - secLeft * 1000;
      if (delayMs > 0) scheduleTick(ctx, audioNow + delayMs / 1000);
    }
    // Final beep tại t=0 (không phải fanfare; fanfare đã phát ở useEffect khác)
    const finalDelay = endAtMs - nowMs;
    if (finalDelay > 0) scheduleFinalBeep(ctx, audioNow + finalDelay / 1000);
  }, [state?.phase, state?.current_question_id, state?.question_started_at, round.question_seconds, serverOffsetMs]);

  // Reset scheduled key khi không còn running (cho lần goto kế)
  useEffect(() => {
    if (state?.phase !== "running") {
      scheduledForQidRef.current = null;
    }
  }, [state?.phase]);

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
    <main className="ocean-bg h-screen overflow-hidden px-8 pt-3 pb-6 flex flex-col">
      <div className="relative flex-1 flex flex-col min-h-0">
        {/* Câu hỏi — LUÔN render khi có câu, ẩn bằng visibility khi bật BXH.
            Không dùng unmount/display:none để CSS animation `correct-reveal`
            không chạy lại khi IT toggle BXH. */}
        {currentQuestion && phase !== "idle" && (
          <div className={`flex-1 flex flex-col min-h-0 ${showLb ? "invisible" : ""}`}>
            {/* Top bar gộp: số câu | tiêu đề phần thi | countdown — tiết kiệm 1 dòng */}
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="text-xl md:text-2xl font-bold text-ocean-800 bg-white/70 px-3 py-2 rounded-xl shrink-0">
                Câu {(state?.question_no ?? 0) > 0 ? state!.question_no : currentQuestion.display_order}
                <span className="text-base md:text-lg font-semibold text-ocean-600"> / {round.questions_to_play}</span>
              </div>
              <h1 className="flex-1 text-center text-2xl md:text-3xl font-extrabold text-ocean-900 drop-shadow uppercase tracking-wide truncate">
                PHẦN THI {round.name}
              </h1>
              <CountdownBig remaining={remaining} phase={phase} />
            </div>

            {/* Thanh power-up: hiển thị ai đã kích hoạt */}
            {powerupUsers.length > 0 && (() => {
              // Auto-fit theo số lượng — ít người → chip to, nhiều người → chip nhỏ
              const n = powerupUsers.length;
              const labelSize = n <= 2 ? "text-2xl" : n <= 4 ? "text-xl" : "text-lg";
              const chipSize = n <= 2 ? "px-4 py-1 text-xl" : n <= 4 ? "px-3 py-0.5 text-lg" : "px-2.5 py-0.5 text-base";
              const barPadding = n <= 2 ? "px-5 py-2" : n <= 4 ? "px-4 py-1.5" : "px-3 py-1";
              return (
                <div className={`shrink-0 flex items-center gap-3 flex-wrap bg-amber-100/90 backdrop-blur border-2 border-amber-400 rounded-xl mb-2 ${barPadding}`}>
                  <span className={`font-bold text-amber-800 shrink-0 ${labelSize}`}>
                    {round.powerup_icon} {round.powerup_name}:
                  </span>
                  <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                    {powerupUsers.map((u) => (
                      <span key={u.contestant_id} className={`bg-amber-200 text-amber-900 rounded-full font-semibold ${chipSize}`}>
                        {u.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Vùng câu hỏi.
                - Câu không media: flow tự nhiên từ trên (đáp án sát câu hỏi)
                - Câu có media: card chiếm hết space còn lại, media co/dãn tự động
                  (flex-1) → đáp án LUÔN hiện ở đáy, không bị khuất */}
            {(currentQuestion as any).media_url ? (
              <div className="flex-1 flex flex-col min-h-0 mt-2">
                <div className="card w-full flex-1 flex flex-col gap-3 min-h-0">
                  <h2 className="shrink-0 text-2xl md:text-3xl font-bold text-ocean-900 leading-snug">
                    {currentQuestion.prompt}
                  </h2>
                  <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                    {(currentQuestion as any).media_type === "video" ? (
                      <video
                        key={(currentQuestion as any).media_url}
                        src={(currentQuestion as any).media_url}
                        controls
                        autoPlay
                        className="max-w-full max-h-full rounded-2xl shadow-lg"
                      />
                    ) : (
                      <img
                        src={(currentQuestion as any).media_url}
                        alt="Câu hỏi minh họa"
                        className="max-w-full max-h-full rounded-2xl shadow-lg object-contain"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
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
                        <div key={k} className={`p-3 md:p-4 rounded-xl border-4 text-xl md:text-2xl font-semibold ${cls}`}>
                          <span className="font-extrabold mr-2 text-ocean-700">{k}.</span>
                          {text}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="card w-full flex flex-col gap-3">
                  <h2 className="text-3xl md:text-5xl font-bold text-ocean-900 leading-snug">
                    {currentQuestion.prompt}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        )}

        {/* Bảng xếp hạng — overlay tuyệt đối khi bật, dùng UnifiedLeaderboard */}
        {showLb && (
          <div className="absolute inset-0">
            <UnifiedLeaderboard
              rows={leaderboard}
              mode={showTop3 ? "top3" : "full"}
              title={`${(round as any).group?.name ?? ""} – ${round.name}`}
            />
          </div>
        )}

        {/* Trạng thái idle (chưa có câu nào) — hiện tên vòng to */}
        {(!currentQuestion || phase === "idle") && !showLb && (
          <div className="flex-1 flex items-center justify-center">
            <div className="card text-center max-w-4xl px-12 py-10">
              <div className="text-2xl text-ocean-700 mb-3 uppercase tracking-widest font-semibold">
                Phần thi
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold text-ocean-900 drop-shadow uppercase tracking-wide mb-6 whitespace-nowrap">
                {round.name}
              </h1>
              <div className="text-xl text-ocean-600 italic">
                Đang chờ Ban Tổ chức bắt đầu...
              </div>
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

/** Chuông "RENG RENG RENG" cho phản biện hết giờ — to + 3 hồi + harmonic */
function playDebateBell(ctx: AudioContext | null) {
  if (!ctx) return;
  scheduleDebateBell(ctx, ctx.currentTime);
}

/** Lên lịch final beep (sine 600Hz) — dùng cho quiz screen khi hết giờ. */
function scheduleFinalBeep(ctx: AudioContext, startTime: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 600;
  o.type = "sine";
  g.gain.setValueAtTime(0.001, startTime);
  g.gain.exponentialRampToValueAtTime(0.4, startTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
  o.connect(g).connect(ctx.destination);
  o.start(startTime);
  o.stop(startTime + 0.55);
}

/** Lên lịch 1 tic-tac vào thời điểm `startTime` (audio context time) — chính xác tới ms. */
function scheduleTick(ctx: AudioContext, startTime: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 1000;
  o.type = "square";
  g.gain.setValueAtTime(0.001, startTime);
  g.gain.exponentialRampToValueAtTime(0.25, startTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
  o.connect(g).connect(ctx.destination);
  o.start(startTime);
  o.stop(startTime + 0.1);
}

/** Lên lịch chuông "reng reng reng" vào `startTime` (audio context time). */
function scheduleDebateBell(ctx: AudioContext, startTime: number) {
  const ringTimes = [0, 0.42, 0.84];
  const harmonics = [
    { freq: 880,  gain: 0.85, type: "sine" as OscillatorType },
    { freq: 1320, gain: 0.55, type: "sine" as OscillatorType },
    { freq: 2200, gain: 0.35, type: "sine" as OscillatorType },
    { freq: 3300, gain: 0.20, type: "triangle" as OscillatorType },
  ];
  for (const t of ringTimes) {
    for (const h of harmonics) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = h.freq;
      o.type = h.type;
      const when = startTime + t;
      g.gain.setValueAtTime(0.001, when);
      g.gain.exponentialRampToValueAtTime(h.gain, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.55);
      o.connect(g).connect(ctx.destination);
      o.start(when);
      o.stop(when + 0.6);
    }
  }
}

/** Fanfare C major arpeggio khi hiện đáp án đúng */
/** Phát file MP3 /dap-an-dung.mp3 khi công bố đáp án (thay fanfare synth). */
let _revealAudio: HTMLAudioElement | null = null;
function playReveal(_ctx?: AudioContext | null) {
  // Pre-load 1 lần, replay nhiều lần
  if (!_revealAudio) {
    _revealAudio = new Audio("/dap-an-dung.mp3");
    _revealAudio.preload = "auto";
    _revealAudio.volume = 1.0;
  }
  // currentTime = 0 để phát từ đầu nếu đang chạy hoặc đã chạy xong trước đó
  _revealAudio.currentTime = 0;
  _revealAudio.play().catch(() => {
    /* user chưa tương tác hoặc browser chặn → bỏ qua */
  });
}
