import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RollingRow } from "../lib/types";

export default function SeasonBrier({ rows }: { rows: RollingRow[] }) {
  const data = rows.map((r) => ({
    season: r.season,
    model: +r.model.brier.toFixed(4),
    rrr: +r.rrr_rule.brier.toFixed(4),
  }));
  return (
    <div className="chart" role="img" aria-label="Line chart of Brier score by season for the model and the required-run-rate baseline, each trained only on earlier seasons. Lower is better. The table below gives the numbers.">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 12, right: 18, bottom: 6, left: 0 }}>
          <CartesianGrid stroke="#27443a" strokeDasharray="2 5" />
          <XAxis dataKey="season" tick={{ fill: "#b4c5bb", fontSize: 13 }} stroke="#5d8070" interval="preserveStartEnd" />
          <YAxis domain={[0.1, 0.22]} tickFormatter={(v: number) => v.toFixed(2)} tick={{ fill: "#b4c5bb", fontSize: 13 }} stroke="#5d8070" width={44} />
          <Tooltip contentStyle={{ background: "#111f1a", border: "1px solid #5d8070", color: "#f1efe4" }} formatter={(v) => Number(v).toFixed(3)} />
          <Legend verticalAlign="top" wrapperStyle={{ color: "#f1efe4", fontSize: 13 }} />
          <Line name="Chaseline model" dataKey="model" stroke="#ffb43a" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          <Line name="Required-run-rate baseline" dataKey="rrr" stroke="#7fdcff" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
