export interface WhatIfTable {
  env: number;
  era_start: number;
  through_season: number;
  runs: number[];
  balls: number[];
  wickets: number[];
  p: number[]; // per-mille, order: wickets, balls, runs
}

/** Index of the axis cell at or below v, plus the fraction of the way to the next cell (clamped to the axis). */
function locate(axis: number[], v: number): [number, number] {
  if (v <= axis[0]) return [0, 0];
  const last = axis.length - 1;
  if (v >= axis[last]) return [last, 0];
  let i = 0;
  while (axis[i + 1] <= v) i++;
  return [i, (v - axis[i]) / (axis[i + 1] - axis[i])];
}

/** Chasing side's win probability (0-100) by bilinear interpolation over runs and balls; wickets are exact. */
export function lookupWinProb(t: WhatIfTable, runsNeeded: number, ballsLeft: number, wicketsLeft: number): number {
  const nb = t.balls.length;
  const nr = t.runs.length;
  const w = Math.min(Math.max(Math.round(wicketsLeft), t.wickets[0]), t.wickets[t.wickets.length - 1]) - t.wickets[0];
  const [ri, rf] = locate(t.runs, runsNeeded);
  const [bi, bf] = locate(t.balls, ballsLeft);
  const at = (b: number, r: number) => t.p[(w * nb + Math.min(b, nb - 1)) * nr + Math.min(r, nr - 1)];
  const top = at(bi, ri) * (1 - rf) + at(bi, ri + 1) * rf;
  const bottom = at(bi + 1, ri) * (1 - rf) + at(bi + 1, ri + 1) * rf;
  return (top * (1 - bf) + bottom * bf) / 10;
}
