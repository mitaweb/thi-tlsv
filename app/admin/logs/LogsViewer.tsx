"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Round } from "@/lib/types";

interface RoundWithGroup extends Round {
  group?: { code: string; name: string } | null;
}

type LogEntry = {
  id: string;
  round_id: string;
  question_id: string | null;
  actor: string;
  actor_name: string;
  action: string;
  payload: Record<string, unknown> | null;
  elapsed_ms: number | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  select_option:           "Chọn đáp án lần đầu",
  change_option:           "Đổi đáp án",
  submit:                  "✅ Gửi đáp án (chốt)",
  reveal:                  "Hiện đáp án",
  phase_goto:              "Chuyển câu hỏi",
  phase_start:             "Bắt đầu đếm giờ",
  phase_reveal:            "→ Hiện đáp án",
  phase_leaderboard:       "→ Bảng xếp hạng",
  phase_idle:              "→ Nghỉ (idle)",
  phase_toggle_scoreboard: "Toggle hiện BXH",
  reset_round:             "⚠️ Reset toàn bộ dữ liệu",
  void_question:           "🚫 Hủy kết quả câu",
  powerup_activate:        "🕊️ Kích hoạt power-up",
  powerup_apply:           "🕊️ Tính power-up",
  judge_submit:            "🧑‍⚖️ Giám khảo gửi điểm",
  judge_score:             "🧑‍⚖️ Chấm điểm",
  display_state_change:    "📺 Chuyển vòng trình chiếu",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function remainingLabel(ms: number | null, totalSec = 30) {
  if (ms === null || ms === undefined) return "—";
  const elapsed = ms / 1000;
  const remaining = Math.max(0, totalSec - elapsed);
  return `${remaining.toFixed(2)}s`;
}

function rowColor(action: string, payload: any) {
  if (action === "submit") {
    if (payload?.isCorrect === true) return "bg-emerald-50";
    if (payload?.isCorrect === false) return "bg-rose-50";
    return "bg-white";
  }
  if (action === "powerup_activate") return "bg-amber-50";
  if (action === "powerup_apply") {
    return payload?.isCorrect ? "bg-amber-100" : "bg-orange-100";
  }
  if (action === "judge_submit") return "bg-sky-100";
  if (action === "judge_score") return "bg-sky-50";
  if (action.startsWith("phase_") || action === "reveal" || action === "display_state_change") return "bg-ocean-50";
  if (action === "reset_round" || action === "void_question") return "bg-amber-100";
  return "bg-white";
}

export default function LogsViewer() {
  const [rounds, setRounds] = useState<RoundWithGroup[]>([]);
  const [roundId, setRoundId] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);

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

  const fetchLogs = useCallback(() => {
    if (!roundId) return;
    setLoading(true);
    fetch(`/api/logs?roundId=${roundId}&limit=300`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setLogs(j.data);
      })
      .finally(() => setLoading(false));
  }, [roundId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const i = setInterval(fetchLogs, 3000);
    return () => clearInterval(i);
  }, [autoRefresh, fetchLogs]);

  const filtered = logs.filter((l) => {
    if (filter === "all") return true;
    if (filter === "answer") return ["submit", "select_option", "change_option"].includes(l.action);
    if (filter === "admin") return l.actor === "admin";
    if (filter === "powerup") return l.action === "powerup_activate" || l.action === "powerup_apply";
    if (filter === "judge") return l.action === "judge_submit" || l.action === "judge_score" || l.actor === "judge";
    return true;
  });

  // Tổng số giây của 1 câu (mặc định 30s) để tính "thời gian còn lại"
  const currentRound = rounds.find((r) => r.id === roundId);
  const questionSeconds = currentRound?.question_seconds ?? 30;

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="btn-ghost text-ocean-700">← Quay lại</Link>
          <h1 className="text-2xl font-bold text-ocean-900">📋 Log hoạt động thí sinh</h1>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-2 text-sm text-ocean-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            Tự động làm mới (3s)
          </label>
          <button className="btn-secondary" onClick={fetchLogs} disabled={loading}>
            {loading ? "Đang tải..." : "🔄 Làm mới"}
          </button>
          <button
            className="btn-ghost text-rose-700 border border-rose-200 hover:bg-rose-50"
            disabled={!roundId}
            onClick={async () => {
              const r = rounds.find((x) => x.id === roundId);
              if (!r) return;
              if (!confirm(`Xóa toàn bộ log của vòng "${r.name}"?\n\nThao tác không thể hoàn tác.`)) return;
              const res = await fetch("/api/logs-reset", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ roundId }),
              });
              const j = await res.json();
              if (j.ok) {
                alert(`✓ Đã xóa log vòng "${r.name}".`);
                fetchLogs();
              } else {
                alert("Lỗi: " + j.error);
              }
            }}
          >
            🗑 Xóa log vòng này
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              if (!confirm("⚠ Xóa TOÀN BỘ log của mọi vòng?\n\nThao tác không thể hoàn tác.")) return;
              if (!confirm("Xác nhận lần 2: bạn chắc chắn xóa hết log?")) return;
              const res = await fetch("/api/logs-reset", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({}),
              });
              const j = await res.json();
              if (j.ok) {
                alert("✓ Đã xóa toàn bộ log.");
                fetchLogs();
              } else {
                alert("Lỗi: " + j.error);
              }
            }}
          >
            🗑 Xóa toàn bộ log
          </button>
        </div>
      </header>

      {/* Bộ lọc */}
      <div className="card flex flex-wrap gap-3 items-center py-4">
        <div className="flex gap-2 flex-wrap">
          {rounds.map((r) => {
            const prefix = r.group?.code === "SV" ? "SV" : r.group?.code === "THPT" ? "THPT" : null;
            return (
              <button
                key={r.id}
                onClick={() => setRoundId(r.id)}
                className={`px-4 py-2 rounded-lg font-semibold border-2 text-sm ${
                  roundId === r.id
                    ? "bg-ocean-600 text-white border-ocean-700"
                    : "bg-white text-ocean-700 border-ocean-200"
                }`}
              >
                {prefix && <span className="text-xs opacity-70 mr-1">{prefix}</span>}
                {r.name}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 ml-auto flex-wrap">
          {[
            { key: "all", label: "Tất cả" },
            { key: "answer", label: "Đáp án thí sinh" },
            { key: "powerup", label: "🕊️ Power-up" },
            { key: "judge", label: "🧑‍⚖️ Giám khảo" },
            { key: "admin", label: "Hành động admin" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                filter === key
                  ? "bg-ocean-100 border-ocean-400 text-ocean-800"
                  : "bg-white border-ocean-200 text-ocean-600 hover:bg-ocean-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="text-sm text-ocean-600">{filtered.length} dòng</div>
      </div>

      {/* Bảng log */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-100 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-ocean-800 whitespace-nowrap">Thời gian</th>
                <th className="px-4 py-3 text-left font-semibold text-ocean-800 whitespace-nowrap">Thí sinh</th>
                <th className="px-4 py-3 text-left font-semibold text-ocean-800 whitespace-nowrap">Hành động</th>
                <th className="px-4 py-3 text-left font-semibold text-ocean-800 whitespace-nowrap">Thời gian còn lại</th>
                <th className="px-4 py-3 text-left font-semibold text-ocean-800">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ocean-500">
                    {loading ? "Đang tải..." : "Chưa có log nào."}
                  </td>
                </tr>
              )}
              {filtered.map((log) => (
                <tr key={log.id} className={`${rowColor(log.action, log.payload)} hover:brightness-95 transition`}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ocean-700 font-mono text-xs">
                    {formatTime(log.created_at)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-semibold text-ocean-900">
                    {log.action === "judge_submit" && log.payload?.judgeName ? (
                      <span className="text-sky-700">🧑‍⚖️ {String(log.payload.judgeName)}</span>
                    ) : log.action === "judge_score" && log.payload?.judgeName ? (
                      <span className="text-sky-700">{log.actor_name}</span>
                    ) : (
                      log.actor_name
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.action === "submit"
                          ? log.payload?.isCorrect
                            ? "bg-emerald-200 text-emerald-800"
                            : "bg-rose-200 text-rose-800"
                          : log.action === "powerup_activate" || log.action === "powerup_apply"
                          ? "bg-amber-300 text-amber-900"
                          : log.action === "judge_submit" || log.action === "judge_score"
                          ? "bg-sky-300 text-sky-900"
                          : log.action.startsWith("phase_") || log.action === "reveal" || log.action === "display_state_change"
                          ? "bg-ocean-200 text-ocean-800"
                          : log.action === "reset_round" || log.action === "void_question"
                          ? "bg-amber-300 text-amber-900"
                          : "bg-white/70 text-ocean-700 border border-ocean-200"
                      }`}
                    >
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-ocean-700">
                    {["submit", "select_option", "change_option", "powerup_apply"].includes(log.action)
                      ? remainingLabel(log.elapsed_ms, questionSeconds)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ocean-600 max-w-xs truncate text-xs">
                    {log.action === "submit" && log.payload && (
                      <span>
                        Chọn: <b>{String(log.payload.selectedOption ?? "—")}</b>
                        {" · "}
                        {log.payload.isCorrect ? (
                          <span className="text-emerald-700 font-bold">Đúng</span>
                        ) : (
                          <span className="text-rose-700 font-bold">Sai</span>
                        )}
                        {log.payload.points !== null && log.payload.points !== undefined && (
                          <span className="ml-1 font-mono font-bold text-ocean-800">
                            · {String(log.payload.points)}đ
                          </span>
                        )}
                      </span>
                    )}
                    {(log.action === "select_option" || log.action === "change_option") && log.payload && (
                      <span>
                        Chọn: <b>{String(log.payload.selectedOption ?? "—")}</b>
                        {log.payload.previous ? ` (trước: ${log.payload.previous})` : ""}
                      </span>
                    )}
                    {log.action === "reveal" && log.payload && (
                      <span>
                        Đáp án đúng: <b>{String(log.payload.correct ?? "—")}</b>
                        {Number(log.payload.powerup_count) > 0 && (
                          <span className="ml-2 text-amber-700 font-medium">
                            · {String(log.payload.powerup_count)} thí sinh dùng power-up
                          </span>
                        )}
                      </span>
                    )}
                    {log.action === "phase_goto" && log.payload && (
                      <span>Câu: {String((log.payload as any).patch?.current_question_id?.slice(0, 8) ?? "—")}…</span>
                    )}
                    {log.action === "powerup_activate" && log.payload && (
                      <span className="text-amber-800">
                        <b>{String(log.payload.powerup_icon ?? "🕊️")} {String(log.payload.powerup_name ?? "Bồ câu")}</b>
                        {log.payload.activated_at_question_no != null && (
                          <span> · kích hoạt ở câu {String(log.payload.activated_at_question_no)} (tính cho câu kế)</span>
                        )}
                      </span>
                    )}
                    {log.action === "powerup_apply" && log.payload && (
                      <span className="text-amber-800">
                        <b>{String(log.payload.powerup_name ?? "🕊️ Bồ câu")}</b>{" · "}
                        {log.payload.isCorrect ? (
                          <>
                            <span className="text-emerald-700 font-bold">Đúng</span>
                            <span className="ml-1 font-mono">
                              {String(log.payload.basePoints)}đ ×2 →{" "}
                              <b className="text-emerald-700">{String(log.payload.finalPoints)}đ</b>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-rose-700 font-bold">Sai</span>
                            <span className="ml-1 font-mono">
                              → <b className="text-rose-700">{String(log.payload.finalPoints)}đ</b>
                            </span>
                          </>
                        )}
                      </span>
                    )}
                    {log.action === "judge_score" && log.payload && (
                      <span className="text-sky-800">
                        <b>{String(log.payload.judgeName ?? "?")}</b>
                        {log.payload.role ? (
                          <span className="ml-1 text-xs opacity-70">
                            ({String(log.payload.role) === "bgk" ? "BGK" : "Hội đồng SV"})
                          </span>
                        ) : null}
                        {" · "}
                        <span className="font-mono font-bold text-lg text-sky-900">
                          {String(log.payload.score)}
                        </span>
                        <span className="font-mono text-xs opacity-70">/{String(log.payload.maxScore)}đ</span>
                      </span>
                    )}
                    {log.action === "judge_submit" && log.payload && (
                      <span className="text-sky-800">
                        <b>{String(log.payload.judgeName ?? "?")}</b>
                        {log.payload.role ? (
                          <span className="ml-1 text-xs opacity-70">
                            ({String(log.payload.role) === "bgk" ? "BGK" : "Hội đồng SV"})
                          </span>
                        ) : null}
                        {" · đã gửi điểm cho "}
                        <b>{String(log.payload.count)}</b>
                        {" thí sinh"}
                      </span>
                    )}
                    {log.action === "display_state_change" && log.payload && (
                      <span>
                        Chiếu vòng: <b>{String(log.payload.roundId ?? "—").slice(0, 8)}…</b>
                        {log.payload.showScoreboard !== undefined && (
                          <span className="ml-2">
                            {log.payload.showScoreboard ? "Hiện BXH" : "Ẩn BXH"}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
