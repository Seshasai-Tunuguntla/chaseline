import pytest

from chaseline import checks, db, parse

from .conftest import ball, raw_match


def test_all_checks_pass_on_real_sample(con):
    checks.run_all(con)


@pytest.mark.parametrize("sql,check", [
    ("UPDATE deliveries SET total_runs = total_runs + 1 WHERE seq = 3 AND innings = 1 AND match_id = (SELECT min(match_id) FROM matches)",
     checks.check_run_arithmetic),
    ("UPDATE deliveries SET batter_runs = batter_runs + 1 WHERE seq = 4 AND innings = 2 AND match_id = (SELECT min(match_id) FROM matches)",
     checks.check_run_arithmetic),
    ("UPDATE deliveries SET over = 25 WHERE seq = 1 AND innings = 1 AND match_id = (SELECT min(match_id) FROM matches)",
     checks.check_overs_and_balls),
    ("UPDATE deliveries SET legal = NOT legal WHERE seq = 5 AND innings = 1 AND match_id = (SELECT min(match_id) FROM matches)",
     checks.check_legal_ball_counting),
    ("UPDATE matches SET winner = NULL, result_type = NULL WHERE match_id = (SELECT min(match_id) FROM matches WHERE winner IS NOT NULL)",
     checks.check_results),
    ("UPDATE matches SET winner = 'Nobody FC' WHERE match_id = (SELECT min(match_id) FROM matches WHERE winner IS NOT NULL)",
     checks.check_results),
])
def test_checks_detect_corruption(con, sql, check):
    assert check(con) == []
    con.execute(sql)
    con.execute("DELETE FROM innings_totals")
    con.execute("""INSERT INTO innings_totals SELECT match_id, innings, any_value(is_super_over), any_value(batting_team),
                   sum(total_runs)::INT, sum(is_wicket::INT)::INT, sum(legal::INT)::INT FROM deliveries GROUP BY ALL""")
    assert check(con), "corruption went undetected"


def test_margin_check_catches_wrong_result(con):
    con.execute("UPDATE matches SET margin = margin + 7 WHERE result_type = 'runs' AND method IS NULL")
    assert checks.check_result_margins(con)


def test_seven_legal_balls_fail_unless_source_documents_it():
    over = [ball()] * 7
    bad = parse.parse_match(raw_match([over], [[ball()]]), "1")
    c = db.build_db([bad[0]], bad[1], ":memory:")
    assert checks.check_overs_and_balls(c)
    raw = raw_match([over], [[ball()]])
    raw["innings"][0]["miscounted_overs"] = {"0": {"balls": 7}}
    ok = parse.parse_match(raw, "1")
    c2 = db.build_db([ok[0]], ok[1], ":memory:")
    assert checks.check_overs_and_balls(c2) == []


def test_run_all_raises(con):
    con.execute("UPDATE matches SET winner = NULL, result_type = NULL WHERE match_id = (SELECT min(match_id) FROM matches WHERE winner IS NOT NULL)")
    with pytest.raises(checks.DataQualityError):
        checks.run_all(con)


@pytest.mark.data
def test_full_dataset_passes_all_checks():
    import duckdb

    from chaseline.config import DB_PATH
    if not DB_PATH.exists():
        pytest.skip("run `make data` first")
    checks.run_all(duckdb.connect(str(DB_PATH), read_only=True))
