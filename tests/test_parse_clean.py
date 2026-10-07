from chaseline import clean, parse

from .conftest import ball, raw_match


def test_wides_and_noballs_are_not_legal_balls():
    over = [ball(), ball(extras={"wides": 1}), ball(extras={"noballs": 1}, runs=4), ball(), ball(), ball(), ball()]
    m, rows = parse.parse_match(raw_match([over], [[ball()]]), "1")
    inn1 = [r for r in rows if r["innings"] == 1]
    assert [r["legal"] for r in inn1] == [True, False, False, True, True, True, True]
    assert [r["legal_ball_no"] for r in inn1] == [1, 1, 1, 2, 3, 4, 5]
    assert inn1[2]["total_runs"] == 5 and inn1[2]["batter_runs"] == 4


def test_byes_and_legbyes_are_legal_balls():
    _, rows = parse.parse_match(raw_match([[ball(extras={"byes": 2}), ball(extras={"legbyes": 1})]], [[ball()]]), "1")
    assert all(r["legal"] for r in rows[:2])


def test_wicket_kinds_credit_bowler_correctly():
    over = [ball(wicket="bowled"), ball(wicket="run out"), ball(wicket="retired hurt")]
    _, rows = parse.parse_match(raw_match([over], [[ball()]]), "1")
    assert [r["is_wicket"] for r in rows[:3]] == [True, True, False]
    assert [r["bowler_wicket"] for r in rows[:3]] == [True, False, False]


def test_season_uses_year_played_not_label():
    assert clean.season_year(["2008-04-18"]) == 2008
    assert clean.season_year(["2020-11-10", "2020-11-11"]) == 2020


def test_super_over_tie_has_winner_recorded():
    raw = raw_match([[ball()]], [[ball()]], outcome={"result": "tie", "eliminator": "Beta"})
    m, _ = parse.parse_match(raw, "1")
    assert m["result_type"] == "tie" and m["winner"] is None and m["super_over_winner"] == "Beta"


def test_miscounted_over_is_recorded():
    raw = raw_match([[ball()] * 7], [[ball()]])
    raw["innings"][0]["miscounted_overs"] = {"0": {"balls": 7}}
    _, rows = parse.parse_match(raw, "1")
    assert rows[0]["allowed_balls"] == 7


def test_aliases_and_venue_normalisation():
    assert clean.team("Delhi Daredevils") == "Delhi Capitals"
    assert clean.team("Mumbai Indians") == "Mumbai Indians"
    assert clean.venue("Wankhede Stadium, Mumbai") == "Wankhede Stadium"
    assert clean.venue("Feroz Shah Kotla") == "Arun Jaitley Stadium"


def test_sample_parses(sample):
    m, d = sample
    assert len(m) >= 20 and m["match_id"].is_unique
    assert d["batter_id"].notna().all() and d["bowler_id"].notna().all()
