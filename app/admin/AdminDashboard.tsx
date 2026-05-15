"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Round } from "@/lib/types";
import QuizRoundControl from "./QuizRoundControl";
import PanelRoundControl from "./PanelRoundControl";
import DebateRoundControl from "./DebateRoundControl";
import ResetSystemModal from "./ResetSystemModal";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; display_order: number; debate_title: string | null } | null;
}

export default function AdminDashboard() {
  const [rounds, setRounds] = useState<RoundWithGroup[]>([]);
  const [activeGroupCode, setActiveGroupCode] = useState<string>("SV");
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setRounds(j.data);
        }
      });
  }, []);

  // Nhóm vòng theo group
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; order: number; rounds: RoundWithGroup[] }>();
    for (const r of rounds) {
      const code = r.group?.code ?? "OTHER";
      const name = r.group?.name ?? "Khác";
      const order = r.group?.display_order ?? 99;
      if (!map.has(code)) map.set(code, { name, order, rounds: [] });
      map.get(code)!.rounds.push(r);
    }
    // Sort rounds in each group by display_order
    for (const g of map.values()) {
      g.rounds.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    }
    // Convert to array sorted by group.order
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => a.order - b.order);
  }, [rounds]);

  // Auto-select first round of current group khi activeGroupCode đổi hoặc lần đầu load
  useEffect(() => {
    const g = grouped.find((x) => x.code === activeGroupCode);
    if (g && g.rounds.length) {
      const currentRoundInGroup = g.rounds.find((r) => r.id === activeRoundId);
      if (!currentRoundInGroup) {
        setActiveRoundId(g.rounds[0].id);
      }
    } else if (!g && grouped.length) {
      // Group hiện tại không tồn tại, fallback sang group đầu
      setActiveGroupCode(grouped[0].code);
      setActiveRoundId(grouped[0].rounds[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, activeGroupCode]);

  const activeRound = rounds.find((r) => r.id === activeRoundId);
  const activeGroup = grouped.find((g) => g.code === activeGroupCode);

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-ocean-900">
          Bảng điều khiển – Hội thi Thủ lĩnh Sinh viên
        </h1>
        <div className="flex gap-2 items-center flex-wrap">
          <Link href="/admin/questions" className="btn-secondary">Quản lý câu hỏi</Link>
          <Link href="/admin/logs" className="btn-secondary">📋 Xem log</Link>
          <Link href="/screen" target="_blank" className="btn-secondary">Mở trình chiếu</Link>
          <Link href="/mc" target="_blank" className="btn-secondary">Mở MC</Link>
          <button className="btn-danger" onClick={() => setShowResetModal(true)}>🗑 Reset hệ thống</button>
          <form
            action="/api/admin/logout"
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              fetch("/api/admin/logout", { method: "POST" }).then(() => location.reload());
            }}
          >
            <button className="btn-ghost text-rose-700">Đăng xuất</button>
          </form>
        </div>
      </header>

      {/* Top tabs: groups */}
      <div className="flex gap-2 border-b-2 border-ocean-200">
        {grouped.map((g) => (
          <button
            key={g.code}
            onClick={() => setActiveGroupCode(g.code)}
            className={`px-5 py-2 font-bold text-base rounded-t-lg border-2 border-b-0 transition ${
              activeGroupCode === g.code
                ? "bg-ocean-600 text-white border-ocean-700 -mb-0.5"
                : "bg-white text-ocean-700 border-ocean-200 hover:bg-ocean-50"
            }`}
          >
            {g.code === "SV" ? "🎓 " : "📘 "}
            {g.name}
          </button>
        ))}
      </div>

      {/* Sub tabs: rounds in active group */}
      {activeGroup && (
        <div className="flex gap-2 flex-wrap">
          {activeGroup.rounds.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRoundId(r.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm border-2 ${
                activeRoundId === r.id
                  ? "bg-ocean-500 text-white border-ocean-600"
                  : "bg-white text-ocean-700 border-ocean-200 hover:bg-ocean-50"
              }`}
              title={`Loại: ${r.kind}`}
            >
              <span className="opacity-70 mr-1 text-xs">
                {r.group?.code ?? ""} · {r.display_order}.
              </span>
              {r.name}
              <span className="ml-1 text-xs opacity-70">({kindLabel(r.kind)})</span>
            </button>
          ))}
        </div>
      )}

      {/* Round control based on kind */}
      {activeRound && (
        activeRound.kind === "quiz" ? (
          <QuizRoundControl roundId={activeRound.id} round={activeRound} />
        ) : activeRound.kind === "panel" ? (
          <PanelRoundControl roundId={activeRound.id} round={activeRound} />
        ) : (
          <DebateRoundControl roundId={activeRound.id} round={activeRound} />
        )
      )}

      {showResetModal && (
        <ResetSystemModal rounds={rounds} onClose={() => setShowResetModal(false)} />
      )}
    </main>
  );
}

function kindLabel(k: string) {
  return k === "quiz" ? "trắc nghiệm" : k === "panel" ? "chấm điểm" : "phản biện";
}
