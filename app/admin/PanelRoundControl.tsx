"use client";
import { useEffect, useState, useMemo } from "react";
import type { Round, Judge, Contestant, RoundLeaderboardRow } from "@/lib/types";
import { getBrowserClient } from "@/lib/supabase";

interface JudgeProgress extends Judge {
  submitted: boolean;
  submittedAt: string | null;
}

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; debate_title: string | null } | null;
}

/**
 * Điều khiển vòng panel (Chân dung, Nhạy bén).
 * - Hiển thị tiến độ chấm của 4 BGK + (nếu có) 30 SV council
 * - Hiển thị BXH 2 cột "Vòng" + "Tổng"
 * - Nút Chiếu BXH → set gm_display_state.current_round_id
 * - Link copy cho judges
 */
export default function PanelRoundControl({ roundId, round }: { roundId: string; round: RoundWithGroup }) {
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [judges, setJudges] = useState<JudgeProgress[]>([]);
  const [leaderboard, setLeaderboard] = useState<RoundLeaderboardRow[]>([]);
  const [isProjecting, setIsProjecting] = useState(false);
  const [showCouncilLinks, setShowCouncilLinks] = useState(false);

  const bgkMax = round.scoring_config?.bgk?.max ?? 100;
  const councilEnabled = !!round.scoring_config?.council?.enabled;
  const councilMax = round.scoring_config?.council?.max ?? 30;

  // Fetch contestants in group
  useEffect(() => {
    const sb = getBrowserClient();
    let q = sb.from("gm_contestant").select("*");
    if (round.group_id) q = q.eq("group_id", round.group_id);
    else q = q.eq("round_id", roundId);
    q.order("display_order").then(({ data }) => setContestants((data ?? []) as Contestant[]));
  }, [roundId, round.group_id]);

  // Fetch judges progress (poll every 3s) + realtime
  useEffect(() => {
    const fetchProgress = () =>
      fetch(`/api/panel-progress?roundId=${roundId}`)
        .then((r) => r.json())
        .then((j) => j.ok && setJudges(j.judges));
    fetchProgress();
    const sb = getBrowserClient();
    const ch = sb
      .channel(`panel-progress-${roundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_panel_submission", filter: `round_id=eq.${roundId}` }, fetchProgress)
      .subscribe();
    const i = setInterval(fetchProgress, 5000);
    return () => { sb.removeChannel(ch); clearInterval(i); };
  }, [roundId]);

  // Fetch leaderboard
  useEffect(() => {
    const fetchLb = () =>
      fetch(`/api/round-leaderboard?roundId=${roundId}`)
        .then((r) => r.json())
        .then((j) => j.ok && setLeaderboard(j.data));
    fetchLb();
    const i = setInterval(fetchLb, 3000);
    return () => clearInterval(i);
  }, [roundId]);

  const [showTop3, setShowTop3] = useState(false);

  // Subscribe display_state to know if this round is currently projecting
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchDs = () =>
      sb.from("gm_display_state").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
        const isCurrent = (data as any)?.current_round_id === roundId;
        setIsProjecting(isCurrent && (data as any)?.show_scoreboard);
        setShowTop3(isCurrent && (data as any)?.show_top3 === true);
      });
    fetchDs();
    const ch = sb
      .channel(`ds-${roundId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gm_display_state" }, fetchDs)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [roundId]);

  const bgkJudges = useMemo(() => judges.filter((j) => j.role === "bgk"), [judges]);
  const councilJudges = useMemo(() => judges.filter((j) => j.role === "sv_council"), [judges]);
  const bgkSubmitted = bgkJudges.filter((j) => j.submitted).length;
  const councilSubmitted = councilJudges.filter((j) => j.submitted).length;

  async function toggleProjection() {
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId: isProjecting ? null : roundId,
        showScoreboard: !isProjecting,
        showTop3: false,
      }),
    });
  }

  async function toggleTop3() {
    await fetch("/api/display-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId,
        showTop3: !showTop3,
        showScoreboard: true,
      }),
    });
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Cột trái + giữa: tiến độ + BXH */}
      <div className="xl:col-span-2 space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm text-ocean-700">Vòng chấm điểm</div>
              <div className="text-xl font-bold text-ocean-900">{round.name}</div>
              <div className="text-xs text-ocean-600 mt-0.5">
                BGK max {bgkMax}đ {councilEnabled ? `· Hội đồng SV max ${councilMax}đ` : ""} · Tổng {round.total_points}đ
              </div>
            </div>
            <button
              className={isProjecting ? "btn-secondary" : "btn-primary"}
              onClick={toggleProjection}
            >
              {isProjecting ? "Ẩn BXH" : "🏆 Chiếu BXH lên trình chiếu"}
            </button>
            <button
              className={showTop3 ? "btn-danger" : "btn-secondary"}
              onClick={toggleTop3}
            >
              {showTop3 ? "Ẩn Top 3" : "🥇 Chiếu Top 3"}
            </button>
          </div>
        </div>

        {/* Tiến độ chấm */}
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">Tiến độ chấm điểm</h2>

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
                    className={`p-2 rounded-lg border-2 ${
                      j.submitted
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-ocean-200 bg-white"
                    }`}
                  >
                    <div className="text-sm font-semibold">{j.display_name}</div>
                    <div className="text-xs text-ocean-700">
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
                <div className="text-xs text-ocean-600 mt-1">
                  BXH chỉ tính từ Hội đồng đã chốt (không tính người chưa chấm).
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BXH 2 cột */}
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">🏆 Bảng xếp hạng</h2>
          {leaderboard.length === 0 ? (
            <div className="text-ocean-700 italic">Chưa có điểm nào được chốt.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ocean-600 border-b border-ocean-200">
                  <th className="text-left py-1">#</th>
                  <th className="text-left">Thí sinh</th>
                  <th className="text-right">Vòng này</th>
                  <th className="text-right">Tổng điểm</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={r.contestant_id} className="border-t border-ocean-100">
                    <td className="py-1.5 font-bold">{i + 1}</td>
                    <td className="py-1.5">
                      <div className="font-semibold">{r.full_name}</div>
                    </td>
                    <td className="text-right font-mono text-ocean-700">{r.round_score}đ</td>
                    <td className="text-right font-mono font-bold text-ocean-800">{r.cumulative_score}đ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cột phải: link giám khảo */}
      <div className="space-y-4">
        <div className="card">
          <h2 className="font-bold text-ocean-800 mb-2">🧑‍⚖️ Link BGK (4 người)</h2>
          <p className="text-xs text-ocean-700 mb-2">
            Mỗi BGK dùng 1 link xuyên suốt mọi vòng chấm điểm.
          </p>
          <div className="space-y-1">
            {bgkJudges.map((j) => (
              <JudgeLink key={j.id} judge={j} />
            ))}
          </div>
        </div>

        {councilEnabled && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-ocean-800">🎓 Link Hội đồng SV ({councilJudges.length})</h2>
              <button
                className="text-xs text-ocean-600 underline"
                onClick={() => setShowCouncilLinks(!showCouncilLinks)}
              >
                {showCouncilLinks ? "Ẩn" : "Hiện"}
              </button>
            </div>
            {showCouncilLinks && (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {councilJudges.map((j) => (
                  <JudgeLink key={j.id} judge={j} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JudgeLink({ judge }: { judge: JudgeProgress }) {
  const [code, setCode] = useState<string | null>(null);

  // Lazy fetch access_code (admin chỉ cần khi click copy)
  async function copyLink() {
    let c = code;
    if (!c) {
      const r = await fetch("/api/judges").then((x) => x.json());
      if (r.ok) {
        const found = (r.data as any[]).find((x) => x.id === judge.id);
        c = found?.access_code ?? null;
        setCode(c);
      }
    }
    if (!c) {
      alert("Không lấy được access_code");
      return;
    }
    const url = `${location.origin}/judge/${c}`;
    await navigator.clipboard.writeText(url);
    alert("Đã copy link: " + url);
  }

  return (
    <div
      onClick={copyLink}
      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-ocean-50 ${
        judge.submitted ? "bg-emerald-50" : "bg-white/70"
      }`}
    >
      <span className="text-sm font-semibold">{judge.display_name}</span>
      <span className="text-xs">
        {judge.submitted ? <span className="text-emerald-700">✓ Chốt</span> : <span className="text-ocean-500">Copy link</span>}
      </span>
    </div>
  );
}
