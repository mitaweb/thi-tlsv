export type Phase = "idle" | "armed" | "running" | "reveal" | "leaderboard";
export type RoundKind = "quiz" | "panel" | "debate";
export type JudgeRole = "bgk" | "sv_council";
export type DebatePhase = "thinking" | "presenting" | "rebutting" | "responding";

export interface Group {
  id: string;
  code: string;             // 'SV' | 'THPT'
  name: string;
  display_order: number;
  debate_title: string | null;
}

export interface Round {
  id: string;
  code: string;
  name: string;
  group_id: string | null;
  kind: RoundKind;
  display_order: number;
  total_points: number;
  scoring_config: {
    bgk?: { max: number };
    council?: { enabled?: boolean; max: number };
    is_debate?: boolean;
  };
  question_seconds: number;
  powerup_icon: string;        // '🕊️' | '⭐'
  powerup_name: string;        // 'Bồ câu' | 'Ngôi sao hi vọng'
  questions_to_play: number;   // số câu cần thi (mặc định 10)
}

export interface Contestant {
  id: string;
  round_id: string;
  group_id: string | null;
  display_order: number;
  full_name: string;
  organization: string | null;
  access_code: string;
}

export interface Judge {
  id: string;
  access_code: string;
  display_name: string;
  role: JudgeRole;
  display_order: number;
  active: boolean;
}

export interface PanelScore {
  id: string;
  round_id: string;
  contestant_id: string;
  judge_id: string;
  score: number;
  locked: boolean;
  submitted_at: string | null;
}

export interface PanelSubmission {
  round_id: string;
  judge_id: string;
  submitted_at: string;
}

export interface DisplayState {
  id: number;
  current_round_id: string | null;
  show_scoreboard: boolean;
  show_top3: boolean;
  updated_at: string;
}

export interface RoundLeaderboardRow {
  contestant_id: string;
  display_order: number;
  full_name: string;
  organization: string | null;
  round_score: number;          // điểm vòng này
  cumulative_score: number;     // tổng tích lũy đến hết vòng này
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
  media_url: string | null;
  media_type: "image" | "video" | null;
}

export interface RoundState {
  round_id: string;
  current_question_id: string | null;
  phase: Phase;
  question_started_at: string | null;
  show_scoreboard: boolean;
  updated_at: string;
  question_no: number;  // số thứ tự câu đang thi trong cuộc thi
  // Debate-specific (chỉ dùng cho round.kind === 'debate')
  debate_match: number | null;
  debate_phase: DebatePhase | null;
  debate_started_at: string | null;
  debate_duration_sec: number | null;
}

export interface PowerupUse {
  id: string;
  round_id: string;
  contestant_id: string;
  question_id: string;
  created_at: string;
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
