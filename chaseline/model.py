"""Win-probability model, baselines and evaluation. Train on older seasons, test on the newest complete one."""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .config import SEED
from .features import FEATURES_BASIC, FEATURES_ENV, FEATURES_FULL

# more runs needed = worse for the chase; more balls/wickets left = better. Enforced for the basic features.
MONOTONE = {"runs_needed": -1, "balls_left": 1, "wickets_left": 1, "rrr": -1, "rrr_gap": -1}


def live(df: pd.DataFrame) -> pd.DataFrame:
    """Rows the model is responsible for: modelled chases, game still undecided."""
    return df[df["modelled"] & ~df["terminal"]]


def trainable(df: pd.DataFrame) -> pd.DataFrame:
    return live(df).dropna(subset=["label"])


def make_gbm(features: list[str], n_rows: int):
    return HistGradientBoostingClassifier(
        max_depth=3, learning_rate=0.05, max_iter=150, l2_regularization=1.0,
        min_samples_leaf=max(5, min(1000, n_rows // 100)),
        monotonic_cst=[MONOTONE.get(f, 0) for f in features],
        early_stopping=False, random_state=SEED,
    )


def make_logit(features: list[str]):
    return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000, random_state=SEED))


def fit(kind: str, train: pd.DataFrame):
    feats = {"rrr_rule": ["rrr"], "logit": FEATURES_BASIC, "gbm_basic": FEATURES_BASIC,
             "gbm_env": FEATURES_ENV, "gbm_full": FEATURES_FULL}[kind]
    model = make_gbm(feats, len(train)) if kind.startswith("gbm") else make_logit(feats)
    model.fit(train[feats], train["label"].astype(int))
    return model, feats


def predict(fitted, df: pd.DataFrame) -> np.ndarray:
    model, feats = fitted
    return model.predict_proba(df[feats])[:, 1]


def scores(y: np.ndarray, p: np.ndarray) -> dict:
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return {"brier": float(brier_score_loss(y, p)), "log_loss": float(log_loss(y, p, labels=[0, 1])), "n": int(len(y))}


def calibration(y: np.ndarray, p: np.ndarray, bins: int = 10) -> list[dict]:
    idx = np.minimum((p * bins).astype(int), bins - 1)
    out = []
    for b in range(bins):
        sel = idx == b
        if sel.sum():
            out.append({"bin": b, "pred": float(p[sel].mean()), "obs": float(y[sel].mean()), "n": int(sel.sum())})
    return out


def bootstrap_diff(df: pd.DataFrame, p_a: np.ndarray, p_b: np.ndarray, reps: int = 1000) -> dict:
    """Match-level bootstrap CI for Brier(a) - Brier(b). Rows within a chase are highly correlated."""
    y = df["label"].to_numpy()
    d = (p_a - y) ** 2 - (p_b - y) ** 2
    g = pd.DataFrame({"m": df["match_id"].to_numpy(), "d": d}).groupby("m")["d"].agg(["sum", "count"])
    rng = np.random.default_rng(SEED)
    sums, counts = g["sum"].to_numpy(), g["count"].to_numpy()
    k = len(g)
    draws = rng.integers(0, k, size=(reps, k))
    est = sums[draws].sum(1) / counts[draws].sum(1)
    return {"diff": float(d.mean()), "lo": float(np.percentile(est, 2.5)), "hi": float(np.percentile(est, 97.5)), "matches": int(k)}


def phase_table(test: pd.DataFrame, preds: dict[str, np.ndarray]) -> list[dict]:
    edges = [(91, 120, "Overs 1-5"), (61, 90, "Overs 6-10"), (31, 60, "Overs 11-15"), (1, 30, "Overs 16-20")]
    rows = []
    for lo, hi, name in edges:
        sel = ((test["balls_left"] >= lo) & (test["balls_left"] <= hi)).to_numpy()
        if sel.sum() == 0:
            continue
        y = test["label"].to_numpy()[sel]
        rows.append({"phase": name, "n": int(sel.sum()),
                     **{k: float(np.mean((np.clip(v[sel], 1e-4, 1 - 1e-4) - y) ** 2)) for k, v in preds.items()}})
    return rows


def complete_seasons(matches: pd.DataFrame, smoke: bool) -> list[int]:
    if smoke:
        return sorted(matches["season"].unique().tolist())
    return sorted(matches.loc[matches["stage"] == "Final", "season"].unique().tolist())


