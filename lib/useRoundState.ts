"use client";
import { useEffect, useState } from "react";
import { getBrowserClient } from "./supabase";
import type { Question, RoundState } from "./types";

export interface RoundStateBundle {
  state: RoundState | null;
  currentQuestion: Question | null;
  serverOffsetMs: number; // Date.now() - serverNow (≈0); dùng cho đồng bộ timer
}

/**
 * Subscribe realtime vào gm_round_state cho 1 round.
 * Đồng thời fetch câu hỏi tương ứng khi current_question_id đổi.
 */
export function useRoundState(roundId: string | null): RoundStateBundle {
  const [state, setState] = useState<RoundState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [serverOffsetMs, setOffset] = useState(0);

  useEffect(() => {
    if (!roundId) return;
    const sb = getBrowserClient();
    let mounted = true;

    async function loadState() {
      const { data } = await sb.from("gm_round_state").select("*").eq("round_id", roundId).maybeSingle();
      if (mounted && data) setState(data as RoundState);
    }
    loadState();

    // Đồng bộ giờ server: gọi 1 endpoint nhẹ và đo skew
    fetch("/api/now")
      .then((r) => r.json())
      .then((j) => {
        if (j?.serverNow && mounted) setOffset(Date.now() - j.serverNow);
      })
      .catch(() => {});

    const channel = sb
      .channel(`round-state-${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gm_round_state", filter: `round_id=eq.${roundId}` },
        (payload) => {
          if (payload.new) setState(payload.new as RoundState);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      sb.removeChannel(channel);
    };
  }, [roundId]);

  // Khi current_question_id đổi → fetch câu hỏi
  useEffect(() => {
    const qid = state?.current_question_id;
    if (!qid) {
      setCurrentQuestion(null);
      return;
    }
    const sb = getBrowserClient();
    sb.from("gm_question")
      .select("*")
      .eq("id", qid)
      .single()
      .then(({ data }) => {
        if (data) setCurrentQuestion(data as Question);
      });
  }, [state?.current_question_id]);

  return { state, currentQuestion, serverOffsetMs };
}

/**
 * Hook đếm ngược dựa trên question_started_at (server time).
 * Trả về số giây còn lại (float).
 */
export function useCountdown(state: RoundState | null, totalSec: number, serverOffsetMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  if (state?.phase !== "running" || !state.question_started_at) return totalSec;
  const startMs = new Date(state.question_started_at).getTime();
  const elapsed = (now - serverOffsetMs - startMs) / 1000;
  return Math.max(0, totalSec - elapsed);
}
