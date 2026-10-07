import { lazy, Suspense, useEffect, useState } from "react";
import { loadJson } from "../lib/data";
import type { CalBin, ModelMetrics, SiteIndex } from "../lib/types";

const Calibration = lazy(() => import("../components/Calibration"));

const LABEL: Record<string, string> = {
  coin_flip: "Coin flip (always 50%)",
  rrr_rule: "Baseline: required-run-rate rule",
  logit: "Logistic regression, 4 basic inputs",
  gbm_basic: "Boosted trees, 4 basic inputs",
  gbm_env: "Boosted trees + scoring environment (the model)",
  gbm_full: "Boosted trees + environment + recent form",
};
const ORDER = ["coin_flip", "rrr_rule", "logit", "gbm_basic", "gbm_env", "gbm_full"];
const f4 = (n: number) => n.toFixed(4);

function CalTable({ bins }: { bins: CalBin[] }) {
  return (
    <table className="data">
      <caption className="sr">Calibration bins</caption>
      <thead><tr><th scope="col">Model said</th><th scope="col">Chasing side won</th><th scope="col">Ball-states</th></tr></thead>
      <tbody>
        {bins.map((b) => (
          <tr key={b.bin}><td>{Math.round(b.pred * 100)}%</td><td>{Math.round(b.obs * 100)}%</td><td>{b.n.toLocaleString()}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Model({ index }: { index: SiteIndex }) {
  const [m, setM] = useState<ModelMetrics | null>(null);
  useEffect(() => {
    loadJson<ModelMetrics>("model.json").then(setM);
  }, []);
  if (!m) return <p className="notice">Loading…</p>;
  const best = m.chosen_model;
  const vsRrr = m.bootstrap_vs_rrr_rule;
  const vsLogit = m.bootstrap_vs_logit;
  const excludesZero = (b: { lo: number; hi: number }) => b.hi < 0 || b.lo > 0;
  const rows = ORDER.filter((k) => m.holdout[k]);

  return (
    <div className="stack prose">
      <section className="panel">
        <h1>The model</h1>
        <p>
          In the second innings of a T20 match, Chaseline estimates the chance that the chasing side wins, after
          every ball. It looks at the state of the game: runs still needed, balls left, wickets in hand, and the
          required run rate. It also knows how fast runs have been scored across the league in the previous 60 matches
          (a number available before the match starts), because scoring has climbed a lot over the years.
        </p>
        <ul>
          <li><strong>Training:</strong> seasons {m.train_seasons[0]}–{m.train_seasons[1]}. <strong>Test:</strong> {m.test_season}, the latest completed season ({m.holdout_chases} chases, {m.holdout_states.toLocaleString()} ball-states). Seasons are never shuffled together.</li>
          <li><strong>Model:</strong> gradient-boosted trees (small, shallow, with monotonic constraints: more runs needed never helps the chasing side). Inputs: {m.features.join(", ")}.</li>
          <li><strong>Choosing inputs:</strong> picked on {m.validation_season}, the last training season, never on the test season.</li>
          <li><strong>Ends of the game:</strong> once the target is reached, or the innings runs out of balls or wickets, the probability is exact (100%, 0%, or 50% for a tie that goes to a Super Over). Rain-affected chases are excluded.</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Against the baseline</h2>
        <p>
          The baseline is the classic rule of thumb: the higher the required run rate, the lower the chance, fitted to
          the same training seasons. Lower scores are better for both measures (<abbr title="mean squared error of the probability">Brier</abbr> and log loss).
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Model score table">
          <table className="data">
            <caption>Scores on the {m.test_season} hold-out and across all seasons (each scored by a model that never saw it)</caption>
            <thead>
              <tr>
                <th scope="col">Predictor</th>
                <th scope="col">Brier {m.test_season}</th><th scope="col">Log loss {m.test_season}</th>
                <th scope="col">Brier, all seasons</th><th scope="col">Log loss, all seasons</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k} className={k === best ? "hl" : undefined}>
                  <th scope="row">{LABEL[k]}</th>
                  <td>{f4(m.holdout[k].brier)}</td><td>{f4(m.holdout[k].log_loss)}</td>
                  <td>{m.loso[k] ? f4(m.loso[k].brier) : "–"}</td><td>{m.loso[k] ? f4(m.loso[k].log_loss) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          On {m.test_season}, the model’s Brier score is <strong>{Math.abs(vsRrr.diff).toFixed(3)} better</strong> than the
          baseline (95% interval {vsRrr.lo.toFixed(3)} to {vsRrr.hi.toFixed(3)}, resampling whole matches), {excludesZero(vsRrr) ? "so the gain is unlikely to be luck" : "which is not clearly separated from luck"}.
          Against the plain four-input logistic regression the gain is {Math.abs(vsLogit.diff).toFixed(3)} ({vsLogit.lo.toFixed(3)} to {vsLogit.hi.toFixed(3)}),{" "}
          {excludesZero(vsLogit) ? "which is clear" : "which is not clearly separated from zero"}.
        </p>
        <p>
          Be careful about the size of that win. Across all seasons the model and the plain logistic regression are
          almost level ({f4(m.loso[best].brier)} v {f4(m.loso.logit.brier)}). Most of the {m.test_season} gain comes from one thing:
          the scoring-environment input noticed that runs were flowing faster than in the seasons it was trained on.
          With only one test season, treat the exact margin as a rough guide.
        </p>
      </section>

      <section className="panel">
        <h2>Calibration: when it says 70%, do teams win about 70%?</h2>
        <Suspense fallback={<div className="chart-skel">Loading chart…</div>}>
          <Calibration pooled={m.calibration_pooled} holdout={m.calibration_holdout} season={m.test_season} />
        </Suspense>
        <p>
          Across all seasons the points hug the diagonal, so yes. In the {m.test_season} hold-out the dots sit above the
          line: the model gave the chasing side {Math.round(m.mean_pred_holdout * 100)}% on average but chasers actually
          won {Math.round(m.mean_obs_holdout * 100)}% of ball-states. That season favoured chasing more than a model trained on
          older seasons expected.
        </p>
        <details>
          <summary>Show the numbers</summary>
          <h3>All seasons</h3><CalTable bins={m.calibration_pooled} />
          <h3>{m.test_season} hold-out</h3><CalTable bins={m.calibration_holdout} />
        </details>
      </section>

      <section className="panel">
        <h2>Where the model helps most</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Score by stage table">
          <table className="data">
            <caption>{m.test_season} Brier score by stage of the chase</caption>
            <thead><tr><th scope="col">Stage</th><th scope="col">Ball-states</th><th scope="col">Baseline</th><th scope="col">Model</th></tr></thead>
            <tbody>
              {m.phases.map((p) => (
                <tr key={p.phase}><th scope="row">{p.phase}</th><td>{p.n.toLocaleString()}</td><td>{f4(p.rrr_rule)}</td><td>{f4(p.model)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Limitations</h2>
        <ul>
          <li><strong>Few independent outcomes.</strong> A season has about 70 chases. Hundreds of ball-states per chase share one result, so the test is far less certain than its row count suggests.</li>
          <li><strong>It sees the scoreboard, not the cricket.</strong> It does not know who is batting or bowling, the pitch, dew, or the batting still to come (“impact player” depth changes this). A set Kohli at 12 an over looks the same as a tail-ender.</li>
          <li><strong>The game changes.</strong> Higher scoring in recent seasons shifted the odds. The scoring-environment input helps, but {m.test_season} is still under-predicted for chasers (see calibration).</li>
          <li><strong>Replay lines are out-of-season, not out-of-time.</strong> Each season’s line comes from a model that never saw that season, but for earlier seasons it was trained partly on later ones. Fine for a replay, not a forecasting test.</li>
          <li><strong>Rain and Super Overs are left out.</strong> Shortened chases have no line; a tie is shown as 50%.</li>
          <li><strong>It is not betting advice.</strong> Probabilities are estimates from a small model on public data.</li>
        </ul>
        <p className="muted small">Data: Cricsheet ({index.source.matches.toLocaleString()} matches, ODC-By 1.0). Method details and code are in the <a href="https://github.com/Seshasai-Tunuguntla/chaseline">repository README</a>.</p>
      </section>
    </div>
  );
}
