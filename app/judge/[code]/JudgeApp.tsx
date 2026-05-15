"use client";
import { useEffect, useMemo, useState } from "react";
import type { Judge, Round, Contestant } from "@/lib/types";
import { getBrowserClient } from "@/lib/supabase";

interface RoundWithGroup extends Round {
  group?: { id: string; code: string; name: string; debate_title: string | null } | null;
}

export default function JudgeApp({ judge, accessCode }: { judge: Judge; accessCode: string }) {
  const [rounds, setRounds] = useState<RoundWithGroup[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rounds")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          // Lọc: chỉ hiện vòng panel/debate.
          // Council chỉ hiện vòng có scoring_config.council.enabled
          const allowed = (j.data as RoundWithGroup[]).filter((r) => {
            if (r.kind === "quiz") return false;
            if (judge.role === "sv_council") {
              return r.scoring_config?.council?.enabled === true;
            }
            return true; // BGK chấm mọi panel + debate
          });
          setRounds(allowed);
          if (allowed.length && !selectedRoundId) setSelectedRoundId(allowed[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRound = useMemo(() => rounds.find((r) => r.id === selectedRoundId), [rounds, selectedRoundId]);

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="card flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ocean-600 font-semibold">
              🧑‍⚖️ {judge.role === "bgk" ? "Ban Giám khảo" : "Hội đồng Sinh Viên"}
            </div>
            <h1 className="text-2xl font-bold text-ocean-900">{judge.display_name}</h1>
          </div>
          {rounds.length > 1 && (
            <select
              className="p-2 rounded-lg border border-ocean-300 text-sm"
              value={selectedRoundId ?? ""}
              onChange={(e) => setSelectedRoundId(e.target.value)}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.group?.code === "SV" ? "SV" : "THPT"} – {r.name}
                </option>
              ))}
            </select>
          )}
        </header>

        {rounds.length === 0 ? (
          <div className="card text-center text-ocean-700">
            Bạn không tham gia chấm bất kỳ vòng nào hiện tại.
          </div>
        ) : selectedRound ? (
          <ScoringForm round={selectedRound} judge={judge} accessCode={accessCode} />
        ) : null}
      </div>
    </main>
  );
}