def run_model(states: pd.DataFrame, matches: pd.DataFrame, smoke: bool = False) -> tuple[pd.DataFrame, dict]:
    """Returns states with a `wp` column (out-of-sample probability) and a metrics dict."""
    comp = complete_seasons(matches, smoke)
    if len(comp) < 2:
        raise ValueError("need at least two complete seasons to split train/test")
    test_season = comp[-1]
    train_seasons = comp[:-1]
    tr_all = trainable(states)
    train = tr_all[tr_all["season"].isin(train_seasons)]
    test = tr_all[tr_all["season"] == test_season]

    # feature-set choice uses only a validation season inside the training period
    val_season = train_seasons[-1]
    sub_train = train[train["season"] < val_season]
    val = train[train["season"] == val_season]
    gbm_kinds = ("gbm_basic", "gbm_env", "gbm_full")
    selection = {}
    if len(sub_train):
        for kind in gbm_kinds:
            selection[kind] = scores(val["label"].to_numpy(), predict(fit(kind, sub_train), val))
        best = min(selection, key=lambda k: selection[k]["brier"])
    else:
        best = "gbm_env"

    kinds = ["rrr_rule", "logit", *gbm_kinds]
    fitted = {k: fit(k, train) for k in kinds}
    y = test["label"].to_numpy()
    preds = {k: predict(f, test) for k, f in fitted.items()}
    preds["coin_flip"] = np.full(len(test), 0.5)
    holdout = {k: scores(y, p) for k, p in preds.items()}

    # pooled leave-one-season-out (every complete season scored by a model that never saw it)
    def pool_for(s: int) -> pd.DataFrame:
        return tr_all[tr_all["season"].isin(train_seasons if s == test_season else [c for c in comp if c != s])]

    loso_kinds = ["rrr_rule", "logit", best]
    loso_p: dict[str, list[np.ndarray]] = {k: [] for k in loso_kinds}
    loso_y = []
    for s in comp:
        part = tr_all[tr_all["season"] == s]
        pool = pool_for(s)
        if part.empty or pool.empty:
            continue
        for k in loso_kinds:
            loso_p[k].append(predict(fit(k, pool), part))
        loso_y.append(part["label"].to_numpy())
    ly = np.concatenate(loso_y)
    lp = {k: np.concatenate(v) for k, v in loso_p.items()}
    loso = {k: scores(ly, p) for k, p in lp.items()}
    loso["coin_flip"] = scores(ly, np.full(len(ly), 0.5))

    # display probabilities: out-of-season for complete seasons, all-complete-seasons model otherwise
    out = states.copy()
    out["wp"] = np.nan
    lv = live(out)
    full_model = fit(best, tr_all[tr_all["season"].isin(comp)])
    for s in sorted(lv["season"].unique()):
        part = lv[lv["season"] == s]
        model_s = fit(best, pool_for(s)) if s in comp else full_model
        out.loc[part.index, "wp"] = predict(model_s, part)
    term = out["terminal"] & out["modelled"]
    out.loc[term, "wp"] = out.loc[term, "terminal_wp"]

    feats = {"gbm_basic": FEATURES_BASIC, "gbm_env": FEATURES_ENV, "gbm_full": FEATURES_FULL}[best]
    metrics = {
        "test_season": int(test_season),
        "train_seasons": [int(train_seasons[0]), int(train_seasons[-1])],
        "validation_season": int(val_season),
        "feature_selection_validation": selection,
        "chosen_model": best,
        "holdout": holdout,
        "holdout_chases": int(test["match_id"].nunique()),
        "holdout_states": int(len(test)),
        "bootstrap_vs_rrr_rule": bootstrap_diff(test, preds[best], preds["rrr_rule"]),
        "bootstrap_vs_logit": bootstrap_diff(test, preds[best], preds["logit"]),
        "phases": phase_table(test, {"rrr_rule": preds["rrr_rule"], "model": preds[best]}),
        "calibration_holdout": calibration(y, preds[best]),
        "calibration_holdout_rrr_rule": calibration(y, preds["rrr_rule"]),
        "calibration_pooled": calibration(ly, lp[best]),
        "loso": loso,
        "loso_chases": int(tr_all[tr_all["season"].isin(comp)]["match_id"].nunique()),
        "features": feats,
        "mean_pred_holdout": float(preds[best].mean()),
        "mean_obs_holdout": float(y.mean()),
    }
    return out, metrics
