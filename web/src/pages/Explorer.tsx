import { useEffect, useMemo, useState } from "react";
import Autocomplete from "../components/Autocomplete";
import { EmptyState, Skeleton } from "../components/Feedback";
import { loadJson } from "../lib/data";
import { deathBowlers, topBatters } from "../lib/explorer";
import { average, fixed, formatDate, ratio, strikeRate } from "../lib/format";
import type { BattersFile, Comeback, DeathBowlersFile, MatchupFile, SiteIndex, VenueRow } from "../lib/types";

type Tab = "matchups" | "death" | "batters" | "venues" | "comebacks";
const TABS: [Tab, string][] = [
  ["matchups", "Batter v bowler"],
  ["death", "Death-over bowlers"],
  ["batters", "Strike rates"],
  ["venues", "Venues"],
  ["comebacks", "Comebacks"],
];

function SeasonRange({ seasons, from, to, set }: { seasons: number[]; from: number; to: number; set: (f: number, t: number) => void }) {
  return (
    <>
      <label><span>From</span>
        <select value={from} onChange={(e) => set(Number(e.target.value), Math.max(Number(e.target.value), to))}>
          {seasons.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label><span>To</span>
        <select value={to} onChange={(e) => set(Math.min(Number(e.target.value), from), Number(e.target.value))}>
          {seasons.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
    </>
  );
}

function MinBalls({ value, set, label = "Min balls" }: { value: number; set: (n: number) => void; label?: string }) {
  return (
    <label><span>{label}</span>
      <input type="number" inputMode="numeric" min={1} step={10} value={value} onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))} />
    </label>
  );
}

function LoadError({ msg }: { msg: string }) {
  return (
    <EmptyState tone="error" title="Could not load this table" action={{ label: "Try again", onClick: () => window.location.reload() }}>
      {msg}
    </EmptyState>
  );
}

function useFile<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadJson<T>(path).then(setData, (e: Error) => setErr(e.message));
  }, [path]);
  return { data, err };
}

function Batters({ seasons }: { seasons: number[] }) {
  const { data, err } = useFile<BattersFile>("explorer/batters.json");
  const [range, setRange] = useState<[number, number]>([seasons[0], seasons[seasons.length - 1]]);
  const [min, setMin] = useState(500);
  const rows = useMemo(() => (data ? topBatters(data, range[0], range[1], min) : []), [data, range, min]);
  if (err) return <LoadError msg={err} />;
  if (!data) return <Skeleton kind="table" />;
  return (
    <>
      <div className="controls panel"><SeasonRange seasons={seasons} from={range[0]} to={range[1]} set={(f, t) => setRange([f, t])} /><MinBalls value={min} set={setMin} /></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Strike rate table">
        <table className="data">
          <caption>Top batters by strike rate, {range[0]}–{range[1]}, at least {min} balls faced</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Batter</th><th scope="col">SR</th><th scope="col">Runs</th><th scope="col">Balls</th><th scope="col">Avg</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id}><td>{i + 1}</td><th scope="row"><a href={`/player/${b.id}`}>{b.name}</a></th><td className="num hl-n">{b.sr.toFixed(1)}</td><td>{b.runs}</td><td>{b.balls}</td><td>{average(b.runs, b.outs)}</td><td>{b.fours}</td><td>{b.sixes}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState title="No batters match" action={min > 1 ? { label: `Try ${Math.max(1, Math.floor(min / 2))}+ balls`, onClick: () => setMin(Math.max(1, Math.floor(min / 2))) } : undefined}>
            Nobody has faced {min}+ balls in {range[0]}–{range[1]}. Lower the minimum or widen the seasons.
          </EmptyState>
        )}
      </div>
    </>
  );
}

