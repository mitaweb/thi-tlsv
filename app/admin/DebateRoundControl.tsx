"use client";
import type { Round } from "@/lib/types";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; debate_title: string | null } | null;
}

/**
 * Placeholder cho Giai đoạn 3 — Phản biện.
 * Sẽ thêm: chọn cặp đấu (1-2, 2-3, 3-1), 4 timer (suy nghĩ/trình bày/phản biện/trả lời),
 * audio 10s cuối, BGK chấm tổng sau debate.
 */
export default function DebateRoundControl({ round }: { roundId: string; round: RoundWithGroup }) {
  return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">🎙️</div>
      <h2 className="text-xl font-bold text-ocean-900 mb-2">
        Vòng phản biện — {round.group?.name}
      </h2>
      <p className="text-ocean-700 mb-1">{round.group?.debate_title}</p>
      <div className="mt-4 p-3 rounded-lg bg-amber-50 border-2 border-amber-200 inline-block text-sm text-amber-800 font-semibold">
        ⏳ Tính năng đang phát triển (Giai đoạn 3)
      </div>
      <p className="text-xs text-ocean-600 mt-3">
        Sẽ có: 4 chế độ đồng hồ (1m suy nghĩ / 3m trình bày / 2m phản biện / 2m trả lời),
        background sân khấu, âm thanh đếm 10s cuối, BGK chấm tổng sau khi đấu xong 3 cặp.
      </p>
    </div>
  );
}
