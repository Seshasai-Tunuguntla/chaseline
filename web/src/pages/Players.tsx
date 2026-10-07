import { useEffect, useId, useState } from "react";
import { navigate } from "../lib/route";
import { loadJson } from "../lib/data";
import { fixed } from "../lib/format";
import { batCareer, bowlCareer } from "../lib/player";
import { strikeRate, economy, average } from "../lib/format";
import type { MatchupFile, PlayerFile, PlayerIndex, SiteIndex } from "../lib/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="led-sm">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Search({ index, current }: { index: PlayerIndex; current?: string }) {
  const listId = useId();
  const [q, setQ] = useState("");
  const go = (v: string) => {
    setQ(v);
    const hit = index.find((r) => r[1].toLowerCase() === v.trim().toLowerCase());
    if (hit) navigate(`/player/${hit[0]}`);
  };
  return (
    <div className="controls panel">
      <label className="grow">
        <span>Find a player (type a name, e.g. “V Kohli”)</span>
        <input list={listId} value={q} onChange={(e) => go(e.target.value)} placeholder={current ?? "Search players"} autoComplete="off" />
        <datalist id={listId}>{index.map((r) => <option key={r[0]} value={r[1]} />)}</datalist>
      </label>
    </div>
  );
}

function Profile({ id }: { id: string }) {
  const [state, setState] = useState<{ id: string; file?: PlayerFile; mu?: MatchupFile; err?: string } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      loadJson<PlayerFile>(`players/${id}.json`),
      loadJson<MatchupFile>(`matchups/${id}.json`).catch(() => undefined),
    ]).then(
      ([file, mu]) => live && setState({ id, file, mu }),
      (e: Error) => live && setState({ id, err: e.message }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  if (!state || state.id !== id) return <p className="notice">Loading…</p>;
  if (state.err || !state.file) return <p className="notice" role="alert">Player not found.</p>;
  const p = state.file;
  const bat = batCareer(p);
  const bowl = bowlCareer(p);
  const mu = state.mu?.rows.slice(0, 10) ?? [];
  return (
    <>
      <section className="panel">
        <h1>{p.name}</h1>
        <p className="muted">IPL career in the Cricsheet data (regular innings only; Super Overs excluded).</p>
        {bat && (
          <>
            <h2>Batting</h2>
            <div className="stats">
              <Stat label="Runs" value={bat.runs} /><Stat label="Strike rate" value={bat.sr.toFixed(1)} /><Stat label="Average" value={bat.avg} />
              <Stat label="Innings" value={bat.innings} /><Stat label="Fours" value={bat.fours} /><Stat label="Sixes" value={bat.sixes} />
            </div>
          </>
        )}
        {bowl && (
          <>
            <h2>Bowling</h2>
            <div className="stats">
              <Stat label="Wickets" value={bowl.wickets} /><Stat label="Economy" value={bowl.econ.toFixed(2)} /><Stat label="Matches" value={bowl.matches} />
              <Stat label="Balls" value={bowl.balls} />
            </div>
          </>
        )}
      </section>
      {bat && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Batting by season">
          <table className="data">
            <caption>Batting by season</caption>
            <thead><tr><th scope="col">Season</th><th scope="col">Inns</th><th scope="col">Runs</th><th scope="col">Balls</th><th scope="col">SR</th><th scope="col">Avg</th><th scope="col">4s</th><th scope="col">6s</th></tr></thead>
            <tbody>
              {p.bat.map(([season, inns, balls, runs, outs, fours, sixes]) => (
                <tr key={season}><th scope="row">{season}</th><td>{inns}</td><td>{runs}</td><td>{balls}</td><td className="hl-n">{strikeRate(runs, balls).toFixed(1)}</td><td>{average(runs, outs)}</td><td>{fours}</td><td>{sixes}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bowl && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Bowling by season">
          <table className="data">
            <caption>Bowling by season</caption>
            <thead><tr><th scope="col">Season</th><th scope="col">Matches</th><th scope="col">Overs</th><th scope="col">Runs</th><th scope="col">Wkts</th><th scope="col">Econ</th></tr></thead>
            <tbody>
              {p.bowl.map(([season, m, balls, runs, w]) => (
                <tr key={season}><th scope="row">{season}</th><td>{m}</td><td>{Math.floor(balls / 6)}.{balls % 6}</td><td>{runs}</td><td>{w}</td><td className="hl-n">{fixed(economy(runs, balls), 2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mu.length > 0 && state.mu && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Most faced bowlers">
          <table className="data">
            <caption>Bowlers {p.name} has faced most</caption>
            <thead><tr><th scope="col">Bowler</th><th scope="col">Balls</th><th scope="col">Runs</th><th scope="col">SR</th><th scope="col">Outs</th></tr></thead>
            <tbody>
              {mu.map(([bid, balls, runs, outs]) => (
                <tr key={bid}><th scope="row"><a href={`/player/${bid}`}>{state.mu!.names[bid]}</a></th><td>{balls}</td><td>{runs}</td><td className="hl-n">{strikeRate(runs, balls).toFixed(0)}</td><td>{outs}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Players({ playerId }: { index: SiteIndex; playerId?: string }) {
  const [list, setList] = useState<PlayerIndex | null>(null);
  useEffect(() => {
    loadJson<PlayerIndex>("players/index.json").then(setList);
  }, []);
  if (!list) return <p className="notice">Loading…</p>;
  const top = [...list].sort((a, b) => b[2] + b[3] - (a[2] + a[3])).slice(0, 24);
  return (
    <div className="stack">
      <Search index={list} current={playerId ? list.find((r) => r[0] === playerId)?.[1] : undefined} />
      {playerId ? (
        <Profile id={playerId} />
      ) : (
        <section className="panel">
          <h1>Players</h1>
          <p className="muted">Search above, or start with the players who have appeared most.</p>
          <ul className="chips">
            {top.map((r) => <li key={r[0]}><a href={`/player/${r[0]}`}>{r[1]}</a></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