function Death({ seasons }: { seasons: number[] }) {
  const { data, err } = useFile<DeathBowlersFile>("explorer/death_bowlers.json");
  const names = useFile<BattersFile>("explorer/batters.json").data?.names;
  const [range, setRange] = useState<[number, number]>([seasons[0], seasons[seasons.length - 1]]);
  const [min, setMin] = useState(180);
  const rows = useMemo(() => (data && names ? deathBowlers(data, names, range[0], range[1], min) : []), [data, names, range, min]);
  if (err) return <LoadError msg={err} />;
  if (!data || !names) return <Skeleton kind="table" />;
  return (
    <>
      <div className="controls panel"><SeasonRange seasons={seasons} from={range[0]} to={range[1]} set={(f, t) => setRange([f, t])} /><MinBalls value={min} set={setMin} label="Min balls bowled" /></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Death-over bowler table">
        <table className="data">
          <caption>Best death-over (overs 16–20) bowlers by economy, {range[0]}–{range[1]}, at least {min} balls</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Bowler</th><th scope="col">Econ</th><th scope="col">Wkts</th><th scope="col">Balls</th><th scope="col">Runs</th><th scope="col">Balls/wkt</th></tr></thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id}><td>{i + 1}</td><th scope="row"><a href={`/player/${b.id}`}>{b.name}</a></th><td className="num hl-n">{b.econ.toFixed(2)}</td><td>{b.wickets}</td><td>{b.balls}</td><td>{b.runs}</td><td>{b.wickets ? (b.balls / b.wickets).toFixed(1) : "—"}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState title="No bowlers match" action={min > 1 ? { label: `Try ${Math.max(1, Math.floor(min / 2))}+ balls`, onClick: () => setMin(Math.max(1, Math.floor(min / 2))) } : undefined}>
            Nobody has bowled {min}+ death-over balls in {range[0]}–{range[1]}. Lower the minimum or widen the seasons.
          </EmptyState>
        )}
      </div>
    </>
  );
}

function Comebacks() {
  const { data, err } = useFile<Comeback[]>("explorer/comebacks.json");
  if (err) return <LoadError msg={err} />;
  if (!data) return <Skeleton kind="table" />;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Biggest comebacks table">
      <table className="data">
        <caption>Biggest comebacks: the winner’s lowest chance during the chase, according to the model (completed matches, no rain)</caption>
        <thead><tr><th scope="col">Match</th><th scope="col">Lowest chance</th><th scope="col">At ball</th><th scope="col">How</th><th scope="col">Date</th></tr></thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id}>
              <th scope="row"><a href={`/replay/${c.id}`}>{c.winner} beat {c.loser}</a></th>
              <td className="num hl-n">{c.low < 0.01 ? "<1" : (c.low * 100).toFixed(1)}%</td>
              <td>{c.at}</td>
              <td>{c.chased ? "chased it down" : "defended it"}</td>
              <td>{formatDate(c.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Probabilities come from a model that did not train on that season. A 3% moment is the model’s estimate, not a measured fact.</p>
    </div>
  );
}

function Venues() {
  const { data, err } = useFile<VenueRow[]>("explorer/venues.json");
  const [min, setMin] = useState(10);
  if (err) return <LoadError msg={err} />;
  if (!data) return <Skeleton kind="table" />;
  const rows = data.filter((v) => v.matches >= min);
  return (
    <>
      <div className="controls panel"><MinBalls value={min} set={setMin} label="Min matches" /></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Venue table">
        <table className="data">
          <caption>Venue stats (matches with a result, rain-affected games excluded from averages)</caption>
          <thead><tr><th scope="col">Ground</th><th scope="col">Matches</th><th scope="col">Avg 1st inns</th><th scope="col">Avg 2nd inns</th><th scope="col">Chasers won</th><th scope="col">Highest</th><th scope="col">Seasons</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.venue}><th scope="row">{v.venue}</th><td>{v.matches}</td><td>{fixed(v.avg1)}</td><td>{fixed(v.avg2)}</td><td className="num hl-n">{ratio(v.chase_wins, v.decided)}</td><td>{v.high1}</td><td>{v.first_season}–{v.last_season}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState title="No grounds that busy" action={{ label: "Show all grounds", onClick: () => setMin(1) }}>
            No ground has hosted {min}+ matches. Lower the minimum.
          </EmptyState>
        )}
      </div>
    </>
  );
}

