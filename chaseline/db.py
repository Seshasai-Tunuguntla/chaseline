"""Load parsed records into DuckDB."""
from pathlib import Path

import duckdb
import pandas as pd


def build_db(matches: list[dict], deliveries: list[dict], path: Path | str) -> duckdb.DuckDBPyConnection:
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).unlink(missing_ok=True)
    con = duckdb.connect(str(path))
    m = pd.DataFrame(matches)
    d = pd.DataFrame(deliveries)
    con.register("m_df", m)
    con.register("d_df", d)
    con.execute("CREATE TABLE matches AS SELECT * FROM m_df")
    con.execute("CREATE TABLE deliveries AS SELECT * FROM d_df ORDER BY match_id, innings, seq")
    con.execute(
        """CREATE TABLE innings_totals AS
        SELECT match_id, innings, any_value(is_super_over) AS is_super_over,
               any_value(batting_team) AS batting_team,
               sum(total_runs)::INT AS runs, sum(is_wicket::INT)::INT AS wickets,
               sum(legal::INT)::INT AS legal_balls
        FROM deliveries GROUP BY match_id, innings"""
    )
    return con
