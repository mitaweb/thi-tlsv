"use client";
import { useEffect, useMemo, useState } from "react";
import type { Round, Contestant, RoundLeaderboardRow, Judge } from "@/lib/types";
import { useRoundState, useDebateCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; debate_title: string | null } | null;
}

interface JudgeProgress extends Judge {
  submitted: boolean;
  submittedAt: string | null;
}

const PHASE_BUTTONS = [
  { phase: "thinking",    label: "🧠 Suy nghĩ",    duration: 60 },
  { phase: "presenting",  label: "🎤 Trình bày",   duration: 180 },
  { phase: "rebutting",   label: "💬 Phản biện",   duration: 120 },
  { phase: "responding",  label: "↩ Trả lời",      duration: 120 },
] as const;

const MATCH_PAIRS: Record<number, [number, number]> = {
  1: [0, 1],  // Top1 vs Top2
  2: [0, 2],  // Top1 vs Top3
  3: [2, 1],  // Top3 vs Top2
};

/**
 * Điều khiển vòng phản biện:
 * - Chọn cặp đấu (1-2, 2-3, 3-1) trong số 3 thí sinh đầu của group
 * - 4 nút timer: Suy nghĩ 1m / Trình bày 3m / Phản biện 2m / Trả lời 2m
 * - Sau debate: BGK chấm 100đ cho từng thí sinh (giống Panel)
 * - Nút "Chiếu BXH" lên màn /screen
 */
