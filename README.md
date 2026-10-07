# Chaseline

**Ball-by-ball win probability for T20 chases, built on public Indian Premier League data.**

**Live site: https://chaseline.vercel.app**

[![CI](https://github.com/Seshasai-Tunuguntla/chaseline/actions/workflows/ci.yml/badge.svg)](https://github.com/Seshasai-Tunuguntla/chaseline/actions/workflows/ci.yml)

![Match replay: a win-probability line swinging through a two-wicket chase, with a wicket, a six and the big overs marked](docs/screenshots/replay.png)

## What it does

- **Match replay.** Pick a season and a match. See the chasing side's win probability after every ball, with the
  biggest swings (wickets, boundaries, big overs) marked and listed in text.
- **Explorer.** Batter v bowler matchups, best death-over (overs 16-20) bowlers, top batters by strike rate with a
  minimum-balls filter, and venue stats.
- **The model.** How the probabilities are made, how they compare with a required-run-rate baseline, a calibration
  chart, and an honest list of limits.

| Explorer | The model |
| --- | --- |
| ![Explorer](docs/screenshots/explorer.png) | ![Model page](docs/screenshots/model.png) |

Mobile (375 px): [replay](docs/screenshots/replay-mobile.png), [explorer](docs/screenshots/explorer-mobile.png),
[model](docs/screenshots/model-mobile.png).

## How it is built

Everything heavy happens offline in Python. The website is static files and a small React app. No server, no hosted
database, no secrets.

```mermaid
flowchart LR
    A[Cricsheet<br/>ipl_json.zip] -->|download each run| B[parse + clean<br/>chaseline/parse.py]
    B --> C[(DuckDB)]
    C --> D{data-quality<br/>checks}
    D -->|fail| X[pipeline stops]
    D -->|pass| E[chase-state features<br/>features.py]
    E --> F[train on older seasons<br/>test on newest complete season<br/>model.py]
    F --> G[win probability after<br/>every ball of every chase]
    C --> H[explorer aggregates]
    G --> I[static JSON<br/>web/public/data]
    H --> I
    F --> I
    I --> J[Vite + React site<br/>Vercel]
    K[GitHub Actions<br/>weekly cron] -->|re-run, commit| I
```

- **Stack:** pandas, DuckDB, scikit-learn; Vite, React, TypeScript, Recharts; Vercel; GitHub Actions.
- **Small files:** one JSON file per match (about 4 KB), one per batter for matchups, one per season for the match
  list. A page loads only what it shows. The chart libraries are code-split.
- **Weekly refresh:** [`refresh-data.yml`](.github/workflows/refresh-data.yml) rebuilds everything on Mondays,
  fails if a data-quality check fails, and commits changed files. Vercel then redeploys.

## The model

For the second innings, Chaseline estimates the chance that the chasing side wins, from the state after each delivery:

| Input | Why |
| --- | --- |
| runs needed, balls left, wickets left | the basic state of a chase |
| required run rate | the classic summary; also the baseline's only input |
| `env_rpo`: league runs per over over the previous 60 matches (strictly earlier dates) | scoring has risen a lot; the same required rate means different things in different eras |
| `rrr_gap`: required rate minus `env_rpo` | how demanding the chase is *for the era* |

Model: small gradient-boosted trees (depth 3, 150 rounds, seed fixed) with monotonic constraints, so more runs needed
or a higher required rate never helps the chasing side. When the target is reached, or balls or wickets run out, the
probability is exact (1, 0, or 0.5 for a tie that goes to a Super Over). Rain-affected chases are left out.

**Split.** Train on seasons 2008-2025. Test on 2026, the newest complete season (it has a final). No shuffling across
seasons. Input choice among three candidate sets used 2025 as validation and never touched the test season.
Leakage is guarded by tests: features at ball *k* are identical when everything after *k* is deleted, and the scoring
environment ignores the current day and anything later.

**Results on the 2026 hold-out** (70 chases, 8,081 ball-states; lower is better):

| Predictor | Brier | Log loss |
| --- | --- | --- |
| Coin flip (always 50%) | 0.2500 | 0.6931 |
| **Baseline: required-run-rate rule** (logistic on RRR, trained on the same seasons) | 0.1498 | 0.4554 |
| Logistic regression, 4 basic inputs | 0.1425 | 0.4320 |
| Boosted trees, 4 basic inputs | 0.1425 | 0.4254 |
| **Chaseline model** (boosted trees + scoring environment) | **0.1139** | **0.3541** |

The model's Brier score is 0.036 better than the baseline (95% interval 0.025 to 0.047, resampling whole matches).

**Over all seasons** (each season scored by a model that never saw it; 1,185 chases) the picture is more modest and
more honest: Brier 0.1446 for the model, 0.1454 for plain logistic regression and 0.1605 for the baseline. Most of the
2026 gain comes from the scoring-environment input noticing that 2026 chases were easier than history suggested.

**Calibration.** Across all seasons, when the model says about 70% the chasing side wins about 70% (bins sit on the
diagonal: model 55% / actual 56%, 75% / 73%, 85% / 86%). In 2026 alone it is *under-confident for chasers*: it gave
them 51% on average, but chasers won 63% of ball-states. The site shows both calibration curves.

![Calibration and baseline comparison on the model page](docs/screenshots/model.png)

### Limitations

- **Few independent outcomes.** About 70 chases per season; hundreds of ball-states share one result. The hold-out
  is far less certain than 8,081 rows suggest, and there is only one hold-out season.
- **It sees the scoreboard, not the cricket.** No batter or bowler quality, pitch, dew, or depth of the batting still
  to come. Impact-player rules make depth matter more than the model knows.
- **The game drifts.** 2026 is still under-predicted for chasers despite the environment input.
- **Replay lines are out-of-season, not out-of-time.** Each season's line comes from a model that did not train on
  that season, but early-season lines were trained partly on later seasons. That is fine for a replay and wrong for
  judging forecasts, which is why the headline numbers use the strict train-before-test split.
- **Excluded:** rain-affected chases (no line shown) and Super Overs (ties show 50%).
- **Wides and no-balls** each get a state, so the chart has one point per delivery, not per legal ball.
- **Not betting advice.**

## Data quality

The pipeline stops if any check fails ([`chaseline/checks.py`](chaseline/checks.py), tested in
[`tests/test_checks.py`](tests/test_checks.py), including tests that corrupt data and confirm the check catches it):

- ball total = batter runs + extras, extras = their parts, innings total = sum of ball runs
- innings totals agree with the recorded result (won-by-runs margins, target = first innings + 1, chasers who won
  reached the target); rain-affected matches are excluded from those comparisons
- no impossible overs (0-19) or balls (at most 6 legal per over, 120 per innings, 10 wickets)
- wides and no-balls are never legal deliveries; legal-ball counter matches an independent recount
- every match has a winner or a recorded reason (no result, or a tie with a Super Over winner)

Real finding: four overs in the data have 7 legal balls. Cricsheet marks these as umpire miscounts
(`miscounted_overs`), so the parser records the documented number of balls for those overs. The check still fails for
any 7-ball over the source does not document.

## Data source and license

Ball-by-ball data: **[Cricsheet](https://cricsheet.org/)**, used under the
**[Open Data Commons Attribution License (ODC-By 1.0)](https://opendatacommons.org/licenses/by/1-0/)**. This project
modifies the data (parsing, cleaning, normalising team and ground names, aggregating, and adding modelled win
probabilities); those derived files are offered under the same license with attribution to Cricsheet. The raw archive
is not committed: the pipeline downloads it on every run. A 32-match sample is committed under
`tests/fixtures/sample` for tests and the CI smoke run.

This is an independent hobby project. It is not affiliated with or endorsed by the IPL, the BCCI or any team. It
uses no official logos; team names appear only to identify teams.

## Run it locally

Needs Python 3.12+ and Node 22+.

```bash
make setup        # venv + pinned Python deps
make data         # download Cricsheet, check, train, export web/public/data (about a minute)
make test         # Python tests (full-data tests run inside `make data`)
make lint
make web-install  # npm ci
make web-dev      # http://localhost:5173
cd web && npm run typecheck && npm run lint && npm test && npm run build
```

Reproducible: dependencies are pinned (`requirements.txt`, `web/package-lock.json`), seeds are fixed, and a test
confirms two pipeline runs produce byte-identical files.

```
chaseline/   parse, clean, checks, features, model, export, run (python -m chaseline.run)
tests/       pytest: parsing, cleaning, checks, features, leakage, model split, export
web/         Vite + React + TypeScript app, Vitest tests; web/public/data is generated
```

CI ([`ci.yml`](.github/workflows/ci.yml)): Python lint and tests, a pipeline smoke run on the sample, then frontend
typecheck, lint, tests and build.
