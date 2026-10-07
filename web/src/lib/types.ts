export interface SiteIndex {
  generated: string;
  source: { name: string; url: string; license: string; license_url: string; matches: number; latest_match: string };
  seasons: { season: number; matches: number }[];
  featured: string | null;
  teams: Record<string, string>;
  test_season: number;
}

export interface SeasonMatch {
  id: string;
  date: string;
  t1: string;
  t2: string;
  w: string;
  result: string;
  venue: string;
  stage: string;
  p: boolean;
  d: number; // total win-probability movement; higher = more dramatic
}

export interface Swing {
  step: number;
  start?: number;
  kind: "wicket" | "boundary" | "ball" | "over";
  label: string;
  delta: number;
  text: string;
}

export interface Chase {
  team: string;
  target: number;
  modelled: boolean;
  runs: number[];
  wickets: number[];
  balls: number[];
  wp?: number[];
  swings?: Swing[];
}

export interface Innings1 {
  team: string;
  runs: number;
  wickets: number;
  balls: number;
  over_scores: number[];
}

export interface MatchDoc {
  id: string;
  season: number;
  date: string;
  venue: string;
  city: string | null;
  stage: string;
  team1: string;
  team2: string;
  winner: string | null;
  result: string;
  player_of_match: string | null;
  inn1: Innings1 | null;
  chase: Chase | null;
}

export interface BattersFile {
  names: Record<string, string>;
  rows: [string, number, number, number, number, number, number][]; // id, season, balls, runs, outs, 4s, 6s
}
export interface DeathBowlersFile {
  rows: [string, number, number, number, number][]; // id, season, legal balls, runs, wickets
}
export interface VenueRow {
  venue: string;
  matches: number;
  avg1: number | null;
  avg2: number | null;
  high1: number;
  chase_wins: number;
  decided: number;
  first_season: number;
  last_season: number;
}
export interface MatchupFile {
  names: Record<string, string>;
  rows: [string, number, number, number, number, number, number][]; // bowler id, balls, runs, outs, 4s, 6s, dots
}

export interface Scores {
  brier: number;
  log_loss: number;
  n: number;
}
export interface CalBin {
  bin: number;
  pred: number;
  obs: number;
  n: number;
}
export interface ModelMetrics {
  test_season: number;
  train_seasons: [number, number];
  validation_season: number;
  candidates: Candidate[];
  chosen_config: { name: string; features: string; half_life: number | null; era: boolean; recal: string };
  chosen_model: string;
  holdout: Record<string, Scores>;
  holdout_chases: number;
  holdout_states: number;
  bootstrap_vs_rrr_rule: { diff: number; lo: number; hi: number; matches: number };
  bootstrap_vs_logit: { diff: number; lo: number; hi: number; matches: number };
  phases: { phase: string; n: number; rrr_rule: number; model: number }[];
  calibration_holdout: CalBin[];
  calibration_holdout_rrr_rule: CalBin[];
  calibration_holdout_default: CalBin[];
  rolling_origin: RollingRow[];
  calibration_pooled: CalBin[];
  loso: Record<string, Scores>;
  loso_chases: number;
  features: string[];
  mean_pred_holdout: number;
  mean_pred_holdout_default: number;
  mean_obs_holdout: number;
}

export interface PlayerFile {
  id: string;
  name: string;
  bat: [number, number, number, number, number, number, number][]; // season, innings, balls, runs, outs, 4s, 6s
  bowl: [number, number, number, number, number][]; // season, matches, legal balls, runs, wickets
}
export type PlayerIndex = [string, string, number, number][]; // id, name, balls faced, balls bowled

export interface Candidate extends Scores {
  name: string;
  features: string;
  half_life: number | null;
  era: boolean;
  recal: string;
}
export interface RollingRow {
  season: number;
  chases: number;
  model: Scores;
  default_model: Scores;
  rrr_rule: Scores;
  logit: Scores;
}
export interface Comeback {
  id: string;
  season: number;
  date: string;
  winner: string;
  loser: string;
  chased: boolean;
  low: number;
  at: string;
  result: string;
}
