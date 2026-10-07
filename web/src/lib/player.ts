import { average, economy, strikeRate } from "./format";
import type { PlayerFile } from "./types";

export interface BatCareer {
  innings: number;
  balls: number;
  runs: number;
  outs: number;
  fours: number;
  sixes: number;
  sr: number;
  avg: string;
}
export interface BowlCareer {
  matches: number;
  balls: number;
  runs: number;
  wickets: number;
  econ: number;
}

export function batCareer(p: PlayerFile): BatCareer | null {
  if (!p.bat.length) return null;
  const t = { innings: 0, balls: 0, runs: 0, outs: 0, fours: 0, sixes: 0 };
  for (const [, inns, balls, runs, outs, fours, sixes] of p.bat) {
    t.innings += inns;
    t.balls += balls;
    t.runs += runs;
    t.outs += outs;
    t.fours += fours;
    t.sixes += sixes;
  }
  return { ...t, sr: strikeRate(t.runs, t.balls), avg: average(t.runs, t.outs) };
}

export function bowlCareer(p: PlayerFile): BowlCareer | null {
  if (!p.bowl.length) return null;
  const t = { matches: 0, balls: 0, runs: 0, wickets: 0 };
  for (const [, m, balls, runs, wickets] of p.bowl) {
    t.matches += m;
    t.balls += balls;
    t.runs += runs;
    t.wickets += wickets;
  }
  return { ...t, econ: economy(t.runs, t.balls) };
}

/** Most dramatic modelled matches first. */
export function mostDramatic<T extends { p: boolean; d: number }>(list: T[], n: number): T[] {
  return list.filter((m) => m.p).sort((a, b) => b.d - a.d).slice(0, n);
}
