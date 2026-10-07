"""Parse Cricsheet JSON (v1.x) into flat match and delivery records."""
import json
from pathlib import Path

from . import clean

NON_BOWLER_WICKETS = {"run out", "retired hurt", "retired out", "retired not out", "obstructing the field"}
NOT_A_DISMISSAL = {"retired hurt", "retired not out"}


def parse_match(raw: dict, match_id: str) -> tuple[dict, list[dict]]:
    info = raw["info"]
    outcome = info.get("outcome", {})
    by = outcome.get("by", {})
    t1, t2 = (clean.team(t) for t in info["teams"])
    stage = info.get("event", {}).get("stage")
    people = info.get("registry", {}).get("people", {})
    innings = raw["innings"]
    chase = next((i for i in innings if not i.get("super_over") and "target" in i), None)
    match = {
        "match_id": match_id,
        "season": clean.season_year(info["dates"]),
        "date": min(info["dates"]),
        "venue": clean.venue(info.get("venue", "Unknown")),
        "city": info.get("city"),
        "team1": t1,
        "team2": t2,
        "toss_winner": clean.team(info["toss"]["winner"]) if "toss" in info else None,
        "toss_decision": info.get("toss", {}).get("decision"),
        "stage": stage or "League",
        "match_number": info.get("event", {}).get("match_number"),
        "winner": clean.team(outcome["winner"]) if "winner" in outcome else None,
        "result_type": (
            "runs" if "runs" in by else "wickets" if "wickets" in by
            else outcome.get("result")  # 'tie', 'no result'
        ),
        "margin": by.get("runs", by.get("wickets")),
        "method": outcome.get("method"),
        "super_over_winner": clean.team(outcome["eliminator"]) if "eliminator" in outcome else None,
        "player_of_match": (info.get("player_of_match") or [None])[0],
        "balls_per_over": info.get("balls_per_over", 6),
        "target_runs": chase["target"]["runs"] if chase else None,
        "target_overs": chase["target"].get("overs") if chase else None,
    }
    rows: list[dict] = []
    for n, inn in enumerate(innings, start=1):
        is_so = bool(inn.get("super_over"))
        team_name = clean.team(inn["team"])
        seq = legal = 0
        # the source documents overs that really had 7 legal balls (umpire miscounts)
        miscounted = {int(k): v["balls"] for k, v in inn.get("miscounted_overs", {}).items()}
        for ov in inn.get("overs", []):
            for d in ov["deliveries"]:
                ex = d.get("extras", {})
                is_legal = "wides" not in ex and "noballs" not in ex
                seq += 1
                legal += is_legal
                wk = d.get("wickets", [])
                bowler_wk = [w for w in wk if w["kind"] not in NON_BOWLER_WICKETS]
                real_out = [w for w in wk if w["kind"] not in NOT_A_DISMISSAL]
                rows.append({
                    "match_id": match_id,
                    "innings": n,
                    "is_super_over": is_so,
                    "batting_team": team_name,
                    "over": ov["over"],
                    "seq": seq,
                    "legal": is_legal,
                    "legal_ball_no": legal,
                    "allowed_balls": miscounted.get(ov["over"], 6),
                    "batter": d["batter"],
                    "batter_id": people.get(d["batter"]),
                    "bowler": d["bowler"],
                    "bowler_id": people.get(d["bowler"]),
                    "batter_runs": d["runs"]["batter"],
                    "extras": d["runs"]["extras"],
                    "total_runs": d["runs"]["total"],
                    "wides": ex.get("wides", 0),
                    "noballs": ex.get("noballs", 0),
                    "byes": ex.get("byes", 0),
                    "legbyes": ex.get("legbyes", 0),
                    "penalty": ex.get("penalty", 0),
                    "is_wicket": bool(real_out),
                    "bowler_wicket": bool(bowler_wk),
                    "player_out": real_out[0]["player_out"] if real_out else None,
                    "player_out_id": people.get(real_out[0]["player_out"]) if real_out else None,
                    "wicket_kind": real_out[0]["kind"] if real_out else None,
                })
    return match, rows


def parse_dir(raw_dir: Path) -> tuple[list[dict], list[dict]]:
    matches, deliveries = [], []
    for f in sorted(raw_dir.glob("*.json")):
        m, d = parse_match(json.loads(f.read_text()), f.stem)
        matches.append(m)
        deliveries.extend(d)
    return matches, deliveries