export default function DebateRoundControl({
  roundId,
  round,
}: {
  roundId: string;
  round: RoundWithGroup;
}) {
  const { state, serverOffsetMs } = useRoundState(roundId);
  const remaining = useDebateCountdown(state, serverOffsetMs);
  const [contestants, setContestants] = useState<Array<Contestant & { cumulative_score?: number }>>([]);
  const [selectedMatch, setSelectedMatch] = useState<number>(1);
  const [judges, setJudges] = useState<JudgeProgress[]>([]);
  const [leaderboard, setLeaderboard] = useState<RoundLeaderboardRow[]>([]);
  const [isProjecting, setIsProjecting] = useState(false);

  // Top 3 thí sinh theo cumulative vòng liền kề trước
  useEffect(() => {
    fetch(`/api/debate-contestants?roundId=${roundId}`)
      .then((r) => r.json())
      .then(async (j) => {
        if (!j.ok || !j.data?.length) {
          setContestants([]);
          return;
        }
        const ids = j.data.map((d: any) => d.contestant_id);
        const sb = getBrowserClient();
        const { data } = await sb.from("gm_contestant").select("*").in("id", ids);
        // Giữ thứ tự theo điểm (cao→thấp), gắn cumulative_score từ API top3
        const ordered = j.data.map((top: any) => {
          const c = (data ?? []).find((x: any) => x.id === top.contestant_id);
          return c ? { ...c, cumulative_score: top.cumulative_score } : null;
        }).filter(Boolean);
        setContestants(ordered as any);
      });
    // Re-fetch khi panel_submission đổi (BGK chấm vòng trước xong → top 3 có thể đổi)
    const sb = getBrowserClient();
    const ch = sb
      .channel(`debate-top3-${roundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission" }, () => {
        fetch(`/api/debate-contestants?roundId=${roundId}`)
          .then((r) => r.json())
          .then(async (j) => {
            if (!j.ok || !j.data?.length) return;
            const ids = j.data.map((d: any) => d.contestant_id);
            const { data } = await sb.from("gm_contestant").select("*").in("id", ids);
            const ordered = j.data.map((top: any) => {
              const c = (data ?? []).find((x: any) => x.id === top.contestant_id);
              return c ? { ...c, cumulative_score: top.cumulative_score } : null;
            }).filter(Boolean);
            setContestants(ordered as any);
          });
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [roundId]);

  // Tiến độ chấm BGK
  useEffect(() => {
    const fetchProgress = () =>
      fetch(`/api/panel-progress?roundId=${roundId}`)
        .then((r) => r.json())
        .then((j) => j.ok && setJudges(j.judges));
    fetchProgress();
    const sb = getBrowserClient();
    const ch = sb
      .channel(`debate-progress-${roundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission", filter: `round_id=eq.${roundId}` }, fetchProgress)
      .subscribe();
    const i = setInterval(fetchProgress, 5000);
    return () => { sb.removeChannel(ch); clearInterval(i); };
  }, [roundId]);

  // BXH
  useEffect(() => {
    const fetchLb = () =>
      fetch(`/api/round-leaderboard?roundId=${roundId}`)
        .then((r) => r.json())
        .then((j) => j.ok && setLeaderboard(j.data));
    fetchLb();
    const i = setInterval(fetchLb, 3000);
    return () => clearInterval(i);
  }, [roundId]);

  // Display state
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
        setIsProjecting((data as any)?.current_round_id === roundId);
      });
    fetchDs();
    const ch = sb
      .channel(`debate-ds-${roundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_display_state" }, fetchDs)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [roundId]);

  async function dispatch(action: string, body: Record<string, unknown> = {}) {
    const r = await fetch("/api/debate-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, action, ...body }),
    });
    if (!r.ok) alert("Lỗi: " + (await r.text()));
  }

  async function startPhase(phase: string, duration: number) {
    if (!selectedMatch) {
      alert("Vui lòng chọn cặp đấu trước.");
      return;
    }
    await dispatch("start_phase", { match: selectedMatch, phase, duration_sec: duration });
  }

  async function toggleProjection() {
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId: isProjecting ? null : roundId,
        showScoreboard: false, // mặc định show timer, không show BXH
      }),
    });
  }

  async function toggleBxhProjection() {
    // Chiếu BXH lên màn debate (sau khi debate xong)
    const sb = getBrowserClient();
    const { data } = await sb.from("gm_display_state").select("*").eq("id", 1).maybeSingle();
    const curShow = (data as any)?.show_scoreboard ?? false;
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, showScoreboard: !curShow, showTop3: false }),
    });
  }

  const [showTop3State, setShowTop3State] = useState(false);
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("show_top3, current_round_id").eq("id", 1).maybeSingle().then(({ data }) => {
        setShowTop3State((data as any)?.current_round_id === roundId && (data as any)?.show_top3 === true);
      });
    fetchDs();
    const ch = sb
      .channel(`dr-ds-${roundId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_display_state" }, fetchDs)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [roundId]);

  async function toggleTop3() {
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, showTop3: !showTop3State, showScoreboard: true }),
    });
  }

  const bgkJudges = useMemo(() => judges.filter((j) => j.role === "bgk"), [judges]);
  const bgkSubmitted = bgkJudges.filter((j) => j.submitted).length;
  const matchPair = MATCH_PAIRS[selectedMatch];
  const debatePhaseLabel = state?.debate_phase
    ? PHASE_BUTTONS.find((p) => p.phase === state.debate_phase)?.label
    : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        {/* Header */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm text-ocean-700">Vòng phản biện</div>
              <div className="text-xl font-bold text-ocean-900">
                {round.name} ({round.group?.name})
              </div>
              <div className="text-xs text-ocean-600 italic">{round.group?.debate_title}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                className={isProjecting ? "btn-secondary" : "btn-primary"}
                onClick={toggleProjection}
              >
                {isProjecting ? "⏹ Tắt màn debate" : "▶ Bật màn debate"}
              </button>
              <button className="btn-secondary" onClick={toggleBxhProjection}>
                🏆 Chiếu BXH
              </button>
              <button
                className={showTop3State ? "btn-danger" : "btn-secondary"}
                onClick={toggleTop3}
              >
                {showTop3State ? "Ẩn Top 3" : "🥇 Chiếu Top 3"}
              </button>
            </div>
          </div>
        </div>

        {/* Cặp đấu + Timer */}
        <div className="card space-y-3">
          <h2 className="font-bold text-ocean-800">Tiến trình phản biện</h2>

          {/* Match selector */}
          <div>
            <div className="text-sm text-ocean-700 mb-2">Chọn cặp đấu:</div>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3].map((m) => {
                const [a, b] = MATCH_PAIRS[m];
                const ts1 = contestants[a];
                const ts2 = contestants[b];
                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMatch(m)}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                      selectedMatch === m
                        ? "bg-ocean-600 text-white border-ocean-700"
                        : "bg-white text-ocean-700 border-ocean-300 hover:bg-ocean-50"
                    }`}
                  >
                    Cặp {m}: {ts1?.full_name?.split(" ").slice(-1)[0] ?? "?"} vs {ts2?.full_name?.split(" ").slice(-1)[0] ?? "?"}
                  </button>
                );
              })}
            </div>
            {matchPair && contestants.length >= 3 && (
              <div className="mt-2 p-2 rounded-lg bg-ocean-50 border border-ocean-200 text-sm">
                <b>Đang chọn:</b> {contestants[matchPair[0]].full_name}
                <span className="mx-2 text-amber-600">vs</span>
                {contestants[matchPair[1]].full_name}
              </div>
            )}
          </div>

          {/* Trạng thái timer hiện tại */}
          <div className="p-3 rounded-lg bg-ocean-50 border border-ocean-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              {state?.debate_match ? (
                <>
                  <div className="text-sm text-ocean-700">
                    Cặp đấu <b>{state.debate_match}</b> · {debatePhaseLabel ?? "Chưa chạy"}
                  </div>
                  <div className={`text-3xl font-mono font-bold ${remaining <= 10 && state.phase === "running" ? "text-rose-600" : "text-ocean-900"}`}>
                    {state.phase === "running" && remaining > 0
                      ? formatMMSS(remaining)
                      : remaining <= 0 && state.debate_duration_sec
                      ? "HẾT GIỜ"
                      : "—"}
                  </div>
                </>
              ) : (
                <div className="text-sm text-ocean-600 italic">Chưa bắt đầu cặp đấu nào.</div>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => dispatch("stop")}>
                ⏸ Dừng
              </button>
              <button className="btn-ghost text-rose-700" onClick={() => dispatch("reset")}>
                ↺ Reset cặp đấu
              </button>
            </div>
          </div>

          {/* 4 nút timer */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PHASE_BUTTONS.map((p) => (
              <button
                key={p.phase}
                onClick={() => startPhase(p.phase, p.duration)}
                className={`p-3 rounded-lg border-2 font-bold text-sm transition ${
                  state?.debate_phase === p.phase && state?.phase === "running"
                    ? "bg-amber-200 border-amber-500 text-amber-900"
                    : "bg-white border-ocean-300 text-ocean-800 hover:bg-ocean-50"
                }`}
              >
                <div>{p.label}</div>
                <div className="text-xs opacity-70 font-mono mt-1">{formatMMSS(p.duration)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tiến độ chấm BGK + BXH */}
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">Chấm điểm phản biện (sau debate)</h2>
          <p className="text-xs text-ocean-700 mb-2">
            BGK chấm tổng 0-100đ cho mỗi thí sinh sau khi đấu xong cả 3 cặp.
          </p>
          <div className="flex justify-between mb-1 text-sm">
            <span className="font-semibold text-ocean-800">Ban Giám khảo</span>
            <span className="font-mono">{bgkSubmitted}/{bgkJudges.length}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
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
        </div>

        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">🏆 Bảng xếp hạng phản biện</h2>
          <p className="text-xs text-ocean-700 mb-2">
            Chỉ tính điểm vòng phản biện (max 100đ), không bao gồm các vòng trước.
          </p>
          {leaderboard.length === 0 ? (
            <div className="text-ocean-700 italic">Chưa có điểm nào được chốt.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ocean-600 border-b border-ocean-200">
                  <th className="text-left py-1">#</th>
                  <th className="text-left">Thí sinh</th>
                  <th className="text-right">Điểm phản biện</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={r.contestant_id} className="border-t border-ocean-100">
                    <td className="py-1.5 font-bold">
                      {["🥇", "🥈", "🥉"][i] ?? i + 1}
                    </td>
                    <td className="py-1.5">
                      <div className="font-semibold">{r.full_name}</div>
                    </td>
                    <td className="text-right font-mono font-bold text-ocean-800">
                      {r.round_score}đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">🏆 Top 3 vào phản biện</h2>
          <p className="text-xs text-ocean-700 mb-2">
            Hệ thống tự chọn 3 thí sinh điểm cao nhất từ vòng liền kề trước.
            Cập nhật tự động khi BGK chốt điểm vòng trước.
          </p>
          <div className="space-y-1">
            {contestants.map((c, i) => (
              <div
                key={c.id}
                className={`p-2 rounded-lg text-sm border-2 ${
                  i === 0 ? "bg-amber-50 border-amber-300"
                  : i === 1 ? "bg-slate-50 border-slate-300"
                  : "bg-orange-50 border-orange-300"
                }`}
              >
                <span className="font-bold mr-2">
                  {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}
                </span>
                <span className="font-semibold">{c.full_name}</span>
                {(c as any).cumulative_score !== undefined && (
                  <span className="ml-2 text-xs text-ocean-600 font-mono">
                    ({(c as any).cumulative_score}đ tích lũy)
                  </span>
                )}
              </div>
            ))}
            {contestants.length < 3 && (
              <div className="text-xs text-rose-600 mt-2">
                ⚠ Chưa đủ 3 thí sinh. Cần các vòng trước được BGK chấm xong để xác định top 3.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">📋 Hướng dẫn vận hành</h2>
          <ol className="text-xs text-ocean-700 space-y-1 list-decimal pl-4">
            <li>Bấm <b>Bật màn debate</b> → /screen tự chuyển sang màn phản biện (background + title)</li>
            <li>Chọn cặp đấu (1, 2, hoặc 3)</li>
            <li>Bấm <b>🧠 Suy nghĩ (1:00)</b> → đồng hồ chạy, 10s cuối có tiếng tic-tac</li>
            <li>Hết giờ → bấm <b>🎤 Trình bày (3:00)</b></li>
            <li>Tiếp tục với <b>💬 Phản biện</b> rồi <b>↩ Trả lời</b></li>
            <li>Lặp cho 3 cặp đấu</li>
            <li>Sau khi xong, BGK chấm điểm qua link đã có</li>
            <li>Bấm <b>🏆 Chiếu BXH</b> để công bố kết quả</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function formatMMSS(sec: number): string {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
