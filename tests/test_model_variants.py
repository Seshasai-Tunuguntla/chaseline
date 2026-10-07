import numpy as np
import pandas as pd
import pytest

from chaseline import model


def toy(n=400, seed=0):
    rng = np.random.default_rng(seed)
    seasons = rng.choice([2020, 2021, 2022], n)
    rrr = rng.uniform(2, 16, n)
    y = (rng.uniform(size=n) < 1 / (1 + np.exp((rrr - 9) / 2))).astype(int)
    df = pd.DataFrame({"season": seasons, "rrr": rrr, "runs_needed": rrr * 5, "balls_left": 30, "wickets_left": 6,
                       "env_rpo": 8.0, "rrr_gap": rrr - 8.0, "impact_era": 0, "label": y, "match_id": "m"})
    return df


def test_candidate_grid_is_simplest_first_and_unique():
    cfgs = model.candidate_configs()
    assert len({c.name for c in cfgs}) == len(cfgs) == 24
    assert cfgs[0] == model.Config("env", None, False, "none")


@pytest.mark.parametrize("kind", ["platt", "isotonic"])
def test_recalibrator_outputs_probabilities_and_is_monotone(kind):
    rng = np.random.default_rng(1)
    p = rng.uniform(0, 1, 500)
    y = (rng.uniform(size=500) < p**2).astype(int)  # over-confident raw scores
    cal = model.fit_calibrator(kind, p, y)
    grid = np.linspace(0.01, 0.99, 50)
    out = model.apply_calibrator(cal, grid)
    assert out.min() >= 0 and out.max() <= 1
    assert (np.diff(out) >= -1e-9).all()
    assert model.apply_calibrator(None, grid) is grid


def test_recalibration_uses_the_season_before_the_newest_training_season():
    df = toy()
    fitted = model.fit_config(model.Config("env", None, False, "platt"), df)
    assert fitted.cal is not None
    # recency weights give the newest season more influence than the oldest
    w = 0.5 ** ((df["season"].max() - df["season"].to_numpy()) / 3.0)
    assert w[df["season"] == 2022].min() == 1.0 and w[df["season"] == 2020].max() < 1.0
    assert 0 <= fitted.predict(df).min() and fitted.predict(df).max() <= 1


def test_single_class_validation_skips_calibration():
    assert model.fit_calibrator("platt", np.array([0.2, 0.8]), np.array([1, 1])) is None
