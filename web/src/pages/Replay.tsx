import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { loadJson } from "../lib/data";
import { formatDate, formatOvers, shortDate, signedPct } from "../lib/format";
import { describeReplay, shapeReplay } from "../lib/replay";
import type { MatchDoc, SeasonMatch, SiteIndex } from "../lib/types";

const WinChart = lazy(() => import("../components/WinChart"));

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

const go = (id: string) => {
  window.location.hash = `#/replay/${id}`;
};

export default function Replay({ index, matchId }: { index: SiteIndex; matchId: string | null }) {
  const narrow = useNarrow();
  const [doc, setDoc] = useState<MatchDoc | null>(null);
  const [list, setList] = useState<SeasonMatch[]>([]);
  const [failed, setFailed] = useState<{ id: string; msg: string } | null>(null);
  const code = (name: string) => index.teams[name] ?? name;

  useEffect(() => {
    if (!matchId) return;
    let live = true;
    loadJson<MatchDoc>(`matches/${matchId}.json`).then(
      (d) => live && setDoc(d),
      (e: Error) => live && setFailed({ id: matchId, msg: e.message }),
    );
    return () => {
      live = false;
    };
  }, [matchId]);

  const season = doc?.season;
  useEffect(() => {
    if (season == null) return;
    let live = true;
    loadJson<SeasonMatch[]>(`seasons/${season}.json`).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [season]);

  const shape = useMemo(() => (doc?.chase ? shapeReplay(doc.chase) : null), [doc]);
  if (failed && failed.id === matchId) return <p className="notice" role="alert">{failed.msg}</p>;
  if (!doc) return <p className="notice">Loading match…</p>;

  const chase = doc.chase;
  const i = list.findIndex((m) => m.id === doc.id);
  const lastStep = chase ? chase.runs.length - 1 : 0;
  const chaseCode = chase ? code(chase.team) : "";
  const defCode = doc.inn1 ? code(doc.inn1.team) : "";
  const swings = [...(chase?.swings ?? [])].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const onSeason = (s: number) => {
    loadJson<SeasonMatch[]>(`seasons/${s}.json`).then((l) => l.length && go((l.find((m) => m.p) ?? l[0]).id));
  };

  return (
    <div className="stack">
      <section className="panel controls" aria-label="Choose a match">
        <label>
          <span>Season</span>
          <select value={doc.season} onChange={(e) => onSeason(Number(e.target.value))}>
            {[...index.seasons].reverse().map((s) => (
              <option key={s.season} value={s.season}>{s.season}</option>
            ))}
          </select>
        </label>
        <label className="grow">
          <span>Match</span>
          <select value={doc.id} onChange={(e) => go(e.target.value)}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {shortDate(m.date)} · {m.t1} v {m.t2}{m.stage !== "League" ? ` · ${m.stage}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="pager">
          <button type="button" disabled={i <= 0} onClick={() => go(list[i - 1].id)} aria-label="Previous match">‹ Prev</button>
          <button type="button" disabled={i < 0 || i >= list.length - 1} onClick={() => go(list[i + 1].id)} aria-label="Next match">Next ›</button>
        </div>
      </section>

      <section className="board" aria-label="Scoreboard">
        <div className="board-teams">
          <div className="team-box">
            <span className="team-code">{defCode}</span>
            <span className="led">{doc.inn1 ? `${doc.inn1.runs}/${doc.inn1.wickets}` : "–"}</span>
            <span className="overs">{doc.inn1 ? `${formatOvers(doc.inn1.balls)} ov` : ""}</span>
          </div>
          <span className="vs" aria-hidden="true">v</span>
          <div className="team-box">
            <span className="team-code">{chaseCode}</span>
            <span className="led">{chase ? `${chase.runs[lastStep]}/${chase.wickets[lastStep]}` : "–"}</span>
            <span className="overs">{chase ? `${formatOvers(chase.balls[lastStep])} ov · target ${chase.target}` : ""}</span>
          </div>
        </div>
        <p className="result">{doc.result}</p>
        <p className="meta">
          {formatDate(doc.date)} · {doc.venue}{doc.city ? `, ${doc.city}` : ""}{doc.stage !== "League" ? ` · ${doc.stage}` : ""}
          {doc.player_of_match ? ` · Player of the match: ${doc.player_of_match}` : ""}
        </p>
      </section>

      <section className="panel" aria-labelledby="wp-h">
        <h1 id="wp-h">{chase ? `${chase.team}: chasing ${chase.target}` : "No chase"}</h1>
        {chase?.modelled && shape ? (
          <>
            <p className="legend">
              <span>Chance that <strong>{chaseCode}</strong> win, after every ball. Above the line they are favourites.</span>
              <span className="key"><i className="dot red" /> wicket</span>
              <span className="key"><i className="dot chalk" /> boundary or big ball</span>
              <span className="key"><i className="band" /> big over</span>
            </p>
            <Suspense fallback={<div className="chart-skel">Loading chart…</div>}>
              <WinChart shape={shape} chaseCode={chaseCode} compact={narrow} label={describeReplay(shape.points, chase.team)} />
            </Suspense>
            <h2>Biggest swings</h2>
            {swings.length ? (
              <ol className="swings">
                {swings.map((s) => (
                  <li key={`${s.kind}-${s.step}`}>
                    <span className={`delta ${s.delta >= 0 ? "up" : "down"}`}>{signedPct(s.delta)}</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No single ball or over moved the odds by more than 5 points.</p>
            )}
            <p className="muted small">Swings are measured for {chase.team}. Probabilities are out-of-sample: this season was not in the training data of the model that drew the line.</p>
          </>
        ) : (
          <p className="notice">
            {chase
              ? "This chase was shortened or re-targeted (rain, D/L), so the model does not describe it and no probability line is drawn."
              : "This match had no second innings."}
          </p>
        )}
      </section>
    </div>
  );
}
