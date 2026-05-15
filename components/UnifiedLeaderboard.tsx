"use client";
import type { RoundLeaderboardRow } from "@/lib/types";

/**
 * BXH format chung dùng trên /screen + /mc.
 * 3 cột: Thí sinh / Điểm phần thi / Tổng tích lũy.
 *
 * mode='full' (default): hiện tất cả thí sinh, có tổ chức, padding 10vh dưới.
 * mode='top3': chỉ 3 top, không hiện tổ chức, font to gấp ~1.5×, căn giữa màn.
 */
export default function UnifiedLeaderboard({
  rows,
  mode = "full",
  title,
}: {
  rows: RoundLeaderboardRow[];
  mode?: "full" | "top3";
  title?: string;
}) {
  const medals = ["🥇", "🥈", "🥉"];
  const list = mode === "top3" ? rows.slice(0, 3) : rows;

  return (
    <main className="ocean-bg h-screen overflow-hidden flex flex-col p-8">
      {title && (
        <header className="text-center mb-4 shrink-0">
          <h1 className="text-4xl md:text-5xl font-extrabold text-ocean-900 drop-shadow uppercase tracking-wide">
            {title}
          </h1>
        </header>
      )}

      <div className={`flex-1 glass rounded-3xl flex flex-col min-h-0 ${mode === "top3" ? "px-12 py-10 pb-[10vh] justify-center" : "px-10 py-6 pb-[10vh]"}`}>
        {/* Header row */}
        <div className={`grid ${mode === "top3" ? "grid-cols-12 gap-6 pb-4 mb-2" : "grid-cols-12 gap-4 pb-3 mb-3"} border-b-4 border-ocean-300 font-bold text-ocean-700 shrink-0`}>
          <div className={`col-span-7 ${mode === "top3" ? "text-3xl" : "text-2xl"}`}>Thí sinh</div>
          <div className={`col-span-2 text-right ${mode === "top3" ? "text-3xl" : "text-2xl"}`}>Điểm phần thi</div>
          <div className={`col-span-3 text-right ${mode === "top3" ? "text-3xl" : "text-2xl"}`}>Tổng điểm</div>
        </div>

        {/* Body rows */}
        {list.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-ocean-700 text-2xl italic">
            Đang chờ giám khảo chấm điểm...
          </div>
        ) : (
          <div className={`flex flex-col ${mode === "top3" ? "gap-6 flex-1 justify-center" : "gap-3 flex-1 overflow-y-auto"} min-h-0`}>
            {list.map((r, i) => {
              const bg =
                i === 0 ? "bg-amber-100 border-amber-400"
                : i === 1 ? "bg-slate-100 border-slate-400"
                : i === 2 ? "bg-orange-100 border-orange-400"
                : "bg-white/85 border-ocean-200";

              return (
                <div
                  key={r.contestant_id}
                  className={`grid grid-cols-12 gap-4 items-center rounded-2xl border-4 ${bg} ${
                    mode === "top3" ? "py-8 px-10" : "py-5 px-8"
                  }`}
                >
                  {/* Tên + medal */}
                  <div className="col-span-7 flex items-center gap-4">
                    <span className={`shrink-0 font-extrabold ${mode === "top3" ? "text-7xl" : "text-4xl"}`}>
                      {i < 3 ? medals[i] : `${i + 1}.`}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-extrabold text-ocean-900 leading-tight ${mode === "top3" ? "text-6xl md:text-7xl" : "text-4xl md:text-5xl"}`}>
                        {r.full_name}
                      </div>
                      {mode === "full" && r.organization && (
                        <div className="text-xl text-ocean-600 mt-1 truncate">{r.organization}</div>
                      )}
                    </div>
                  </div>

                  {/* Điểm phần thi */}
                  <div className={`col-span-2 text-right font-mono font-extrabold text-ocean-700 ${mode === "top3" ? "text-6xl md:text-7xl" : "text-4xl md:text-5xl"}`}>
                    {r.round_score}
                  </div>

                  {/* Tổng tích lũy */}
                  <div className={`col-span-3 text-right font-mono font-extrabold text-ocean-800 ${mode === "top3" ? "text-7xl md:text-8xl" : "text-5xl md:text-6xl"}`}>
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
