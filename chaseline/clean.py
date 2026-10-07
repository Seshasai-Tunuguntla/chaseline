"""Name normalisation so franchises and grounds are consistent across seasons."""
import re

TEAM_ALIASES = {
    "Delhi Daredevils": "Delhi Capitals",
    "Kings XI Punjab": "Punjab Kings",
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Rising Pune Supergiants": "Rising Pune Supergiant",
}

TEAM_CODES = {
    "Chennai Super Kings": "CSK", "Mumbai Indians": "MI", "Kolkata Knight Riders": "KKR",
    "Royal Challengers Bengaluru": "RCB", "Delhi Capitals": "DC", "Punjab Kings": "PBKS",
    "Rajasthan Royals": "RR", "Sunrisers Hyderabad": "SRH", "Gujarat Titans": "GT",
    "Lucknow Super Giants": "LSG", "Deccan Chargers": "DCH", "Pune Warriors": "PWI",
    "Rising Pune Supergiant": "RPS", "Gujarat Lions": "GL", "Kochi Tuskers Kerala": "KTK",
}

VENUE_ALIASES = {
    "Feroz Shah Kotla": "Arun Jaitley Stadium",
    "Punjab Cricket Association IS Bindra Stadium": "Punjab Cricket Association Stadium",
    "Zayed Cricket Stadium": "Sheikh Zayed Stadium",
    "Sardar Patel Stadium": "Narendra Modi Stadium",
    "M.Chinnaswamy Stadium": "M Chinnaswamy Stadium",
}


def team(name: str) -> str:
    return TEAM_ALIASES.get(name, name)


def venue(name: str) -> str:
    base = re.sub(r"\s+", " ", name.split(",")[0]).strip()  # drop ", City" suffixes
    return VENUE_ALIASES.get(base, base)


def season_year(dates: list[str]) -> int:
    """Cricsheet labels some seasons '2007/08'; use the year the first match was played."""
    return int(min(dates)[:4])
