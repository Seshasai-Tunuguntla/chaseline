"""Write small static JSON files for the website (loaded per page / per match)."""
import json
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from . import clean

MIN_MATCHUP_BALLS = 6
SWING_MIN = 0.05
OVER_SWING_MIN = 0.10


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))


def surname(name: str) -> str:
    return name.split(" ")[-1]


def result_text(m: pd.Series) -> str:
    dl = " (D/L method)" if isinstance(m["method"], str) else ""
    if m["result_type"] == "runs":
        return f"{m['winner']} won by {int(m['margin'])} runs{dl}"
    if m["result_type"] == "wickets":
        return f"{m['winner']} won by {int(m['margin'])} wickets{dl}"
    if m["result_type"] == "tie":
        w = m["super_over_winner"]
        return f"Tied, {w} won the Super Over" if isinstance(w, str) else "Tied"
    return "No result"


def ball_label(legal_balls: int) -> str:
    """Cricket notation for the last legal ball bowled: 107 balls -> '17.5', 120 -> '19.6'."""
    n = max(int(legal_balls), 1)
    return f"{(n - 1) // 6}.{(n - 1) % 6 + 1}"


def _pct(x: float) -> str:
    return f"{x * 100:+.0f}%".replace("-", "−")


def find_swings(chase: pd.DataFrame, balls: pd.DataFrame) -> list[dict]:
    """Biggest single-delivery swings plus biggest overs, from the chasing team's point of view."""
    wp = chase["wp"].to_numpy()
    delta = np.diff(wp)
    swings = []
    order = np.argsort(-np.abs(delta))
    taken: list[int] = []
    for i in order:
        if abs(delta[i]) < SWING_MIN or len(taken) >= 4:
            break
        if any(abs(i - t) < 4 for t in taken):  # keep labels from stacking up
            continue
        taken.append(int(i))
    for i in sorted(taken):
        b = balls.iloc[i]
        step = i + 1
        if b["is_wicket"]:
            kind, label = "wicket", f"W {surname(b['player_out'])}"
            text = f"{b['player_out']} out ({b['wicket_kind']}, {b['bowler']})"
        elif b["batter_runs"] >= 4:
            kind, label = "boundary", "SIX" if b["batter_runs"] >= 6 else "FOUR"
            text = f"{b['batter']} hits {int(b['batter_runs'])} off {b['bowler']}"
        else:
            n = int(b["total_runs"])
            kind, label = "ball", "dot" if n == 0 else f"{n} run{'s' if n > 1 else ''}"
            text = f"{int(b['total_runs'])} off {b['bowler']}"
        swings.append({"step": step, "kind": kind, "label": label, "delta": round(float(delta[i]), 3),
                       "text": f"{ball_label(chase['legal_balls'].iloc[step])}: {text}"})
    ov = balls.assign(d=delta).groupby("over").agg(
        d=("d", "sum"), runs=("total_runs", "sum"), wk=("is_wicket", "sum"),
        first=("seq", "min"), last=("seq", "max"))
    for o, r in ov.reindex(ov["d"].abs().sort_values(ascending=False).index).iterrows():
        if abs(r["d"]) < OVER_SWING_MIN or sum(s["kind"] == "over" for s in swings) >= 2:
            break
        swings.append({"step": int(r["last"]), "start": int(r["first"]) - 1, "kind": "over",
                       "label": f"Ov {int(o) + 1}", "delta": round(float(r["d"]), 3),
                       "text": f"Over {int(o) + 1}: {int(r['runs'])} runs, {int(r['wk'])} wkt, {_pct(r['d'])} for the chasing side"})
    return swings


