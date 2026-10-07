import { useEffect, useId, useState } from "react";
import { loadJson } from "../lib/data";
import { formatOvers } from "../lib/format";
import { lookupWinProb, type WhatIfTable } from "../lib/whatif";

function Field(props: { label: string; value: number; min: number; max: number; set: (n: number) => void; hint?: string }) {
  const id = useId();
  const { label, value, min, max, set, hint } = props;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n) || min));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-row">
        <input id={`${id}-n`} aria-label={`${label} (number)`} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => set(clamp(Number(e.target.value)))} />
        <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => set(clamp(Number(e.target.value)))} />
      </div>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

export default function WhatIf() {
  const [t, setT] = useState<WhatIfTable | null>(null);
  const [runs, setRuns] = useState(48);
  const [balls, setBalls] = useState(30);
  const [wk, setWk] = useState(5);
  useEffect(() => {
    loadJson<WhatIfTable>("whatif.json").then(setT);
  }, []);
  if (!t) return <p className="notice">Loading…</p>;

  const p = lookupWinProb(t, runs, balls, wk);
  const rrr = (runs * 6) / balls;
  const scenarios: [string, number][] = [
    ["A wicket falls", lookupWinProb(t, runs, balls, wk - 1)],
    ["A wicket in hand is saved", lookupWinProb(t, runs, balls, wk + 1)],
    ["A six is hit", lookupWinProb(t, Math.max(1, runs - 6), Math.max(1, balls - 1), wk)],
    ["A dot ball is bowled", lookupWinProb(t, runs, Math.max(1, balls - 1), wk)],
    ["An over goes for 12", lookupWinProb(t, Math.max(1, runs - 12), Math.max(1, balls - 6), wk)],
    ["An over goes for 3", lookupWinProb(t, Math.max(1, runs - 3), Math.max(1, balls - 6), wk)],
  ];
  return (
    <div className="stack">
      <section className="panel">
        <h1>What if?</h1>
        <p className="muted">
          Set up any chase and read off the model’s chance for the batting side. Inputs outside the table are clamped.
          Values come from a precomputed table at the current scoring environment ({t.env.toFixed(1)} runs an over in the last 60 matches, Impact Player era), through the {t.through_season} season.
        </p>
        <div className="fields">
          <Field label="Runs needed" value={runs} min={1} max={250} set={setRuns} />
          <Field label="Balls left" value={balls} min={1} max={120} set={setBalls} hint={`${formatOvers(120 - balls)} overs bowled, ${formatOvers(balls)} to go`} />
          <Field label="Wickets in hand" value={wk} min={1} max={10} set={setWk} />
        </div>
      </section>
      <section className="board" aria-live="polite" aria-label="Result">
        <div className="board-teams">
          <div className="team-box"><span className="team-code">CHASERS WIN</span><span className="led">{p.toFixed(0)}%</span></div>
          <span className="vs" aria-hidden="true">·</span>
          <div className="team-box"><span className="team-code">NEED PER OVER</span><span className="led">{rrr.toFixed(1)}</span></div>
        </div>
        <p className="meta">{runs} needed from {balls} balls with {wk} wicket{wk === 1 ? "" : "s"} in hand. Defenders: {(100 - p).toFixed(0)}%.</p>
      </section>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="What happens next table">
        <table className="data">
          <caption>One thing happens next: how the chasers’ chance moves</caption>
          <thead><tr><th scope="col">Next</th><th scope="col">Chasers win</th><th scope="col">Change</th></tr></thead>
          <tbody>
            {scenarios.map(([label, v]) => {
              const d = v - p;
              return (
                <tr key={label}>
                  <th scope="row">{label}</th><td className="hl-n">{v.toFixed(0)}%</td>
                  <td className={d >= 0 ? "up" : "down"}>{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(0)} pts</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">The “six” and “dot ball” rows use the table as is (a six also uses a ball). Small differences are within the model’s noise. Not betting advice.</p>
      </div>
    </div>
  );
}
