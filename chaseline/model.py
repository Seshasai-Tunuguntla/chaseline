"""Win-probability model, baselines and evaluation. Train on older seasons, test on the newest complete one."""
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
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


@dataclass(frozen=True)
class Config:
    """A candidate model. All options are fixed before the test season is looked at."""
    features: str = "env"  # 'basic' or 'env'
    half_life: float | None = None  # seasons; recency weight 0.5 ** (age / half_life)
    era: bool = False  # add the Impact Player era flag
    recal: str = "none"  # 'none', 'platt' or 'isotonic', fitted on the season before the newest training one

    @property
    def name(self) -> str:
        parts = [self.features, f"hl{self.half_life:g}" if self.half_life else "unweighted",
                 "era" if self.era else "no-era", self.recal]
        return "+".join(parts)

    @property
    def feats(self) -> list[str]:
        base = FEATURES_BASIC if self.features == "basic" else FEATURES_ENV
        return base + (["impact_era"] if self.era else [])


def candidate_configs() -> list[Config]:
    """Simplest first, so ties on validation go to the simpler model."""
    return [Config(f, h, e, r) for r in ("none", "platt", "isotonic") for e in (False, True)
            for h in (None, 3.0) for f in ("env", "basic")]


class Fitted:
    """A fitted predictor: a classifier on named features plus an optional probability recalibrator."""

    def __init__(self, model, feats: list[str], cal=None):
        self.model, self.feats, self.cal = model, feats, cal

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        p = self.model.predict_proba(df[self.feats])[:, 1]
        return apply_calibrator(self.cal, p)


def _logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p)).reshape(-1, 1)


def fit_calibrator(kind: str, p: np.ndarray, y: np.ndarray):
    if kind == "none" or len(np.unique(y)) < 2:
        return None
    if kind == "platt":
        return ("platt", LogisticRegression(C=1e6, max_iter=1000).fit(_logit(p), y))
    return ("isotonic", IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(p, y))


def apply_calibrator(cal, p: np.ndarray) -> np.ndarray:
    if cal is None:
        return p
    kind, m = cal
    return m.predict_proba(_logit(p))[:, 1] if kind == "platt" else m.predict(p)


def _fit_core(cfg: Config, train: pd.DataFrame) -> Fitted:
    w = None
    if cfg.half_life:
        w = 0.5 ** ((train["season"].max() - train["season"].to_numpy()) / cfg.half_life)
    # a constant column (e.g. the era flag when every training season is pre-2023) cannot be binned
    feats = [f for f in cfg.feats if train[f].nunique(dropna=True) > 1]
    model = make_gbm(feats, len(train))
    model.fit(train[feats], train["label"].astype(int), sample_weight=w)
    return Fitted(model, feats)


def fit_config(cfg: Config, train: pd.DataFrame) -> Fitted:
    core = _fit_core(cfg, train)
    if cfg.recal == "none":
        return core
    last = train["season"].max()
    inner, part = train[train["season"] < last], train[train["season"] == last]
    if inner.empty or part.empty:
        return core
    p = _fit_core(cfg, inner).predict(part)
    core.cal = fit_calibrator(cfg.recal, p, part["label"].astype(int).to_numpy())
    return core


KINDS = {"rrr_rule": ["rrr"], "logit": FEATURES_BASIC, "gbm_basic": FEATURES_BASIC,
         "gbm_env": FEATURES_ENV, "gbm_full": FEATURES_FULL}


def fit(kind: str | Config, train: pd.DataFrame, purpose: str = "") -> Fitted:
    """Fit a named baseline/variant or a Config. `purpose` labels the call so tests can audit what saw which seasons."""
    if isinstance(kind, Config):
        return fit_config(kind, train)
    feats = KINDS[kind]
    model = make_gbm(feats, len(train)) if kind.startswith("gbm") else make_logit(feats)
    model.fit(train[feats], train["label"].astype(int))
    return Fitted(model, feats)


