import { useEffect, useId, useMemo, useState } from "react";
import { loadJson } from "../lib/data";
import { deathBowlers, topBatters } from "../lib/explorer";
import { average, fixed, ratio, strikeRate } from "../lib/format";
import type { BattersFile, DeathBowlersFile, MatchupFile, SiteIndex, VenueRow } from "../lib/types";

type Tab = "matchups" | "death" | "batters" | "venues";
const TABS: [Tab, string][] = [
  ["matchups", "Batter v bowler"],
  ["death", "Death-over bowlers"],
  ["batters", "Strike rates"],
  ["venues", "Venues"],
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
  if (err) return <p className="notice" role="alert">{err}</p>;
  if (!data) return <p className="notice">Loading…</p>;
  return (
    <>
      <div className="controls panel"><SeasonRange seasons={seasons} from={range[0]} to={range[1]} set={(f, t) => setRange([f, t])} /><MinBalls value={min} set={setMin} /></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Strike rate table">
        <table className="data">
          <caption>Top batters by strike rate, {range[0]}–{range[1]}, at least {min} balls faced</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Batter</th><th scope="col">SR</th><th scope="col">Runs</th><th scope="col">Balls</th><th scope="col">Avg</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id}><td>{i + 1}</td><th scope="row"><a href={`#/player/${b.id}`}>{b.name}</a></th><td className="num hl-n">{b.sr.toFixed(1)}</td><td>{b.runs}</td><td>{b.balls}</td><td>{average(b.runs, b.outs)}</td><td>{b.fours}</td><td>{b.sixes}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="notice">No batter has faced that many balls in this range. Lower the minimum.</p>}
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
  if (err) return <p className="notice" role="alert">{err}</p>;
  if (!data || !names) return <p className="notice">Loading…</p>;
  return (
    <>
      <div className="controls panel"><SeasonRange seasons={seasons} from={range[0]} to={range[1]} set={(f, t) => setRange([f, t])} /><MinBalls value={min} set={setMin} label="Min balls bowled" /></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Death-over bowler table">
        <table className="data">
          <caption>Best death-over (overs 16–20) bowlers by economy, {range[0]}–{range[1]}, at least {min} balls</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Bowler</th><th scope="col">Econ</th><th scope="col">Wkts</th><th scope="col">Balls</th><th scope="col">Runs</th><th scope="col">Balls/wkt</th></tr></thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id}><td>{i + 1}</td><th scope="row"><a href={`#/player/${b.id}`}>{b.name}</a></th><td className="num hl-n">{b.econ.toFixed(2)}</td><td>{b.wickets}</td><td>{b.balls}</td><td>{b.runs}</td><td>{b.wickets ? (b.balls / b.wickets).toFixed(1) : "—"}</td></tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="notice">No bowler has bowled that many death-over balls in this range. Lower the minimum.</p>}
      </div>
    </>
  );
}

function Venues() {
  const { data, err } = useFile<VenueRow[]>("explorer/venues.json");
  const [min, setMin] = useState(10);
  if (err) return <p className="notice" role="alert">{err}</p>;
  if (!data) return <p className="notice">Loading…</p>;
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
      </div>
    </>
  );
}

function Matchups() {
  const { data, err } = useFile<BattersFile>("explorer/batters.json");
  const listId = useId();
  const [query, setQuery] = useState("V Kohli");
  const batterId = useMemo(() => {
    if (!data) return null;
    const q = query.trim().toLowerCase();
    return Object.entries(data.names).find(([, n]) => n.toLowerCase() === q)?.[0] ?? null;
  }, [data, query]);
  const [loaded, setLoaded] = useState<{ id: string; file: MatchupFile } | null>(null);
  const mu = loaded && loaded.id === batterId ? loaded.file : null;
  const [bowlerQ, setBowlerQ] = useState("");
  useEffect(() => {
    if (!batterId) return;
    const done = (file: MatchupFile) => setLoaded({ id: batterId, file });
    loadJson<MatchupFile>(`matchups/${batterId}.json`).then(done, () => done({ names: {}, rows: [] }));
  }, [batterId]);
  if (err) return <p className="notice" role="alert">{err}</p>;
  if (!data) return <p className="notice">Loading…</p>;
  const batters = Object.entries(data.names)
    .map(([id, n]) => ({ id, n }))
    .sort((a, b) => a.n.localeCompare(b.n));
  const rows = mu?.rows ?? [];
  const bq = bowlerQ.trim().toLowerCase();
  const filtered = bq ? rows.filter((r) => (mu?.names[r[0]] ?? "").toLowerCase().includes(bq)) : rows;
  return (
    <>
      <div className="controls panel">
        <label className="grow"><span>Batter (type to search)</span>
          <input list={listId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. V Kohli" autoComplete="off" />
          <datalist id={listId}>{batters.map((b) => <option key={b.id} value={b.n} />)}</datalist>
        </label>
        <label className="grow"><span>Filter bowlers</span>
          <input value={bowlerQ} onChange={(e) => setBowlerQ(e.target.value)} placeholder="e.g. Bumrah" autoComplete="off" />
        </label>
      </div>
      {!batterId && <p className="notice">Pick a batter from the list (names are written as in the Cricsheet data, like “V Kohli”).</p>}
      {batterId && !mu && <p className="notice">Loading…</p>}
      {batterId && mu && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Matchup table">
          <table className="data">
            <caption>{data.names[batterId]} against each bowler (6+ balls faced, regular innings only)</caption>
            <thead><tr><th scope="col">Bowler</th><th scope="col">Balls</th><th scope="col">Runs</th><th scope="col">SR</th><th scope="col">Outs</th><th scope="col">Dot %</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead>
            <tbody>
              {filtered.slice(0, 60).map(([bid, balls, runs, outs, fours, sixes, dots]) => (
                <tr key={bid}><th scope="row"><a href={`#/player/${bid}`}>{mu.names[bid]}</a></th><td>{balls}</td><td>{runs}</td><td className="num hl-n">{strikeRate(runs, balls).toFixed(0)}</td><td>{outs}</td><td>{ratio(dots, balls)}</td><td>{fours}</td><td>{sixes}</td></tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="notice">No bowler matches. {rows.length ? "Clear the filter." : "This batter has not faced anyone for 6+ balls."}</p>}
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
      </div>
    </div>
  );
}
