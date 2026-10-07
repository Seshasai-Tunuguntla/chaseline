const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Overs bowled as cricketers write them: 119 balls -> "19.5", 120 -> "20.0". */
export function formatOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

/** Notation for the last legal ball bowled: 107 -> "17.5", 120 -> "19.6". */
export function ballLabel(balls: number): string {
  const n = Math.max(balls, 1);
  return `${Math.floor((n - 1) / 6)}.${((n - 1) % 6) + 1}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Win probability stored as per-mille integers. */
export function pct(permille: number): string {
  return `${Math.round(permille / 10)}%`;
}

export function signedPct(delta: number): string {
  const v = Math.round(delta * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`;
}

export function strikeRate(runs: number, balls: number): number {
  return balls ? (runs * 100) / balls : 0;
}

export function economy(runs: number, balls: number): number {
  return balls ? (runs * 6) / balls : 0;
}

export function average(runs: number, outs: number): string {
  return outs ? (runs / outs).toFixed(1) : "—";
}

export function fixed(n: number | null | undefined, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

export function ratio(part: number, whole: number): string {
  return whole ? `${Math.round((part * 100) / whole)}%` : "—";
}