def predict(fitted: Fitted, df: pd.DataFrame) -> np.ndarray:
    return fitted.predict(df)


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

    # 1. choose the final model on the last training season only (train < val, score on val)
    val_season = train_seasons[-1]
    sub_train = train[train["season"] < val_season]
    val = train[train["season"] == val_season]
    candidates = []
    if len(sub_train):
        for cfg in candidate_configs():
            sc = scores(val["label"].to_numpy(), fit(cfg, sub_train, "selection").predict(val))
            candidates.append({"name": cfg.name, "features": cfg.features, "half_life": cfg.half_life,
                               "era": cfg.era, "recal": cfg.recal, **sc})
        best_row = min(candidates, key=lambda c: c["brier"])
        best_cfg = Config(best_row["features"], best_row["half_life"], best_row["era"], best_row["recal"])
    else:
        best_cfg = Config()
    default_cfg = Config()  # the previous production model: env features, no weights, no era flag, no recal

    # 2. hold-out: everything below is fitted on train seasons only
    kinds = ["rrr_rule", "logit", "gbm_basic", "gbm_env", "gbm_full"]
    fitted = {k: fit(k, train, "holdout") for k in kinds}
    fitted["model"] = fit(best_cfg, train, "holdout")
    y = test["label"].to_numpy()
    preds = {k: f.predict(test) for k, f in fitted.items()}
    preds["coin_flip"] = np.full(len(test), 0.5)
    holdout = {k: scores(y, p) for k, p in preds.items()}

    def pool_for(s: int) -> pd.DataFrame:
        return tr_all[tr_all["season"].isin(train_seasons if s == test_season else [c for c in comp if c != s])]

    # 3. leave-one-season-out (trains on FUTURE seasons too) and display probabilities
    out = states.copy()
    out["wp"] = np.nan
    lv = live(out)
    loso_p: dict[str, list[np.ndarray]] = {"rrr_rule": [], "logit": [], "model": []}
    loso_y = []
    for s in sorted(lv["season"].unique()):
        live_s = lv[lv["season"] == s]
        model_s = fit(best_cfg, pool_for(s), "loso") if s in comp else None
        if model_s is None:
            continue
        out.loc[live_s.index, "wp"] = model_s.predict(live_s)
        part = tr_all[tr_all["season"] == s]
        pool = pool_for(s)
        if part.empty or pool.empty:
            continue
        loso_p["model"].append(model_s.predict(part))
        for k in ("rrr_rule", "logit"):
            loso_p[k].append(fit(k, pool, "loso").predict(part))
        loso_y.append(part["label"].to_numpy())
    full_model = fit(best_cfg, tr_all[tr_all["season"].isin(comp)], "display")
    for s in sorted(lv["season"].unique()):
        if s not in comp:
            live_s = lv[lv["season"] == s]
            out.loc[live_s.index, "wp"] = full_model.predict(live_s)
    ly = np.concatenate(loso_y)
    lp = {k: np.concatenate(v) for k, v in loso_p.items()}
    loso = {k: scores(ly, p) for k, p in lp.items()}
    loso["coin_flip"] = scores(ly, np.full(len(ly), 0.5))
    term = out["terminal"] & out["modelled"]
    out.loc[term, "wp"] = out.loc[term, "terminal_wp"]

    # 4. rolling origin: each season scored by a model trained only on EARLIER seasons
    rolling = []
    for s in comp:
        pool = tr_all[tr_all["season"].isin([c for c in comp if c < s])]
        part = tr_all[tr_all["season"] == s]
        if pool["season"].nunique() < 2 or part.empty:
            continue
        ys = part["label"].to_numpy()
        rolling.append({
            "season": int(s), "chases": int(part["match_id"].nunique()),
            "model": scores(ys, fit(best_cfg, pool, "rolling").predict(part)),
            "default_model": scores(ys, fit(default_cfg, pool, "rolling").predict(part)),
            "rrr_rule": scores(ys, fit("rrr_rule", pool, "rolling").predict(part)),
            "logit": scores(ys, fit("logit", pool, "rolling").predict(part)),
        })

    metrics = {
        "test_season": int(test_season),
        "train_seasons": [int(train_seasons[0]), int(train_seasons[-1])],
        "validation_season": int(val_season),
        "candidates": sorted(candidates, key=lambda c: c["brier"]),
        "chosen_config": {"name": best_cfg.name, "features": best_cfg.features, "half_life": best_cfg.half_life,
                          "era": best_cfg.era, "recal": best_cfg.recal},
        "chosen_model": "model",
        "holdout": holdout,
        "holdout_chases": int(test["match_id"].nunique()),
        "holdout_states": int(len(test)),
        "bootstrap_vs_rrr_rule": bootstrap_diff(test, preds["model"], preds["rrr_rule"]),
        "bootstrap_vs_logit": bootstrap_diff(test, preds["model"], preds["logit"]),
        "phases": phase_table(test, {"rrr_rule": preds["rrr_rule"], "model": preds["model"]}),
        "calibration_holdout": calibration(y, preds["model"]),
        "calibration_holdout_default": calibration(y, preds["gbm_env"]),
        "calibration_holdout_rrr_rule": calibration(y, preds["rrr_rule"]),
        "calibration_pooled": calibration(ly, lp["model"]),
        "loso": loso,
        "loso_chases": int(tr_all[tr_all["season"].isin(comp)]["match_id"].nunique()),
        "rolling_origin": rolling,
        "features": best_cfg.feats,
        "mean_pred_holdout": float(preds["model"].mean()),
        "mean_pred_holdout_default": float(preds["gbm_env"].mean()),
        "mean_obs_holdout": float(y.mean()),
    }
    return out, metrics
