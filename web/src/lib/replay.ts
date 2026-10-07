import type { Chase, Swing } from "./types";

export interface ReplayPoint {
  step: number;
  x: number; // overs bowled, nudged so wides/no-balls on the same legal ball do not overlap
  balls: number;
  runs: number;
  wickets: number;
  wp: number; // chasing side's win probability, 0-100
}

export interface Marker {
  step: number;
  x: number;
  y: number;
  kind: Swing["kind"];
  label: string;
  delta: number;
  text: string;
}

export interface Band {
  x1: number;
  x2: number;
  label: string;
  delta: number;
  text: string;
}

export interface ReplayShape {
  points: ReplayPoint[];
  markers: Marker[];
  bands: Band[];
}

/** Turn the per-ball arrays of a match file into chart points, dots and shaded over bands. */
export function shapeReplay(chase: Chase): ReplayShape {
  if (!chase.wp) return { points: [], markers: [], bands: [] };
  const seen = new Map<number, number>();
  const points = chase.wp.map((wp, step) => {
    const balls = chase.balls[step];
    const repeat = seen.get(balls) ?? 0;
    seen.set(balls, repeat + 1);
    return {
      step,
      x: balls / 6 + repeat * 0.02,
      balls,
      runs: chase.runs[step],
      wickets: chase.wickets[step],
      wp: wp / 10,
    };
  });
  const markers: Marker[] = [];
  const bands: Band[] = [];
  for (const s of chase.swings ?? []) {
    const end = points[s.step];
    if (!end) continue;
    if (s.kind === "over") {
      const start = points[s.start ?? s.step - 6] ?? end;
      bands.push({ x1: start.x, x2: end.x, label: s.label, delta: s.delta, text: s.text });
    } else {
      markers.push({ step: s.step, x: end.x, y: end.wp, kind: s.kind, label: s.label, delta: s.delta, text: s.text });
    }
  }
  return { points, markers, bands };
}

export function describeReplay(points: ReplayPoint[], chaseTeam: string): string {
  if (!points.length) return "No win probability for this match.";
  const first = points[0].wp;
  const last = points[points.length - 1].wp;
  const lo = Math.min(...points.map((p) => p.wp));
  const hi = Math.max(...points.map((p) => p.wp));
  return `Win probability for ${chaseTeam} over the chase: starts at ${Math.round(first)}%, ranges from ${Math.round(lo)}% to ${Math.round(hi)}%, finishes at ${Math.round(last)}%.`;
}
