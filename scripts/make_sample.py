"""Pick a small, reproducible sample of Cricsheet matches for tests and the CI smoke run.

Usage: python scripts/make_sample.py /path/to/unzipped/ipl_json
Includes edge cases: super-over ties, a no result, D/L matches and overs the source marks as miscounted.
"""
import json
import random
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
DEST = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "sample"
DEST.mkdir(parents=True, exist_ok=True)
for old in DEST.glob("*.json"):
    old.unlink()

docs = {f.stem: json.loads(f.read_text()) for f in sorted(SRC.glob("*.json"))}
by_season: dict[int, list[str]] = {}
special: list[str] = []
for mid, d in docs.items():
    season = int(min(d["info"]["dates"])[:4])
    by_season.setdefault(season, []).append(mid)
    o = d["info"]["outcome"]
    if any("miscounted_overs" in i for i in d["innings"]):
        special.append(mid)
rng = random.Random(7)
picks = set(special[:3])
ties = [m for m, d in docs.items() if d["info"]["outcome"].get("result") == "tie"]
nr = [m for m, d in docs.items() if d["info"]["outcome"].get("result") == "no result"]
dl = [m for m, d in docs.items() if d["info"]["outcome"].get("method")]
picks |= {ties[0], ties[-1], nr[0], dl[0], dl[-1]}
for season in (2008, 2009, 2010, 2024, 2025, 2026):
    picks |= set(rng.sample(sorted(by_season[season]), 4))
for mid in sorted(picks):
    (DEST / f"{mid}.json").write_text(json.dumps(docs[mid], separators=(",", ":")))
print(len(picks), "matches,", sum(f.stat().st_size for f in DEST.glob("*.json")) // 1024, "KB")
