import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, Legend } from "recharts";
import type { CalBin } from "../lib/types";

const toPts = (bins: CalBin[]) => bins.map((b) => ({ pred: +(b.pred * 100).toFixed(1), obs: +(b.obs * 100).toFixed(1), n: b.n }));

export default function Calibration({ pooled, holdout, season }: { pooled: CalBin[]; holdout: CalBin[]; season: number }) {
  return (
    <div className="chart" role="img" aria-label="Calibration chart: predicted win probability against how often the chasing side actually won, in ten bins. A perfectly calibrated model lies on the diagonal. The table below gives the same numbers.">
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 0 }}>
          <CartesianGrid stroke="#27443a" strokeDasharray="2 5" />
          <XAxis type="number" dataKey="pred" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fill: "#b4c5bb", fontSize: 13 }} stroke="#4a6b5d" name="Predicted"
            label={{ value: "Model says (chasing side wins)", position: "insideBottom", offset: -16, fill: "#b4c5bb", fontSize: 12 }} />
          <YAxis type="number" dataKey="obs" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fill: "#b4c5bb", fontSize: 13 }} stroke="#4a6b5d" width={48} name="Actual" />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#f1efe4" strokeOpacity={0.6} strokeDasharray="6 4" />
          <Tooltip cursor={false} formatter={(v) => `${v}%`} contentStyle={{ background: "#111f1a", border: "1px solid #4a6b5d", color: "#f1efe4" }} />
          <Legend verticalAlign="top" wrapperStyle={{ color: "#f1efe4", fontSize: 13 }} />
          <Scatter name="All seasons (each scored out-of-season)" data={toPts(pooled)} fill="#ffb43a" line={{ stroke: "#ffb43a", strokeWidth: 2 }} isAnimationActive={false} />
          <Scatter name={`${season} hold-out`} data={toPts(holdout)} fill="#5fd0ff" shape="diamond" line={{ stroke: "#5fd0ff", strokeWidth: 2, strokeDasharray: "4 3" }} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