def export_matches(out: Path, matches: pd.DataFrame, deliveries: pd.DataFrame, states: pd.DataFrame) -> dict:
    dd = {k: g for k, g in deliveries[~deliveries["is_super_over"]].groupby(["match_id", "innings"])}
    st = {k: g.reset_index(drop=True) for k, g in states.groupby("match_id")}
    drama: dict[str, float] = {}
    season_rows: dict[int, list] = {}
    for _, m in matches.sort_values(["date", "match_id"]).iterrows():
        mid = m["match_id"]
        first = dd.get((mid, 1))
        inn1 = None
        if first is not None:
            cum = first["total_runs"].cumsum()
            over_end = first.groupby("over")["total_runs"].sum().cumsum()
            inn1 = {"team": first["batting_team"].iloc[0], "runs": int(cum.iloc[-1]),
                    "wickets": int(first["is_wicket"].sum()), "balls": int(first["legal"].sum()),
                    "over_scores": [int(x) for x in over_end]}
        chase = None
        s = st.get(mid)
        second = dd.get((mid, 2))
        if s is not None and second is not None:
            modelled = bool(s["modelled"].iloc[0])
            chase = {"team": second["batting_team"].iloc[0], "target": int(s["target"].iloc[0]), "modelled": modelled,
                     "runs": [int(x) for x in s["runs"]], "wickets": [int(x) for x in s["wickets"]],
                     "balls": [int(x) for x in s["legal_balls"]]}
            if modelled:
                wp = s["wp"].to_numpy()
                chase["wp"] = [int(round(float(x) * 1000)) for x in wp]
                chase["swings"] = find_swings(s, second.reset_index(drop=True))
                drama[mid] = float(np.abs(np.diff(wp)).sum())
        doc = {
            "id": mid, "season": int(m["season"]), "date": m["date"], "venue": m["venue"], "city": m["city"],
            "stage": m["stage"], "team1": m["team1"], "team2": m["team2"], "winner": m["winner"],
            "result": result_text(m), "player_of_match": m["player_of_match"], "inn1": inn1, "chase": chase,
        }
        _dump(out / "matches" / f"{mid}.json", doc)
        season_rows.setdefault(int(m["season"]), []).append({
            "id": mid, "date": m["date"], "t1": clean.TEAM_CODES.get(m["team1"], m["team1"]),
            "t2": clean.TEAM_CODES.get(m["team2"], m["team2"]),
            "w": clean.TEAM_CODES.get(m["winner"], "") if isinstance(m["winner"], str) else "",
            "result": result_text(m), "venue": m["venue"], "stage": m["stage"], "p": bool(chase and chase["modelled"]),
            "d": round(drama.get(mid, 0.0), 2),
        })
    for season, rows in season_rows.items():
        _dump(out / "seasons" / f"{season}.json", rows)
    return {"season_rows": season_rows, "drama": drama}


