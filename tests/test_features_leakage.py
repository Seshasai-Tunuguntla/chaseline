import numpy as np
import pandas as pd
import pytest

from chaseline import parse
from chaseline.features import FEATURES_FULL, chase_states, scoring_environment

from .conftest import ball, raw_match


def innings_df(overs):
    _, rows = parse.parse_match(raw_match([[ball()]], overs, target=100), "1")
    return pd.DataFrame([r for r in rows if r["innings"] == 2])


def test_state_arithmetic_with_wide_and_wicket():
    inn = innings_df([[ball(runs=4), ball(extras={"wides": 1}), ball(wicket="bowled"), ball(runs=1)]])
    s = chase_states(inn, target=100)
    assert list(s["legal_balls"]) == [0, 1, 1, 2, 3]  # the wide does not use a ball
    assert list(s["runs"]) == [0, 4, 5, 5, 6]
    assert list(s["wickets"]) == [0, 0, 0, 1, 1]
    last = s.iloc[-1]
    assert last["runs_needed"] == 94 and last["balls_left"] == 117 and last["wickets_left"] == 9
    assert last["rrr"] == pytest.approx(94 * 6 / 117)


def test_terminal_probabilities():
    win = chase_states(innings_df([[ball(runs=6)] * 6] * 3), target=18)
    assert win.iloc[-1]["terminal"] and win.iloc[-1]["terminal_wp"] == 1.0
    tie_inn = innings_df([[ball(runs=1)] * 6] * 20)
    tie = chase_states(tie_inn, target=121)
    assert tie.iloc[-1]["terminal_wp"] == 0.5
    lost = chase_states(tie_inn, target=130)
    assert lost.iloc[-1]["terminal_wp"] == 0.0
    allout = chase_states(innings_df([[ball(wicket="bowled")] * 6, [ball(wicket="lbw")] * 4]), target=50)
    assert allout.iloc[-1]["terminal"] and allout.iloc[-1]["terminal_wp"] == 0.0
    assert allout.iloc[-1]["wickets_left"] == 0


def test_last12_window_counts_only_recent_balls():
    inn = innings_df([[ball(runs=6)] * 6, [ball(runs=0)] * 6, [ball(runs=1)] * 6])
    s = chase_states(inn, target=200)
    assert s.iloc[12]["last12_runs"] == 36
    assert s.iloc[18]["last12_runs"] == 6  # the first over has rolled out of the window


@pytest.mark.parametrize("cut", [1, 7, 30, 90])
def test_features_do_not_depend_on_future_deliveries(sample, cut):
    """Leakage test: features at ball k must be identical when everything after k is removed."""
    _, d = sample
    second = d[(d["innings"] == 2) & ~d["is_super_over"]]
    for _, inn in list(second.groupby("match_id"))[:6]:
        full = chase_states(inn, target=150, env_rpo=8.0)
        k = min(cut, len(inn))
        trunc = chase_states(inn.sort_values("seq").iloc[:k], target=150, env_rpo=8.0)
        cols = [c for c in FEATURES_FULL if c in full.columns] + ["runs", "wickets", "legal_balls"]
        pd.testing.assert_frame_equal(full.iloc[: k + 1][cols].reset_index(drop=True), trunc[cols].reset_index(drop=True))


def test_features_exclude_outcome_columns():
    for f in FEATURES_FULL:
        assert f not in ("label", "terminal_wp", "wp", "winner")


def _tiny_league(n=15, same_day_pair=False):
    ms, ds = [], []
    for i in range(n):
        day = f"2019-04-{1 + i:02d}"
        over = [[ball(runs=1)] * 6] * 2
        raw = raw_match(over, over, dates=(day,))
        m, d = parse.parse_match(raw, f"{1000 + i}")
        ms.append(m)
        ds.extend(d)
    return pd.DataFrame(ms), pd.DataFrame(ds)


def test_scoring_environment_ignores_current_and_future_matches():
    m, d = _tiny_league()
    base = scoring_environment(m, d)
    d2 = d.copy()
    d2.loc[d2["match_id"] == "1012", "total_runs"] = 6  # change a *later* match drastically
    changed = scoring_environment(m, d2)
    earlier = base.index[:12]
    pd.testing.assert_series_equal(base.loc[earlier], changed.loc[earlier])
    assert not np.isclose(base.loc["1013"], changed.loc["1013"])  # it only affects what comes after it


def test_scoring_environment_unavailable_until_enough_history():
    m, d = _tiny_league()
    env = scoring_environment(m, d)
    assert env.iloc[:10].isna().all() and env.iloc[10:].notna().all()


def test_same_day_matches_do_not_inform_each_other():
    m, d = _tiny_league(12)
    m.loc[m["match_id"] == "1011", "date"] = m.loc[m["match_id"] == "1010", "date"].iloc[0]
    d.loc[d["match_id"] == "1010", "total_runs"] = 6  # a very different scoring rate on that day
    env = scoring_environment(m, d)
    assert env.loc["1010"] == env.loc["1011"]  # neither sees the other, only the 10 earlier days


def test_build_states_labels_follow_winner(sample, sample_states):
    m, _ = sample
    st = sample_states
    assert m["match_id"].is_unique
    assert st["match_id"].nunique() > 10
    for _, g in st.dropna(subset=["label"]).groupby("match_id"):
        assert g["label"].nunique() == 1  # one outcome per chase
    won = st.dropna(subset=["label"]).groupby("match_id")["label"].first()
    assert won.isin([0.0, 1.0]).all() and 0 < won.mean() < 1


def test_era_flag_depends_only_on_the_season(sample_states):
    from chaseline.features import ERA_START
    assert (sample_states["impact_era"] == (sample_states["season"] >= ERA_START).astype(int)).all()
