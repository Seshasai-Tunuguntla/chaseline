import json

import numpy as np
import pandas as pd
import pytest

from chaseline import config, export, model, run


def test_split_is_chronological_and_never_trains_on_test_season(sample, sample_states, monkeypatch):
    m, _ = sample
    seen = []
    real_fit = model.fit

    def spy(kind, train):
        seen.append((kind, set(train["season"])))
        return real_fit(kind, train)

    monkeypatch.setattr(model, "fit", spy)
    _, metrics = model.run_model(sample_states, m, smoke=True)
    test_season = metrics["test_season"]
    assert test_season == m["season"].max()
    assert metrics["train_seasons"][1] < test_season
    # validation-selection fits (3) and hold-out fits (5) come first and may only see older seasons
    assert len(seen) > 8
    assert all(max(seasons) < test_season for _, seasons in seen[:8])


def test_wp_is_probability_and_terminal_states_exact(sample, sample_states):
    m, _ = sample
    out, metrics = model.run_model(sample_states, m, smoke=True)
    mod = out[out["modelled"]]
    assert mod["wp"].notna().all()
    assert mod["wp"].between(0, 1).all()
    assert (mod.loc[mod["terminal"] & (mod["terminal_wp"] == 1.0), "wp"] == 1.0).all()
    assert not out.loc[~out["modelled"], "wp"].notna().any()
    assert {"rrr_rule", "logit", "gbm_env", "coin_flip"} <= set(metrics["holdout"])


def test_calibration_and_scores():
    y = np.array([1, 0, 1, 0.0])
    p = np.array([0.9, 0.1, 0.8, 0.3])
    cal = model.calibration(y, p)
    assert sum(c["n"] for c in cal) == 4
    assert model.scores(y, p)["brier"] == pytest.approx(np.mean((p - y) ** 2))
    assert model.scores(y, np.full(4, 0.5))["log_loss"] == pytest.approx(np.log(2))


def test_bootstrap_is_seeded(sample_states):
    df = model.trainable(sample_states)
    a = model.bootstrap_diff(df, np.full(len(df), 0.5), np.full(len(df), 0.4), reps=50)
    b = model.bootstrap_diff(df, np.full(len(df), 0.5), np.full(len(df), 0.4), reps=50)
    assert a == b


def test_ball_label_and_result_text():
    assert export.ball_label(107) == "17.5" and export.ball_label(120) == "19.6" and export.ball_label(1) == "0.1"
    m = pd.Series({"winner": "A", "result_type": "wickets", "margin": 5, "method": None, "super_over_winner": None})
    assert export.result_text(m) == "A won by 5 wickets"
    m["result_type"], m["winner"], m["super_over_winner"] = "tie", None, "B"
    assert "Super Over" in export.result_text(m)


def test_smoke_pipeline_writes_consistent_site_data(tmp_path):
    run.main(["--smoke", "--out", str(tmp_path / "data"), "--db", str(tmp_path / "t.duckdb")])
    out = tmp_path / "data"
    index = json.loads((out / "index.json").read_text())
    assert index["featured"] and index["source"]["license"] == "ODC-By 1.0"
    files = list((out / "matches").glob("*.json"))
    assert len(files) == len(list(config.SAMPLE_DIR.glob("*.json")))
    modelled = 0
    for f in files:
        doc = json.loads(f.read_text())
        c = doc["chase"]
        if c and c["modelled"]:
            modelled += 1
            n = len(c["wp"])
            assert n == len(c["runs"]) == len(c["wickets"]) == len(c["balls"])
            assert all(0 <= x <= 1000 for x in c["wp"])
            assert all(1 <= s["step"] < n for s in c["swings"])
    assert modelled > 5
    assert (out / "model.json").exists() and (out / "explorer" / "batters.json").exists()
    assert (tmp_path / "win_prob.parquet").exists()
    assert sum(f.stat().st_size for f in files) / len(files) < 20_000


@pytest.mark.data
def test_full_model_beats_baselines_on_holdout():
    path = config.WEB_DATA / "model.json"
    if not path.exists():
        pytest.skip("run `make data` first")
    h = json.loads(path.read_text())
    best = h["holdout"][h["chosen_model"]]
    assert best["brier"] < h["holdout"]["rrr_rule"]["brier"] < h["holdout"]["coin_flip"]["brier"]
    assert best["log_loss"] < h["holdout"]["rrr_rule"]["log_loss"]
    assert h["holdout_chases"] >= 50


def test_pipeline_output_is_reproducible(tmp_path):
    """Same input, same seeds: byte-identical site data."""
    outs = []
    for i in range(2):
        out = tmp_path / f"run{i}"
        run.main(["--smoke", "--out", str(out), "--db", str(tmp_path / f"r{i}.duckdb")])
        outs.append({str(p.relative_to(out)): p.read_bytes() for p in out.rglob("*.json")})
    assert outs[0].keys() == outs[1].keys()
    assert all(outs[0][k] == outs[1][k] for k in outs[0])
