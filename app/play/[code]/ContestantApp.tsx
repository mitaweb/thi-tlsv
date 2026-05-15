"use client";
import { useEffect, useMemo, useState } from "react";
import type { Contestant, Round, Answer } from "@/lib/types";
import { useRoundState, useCountdown } from "@/lib/useRoundState";
import { getBrowserClient } from "@/lib/supabase";

type Opt = "A" | "B" | "C" | "D";

export default function ContestantApp({ contestant, round }: { contestant: Contestant; round: Round }) {
  const { state, currentQuestion, serverOffsetMs } = useRoundState(round.id);
  const remaining = useCountdown(state, round.question_seconds, serverOffsetMs);
  const [selected, setSelected] = useState<Opt | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null);
  const [myPoints, setMyPoints] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // Power-up state
  const [powerupUsed, setPowerupUsed] = useState(false);       // đã dùng trong vòng này chưa
  const [powerupThisQ, setPowerupThisQ] = useState(false);     // đang kích hoạt cho câu này
  const [activatingPowerup, setActivatingPowerup] = useState(false);

  // Lấy tổng điểm + answer hiện tại
  useEffect(() => {
    const sb = getBrowserClient();
    const fetchMine = () =>
      sb.from("gm_answer").select("*").eq("contestant_id", contestant.id).then(({ data }) => {
        const all = (data ?? []) as Answer[];
        setMyPoints(all.filter((a) => a.locked).reduce((s, a) => s + a.points_awarded, 0));
        const curId = state?.current_question_id;
        const cur = curId ? all.find((a) => a.question_id === curId) ?? null : null;
        setMyAnswer(cur);
        if (cur) {
          setSelected((cur.selected_option as Opt) ?? null);
          setSubmitted(cur.locked);
        } else {
          setSelected(null);
          setSubmitted(false);
        }
      });
    fetchMine();
    const ch = sb
      .channel(`my-ans-${contestant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gm_answer", filter: `contestant_id=eq.${contestant.id}` },
        fetchMine
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [contestant.id, state?.current_question_id]);

  // Kiểm tra trạng thái power-up từ DB khi mount / đổi câu
  useEffect(() => {
    const sb = getBrowserClient();
    sb.from("gm_powerup_use")
      .select("question_id")
      .eq("round_id", round.id)
      .eq("contestant_id", contestant.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPowerupUsed(true);
          setPowerupThisQ(data.question_id === state?.current_question_id);
        } else {
          setPowerupUsed(false);
          setPowerupThisQ(false);
        }
      });
  }, [contestant.id, round.id, state?.current_question_id]);

  // Reset per-question UI khi đổi câu
  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
    setPowerupThisQ(false);
  }, [state?.current_question_id]);

  const phase = state?.phase ?? "idle";
  const isReveal = phase === "reveal" || phase === "leaderboard";
  const canPick = phase === "running" && !submitted && remaining > 0;
  const questionNo = state?.question_no ?? 0;

  function sendSelect(opt: Opt) {
    if (!currentQuestion) return;
    fetch("/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accessCode: contestant.access_code,
        questionId: currentQuestion.id,
        selectedOption: opt,
        action: "select",
      }),
    }).catch(() => {});
  }

  async function sendSubmit(opt: Opt) {
    if (!currentQuestion) return;
    setBusy(true);
    try {
      const r = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessCode: contestant.access_code,
          questionId: currentQuestion.id,
          selectedOption: opt,
          action: "submit",
        }),
      });
      const j = await r.json();
      if (!j.ok) { alert("Không gửi được: " + j.error); return; }
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  }

  async function activatePowerup() {
    if (!currentQuestion || powerupUsed || activatingPowerup || phase !== "running") return;
    setActivatingPowerup(true);
    try {
      const r = await fetch("/api/powerup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode: contestant.access_code, questionId: currentQuestion.id }),
      });
      const j = await r.json();
      if (j.ok) {
        setPowerupUsed(true);
        setPowerupThisQ(true);
      } else if (j.error === "already_used") {
        setPowerupUsed(true);
      } else {
        alert("Lỗi: " + j.error);
      }
    } finally {
      setActivatingPowerup(false);
    }
  }

  const optionClass = (k: Opt) => {
    if (isReveal && currentQuestion) {
      if (k === currentQuestion.correct_option) return "option-btn correct locked";
      if (k === selected) return "option-btn wrong locked";
      return "option-btn locked opacity-70";
    }
    if (submitted) return `option-btn locked ${selected === k ? "selected" : ""}`;
    return `option-btn ${selected === k ? "selected" : ""}`;
  };

  return (
    <main className="ocean-bg min-h-screen p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header thí sinh */}
        <header className="card flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm text-ocean-700">Thí sinh #{contestant.display_order}</div>
            <div className="text-xl font-bold text-ocean-900">{contestant.full_name}</div>
            {contestant.organization && <div className="text-xs text-ocean-700">{contestant.organization}</div>}
          </div>
          <div className="text-right">
            <div className="text-sm text-ocean-700">Tổng điểm</div>
            <div className="text-3xl font-mono font-bold text-ocean-800">{myPoints}đ</div>
          </div>
        </header>

        <div className="card space-y-3">
          {phase === "idle" && <Banner>Đang chờ Ban Tổ chức bắt đầu phần thi...</Banner>}

          {currentQuestion && phase !== "idle" && (
            <>
              {/* Header câu hỏi */}
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-semibold text-ocean-700">
                    Câu {questionNo > 0 ? questionNo : currentQuestion.display_order} / {round.questions_to_play}
                  </div>
                </div>
                <div className={`text-3xl font-mono font-bold ${remaining <= 5 && phase === "running" ? "text-rose-600 animate-pulse" : "text-ocean-800"}`}>
                  {phase === "running" && remaining > 0 ? Math.ceil(remaining) + "s" : isReveal ? "Hết giờ" : "—"}
                </div>
              </div>

              {/* Power-up button — hiện từ khi HẾT GIỜ đến khi qua câu kế */}
              {((phase === "running" && remaining <= 0) || phase === "reveal") && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    disabled={powerupUsed || activatingPowerup || phase === "reveal"}
                    onClick={activatePowerup}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition select-none ${
                      powerupThisQ
                        ? "bg-amber-200 border-amber-500 text-amber-800 cursor-default"
                        : powerupUsed
                        ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60"
                        : "bg-white border-amber-400 text-amber-700 hover:bg-amber-50 active:scale-95"
                    }`}
                  >
                    <span className="text-xl">{round.powerup_icon}</span>
                    <span>{round.powerup_name}</span>
                    {powerupThisQ && <span className="text-xs font-semibold">✓ Đã kích hoạt</span>}
                    {powerupUsed && !powerupThisQ && <span className="text-xs">Đã dùng</span>}
                    {!powerupUsed && <span className="text-xs text-amber-600">(1 lần duy nhất)</span>}
                  </button>
                  {powerupThisQ && (
                    <span className="text-xs text-amber-700 font-medium">
                      Đúng: ×2 điểm · Sai: −5 điểm
                    </span>
                  )}
                </div>
              )}

              <h2 className="text-xl font-bold text-ocean-900">{currentQuestion.prompt}</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(["A", "B", "C", "D"] as const).map((k) => {
                  const text = (currentQuestion as any)["option_" + k.toLowerCase()];
                  if (!text) return null;
                  return (
                    <button
                      key={k}
                      disabled={!canPick}
                      onClick={() => {
                        if (!canPick) return;
                        setSelected(k);
                        sendSelect(k);
                      }}
                      className={optionClass(k)}
                    >
                      <span className="font-bold mr-2">{k}.</span>
                      {text}
                    </button>
                  );
                })}
              </div>

              {!isReveal && (
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    className="btn-primary"
                    disabled={!selected || submitted || busy || phase !== "running"}
                    onClick={() => selected && sendSubmit(selected)}
                  >
                    {submitted ? "Đã gửi đáp án" : "Gửi đáp án"}
                  </button>
                </div>
              )}

              {isReveal && myAnswer && (
                <div className={`p-3 rounded-lg ${myAnswer.is_correct ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>
                  {myAnswer.is_correct
                    ? `✓ Đúng! ${powerupThisQ ? "×2 → " : ""}Bạn được ${myAnswer.points_awarded} điểm.`
                    : `✗ Sai. Đáp án đúng là ${currentQuestion.correct_option}.${powerupThisQ ? " (Trừ 5 điểm)" : ""}`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ocean-100 border-2 border-ocean-300 rounded-xl p-6 text-center text-ocean-800 font-semibold">
      {children}
    </div>
  );
}
