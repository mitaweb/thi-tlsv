export type Phase = "idle" | "armed" | "running" | "reveal" | "leaderboard";

export interface Round {
  id: string;
  code: string;
  name: string;
  question_seconds: number;
}

export interface Contestant {
  id: string;
  round_id: string;
  display_order: number;
  full_name: string;
  organization: string | null;
  access_code: string;
}

export interface Question {
  id: string;
  round_id: string;
  display_order: number;
  prompt: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: "A" | "B" | "C" | "D";
}

export interface RoundState {
  round_id: string;
  current_question_id: string | null;
  phase: Phase;
  question_started_at: string | null;
  show_scoreboard: boolean;
  updated_at: string;
}

export interface Answer {
  id: string;
  round_id: string;
  question_id: string;
  contestant_id: string;
  selected_option: "A" | "B" | "C" | "D" | null;
  submitted_at: string;
  elapsed_ms: number;
  is_correct: boolean;
  points_awarded: number;
  locked: boolean;
}

export interface LeaderboardRow {
  contestant_id: string;
  round_id: string;
  display_order: number;
  full_name: string;
  organization: string | null;
  total_points: number;
  correct_count: number;
  answered_count: number;
}