function ScoringForm({
  round,
  judge,
  accessCode,
}: {
  round: RoundWithGroup;
  judge: Judge;
  accessCode: string;
}) {
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({}); // string vì input
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingScores, setExistingScores] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Hội đồng SV bị khóa khi admin công bố BXH (show_scoreboard=true)
  const [roundPublished, setRoundPublished] = useState(false);

  const maxScore =
    judge.role === "bgk" ? (round.scoring_config?.bgk?.max ?? 100) : (round.scoring_config?.council?.max ?? 30);

  // Subscribe gm_round_state để biết khi vòng được công bố
  useEffect(() => {
    if (judge.role !== "sv_council") return; // chỉ council mới quan tâm
    const sb = getBrowserClient();
    const fetchState = () =>
      sb.from("gm_round_state").select("show_scoreboard").eq("round_id", round.id).maybeSingle().then(({ data }) => {
        setRoundPublished((data as any)?.show_scoreboard === true);
      });
    fetchState();
    const ch = sb
      .channel(`judge-rs-${round.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gm_round_state", filter: `round_id=eq.${round.id}` },
        fetchState,
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [round.id, judge.role]);

  // Fetch contestants + check existing submission + scores
  useEffect(() => {
    const sb = getBrowserClient();
    setLoading(true);
    (async () => {
      let cs: Contestant[] = [];
      if (round.kind === "debate") {
        // Debate: top 3 theo cumulative vòng liền kề trước
        const r = await fetch(`/api/debate-contestants?roundId=${round.id}`).then((x) => x.json());
        if (r.ok) {
          const ids = r.data.map((d: any) => d.contestant_id);
          const { data } = await sb.from("gm_contestant").select("*").in("id", ids);
          // Giữ thứ tự top 3 (theo điểm)
          cs = ids.map((id: string) => (data ?? []).find((c: any) => c.id === id)).filter(Boolean) as Contestant[];
        }
      } else {
        // Panel: toàn bộ thí sinh group
        let q = sb.from("gm_contestant").select("*");
        if (round.group_id) q = q.eq("group_id", round.group_id);
        else q = q.eq("round_id", round.id);
        const { data } = await q.order("display_order");
        cs = (data ?? []) as Contestant[];
      }
      setContestants(cs);

      // Existing submission?
      const { data: sub } = await sb
        .from("gm_panel_submission")
        .select("submitted_at")
        .eq("round_id", round.id)
        .eq("judge_id", judge.id)
        .maybeSingle();
      const submitted = !!sub;
      setAlreadySubmitted(submitted);

      // Existing scores (nếu đã submit)
      if (submitted) {
        const { data: sc } = await sb
          .from("gm_panel_score")
          .select("contestant_id, score")
          .eq("round_id", round.id)
          .eq("judge_id", judge.id);
        const map: Record<string, number> = {};
        for (const r of (sc ?? [])) {
          map[(r as any).contestant_id] = (r as any).score;
        }
        setExistingScores(map);
        // Hiện điểm cũ trong input (readonly)
        const inputMap: Record<string, string> = {};
        for (const c of cs) inputMap[c.id] = String(map[c.id] ?? "");
        setScores(inputMap);
      } else {
        // Reset input cho vòng mới
        setScores({});
      }
      setLoading(false);
    })();
  }, [round.id, judge.id, round.group_id]);

  const allFilled = contestants.length > 0 && contestants.every((c) => {
    const s = scores[c.id];
    return s !== undefined && s !== "" && /^\d+$/.test(s);
  });

  const validateRange = (): string | null => {
    for (const c of contestants) {
      const v = parseInt(scores[c.id] ?? "", 10);
      if (!Number.isInteger(v)) return `Điểm cho ${c.full_name} chưa hợp lệ.`;
      if (v < 0 || v > maxScore) return `Điểm cho ${c.full_name} phải từ 0 đến ${maxScore}.`;
    }
    return null;
  };

  async function submit() {
    if (alreadySubmitted) return;
    const err = validateRange();
    if (err) {
      alert(err);
      return;
    }
    if (!confirm(`Xác nhận gửi điểm cho vòng "${round.name}"?\n\nĐiểm sẽ bị KHÓA sau khi gửi, không sửa được.`)) {
      return;
    }
    setBusy(true);
    try {
      const scoresPayload: Record<string, number> = {};
      for (const c of contestants) scoresPayload[c.id] = parseInt(scores[c.id], 10);
      const r = await fetch("/api/panel-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode, roundId: round.id, scores: scoresPayload }),
      });
      const j = await r.json();
      if (!j.ok) {
        alert("Lỗi: " + j.error);
        return;
      }
      alert("✓ Đã gửi điểm thành công. Cảm ơn giám khảo!");
      setAlreadySubmitted(true);
      const map: Record<string, number> = {};
      for (const c of contestants) map[c.id] = scoresPayload[c.id];
      setExistingScores(map);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="card text-ocean-700">Đang tải...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-ocean-900">
            {round.group?.code === "SV" ? "Sinh Viên" : "THPT"} – {round.name}
          </h2>
          <span className="text-sm text-ocean-700 font-mono">tối đa {maxScore}đ / thí sinh</span>
        </div>
        <p className="text-sm text-ocean-700">
          {judge.role === "bgk"
            ? "Chấm điểm số nguyên (không 0.25/0.5/0.75) cho từng thí sinh."
            : "Hội đồng SV chấm điểm 0-30 cho từng thí sinh."}
        </p>
        {alreadySubmitted && (
          <div className="mt-2 p-2 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm font-semibold">
            ✓ Bạn đã gửi điểm cho vòng này. Điểm đã khóa, không thể sửa.
          </div>
        )}
        {!alreadySubmitted && roundPublished && judge.role === "sv_council" && (
          <div className="mt-2 p-2 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-sm font-semibold">
            ⛔ Ban Tổ chức đã công bố bảng xếp hạng vòng này. Hội đồng Sinh Viên không thể gửi điểm nữa.
          </div>
        )}
      </div>

      <div className="card space-y-2">
        {contestants.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/70 border border-ocean-200">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ocean-900 truncate">
                {c.display_order}. {c.full_name}
              </div>
              {c.organization && <div className="text-xs text-ocean-600 truncate">{c.organization}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={0}
                max={maxScore}
                step={1}
                disabled={alreadySubmitted || (roundPublished && judge.role === "sv_council")}
                value={scores[c.id] ?? ""}
                onChange={(e) => {
                  // Chỉ cho số nguyên
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setScores((prev) => ({ ...prev, [c.id]: v }));
                }}
                placeholder="—"
                className="w-20 p-2 text-center text-lg font-bold rounded-lg border-2 border-ocean-300 disabled:bg-ocean-100 disabled:text-ocean-700"
              />
              <span className="text-sm text-ocean-600 font-mono">/{maxScore}đ</span>
            </div>
          </div>
        ))}

        {!alreadySubmitted && !(roundPublished && judge.role === "sv_council") && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-ocean-700">
              {allFilled
                ? "✓ Đã đủ điểm cho mọi thí sinh"
                : `Còn ${contestants.length - Object.values(scores).filter((s) => s && /^\d+$/.test(s)).length} thí sinh chưa chấm`}
            </span>
            <button
              className="btn-primary"
              disabled={!allFilled || busy}
              onClick={submit}
            >
              {busy ? "Đang gửi..." : "Gửi điểm"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
