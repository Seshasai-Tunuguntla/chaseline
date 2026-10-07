import json

import numpy as np
import pandas as pd
import pytest

from chaseline import config, export, model, run


def test_split_is_chronological_and_never_trains_on_test_season(sample, sample_states, monkeypatch):
    m, _ = sample
    seen = []
    real_fit = model.fit

    def spy(kind, train, purpose=""):
        seen.append((purpose, set(train["season"])))
        return real_fit(kind, train, purpose)

    monkeypatch.setattr(model, "fit", spy)
    _, metrics = model.run_model(sample_states, m, smoke=True)
    test_season = metrics["test_season"]
    assert test_season == m["season"].max()
    assert metrics["train_seasons"][1] < test_season
    purposes = {p for p, _ in seen}
    assert {"selection", "holdout", "rolling", "loso"} <= purposes
    # choosing the model and the hold-out fits may only see seasons before the test season
    assert all(max(s) < test_season for p, s in seen if p in ("selection", "holdout"))
    # selection never even sees the validation season in training
    assert all(max(s) < metrics["validation_season"] for p, s in seen if p == "selection")
    # rolling origin: every fit trains strictly before the season it scores
    scored = [r["season"] for r in metrics["rolling_origin"]]
    roll = [s for p, s in seen if p == "rolling"]
    assert len(roll) == 4 * len(scored)
    for i, season in enumerate(scored):
        assert all(max(s) < season for s in roll[4 * i: 4 * i + 4])


def test_wp_is_probability_and_terminal_states_exact(sample, sample_states):
    m, _ = sample
    out, metrics = model.run_model(sample_states, m, smoke=True)
    mod = out[out["modelled"]]
    assert mod["wp"].notna().all()
    assert mod["wp"].between(0, 1).all()
    assert (mod.loc[mod["terminal"] & (mod["terminal_wp"] == 1.0), "wp"] == 1.0).all()
    assert not out.loc[~out["modelled"], "wp"].notna().any()
    assert {"rrr_rule", "logit", "model", "coin_flip"} <= set(metrics["holdout"])


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
    assert (out / "players" / "index.json").exists()
    idx = json.loads((out / "players" / "index.json").read_text())
    assert idx and all((out / "players" / f"{r[0]}.json").exists() for r in idx)
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


def test_round_floats_trims_noise_and_nulls_nan():
    out = export.round_floats({"a": 0.123456789, "b": [np.float64(1.0000001), 3], "c": {"d": float("nan")}, "e": "x"})
    assert out == {"a": 0.12346, "b": [1.0, 3], "c": {"d": None}, "e": "x"}
    assert json.dumps(export.round_floats({"p": 0.1 + 0.2})) == '{"p": 0.3}'


@pytest.fixture(scope="module")
def pipeline_objects(sample):

    from chaseline import db, features

    m, d = sample
    con = db.build_db(m.to_dict("records"), d.to_dict("records"), ":memory:")
    states, metrics = model.run_model(features.build_states(m, d), m, smoke=True)
    return con, m, d, states, metrics


def test_export_twice_is_byte_identical(pipeline_objects, tmp_path):
    con, m, d, states, metrics = pipeline_objects
    src = {"name": "Cricsheet", "license": "ODC-By 1.0"}
    for name in ("a", "b"):
        export.export_all(tmp_path / name, con, m, d, states, metrics, src)
    files_a = {p.relative_to(tmp_path / "a"): p.read_bytes() for p in (tmp_path / "a").rglob("*.json")}
    files_b = {p.relative_to(tmp_path / "b"): p.read_bytes() for p in (tmp_path / "b").rglob("*.json")}
    assert files_a.keys() == files_b.keys() and len(files_a) > 20
    assert all(files_a[k] == files_b[k] for k in files_a)


def test_lowest_win_prob_from_the_winners_side():
    wp = np.array([0.5, 0.2, 0.05, 0.4, 1.0])
    assert export.lowest_win_prob(wp, chase_won=True) == (0.05, 2)
    wp2 = np.array([0.5, 0.8, 0.97, 0.6, 0.0])  # chasers led 97% but lost: defenders came back from 3%
    low, at = export.lowest_win_prob(wp2, chase_won=False)
    assert low == pytest.approx(0.03) and at == 2


def test_comebacks_file_is_sorted_and_valid(pipeline_objects, tmp_path):
    con, m, d, states, metrics = pipeline_objects
    export.export_all(tmp_path, con, m, d, states, metrics, {})
    cb = json.loads((tmp_path / "explorer" / "comebacks.json").read_text())
    assert cb and [c["low"] for c in cb] == sorted(c["low"] for c in cb)
    assert all(0 <= c["low"] <= 0.5 and c["winner"] != c["loser"] for c in cb)
    assert (tmp_path / "matches" / f"{cb[0]['id']}.json").exists()


def test_whatif_grid_is_complete_bounded_and_monotone(pipeline_objects):
    g = pipeline_objects[4]["_whatif"]
    nw, nb, nr = len(g["wickets"]), len(g["balls"]), len(g["runs"])
    assert len(g["p"]) == nw * nb * nr and min(g["p"]) >= 0 and max(g["p"]) <= 1000
    cube = np.array(g["p"]).reshape(nw, nb, nr)
    assert (np.diff(cube, axis=2) <= 0).all(), "more runs needed must never raise the chasing side's chances"
    assert (np.diff(cube, axis=1) >= 0).all(), "more balls left must never lower them"
    assert (np.diff(cube, axis=0) >= 0).all(), "more wickets in hand must never lower them"
    assert g["runs"] == sorted(set(g["runs"])) and g["balls"][0] == 1 and g["wickets"] == list(range(1, 11))


def test_whatif_export_is_written_and_kept_out_of_model_json(pipeline_objects, tmp_path):
    con, m, d, states, metrics = pipeline_objects
    export.export_all(tmp_path, con, m, d, states, metrics, {})
    w = json.loads((tmp_path / "whatif.json").read_text())
    assert {"env", "runs", "balls", "wickets", "p", "through_season"} <= set(w)
    assert all(isinstance(x, int) for x in w["p"][:50])
    assert "_whatif" not in json.loads((tmp_path / "model.json").read_text())
    assert (tmp_path / "whatif.json").stat().st_size < 400_000
