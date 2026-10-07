"""Chase-state features. Every feature at a state uses only deliveries up to that state."""
import numpy as np
import pandas as pd

from .config import MAX_BALLS

FEATURES_BASIC = ["runs_needed", "balls_left", "wickets_left", "rrr"]
FEATURES_ENV = FEATURES_BASIC + ["env_rpo", "rrr_gap"]
FEATURES_FULL = FEATURES_ENV + ["crr", "last12_runs", "last12_wkts"]
FEATURES_MOMENTUM = ["dots12", "bounds12"]  # dot balls / boundaries among the last 12 legal balls
WINDOW = 12
ERA_START = 2023  # Impact Player rule introduced; known before any match in the season
ENV_MATCHES = 60
ENV_MIN = 10


def scoring_environment(matches: pd.DataFrame, deliveries: pd.DataFrame) -> pd.Series:
    """League scoring rate (runs per over) over the last 60 matches played on strictly earlier dates.

    Known before a match starts, so it carries no information from the match itself or later ones.
    """
    reg = deliveries[~deliveries["is_super_over"]]
    g = reg.groupby("match_id").agg(runs=("total_runs", "sum"), balls=("legal", "sum"))
    rpo = (g["runs"] * 6 / g["balls"]).rename("rpo")
    m = matches.set_index("match_id").join(rpo).sort_values(["date", "match_id"])
    dates = m["date"].to_numpy()
    vals = m["rpo"].to_numpy(dtype=float)
    env = np.full(len(m), np.nan)
    for i in range(len(m)):
        hi = np.searchsorted(dates, dates[i], side="left")  # only matches on earlier dates
        window = vals[max(0, hi - ENV_MATCHES):hi]
        window = window[~np.isnan(window)]
        if len(window) >= ENV_MIN:
            env[i] = window.mean()
    return pd.Series(env, index=m.index, name="env_rpo")


def current_environment(matches: pd.DataFrame, deliveries: pd.DataFrame) -> float:
    """Scoring environment for a hypothetical next match: mean runs per over of the last 60 matches."""
    reg = deliveries[~deliveries["is_super_over"]]
    g = reg.groupby("match_id").agg(runs=("total_runs", "sum"), balls=("legal", "sum"))
    rpo = (g["runs"] * 6 / g["balls"]).reindex(matches.sort_values(["date", "match_id"])["match_id"]).dropna()
    return float(rpo.iloc[-ENV_MATCHES:].mean())


def chase_states(inn: pd.DataFrame, target: int, env_rpo: float = np.nan) -> pd.DataFrame:
    """States of one second innings: step 0 is before the first delivery, step k is after delivery k.

    `inn` holds that innings' deliveries ordered by seq. Terminal states get an exact win probability
    (1 = target reached, 0 = out of balls/wickets, 0.5 = tied and sent to a super over).
    """
    inn = inn.sort_values("seq")
    runs = np.concatenate([[0], inn["total_runs"].cumsum().to_numpy()])
    wkts = np.concatenate([[0], inn["is_wicket"].astype(int).cumsum().to_numpy()])
    legal = np.concatenate([[0], inn["legal"].astype(int).cumsum().to_numpy()])
    seq = np.concatenate([[0], inn["seq"].to_numpy()])
    dots = np.concatenate([[0], ((inn["total_runs"] == 0) & inn["legal"]).astype(int).cumsum().to_numpy()])
    bounds = np.concatenate([[0], (inn["batter_runs"] >= 4).astype(int).cumsum().to_numpy()])
    # index of the last state at least WINDOW legal balls back (searchsorted on non-decreasing counts)
    back = np.searchsorted(legal, np.maximum(legal - WINDOW, 0), side="right") - 1
    balls_left = MAX_BALLS - legal
    needed = target - runs
    wickets_left = 10 - wkts
    won = runs >= target
    lost = ~won & ((wickets_left <= 0) | (balls_left <= 0))
    terminal = won | lost
    live_balls = np.where(balls_left > 0, balls_left, np.nan)
    df = pd.DataFrame({
        "step": np.arange(len(runs)),
        "seq": seq,
        "legal_balls": legal,
        "runs": runs,
        "wickets": wkts,
        "target": target,
        "runs_needed": needed,
        "balls_left": balls_left,
        "wickets_left": wickets_left,
        "rrr": needed * 6 / live_balls,
        "crr": np.where(legal > 0, runs * 6 / np.maximum(legal, 1), 0.0),
        "last12_runs": runs - runs[back],
        "last12_wkts": wkts - wkts[back],
        "dots12": dots - dots[back],
        "bounds12": bounds - bounds[back],
        "terminal": terminal,
        "env_rpo": env_rpo,
    })
    df["rrr_gap"] = df["rrr"] - df["env_rpo"]
    tie = lost & (runs == target - 1)
    df["terminal_wp"] = np.where(won, 1.0, np.where(tie, 0.5, np.where(lost, 0.0, np.nan)))
    return df


def build_states(matches: pd.DataFrame, deliveries: pd.DataFrame) -> pd.DataFrame:
    """All chase states for every match with a regular second innings."""
    second = deliveries[(deliveries["innings"] == 2) & (~deliveries["is_super_over"])]
    info = matches.set_index("match_id")
    env = scoring_environment(matches, deliveries)
    parts = []
    for mid, inn in second.groupby("match_id", sort=True):
        m = info.loc[mid]
        if pd.isna(m["target_runs"]):
            continue
        st = chase_states(inn, int(m["target_runs"]), float(env.loc[mid]))
        chasing = inn["batting_team"].iloc[0]
        if m["winner"] is not None and not pd.isna(m["winner"]):
            label = float(m["winner"] == chasing)
        else:
            label = np.nan  # tie (super over) or no result: no regulation-time winner
        st.insert(0, "match_id", mid)
        st["season"] = int(m["season"])
        st["impact_era"] = int(int(m["season"]) >= ERA_START)
        st["label"] = label
        # rain-affected chases (shortened or re-set targets) are outside what the model describes
        st["modelled"] = bool(m["target_overs"] == 20 and pd.isna(m["method"]))
        parts.append(st)
    return pd.concat(parts, ignore_index=True)