def export_explorer(out: Path, con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""CREATE OR REPLACE TEMP VIEW reg AS
        SELECT d.*, m.season FROM deliveries d JOIN matches m USING (match_id) WHERE NOT d.is_super_over""")
    names = dict(con.execute(
        """SELECT id, arg_max(name, date || '|' || name) FROM (
             SELECT batter_id AS id, batter AS name, date FROM reg JOIN matches USING (match_id)
             UNION ALL
             SELECT bowler_id, bowler, date FROM reg JOIN matches USING (match_id))
           GROUP BY id""").fetchall())
    bat = con.execute(
        """SELECT b.batter_id, b.season, b.balls, b.runs, coalesce(o.outs, 0) AS outs, b.fours, b.sixes FROM (
             SELECT batter_id, season, count(*) FILTER (wides = 0)::INT AS balls, sum(batter_runs)::INT AS runs,
                    count(*) FILTER (batter_runs = 4)::INT AS fours, count(*) FILTER (batter_runs = 6)::INT AS sixes
             FROM reg GROUP BY 1, 2) b
           LEFT JOIN (SELECT player_out_id AS id, season, count(*)::INT AS outs FROM reg WHERE is_wicket GROUP BY 1, 2) o
             ON o.id = b.batter_id AND o.season = b.season
           ORDER BY b.batter_id, b.season""").fetchall()
    bowl = con.execute(
        """SELECT bowler_id, season, count(*) FILTER (legal)::INT, sum(batter_runs + wides + noballs)::INT,
                  count(*) FILTER (bowler_wicket)::INT
           FROM reg WHERE over >= 15 GROUP BY 1, 2 ORDER BY 1, 2""").fetchall()
    used = {r[0] for r in bat} | {r[0] for r in bowl}
    _dump(out / "explorer" / "batters.json", {"names": {k: names[k] for k in sorted(used) if k in names},
                                              "rows": [list(r) for r in bat]})
    _dump(out / "explorer" / "death_bowlers.json", {"rows": [list(r) for r in bowl]})
    venues = con.execute(
        """SELECT m.venue, count(DISTINCT m.match_id)::INT AS matches,
                  round(avg(a.runs) FILTER (m.method IS NULL), 1) AS avg1,
                  round(avg(b.runs) FILTER (m.method IS NULL), 1) AS avg2,
                  max(a.runs)::INT AS high1,
                  count(*) FILTER (m.winner = b.batting_team)::INT AS chase_wins,
                  count(*) FILTER (m.winner IS NOT NULL)::INT AS decided,
                  min(m.season)::INT AS first_season, max(m.season)::INT AS last_season
           FROM matches m
           JOIN innings_totals a ON a.match_id = m.match_id AND a.innings = 1 AND NOT a.is_super_over
           JOIN innings_totals b ON b.match_id = m.match_id AND b.innings = 2 AND NOT b.is_super_over
           GROUP BY 1 HAVING matches >= 3 ORDER BY matches DESC, m.venue""").fetchall()
    cols = ["venue", "matches", "avg1", "avg2", "high1", "chase_wins", "decided", "first_season", "last_season"]
    _dump(out / "explorer" / "venues.json", [dict(zip(cols, r, strict=True)) for r in venues])
    pairs = con.execute(
        f"""SELECT batter_id, bowler_id, count(*) FILTER (wides = 0)::INT AS balls, sum(batter_runs)::INT AS runs,
                   count(*) FILTER (bowler_wicket AND player_out_id = batter_id)::INT AS outs,
                   count(*) FILTER (batter_runs = 4)::INT, count(*) FILTER (batter_runs = 6)::INT,
                   count(*) FILTER (wides = 0 AND batter_runs = 0 AND byes = 0 AND legbyes = 0)::INT AS dots
            FROM reg GROUP BY 1, 2 HAVING balls >= {MIN_MATCHUP_BALLS} ORDER BY 1, balls DESC, 2""").fetchall()
    by_batter: dict[str, list] = {}
    for r in pairs:
        by_batter.setdefault(r[0], []).append(list(r[1:]))
    export_players(out, con, names)
    shutil.rmtree(out / "matchups", ignore_errors=True)
    for bid, rows in by_batter.items():
        _dump(out / "matchups" / f"{bid}.json", {"names": {r[0]: names.get(r[0], "?") for r in rows}, "rows": rows})


def export_players(out: Path, con: duckdb.DuckDBPyConnection, names: dict) -> None:
    """One small file per player (career by season) plus a searchable index."""
    bat: dict[str, list] = {}
    for r in con.execute(
        """SELECT b.batter_id, b.season, b.inns, b.balls, b.runs, coalesce(o.outs, 0), b.fours, b.sixes FROM (
             SELECT batter_id, season, count(DISTINCT match_id)::INT AS inns, count(*) FILTER (wides = 0)::INT AS balls,
                    sum(batter_runs)::INT AS runs, count(*) FILTER (batter_runs = 4)::INT AS fours,
                    count(*) FILTER (batter_runs = 6)::INT AS sixes
             FROM reg GROUP BY 1, 2) b
           LEFT JOIN (SELECT player_out_id AS id, season, count(*)::INT AS outs FROM reg WHERE is_wicket GROUP BY 1, 2) o
             ON o.id = b.batter_id AND o.season = b.season ORDER BY 1, 2""").fetchall():
        bat.setdefault(r[0], []).append(list(r[1:]))
    bowl: dict[str, list] = {}
    for r in con.execute(
        """SELECT bowler_id, season, count(DISTINCT match_id)::INT, count(*) FILTER (legal)::INT,
                  sum(batter_runs + wides + noballs)::INT, count(*) FILTER (bowler_wicket)::INT
           FROM reg GROUP BY 1, 2 ORDER BY 1, 2""").fetchall():
        bowl.setdefault(r[0], []).append(list(r[1:]))
    shutil.rmtree(out / "players", ignore_errors=True)
    index = []
    for pid in sorted(set(bat) | set(bowl)):
        bb = sum(r[2] for r in bat.get(pid, []))
        wb = sum(r[2] for r in bowl.get(pid, []))
        if bb + wb < 60:
            continue
        _dump(out / "players" / f"{pid}.json", {"id": pid, "name": names.get(pid, pid),
                                                "bat": bat.get(pid, []), "bowl": bowl.get(pid, [])})
        index.append([pid, names.get(pid, pid), bb, wb])
    index.sort(key=lambda r: (r[1], r[0]))
    _dump(out / "players" / "index.json", index)


def export_all(out: Path, con: duckdb.DuckDBPyConnection, matches: pd.DataFrame, deliveries: pd.DataFrame,
               states: pd.DataFrame, metrics: dict, source_info: dict) -> None:
    for sub in ("matches", "seasons"):
        shutil.rmtree(out / sub, ignore_errors=True)
    info = export_matches(out, matches, deliveries, states)
    export_explorer(out, con)
    comp_test = metrics["test_season"]
    cand = {k: v for k, v in info["drama"].items()
            if matches.set_index("match_id").loc[k, "season"] == comp_test}
    featured = max(cand, key=cand.get) if cand else next(iter(info["drama"]), None)
    seasons = [{"season": s, "matches": len(r)} for s, r in sorted(info["season_rows"].items())]
    _dump(out / "index.json", {
        "generated": datetime.now(UTC).strftime("%Y-%m-%d"),
        "source": source_info, "seasons": seasons, "featured": featured,
        "teams": clean.TEAM_CODES, "test_season": comp_test,
    })
    _dump(out / "model.json", metrics)


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
