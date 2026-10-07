"""Data-quality checks. Each returns a list of human-readable failures (empty = pass)."""
import duckdb


class DataQualityError(RuntimeError):
    pass


def _fmt(label: str, rows: list) -> list[str]:
    return [f"{label}: {r}" for r in rows[:10]] + ([f"{label}: ... {len(rows)} total"] if len(rows) > 10 else [])


def check_run_arithmetic(con: duckdb.DuckDBPyConnection) -> list[str]:
    """Ball total = batter + extras, and extras = sum of its parts; innings totals = sum of ball runs."""
    bad = con.execute(
        """SELECT match_id, innings, seq FROM deliveries
           WHERE total_runs <> batter_runs + extras
              OR extras <> wides + noballs + byes + legbyes + penalty"""
    ).fetchall()
    out = _fmt("run arithmetic", bad)
    bad = con.execute(
        """SELECT t.match_id, t.innings, t.runs, s.s FROM innings_totals t
           JOIN (SELECT match_id, innings, sum(batter_runs + wides + noballs + byes + legbyes + penalty) AS s
                 FROM deliveries GROUP BY ALL) s USING (match_id, innings)
           WHERE t.runs <> s.s"""
    ).fetchall()
    return out + _fmt("innings total != sum of ball runs", bad)


def check_result_margins(con: duckdb.DuckDBPyConnection) -> list[str]:
    """Innings totals must agree with the recorded result (excluding rain-adjusted matches)."""
    out = []
    by_runs = con.execute(
        """SELECT m.match_id, a.runs - b.runs AS diff, m.margin FROM matches m
           JOIN innings_totals a ON a.match_id = m.match_id AND a.innings = 1 AND NOT a.is_super_over
           JOIN innings_totals b ON b.match_id = m.match_id AND b.innings = 2 AND NOT b.is_super_over
           WHERE m.result_type = 'runs' AND m.method IS NULL AND a.runs - b.runs <> m.margin"""
    ).fetchall()
    out += _fmt("won-by-runs margin mismatch", by_runs)
    by_wkts = con.execute(
        """SELECT m.match_id, b.runs, m.target_runs FROM matches m
           JOIN innings_totals b ON b.match_id = m.match_id AND b.innings = 2 AND NOT b.is_super_over
           WHERE m.result_type = 'wickets' AND m.method IS NULL AND b.runs < m.target_runs"""
    ).fetchall()
    out += _fmt("chase won without reaching target", by_wkts)
    tgt = con.execute(
        """SELECT m.match_id, a.runs, m.target_runs FROM matches m
           JOIN innings_totals a ON a.match_id = m.match_id AND a.innings = 1
           WHERE m.method IS NULL AND m.target_runs IS NOT NULL AND m.target_runs <> a.runs + 1"""
    ).fetchall()
    return out + _fmt("target != first innings + 1", tgt)


def check_overs_and_balls(con: duckdb.DuckDBPyConnection) -> list[str]:
    out = []
    bad = con.execute(
        """SELECT match_id, innings, over FROM deliveries
           WHERE over < 0 OR (NOT is_super_over AND over > 19) OR (is_super_over AND over > 0)"""
    ).fetchall()
    out += _fmt("impossible over number", bad)
    bad = con.execute(
        """SELECT match_id, innings, over, count(*) FILTER (legal) AS n FROM deliveries
           GROUP BY match_id, innings, over, allowed_balls HAVING n > allowed_balls"""
    ).fetchall()
    out += _fmt("more than 6 legal balls in an over", bad)
    bad = con.execute(
        """SELECT t.match_id, t.innings, t.legal_balls FROM innings_totals t
           JOIN (SELECT match_id, innings, sum(allowed - 6) AS extra
                 FROM (SELECT DISTINCT match_id, innings, over, allowed_balls AS allowed FROM deliveries)
                 GROUP BY ALL) x USING (match_id, innings)
           WHERE t.legal_balls > CASE WHEN t.is_super_over THEN 6 ELSE 120 END + x.extra"""
    ).fetchall()
    out += _fmt("too many legal balls in an innings", bad)
    bad = con.execute("SELECT match_id, innings, wickets FROM innings_totals WHERE wickets > 10").fetchall()
    out += _fmt("more than 10 wickets", bad)
    bad = con.execute(
        """SELECT match_id, innings, count(*) AS n, max(seq) AS mx FROM deliveries
           GROUP BY match_id, innings HAVING n <> mx"""
    ).fetchall()
    out += _fmt("delivery sequence has gaps", bad)
    bad = con.execute("SELECT match_id FROM matches WHERE balls_per_over <> 6").fetchall()
    return out + _fmt("balls_per_over != 6", bad)


def check_legal_ball_counting(con: duckdb.DuckDBPyConnection) -> list[str]:
    """Wides and no-balls are not legal deliveries; stored counters match an independent recount."""
    out = []
    bad = con.execute("SELECT match_id, innings, seq FROM deliveries WHERE legal AND (wides > 0 OR noballs > 0)").fetchall()
    out += _fmt("wide/no-ball marked legal", bad)
    bad = con.execute("SELECT match_id, innings, seq FROM deliveries WHERE NOT legal AND wides = 0 AND noballs = 0").fetchall()
    out += _fmt("illegal ball without wide/no-ball", bad)
    bad = con.execute(
        """SELECT match_id, innings, seq FROM (
             SELECT *, sum(legal::INT) OVER (PARTITION BY match_id, innings ORDER BY seq) AS recount FROM deliveries)
           WHERE recount <> legal_ball_no"""
    ).fetchall()
    return out + _fmt("legal ball counter mismatch", bad)


def check_results(con: duckdb.DuckDBPyConnection) -> list[str]:
    out = []
    bad = con.execute(
        """SELECT match_id, result_type, winner FROM matches
           WHERE winner IS NULL AND NOT (coalesce(result_type, '') = 'no result'
                                         OR (coalesce(result_type, '') = 'tie' AND super_over_winner IS NOT NULL))"""
    ).fetchall()
    out += _fmt("match with neither winner nor no-result reason", bad)
    bad = con.execute(
        "SELECT match_id, winner FROM matches WHERE winner IS NOT NULL AND winner NOT IN (team1, team2)"
    ).fetchall()
    out += _fmt("winner is not one of the teams", bad)
    bad = con.execute(
        "SELECT match_id FROM deliveries WHERE batter_id IS NULL OR bowler_id IS NULL GROUP BY match_id"
    ).fetchall()
    out += _fmt("delivery missing player id", bad)
    bad = con.execute("SELECT match_id FROM matches GROUP BY match_id HAVING count(*) > 1").fetchall()
    return out + _fmt("duplicate match id", bad)


ALL_CHECKS = [
    check_run_arithmetic, check_result_margins, check_overs_and_balls,
    check_legal_ball_counting, check_results,
]


def run_all(con: duckdb.DuckDBPyConnection) -> None:
    failures = [f for chk in ALL_CHECKS for f in chk(con)]
    if failures:
        raise DataQualityError("Data-quality checks failed:\n" + "\n".join(failures))