function Matchups() {
  const { data, err } = useFile<BattersFile>("explorer/batters.json");
  const [batterId, setBatterId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; file: MatchupFile } | null>(null);
  const [bowlerQ, setBowlerQ] = useState("");
  const options = useMemo(() => {
    if (!data) return [];
    const balls = new Map<string, number>();
    for (const r of data.rows) balls.set(r[0], (balls.get(r[0]) ?? 0) + r[2]);
    return Object.entries(data.names)
      .filter(([id]) => balls.has(id))
      .map(([id, label]) => ({ id, label, hint: `${balls.get(id)} balls` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);
  const id = batterId ?? options.find((o) => o.label === "V Kohli")?.id ?? null; // start on a well-known batter
  const mu = loaded && loaded.id === id ? loaded.file : null;
  useEffect(() => {
    if (!id) return;
    const done = (file: MatchupFile) => setLoaded({ id, file });
    loadJson<MatchupFile>(`matchups/${id}.json`).then(done, () => done({ names: {}, rows: [] }));
  }, [id]);
  if (err) return <LoadError msg={err} />;
  if (!data) return <Skeleton kind="table" />;
  const rows = mu?.rows ?? [];
  const bq = bowlerQ.trim().toLowerCase();
  const filtered = bq ? rows.filter((r) => (mu?.names[r[0]] ?? "").toLowerCase().includes(bq)) : rows;
  return (
    <>
      <div className="controls panel">
        <div className="grow">
          <Autocomplete label="Batter (type a name)" options={options} placeholder="e.g. Kohli" initial="V Kohli"
            onSelect={(o) => { setBatterId(o.id); setBowlerQ(""); }} />
        </div>
        <label className="grow"><span>Filter bowlers</span>
          <input value={bowlerQ} onChange={(e) => setBowlerQ(e.target.value)} placeholder="e.g. Bumrah" autoComplete="off" />
        </label>
      </div>
      {id && !mu && <Skeleton kind="table" />}
      {id && mu && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Matchup table">
          <table className="data">
            <caption>{data.names[id]} against each bowler (6+ balls faced, regular innings only)</caption>
            <thead><tr><th scope="col">Bowler</th><th scope="col">Balls</th><th scope="col">Runs</th><th scope="col">SR</th><th scope="col">Outs</th><th scope="col">Dot %</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead>
            <tbody>
              {filtered.slice(0, 60).map(([bid, balls, runs, outs, fours, sixes, dots]) => (
                <tr key={bid}><th scope="row"><a href={`/player/${bid}`}>{mu.names[bid]}</a></th><td>{balls}</td><td>{runs}</td><td className="num hl-n">{strikeRate(runs, balls).toFixed(0)}</td><td>{outs}</td><td>{ratio(dots, balls)}</td><td>{fours}</td><td>{sixes}</td></tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <EmptyState title={rows.length ? "No bowler matches that filter" : "No matchups to show"} action={rows.length ? { label: "Clear the filter", onClick: () => setBowlerQ("") } : undefined}>
              {rows.length ? `None of the bowlers ${data.names[id]} has faced match “${bowlerQ}”.` : `${data.names[id]} has not faced any bowler for 6 or more balls.`}
            </EmptyState>
          )}
          {filtered.length > 60 && <p className="muted small">Showing the 60 bowlers faced most. Use the filter to find others.</p>}
        </div>
      )}
      <p className="muted small">Small samples mislead: a 12-ball record is not a verdict.</p>
    </>
  );
}

export default function Explorer({ index }: { index: SiteIndex }) {
  const seasons = index.seasons.map((s) => s.season);
  const [tab, setTab] = useState<Tab>("matchups");
  return (
    <div className="stack">
      <section className="panel">
        <h1>Explorer</h1>
        <div role="tablist" aria-label="Explorer views" className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} id={`tab-${key}`} role="tab" type="button" aria-selected={tab === key} aria-controls="tabpanel" tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => {
                const i = TABS.findIndex(([k]) => k === tab);
                const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
                if (next !== null) {
                  const k = TABS[(next + TABS.length) % TABS.length][0];
                  setTab(k);
                  document.getElementById(`tab-${k}`)?.focus();
                }
              }}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="stack">
        {tab === "matchups" && <Matchups />}
        {tab === "death" && <Death seasons={seasons} />}
        {tab === "batters" && <Batters seasons={seasons} />}
        {tab === "venues" && <Venues />}
        {tab === "comebacks" && <Comebacks />}
      </div>
    </div>
  );
}
