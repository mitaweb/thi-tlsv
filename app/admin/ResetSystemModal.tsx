"use client";
import { useState } from "react";
import type { Round } from "@/lib/types";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string } | null;
}

/**
 * Modal "Reset hệ thống" — admin chọn 1 vòng để reset.
 * API /api/reset tự xử lý theo round.kind (quiz/panel/debate).
 */
export default function ResetSystemModal({
  rounds,
  onClose,
}: {
  rounds: RoundWithGroup[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doReset() {
    if (!selected) return;
    const round = rounds.find((r) => r.id === selected);
    if (!round) return;
    const what =
      round.kind === "quiz"
        ? "toàn bộ câu trả lời, bồ câu power-up, và trạng thái vòng"
        : round.kind === "panel"
        ? "toàn bộ điểm BGK & Hội đồng (nếu có) và trạng thái vòng"
        : "toàn bộ điểm BGK, trạng thái debate (cặp đấu, đồng hồ) và trạng thái vòng";
    if (!confirm(
      `⚠ Reset vòng "${round.name}"?\n\nSẽ xóa: ${what}.\n\nThao tác không thể hoàn tác. Tiếp tục?`,
    )) {
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
        <h2 className="text-xl font-bold text-rose-700 mb-2">🗑 Reset hệ thống</h2>
        <p className="text-sm text-ocean-700 mb-3">
          Chọn vòng cần reset. Mỗi vòng có cách reset khác nhau theo loại (trắc nghiệm / chấm điểm / phản biện).
        </p>

        <div className="space-y-2 max-h-80 overflow-y-auto mb-4 border border-ocean-200 rounded-lg p-2">
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

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            className="btn-danger"
            disabled={!selected || busy}
            onClick={doReset}
          >
            {busy ? "Đang reset..." : "Reset vòng đã chọn"}
          </button>
        </div>
      </div>
    </div>
  );
}
