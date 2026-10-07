import type { BattersFile, DeathBowlersFile } from "./types";
import { economy, strikeRate } from "./format";

export interface BatterLine {
  id: string;
  name: string;
  balls: number;
  runs: number;
  outs: number;
  fours: number;
  sixes: number;
  sr: number;
}

export interface BowlerLine {
  id: string;
  name: string;
  balls: number;
  runs: number;
  wickets: number;
  econ: number;
}

export function topBatters(f: BattersFile, from: number, to: number, minBalls: number, limit = 25): BatterLine[] {
  const acc = new Map<string, BatterLine>();
  for (const [id, season, balls, runs, outs, fours, sixes] of f.rows) {
    if (season < from || season > to) continue;
    const cur = acc.get(id) ?? { id, name: f.names[id] ?? id, balls: 0, runs: 0, outs: 0, fours: 0, sixes: 0, sr: 0 };
    cur.balls += balls;
    cur.runs += runs;
    cur.outs += outs;
    cur.fours += fours;
    cur.sixes += sixes;
    acc.set(id, cur);
  }
  return [...acc.values()]
    .filter((b) => b.balls >= minBalls)
    .map((b) => ({ ...b, sr: strikeRate(b.runs, b.balls) }))
    .sort((a, b) => b.sr - a.sr)
    .slice(0, limit);
}

export function deathBowlers(
  f: DeathBowlersFile,
  names: Record<string, string>,
  from: number,
  to: number,
  minBalls: number,
  limit = 25,
): BowlerLine[] {
  const acc = new Map<string, BowlerLine>();
  for (const [id, season, balls, runs, wickets] of f.rows) {
    if (season < from || season > to) continue;
    const cur = acc.get(id) ?? { id, name: names[id] ?? id, balls: 0, runs: 0, wickets: 0, econ: 0 };
    cur.balls += balls;
    cur.runs += runs;
    cur.wickets += wickets;
    acc.set(id, cur);
  }
  return [...acc.values()]
    .filter((b) => b.balls >= minBalls)
    .map((b) => ({ ...b, econ: economy(b.runs, b.balls) }))
    .sort((a, b) => a.econ - b.econ)
    .slice(0, limit);
}
