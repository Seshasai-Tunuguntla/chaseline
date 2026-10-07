import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ballLabel } from "../lib/format";
import type { ReplayPoint, ReplayShape } from "../lib/replay";

interface Props {
  shape: ReplayShape;
  chaseCode: string;
  label: string;
  compact: boolean;
}

function TipBody({ active, payload, chaseCode }: { active?: boolean; payload?: { payload: ReplayPoint }[]; chaseCode: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-over">Ball {p.balls === 0 ? "0.0" : ballLabel(p.balls)}</div>
      <div>{chaseCode} {p.runs}/{p.wickets}</div>
      <div className="tip-wp">{Math.round(p.wp)}% win</div>
    </div>
  );
}

export default function WinChart({ shape, chaseCode, label, compact }: Props) {
  const { points, markers, bands } = shape;
  return (
    <div className="chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={compact ? 300 : 380}>
        <ComposedChart data={points} margin={{ top: 28, right: 30, bottom: 6, left: 0 }}>
          <CartesianGrid stroke="#27443a" strokeDasharray="2 5" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 20]}
            ticks={[0, 5, 10, 15, 20]}
            tick={{ fill: "#b4c5bb", fontSize: 13 }}
            stroke="#5d8070"
            label={{ value: "Overs bowled", position: "insideBottom", offset: -2, fill: "#b4c5bb", fontSize: 12 }}
            height={44}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "#b4c5bb", fontSize: 13 }}
            stroke="#5d8070"
            width={46}
          />
          <ReferenceLine y={50} stroke="#f1efe4" strokeOpacity={0.55} />
          {bands.map((b) => (
            <ReferenceArea
              key={b.label}
              x1={b.x1}
              x2={b.x2}
              fill="#5fd0ff"
              fillOpacity={0.14}
              stroke="#5fd0ff"
              strokeOpacity={0.5}
              label={{ value: b.label, position: "insideTop", fill: "#8fe0ff", fontSize: 12, fontWeight: 600 }}
            />
          ))}
          <Area
            type="linear"
            dataKey="wp"
            baseValue={50}
            stroke="#ffb43a"
            strokeWidth={2.5}
            fill="#ffb43a"
            fillOpacity={0.16}
            dot={false}
            activeDot={{ r: 5, fill: "#ffb43a", stroke: "#0a1310" }}
            isAnimationActive={false}
          />
          {markers.map((m) => (
            <ReferenceDot
              key={m.step}
              x={m.x}
              y={m.y}
              r={m.kind === "wicket" ? 6 : 5}
              fill={m.kind === "wicket" ? "#ff6b5b" : "#f1efe4"}
              stroke="#0a1310"
              strokeWidth={1.5}
              ifOverflow="visible"
              label={{
                value: m.label,
                position: m.y > 55 ? "bottom" : "top",
                fill: m.kind === "wicket" ? "#ff9d90" : "#f1efe4",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          ))}
          <Tooltip content={<TipBody chaseCode={chaseCode} />} isAnimationActive={false} cursor={{ stroke: "#f1efe4", strokeOpacity: 0.4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
