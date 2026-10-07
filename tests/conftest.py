import pandas as pd
import pytest

from chaseline import config, db, features, parse


def ball(batter="A", bowler="X", runs=0, extras=None, wicket=None):
    d = {"batter": batter, "bowler": bowler, "non_striker": "B", "runs": {"batter": runs, "extras": 0, "total": runs}}
    if extras:
        d["extras"] = extras
        n = sum(extras.values())
        d["runs"]["extras"] = n
        d["runs"]["total"] = runs + n
    if wicket:
        d["wickets"] = [{"player_out": batter, "kind": wicket}]
    return d


def raw_match(inn1, inn2, dates=("2019-04-01",), outcome=None, target=None, **info):
    """Build a minimal Cricsheet-style document; inn1/inn2 are lists of overs (lists of balls)."""
    def innings(team, overs, **extra):
        return {"team": team, "overs": [{"over": i, "deliveries": o} for i, o in enumerate(overs)], **extra}
    people = {n: n.lower() + "000" for n in ("A", "B", "X", "Y")}
    return {
        "info": {"dates": list(dates), "teams": ["Alpha", "Beta"], "venue": "Test Ground, Testville", "city": "Testville",
                 "toss": {"winner": "Alpha", "decision": "bat"}, "outcome": outcome or {"winner": "Alpha", "by": {"runs": 1}},
                 "registry": {"people": people}, "balls_per_over": 6, **info},
        "innings": [innings("Alpha", inn1),
                    innings("Beta", inn2, target={"overs": 20, "runs": target if target is not None else 1})],
    }


@pytest.fixture(scope="session")
def sample():
    matches, deliveries = parse.parse_dir(config.SAMPLE_DIR)
    return pd.DataFrame(matches), pd.DataFrame(deliveries)


@pytest.fixture()
def con(sample):
    m, d = sample
    c = db.build_db(m.to_dict("records"), d.to_dict("records"), ":memory:")
    yield c
    c.close()


@pytest.fixture(scope="session")
def sample_states(sample):
    return features.build_states(*sample)
