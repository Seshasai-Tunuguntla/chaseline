"""One command to rebuild everything: `python -m chaseline.run`."""
import argparse
import json
import shutil
import time
from pathlib import Path

import pandas as pd

from . import checks, config, db, download, export, features, model, parse


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="small committed sample; relaxed season rules")
    ap.add_argument("--raw-dir", type=Path, default=None, help="use existing JSON files instead of downloading")
    ap.add_argument("--out", type=Path, default=config.WEB_DATA)
    ap.add_argument("--db", type=Path, default=config.DB_PATH)
    args = ap.parse_args(argv)
    t0 = time.time()

    raw = args.raw_dir or (config.SAMPLE_DIR if args.smoke else None)
    if raw is None:
        shutil.rmtree(config.RAW_DIR, ignore_errors=True)
        raw = download.download()
    print(f"[1/5] parse {raw}")
    matches, deliveries = parse.parse_dir(raw)
    con = db.build_db(matches, deliveries, args.db)
    print(f"      {len(matches)} matches, {len(deliveries)} deliveries")

    print("[2/5] data-quality checks")
    checks.run_all(con)  # raises DataQualityError and stops the pipeline

    print("[3/5] chase features")
    m_df = pd.DataFrame(matches)
    d_df = pd.DataFrame(deliveries)
    states = features.build_states(m_df, d_df)

    print("[4/5] model")
    states, metrics = model.run_model(states, m_df, smoke=args.smoke, env_now=features.current_environment(m_df, d_df))
    con.register("states_df", states)
    con.execute("CREATE OR REPLACE TABLE win_prob AS SELECT * FROM states_df")
    pq = Path(args.db).with_name("win_prob.parquet")
    con.execute(f"COPY (SELECT match_id, step, seq, runs, wickets, legal_balls, runs_needed, balls_left, wp "
                f"FROM win_prob ORDER BY match_id, step) TO '{pq}' (FORMAT PARQUET)")

    print("[5/5] export")
    source = {"name": "Cricsheet", "url": "https://cricsheet.org/", "license": "ODC-By 1.0",
              "license_url": "https://opendatacommons.org/licenses/by/1-0/", "matches": len(m_df),
              "latest_match": str(m_df["date"].max())}
    export.export_all(args.out, con, m_df, d_df, states, metrics, source)
    print(f"done in {time.time() - t0:.0f}s; chosen={metrics['chosen_model']}; "
          f"holdout brier={json.dumps({k: round(v['brier'], 4) for k, v in metrics['holdout'].items()})}")


if __name__ == "__main__":
    main()
