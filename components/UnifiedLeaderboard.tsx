"use client";
import type { RoundLeaderboardRow } from "@/lib/types";

/**
 * BXH format chung dùng trên /screen + /mc.
 * 3 cột: Thí sinh / Điểm phần thi / Tổng điểm.
 *
 * - mode='full' (default): tất cả thí sinh, padding bottom 10%
 * - mode='top3': chỉ 3 top, fonts to, căn giữa màn
 * - compact=true: scale fonts/padding nhỏ ~40% (dùng cho MC laptop nhỏ)
 */
export default function UnifiedLeaderboard({
  rows,
  mode = "full",
  title,
  compact = false,
}: {
  rows: RoundLeaderboardRow[];
  mode?: "full" | "top3";
  title?: string;
  compact?: boolean;
}) {
  const medals = ["🥇", "🥈", "🥉"];
  const list = mode === "top3" ? rows.slice(0, 3) : rows;

  // Tailwind class strings theo (mode, compact)
  const T = {
    title: compact ? "text-2xl md:text-3xl" : "text-4xl md:text-5xl",
    headerCol:
      mode === "top3"
        ? compact ? "text-xl" : "text-3xl"
        : compact ? "text-lg" : "text-2xl",
    rowPadding:
      mode === "top3"
        ? compact ? "py-4 px-6" : "py-8 px-10"
        : "flex-1 min-h-0 px-6",
    rowGap: mode === "top3" ? (compact ? "gap-3" : "gap-6") : "gap-2",
    medalSize:
      mode === "top3"
        ? compact ? "text-5xl" : "text-7xl"
        : compact ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl",
    nameSize:
      mode === "top3"
        ? compact ? "text-4xl md:text-5xl" : "text-6xl md:text-7xl"
        : compact ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl",
    roundScoreSize:
      mode === "top3"
        ? compact ? "text-3xl md:text-4xl" : "text-6xl md:text-7xl"
        : compact ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl",
    cumulSize:
      mode === "top3"
        ? compact ? "text-4xl md:text-5xl" : "text-7xl md:text-8xl"
        : compact ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl",
    cardPadding:
      mode === "top3"
        ? compact ? "px-6 py-5 pb-6" : "px-12 py-8 pb-[10vh]"
        : compact ? "px-6 py-4 pb-4" : "px-10 py-5 pb-6",
  };

  return (
    <main className="ocean-bg h-screen overflow-hidden flex flex-col p-4 md:p-8">
      {title && (
        <header className="text-center mb-3 shrink-0">
          <h1 className={`${T.title} font-extrabold text-ocean-900 drop-shadow uppercase tracking-wide`}>
            {title}
          </h1>
        </header>
      )}

      <div className={`flex-1 glass rounded-3xl flex flex-col min-h-0 ${T.cardPadding} ${mode === "top3" ? "justify-center" : ""}`}>
        {/* Header row */}
        <div className={`grid grid-cols-12 ${mode === "top3" ? (compact ? "gap-4 pb-2 mb-2" : "gap-6 pb-4 mb-2") : "gap-4 pb-2 mb-2"} border-b-4 border-ocean-300 font-bold text-ocean-700 shrink-0`}>
          <div className={`col-span-7 ${T.headerCol}`}>Thí sinh</div>
          <div className={`col-span-2 text-right ${T.headerCol}`}>Điểm phần thi</div>
          <div className={`col-span-3 text-right ${T.headerCol}`}>Tổng điểm</div>
        </div>

        {/* Body rows */}
        {list.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-ocean-700 text-2xl italic">
            Đang chờ giám khảo chấm điểm...
          </div>
        ) : (
          <div className={`flex flex-col ${T.rowGap} ${mode === "top3" ? "flex-1 justify-center" : "flex-1 min-h-0"}`}>
            {list.map((r, i) => {
              const bg =
                i === 0 ? "bg-amber-100 border-amber-400"
                : i === 1 ? "bg-slate-100 border-slate-400"
                : i === 2 ? "bg-orange-100 border-orange-400"
                : "bg-white/85 border-ocean-200";

              return (
                <div
                  key={r.contestant_id}
                  className={`grid grid-cols-12 gap-4 items-center rounded-2xl border-4 ${bg} ${T.rowPadding}`}
                >
                  <div className="col-span-7 flex items-center gap-4 min-h-0">
                    <span className={`shrink-0 font-extrabold ${T.medalSize}`}>
                      {i < 3 ? medals[i] : `${i + 1}.`}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-extrabold text-ocean-900 leading-tight ${T.nameSize}`}>
                        {r.full_name}
                      </div>
                    </div>
                  </div>

                  <div className={`col-span-2 text-right font-mono font-extrabold text-ocean-700 ${T.roundScoreSize}`}>
                    {r.round_score}
                  </div>

                  <div className={`col-span-3 text-right font-mono font-extrabold text-ocean-800 ${T.cumulSize}`}>
                    {r.cumulative_score}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
