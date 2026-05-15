"use client";
import { useState } from "react";
import type { Round } from "@/lib/types";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string } | null;
}

/**
 * Modal "Reset hệ thống" — 2 lựa chọn:
 *   1. Reset TOÀN BỘ: xóa hết điểm/scores/log/state, giữ lại thí sinh + câu hỏi + giám khảo
 *   2. Reset 1 vòng: chọn 1 vòng → xóa data của vòng đó theo kind
 */
export default function ResetSystemModal({
  rounds,
  onClose,
}: {
  rounds: RoundWithGroup[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"all" | "round">("round");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doReset() {
    if (mode === "all") {
      if (!confirm("⚠ Reset TOÀN BỘ hệ thống?\n\nSẽ xóa:\n• Toàn bộ câu trả lời + điểm trắc nghiệm + bồ câu\n• Toàn bộ điểm BGK + Hội đồng SV\n• Toàn bộ log hoạt động\n• Trạng thái mọi vòng → idle\n\nGiữ lại: thí sinh, câu hỏi, giám khảo, vòng thi.\n\nThao tác không thể hoàn tác. Tiếp tục?")) {
        return;
      }
      if (!confirm("Xác nhận lần 2: bạn chắc chắn reset TOÀN BỘ?")) return;
      setBusy(true);
      try {
        const r = await fetch("/api/reset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        const j = await r.json();
        if (j.ok) {
          alert("✓ Đã reset toàn bộ hệ thống.");
          onClose();
        } else {
          alert("Lỗi: " + j.error);
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Reset 1 vòng
    if (!selected) return;
    const round = rounds.find((r) => r.id === selected);
    if (!round) return;
    const what =
      round.kind === "quiz"
        ? "toàn bộ câu trả lời, bồ câu power-up, log hoạt động và trạng thái vòng"
        : round.kind === "panel"
        ? "toàn bộ điểm BGK & Hội đồng (nếu có), log hoạt động và trạng thái vòng"
        : "toàn bộ điểm BGK, trạng thái debate (cặp đấu, đồng hồ), log hoạt động và trạng thái vòng";
    if (!confirm(`⚠ Reset vòng "${round.name}"?\n\nSẽ xóa: ${what}.\n\nThao tác không thể hoàn tác. Tiếp tục?`)) {
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: selected }),
      });
      const j = await r.json();
      if (j.ok) {
        alert(`✓ Đã reset vòng "${round.name}"`);
        onClose();
      } else {
        alert("Lỗi: " + j.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl">
        <h2 className="text-xl font-bold text-rose-700 mb-3">🗑 Reset hệ thống</h2>

        {/* Chọn mode */}
        <div className="space-y-2 mb-4">
          <label
            className={`flex items-start gap-2 p-3 rounded-lg cursor-pointer border-2 transition ${
              mode === "all" ? "bg-rose-50 border-rose-400" : "bg-white border-ocean-200 hover:bg-ocean-50"
            }`}
          >
            <input
              type="radio"
              name="reset-mode"
              checked={mode === "all"}
              onChange={() => setMode("all")}
              className="mt-1"
            />
            <div>
              <div className="font-bold text-rose-700">⚠ Reset TOÀN BỘ hệ thống</div>
              <div className="text-xs text-ocean-700 mt-1">
                Xóa tất cả điểm, scores, log, trạng thái mọi vòng.
                <br />
                <b>Giữ lại</b>: thí sinh, câu hỏi, giám khảo, cấu hình vòng.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-2 p-3 rounded-lg cursor-pointer border-2 transition ${
              mode === "round" ? "bg-ocean-50 border-ocean-400" : "bg-white border-ocean-200 hover:bg-ocean-50"
            }`}
          >
            <input
              type="radio"
              name="reset-mode"
              checked={mode === "round"}
              onChange={() => setMode("round")}
              className="mt-1"
            />
            <div>
              <div className="font-bold text-ocean-800">Reset 1 vòng</div>
              <div className="text-xs text-ocean-700 mt-1">
                Chọn 1 vòng để reset điểm + log + trạng thái của vòng đó.
              </div>
            </div>
          </label>
        </div>

        {/* List vòng (chỉ hiện khi mode = round) */}
        {mode === "round" && (
          <div className="space-y-2 max-h-72 overflow-y-auto mb-4 border border-ocean-200 rounded-lg p-2">
            {rounds.map((r) => (
              <label
                key={r.id}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-ocean-50 ${
                  selected === r.id ? "bg-ocean-100 border border-ocean-400" : ""
                }`}
              >
                <input
                  type="radio"
                  name="reset-round"
                  checked={selected === r.id}
                  onChange={() => setSelected(r.id)}
                />
                <div className="flex-1">
                  <div className="font-semibold text-sm">
                    {r.group?.code === "SV" ? "Sinh Viên" : "THPT"} – {r.name}
                  </div>
                  <div className="text-xs text-ocean-600">
                    Loại: <span className="font-mono">{r.kind}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            className="btn-danger"
            disabled={busy || (mode === "round" && !selected)}
            onClick={doReset}
          >
            {busy ? "Đang reset..." : mode === "all" ? "Reset TOÀN BỘ" : "Reset vòng đã chọn"}
          </button>
        </div>
      </div>
    </div>
  );
}
