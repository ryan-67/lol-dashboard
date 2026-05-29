#!/usr/bin/env python3
"""
Ingest Oracle's Elixir CSV files from lol/ into a slice-indexed JSON store.

Usage:
    python scripts/ingest_csv.py

Reads:
    lol/2024_oracle_elixir.csv
    lol/2025_oracle_elixir.csv
    lol/2026_oracle_elixir.csv

Writes:
    public/data/oe_slices.json
"""

from __future__ import annotations

import json
import csv
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOL_DIR = ROOT / "lol"
OUT_PATH = ROOT / "public" / "data" / "oe_slices.json"
CSV_FILES = [
    LOL_DIR / "2024_oracle_elixir.csv",
    LOL_DIR / "2025_oracle_elixir.csv",
    LOL_DIR / "2026_oracle_elixir.csv",
]

TARGET_LEAGUES = {"LCK", "LPL", "LEC", "LCS"}
INTERNATIONAL_LEAGUES = {"MSI", "WLDs", "FST"}
ALLOWED_LEAGUES = TARGET_LEAGUES | INTERNATIONAL_LEAGUES
ALLOWED_COMPLETENESS = {"complete", "partial"}
MIN_PLAYER_GAMES = 5
MIN_TEAM_GAMES = 3
MIN_CHAMP_PICKS = 3

POSITION_MAP = {
    "top": "top",
    "jng": "jungle",
    "jungle": "jungle",
    "mid": "mid",
    "bot": "adc",
    "adc": "adc",
    "sup": "support",
    "support": "support",
}

# Chronological order within a competitive year for the split dropdown.
SEASON_ORDER = {
    "Winter": 0,
    "First Stand": 1,
    "Spring": 2,
    "MSI": 3,
    "Summer": 4,
    "Worlds": 5,
}

INTERNATIONAL_FROM_LEAGUE = {
    "MSI": "MSI",
    "WLDs": "Worlds",
    "FST": "First Stand",
}

INTERNATIONAL_PATTERNS = [
    (re.compile(r"first\s*stand|\bfst\b", re.I), "First Stand"),
    (re.compile(r"\bmsi\b", re.I), "MSI"),
    (re.compile(r"worlds|\bwlds\b", re.I), "Worlds"),
]

PLAYOFF_MARKERS = re.compile(
    r"playoffs?|play[\s-]?in|regional\s+final|placements|kickoff",
    re.I,
)

WINTER_PATTERNS = [
    re.compile(r"\bcup\b", re.I),
    re.compile(r"lock[\s-]?in", re.I),
    re.compile(r"versus", re.I),
    re.compile(r"\bwinter\b", re.I),
]

SPRING_PATTERNS = [
    re.compile(r"rounds?\s*1[\s-]*2", re.I),
    re.compile(r"road\s+to\s+msi", re.I),
    re.compile(r"\bspring\b", re.I),
    re.compile(r"split\s*2\b", re.I),
]

SUMMER_PATTERNS = [
    re.compile(r"rounds?\s*3[\s-]*5", re.I),
    re.compile(r"rounds?\s*3[\s-]*4", re.I),
    re.compile(r"season\s+playoffs", re.I),
    re.compile(r"\bsummer\b", re.I),
    re.compile(r"split\s*3\b", re.I),
]

LEAGUE_OVERRIDES = {
    "LCK": [
        (re.compile(r"\bcup\b", re.I), "Winter"),
        (re.compile(r"rounds?\s*1[\s-]*2", re.I), "Spring"),
        (re.compile(r"rounds?\s*3[\s-]*5", re.I), "Summer"),
    ],
    "LPL": [
        (re.compile(r"split\s*1\b", re.I), "Spring"),
        (re.compile(r"split\s*2\b", re.I), "Spring"),
        (re.compile(r"split\s*3\b", re.I), "Summer"),
    ],
    "LCS": [
        (re.compile(r"lock[\s-]?in", re.I), "Winter"),
    ],
    "LEC": [
        (re.compile(r"versus", re.I), "Winter"),
        (re.compile(r"finals", re.I), "Summer"),
    ],
}

UNMAPPED_WARNINGS: set[str] = set()


def safe_float(val, default=0.0):
    try:
        return float(val) if val not in (None, "") else default
    except ValueError:
        return default


def week_start_key(date_raw: str) -> str | None:
    if not date_raw:
        return None
    try:
        text = str(date_raw).strip()[:10]
        dt = datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    monday = dt - timedelta(days=dt.weekday())
    return monday.strftime("%Y-%m-%d")


def safe_int(val, default=0):
    try:
        return int(float(val)) if val not in (None, "") else default
    except ValueError:
        return default


def normalize_position(raw: str) -> str:
    return POSITION_MAP.get((raw or "").lower(), raw or "")


def _match_patterns(text: str, patterns: list) -> bool:
    return any(p.search(text) for p in patterns)


def _match_named_patterns(text: str, patterns: list[tuple]) -> str | None:
    for pattern, label in patterns:
        if pattern.search(text):
            return label
    return None


def normalize_split(
    league: str,
    year: str,
    raw_split: str,
    playoffs: str,
) -> tuple[str, bool]:
    """
    Map a raw Oracle Elixir split value to a canonical season label.

    Returns (canonical_label, is_international).
    Playoffs rows are merged into their parent season label.
    """
    split_text = (raw_split or "").strip()
    combined = split_text
    if str(playoffs) == "1" and split_text:
        combined = f"{split_text} Playoffs"

    if league in INTERNATIONAL_LEAGUES:
        return INTERNATIONAL_FROM_LEAGUE.get(league, league), True

    for pattern, label in INTERNATIONAL_PATTERNS:
        if pattern.search(combined) or pattern.search(league):
            return label, True

    for pattern, label in LEAGUE_OVERRIDES.get(league, []):
        if pattern.search(combined) or pattern.search(split_text):
            return label, False

    is_playoff_row = str(playoffs) == "1" or bool(PLAYOFF_MARKERS.search(combined))
    if is_playoff_row and not any(p.search(combined) for p, _ in INTERNATIONAL_PATTERNS):
        combined = PLAYOFF_MARKERS.sub("", combined).strip(" -")

    if _match_patterns(combined, WINTER_PATTERNS):
        return "Winter", False
    if _match_patterns(combined, SPRING_PATTERNS):
        return "Spring", False
    if _match_patterns(combined, SUMMER_PATTERNS):
        return "Summer", False

    label = _match_named_patterns(combined, INTERNATIONAL_PATTERNS)
    if label:
        return label, True

    fallback = combined or split_text or "Unknown"
    warning_key = f"{league}|{year}|{raw_split}|playoffs={playoffs}"
    if warning_key not in UNMAPPED_WARNINGS:
        UNMAPPED_WARNINGS.add(warning_key)
        print(
            f"WARNING: Unmapped split '{raw_split}' (league={league}, year={year}, playoffs={playoffs}); "
            f"using raw value '{fallback}'",
            file=sys.stderr,
        )
    return fallback, False


def canonical_split_key(league: str, year: str, raw_split: str, playoffs: str) -> str:
    label, _ = normalize_split(league, year, raw_split, playoffs)
    return f"{year} {label}"


def split_sort_key(split_label: str) -> tuple:
    parts = split_label.split(" ", 1)
    year = int(parts[0]) if parts and parts[0].isdigit() else 0
    season = parts[1] if len(parts) > 1 else parts[0]
    return (year, SEASON_ORDER.get(season, 99), season.lower())


def player_bucket():
    return {
        "games": 0,
        "kills": 0,
        "deaths": 0,
        "assists": 0,
        "kp": [],
        "dmgShare": [],
        "gd15": [],
        "csd15": [],
        "xpd15": [],
        "dpm": [],
        "visionScore": [],
        "goldShare": [],
        "firstBloodGames": [],
        "objControl": [],
        "team": "",
        "league": "",
        "position": "",
    }


def team_bucket():
    return {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "kills": 0,
        "deaths": 0,
        "assists": 0,
        "towers": 0,
        "dragons": 0,
        "barons": 0,
        "heralds": 0,
        "gd15": [],
        "gamelength": [],
        "totalgold": [],
        "wardsplaced": [],
        "firstbloodgames": [],
        "league": "",
    }


def champ_bucket():
    return {
        "picks": 0,
        "bans": 0,
        "wins": 0,
        "kills": 0,
        "deaths": 0,
        "assists": 0,
        "positions": set(),
        "csd15": [],
        "dpm": [],
        "goldpermin": [],
        "recentresults": [],
        "weekly": defaultdict(lambda: {"picks": 0, "bans": 0}),
        "gameDates": [],
    }


def slice_store():
    return {
        "players": defaultdict(player_bucket),
        "teams": defaultdict(team_bucket),
        "champions": defaultdict(champ_bucket),
        "team_champions": defaultdict(lambda: {"picks": 0, "wins": 0}),
        "game_teams": defaultdict(list),
        "team_games": 0,
        "weekly_team_games": defaultdict(int),
    }


def compile_players(players_dict):
    out = []
    for name, p in players_dict.items():
        games = p["games"]
        if games < MIN_PLAYER_GAMES:
            continue
        deaths = max(p["deaths"], 1)
        out.append(
            {
                "name": name,
                "team": p["team"],
                "league": p["league"],
                "position": p["position"],
                "games": games,
                "kills": p["kills"],
                "deaths": p["deaths"],
                "assists": p["assists"],
                "kda": round((p["kills"] + p["assists"]) / deaths, 2),
                "kp": round(sum(p["kp"]) / len(p["kp"]), 1) if p["kp"] else 0,
                "dmgShare": round(sum(p["dmgShare"]) / len(p["dmgShare"]), 1) if p["dmgShare"] else 0,
                "gd15": round(sum(p["gd15"]) / len(p["gd15"]), 1) if p["gd15"] else 0,
                "csd15": round(sum(p["csd15"]) / len(p["csd15"]), 1) if p["csd15"] else 0,
                "xpd15": round(sum(p["xpd15"]) / len(p["xpd15"]), 1) if p["xpd15"] else 0,
                "dpm": round(sum(p["dpm"]) / len(p["dpm"]), 1) if p["dpm"] else 0,
                "visionScore": round(sum(p["visionScore"]) / len(p["visionScore"]), 1)
                if p["visionScore"]
                else 0,
                "goldShare": round(sum(p["goldShare"]) / len(p["goldShare"]), 1) if p["goldShare"] else 0,
                "firstBloodRate": round(sum(p["firstBloodGames"]) / games * 100, 1) if games else 0,
                "objControl": round(sum(p["objControl"]) / len(p["objControl"]), 2) if p["objControl"] else 0,
            }
        )
    out.sort(key=lambda x: x["kda"], reverse=True)
    return out


def compile_teams(teams_dict):
    out = []
    for name, t in teams_dict.items():
        games = t["games"]
        if games < MIN_TEAM_GAMES:
            continue
        deaths = max(t["deaths"], 1)
        out.append(
            {
                "name": name,
                "league": t["league"],
                "games": games,
                "wins": t["wins"],
                "losses": t["losses"],
                "kills": t["kills"],
                "deaths": t["deaths"],
                "assists": t["assists"],
                "winrate": round(t["wins"] / games * 100, 1),
                "avgKda": round((t["kills"] + t["assists"]) / deaths, 2),
                "avgGd15": round(sum(t["gd15"]) / len(t["gd15"]), 1) if t["gd15"] else 0,
                "towers": t["towers"],
                "dragons": t["dragons"],
                "barons": t["barons"],
                "heralds": t["heralds"],
                "dragonsPerGame": round(t["dragons"] / games, 2),
                "baronsPerGame": round(t["barons"] / games, 2),
                "towersPerGame": round(t["towers"] / games, 2),
                "heraldsPerGame": round(t["heralds"] / games, 2),
                "objPerGame": round((t["dragons"] + t["barons"] + t["heralds"]) / games, 2),
                "avgGameLength": round(sum(t["gamelength"]) / len(t["gamelength"]), 0)
                if t["gamelength"]
                else 0,
                "goldPerMin": round(
                    sum(
                        (tg / gl) * 60
                        for tg, gl in zip(t["totalgold"], t["gamelength"])
                        if gl > 0
                    )
                    / max(len([gl for gl in t["gamelength"] if gl > 0]), 1),
                    1,
                ),
                "wardsPerMin": round(
                    sum(
                        (w / gl) * 60
                        for w, gl in zip(t["wardsplaced"], t["gamelength"])
                        if gl > 0
                    )
                    / max(len([gl for gl in t["gamelength"] if gl > 0]), 1),
                    2,
                ),
                "firstBloodRate": round(sum(t["firstbloodgames"]) / games * 100, 1) if games else 0,
            }
        )
    out.sort(key=lambda x: x["winrate"], reverse=True)
    return out


def compile_champions(champs_dict, team_games: int, weekly_team_games: dict):
    out = []
    denom = max(team_games / 12, 1)
    for name, c in champs_dict.items():
        picks = c["picks"]
        if picks < MIN_CHAMP_PICKS:
            continue
        deaths = max(c["deaths"], 1)
        total = picks + c["bans"]
        out.append(
            {
                "name": name,
                "positions": sorted(c["positions"]),
                "picks": picks,
                "bans": c["bans"],
                "wins": c["wins"],
                "kills": c["kills"],
                "deaths": c["deaths"],
                "assists": c["assists"],
                "presence": round(total / denom * 100, 1),
                "pickRate": round(picks / denom * 100, 1),
                "banRate": round(c["bans"] / denom * 100, 1),
                "winrate": round(c["wins"] / picks * 100, 1) if picks else 0,
                "avgKda": round((c["kills"] + c["assists"]) / deaths, 2),
                "games": picks,
                "avgCsd15": round(sum(c["csd15"]) / len(c["csd15"]), 1) if c["csd15"] else 0,
                "avgDpm": round(sum(c["dpm"]) / len(c["dpm"]), 1) if c["dpm"] else 0,
                "avgGoldPerMin": round(sum(c["goldpermin"]) / len(c["goldpermin"]), 1)
                if c["goldpermin"]
                else 0,
                "sparkline": list(c["recentresults"][-8:]),
                "primaryRole": sorted(c["positions"])[0] if c["positions"] else "",
                "weeklyStats": [
                    {
                        "weekStart": wk,
                        "picks": c["weekly"][wk]["picks"],
                        "bans": c["weekly"][wk]["bans"],
                        "presence": round(
                            (c["weekly"][wk]["picks"] + c["weekly"][wk]["bans"])
                            / max(weekly_team_games.get(wk, 0) / 12, 1)
                            * 100,
                            1,
                        ),
                    }
                    for wk in sorted(c["weekly"].keys())
                ],
                "gameDates": sorted(set(c["gameDates"])),
            }
        )
    out.sort(key=lambda x: x["presence"], reverse=True)
    return out


def compile_matchups(game_teams):
    counts = defaultdict(lambda: {"games": 0, "winsA": 0, "winsB": 0})
    for sides in game_teams.values():
        if len(sides) != 2:
            continue
        a, b = sides
        key = tuple(sorted([a["team"], b["team"]]))
        counts[key]["games"] += 1
        if a["team"] == key[0]:
            if a["result"] == "1":
                counts[key]["winsA"] += 1
            else:
                counts[key]["winsB"] += 1
        else:
            if b["result"] == "1":
                counts[key]["winsA"] += 1
            else:
                counts[key]["winsB"] += 1
    return [
        {
            "teamA": key[0],
            "teamB": key[1],
            "games": v["games"],
            "winsA": v["winsA"],
            "winsB": v["winsB"],
        }
        for key, v in counts.items()
        if v["games"] > 0
    ]


def compile_team_champions(team_champions):
    out = []
    for (team, champion), stats in team_champions.items():
        picks = stats["picks"]
        if picks < 1:
            continue
        out.append(
            {
                "team": team,
                "champion": champion,
                "picks": picks,
                "winrate": round(stats["wins"] / picks * 100, 1) if picks else 0,
            }
        )
    return out


def compile_slice(store):
    return {
        "players": compile_players(store["players"]),
        "teams": compile_teams(store["teams"]),
        "champions": compile_champions(
            store["champions"], store["team_games"], dict(store["weekly_team_games"])
        ),
        "weeklyTeamGames": dict(store["weekly_team_games"]),
        "matchups": compile_matchups(store["game_teams"]),
        "teamChampions": compile_team_champions(store["team_champions"]),
    }


def resolve_bucket_key(
    row,
    team_to_league: dict[str, str],
) -> tuple[str, str] | None:
    league = row.get("league", "")
    year = row.get("year", "")
    raw_split = row.get("split", "")
    playoffs = row.get("playoffs", "0")
    team_name = row.get("teamname", "")

    if league not in ALLOWED_LEAGUES:
        return None

    sk = canonical_split_key(league, year, raw_split, playoffs)
    _, is_international = normalize_split(league, year, raw_split, playoffs)

    if league in TARGET_LEAGUES:
        return sk, league

    if league in INTERNATIONAL_LEAGUES or is_international:
        home_league = team_to_league.get(team_name)
        if home_league not in TARGET_LEAGUES:
            return None
        return sk, home_league

    return None


def process_row(row, buckets: dict, team_to_league: dict[str, str]):
    league = row.get("league", "")
    if league not in ALLOWED_LEAGUES:
        return

    completeness = row.get("datacompleteness", "")
    if completeness not in ALLOWED_COMPLETENESS:
        return

    team_name = row.get("teamname", "")
    if league in TARGET_LEAGUES and team_name:
        team_to_league[team_name] = league

    bucket_ref = resolve_bucket_key(row, team_to_league)
    if not bucket_ref:
        return
    sk, bucket_league = bucket_ref
    bucket = buckets[(sk, bucket_league)]

    position = row.get("position", "")
    player_name = row.get("playername") or row.get("name", "")
    champion = row.get("champion", "")
    result = row.get("result", "")
    game_id = row.get("gameid", "")

    if position == "team":
        if not team_name:
            return
        t = bucket["teams"][team_name]
        t["games"] += 1
        t["league"] = bucket_league
        bucket["team_games"] += 1
        if result == "1":
            t["wins"] += 1
        else:
            t["losses"] += 1
        t["towers"] += safe_int(row.get("towers", 0))
        t["dragons"] += safe_int(row.get("dragons", 0))
        t["barons"] += safe_int(row.get("barons", 0))
        t["heralds"] += safe_int(row.get("heralds", 0))
        t["kills"] += safe_int(row.get("kills", 0))
        t["deaths"] += safe_int(row.get("deaths", 0))
        t["assists"] += safe_int(row.get("assists", 0))
        t["gd15"].append(safe_float(row.get("golddiffat15", 0)))
        gl = safe_float(row.get("gamelength", 0))
        if gl > 0:
            t["gamelength"].append(gl)
            t["totalgold"].append(safe_float(row.get("totalgold", 0)))
            t["wardsplaced"].append(safe_float(row.get("wardsplaced", 0)))
        t["firstbloodgames"].append(1 if safe_int(row.get("firstblood", 0)) else 0)
        week_key = week_start_key(row.get("date", ""))
        if week_key:
            bucket["weekly_team_games"][week_key] += 1
        if game_id:
            bucket["game_teams"][game_id].append(
                {"team": team_name, "result": result, "league": bucket_league}
            )
        for i in range(1, 6):
            ban = row.get(f"ban{i}", "")
            if ban:
                bucket["champions"][ban]["bans"] += 1
                if week_key:
                    bucket["champions"][ban]["weekly"][week_key]["bans"] += 1
        return

    pos = normalize_position(position)
    if pos not in {"top", "jungle", "mid", "adc", "support"}:
        return

    if player_name:
        p = bucket["players"][player_name]
        p["games"] += 1
        p["team"] = team_name
        p["league"] = bucket_league
        p["position"] = pos
        p["kills"] += safe_int(row.get("kills", 0))
        p["deaths"] += safe_int(row.get("deaths", 0))
        p["assists"] += safe_int(row.get("assists", 0))
        team_kills = safe_float(row.get("teamkills", 0))
        if team_kills > 0:
            kp_val = (safe_int(row.get("kills", 0)) + safe_int(row.get("assists", 0))) / team_kills * 100
        else:
            kp_val = safe_float(row.get("killparticipation", 0)) * 100
        p["kp"].append(kp_val)
        p["dmgShare"].append(safe_float(row.get("damageshare", 0)) * 100)
        p["gd15"].append(safe_float(row.get("golddiffat15", 0)))
        p["csd15"].append(safe_float(row.get("csdiffat15", 0)))
        p["xpd15"].append(safe_float(row.get("xpdiffat15", 0)))
        p["dpm"].append(safe_float(row.get("dpm", 0)))
        p["visionScore"].append(safe_float(row.get("visionscore", 0)))
        p["goldShare"].append(safe_float(row.get("earnedgoldshare", 0)) * 100)
        fb_involved = 1 if (
            safe_int(row.get("firstbloodkill", 0)) or safe_int(row.get("firstbloodassist", 0))
        ) else 0
        p["firstBloodGames"].append(fb_involved)
        obj_total = (
            safe_int(row.get("dragons", 0))
            + safe_int(row.get("heralds", 0))
            + safe_int(row.get("barons", 0))
            + safe_int(row.get("void_grubs", 0))
        )
        p["objControl"].append(float(obj_total))

    if champion and team_name:
        c = bucket["champions"][champion]
        week_key = week_start_key(row.get("date", ""))
        date_only = str(row.get("date", "")).strip()[:10] if row.get("date") else None
        c["picks"] += 1
        c["positions"].add(pos)
        if week_key:
            c["weekly"][week_key]["picks"] += 1
        if date_only:
            c["gameDates"].append(date_only)
        c["kills"] += safe_int(row.get("kills", 0))
        c["deaths"] += safe_int(row.get("deaths", 0))
        c["assists"] += safe_int(row.get("assists", 0))
        c["csd15"].append(safe_float(row.get("csdiffat15", 0)))
        c["dpm"].append(safe_float(row.get("dpm", 0)))
        gl = safe_float(row.get("gamelength", 0))
        if gl > 0:
            c["goldpermin"].append(safe_float(row.get("earnedgold", 0)) / gl * 60)
        c["recentresults"].append(1 if result == "1" else 0)
        if len(c["recentresults"]) > 12:
            c["recentresults"] = c["recentresults"][-12:]
        if result == "1":
            c["wins"] += 1
        tc = bucket["team_champions"][(team_name, champion)]
        tc["picks"] += 1
        if result == "1":
            tc["wins"] += 1


def ingest():
    missing = [str(p) for p in CSV_FILES if not p.exists()]
    if missing:
        if OUT_PATH.exists():
            print("WARNING: Missing CSV files; keeping existing data store:", file=sys.stderr)
            for path in missing:
                print(f"  - {path}", file=sys.stderr)
            print(f"Using existing {OUT_PATH}", file=sys.stderr)
            return
        print("ERROR: Missing CSV files and no existing data store:", file=sys.stderr)
        for path in missing:
            print(f"  - {path}", file=sys.stderr)
        print("Place Oracle's Elixir CSV files in lol/ or run from project root.", file=sys.stderr)
        sys.exit(1)

    buckets: dict[tuple[str, str], dict] = defaultdict(slice_store)
    team_to_league: dict[str, str] = {}

    # Pass 1: build team → home league map from regional tier-1 rows.
    for csv_path in CSV_FILES:
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                league = row.get("league", "")
                if league not in TARGET_LEAGUES:
                    continue
                if row.get("datacompleteness", "") not in ALLOWED_COMPLETENESS:
                    continue
                team_name = row.get("teamname", "")
                if team_name:
                    team_to_league[team_name] = league

    # Pass 2: aggregate into canonical split/league buckets.
    for csv_path in CSV_FILES:
        print(f"Reading {csv_path.name}...")
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                process_row(row, buckets, team_to_league)

    slices = {}
    split_set = set()
    for (sk, league), store in buckets.items():
        split_set.add(sk)
        slices[f"{sk}|{league}"] = compile_slice(store)

    meta = {
        "source": "Oracle's Elixir",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "leagues": sorted(TARGET_LEAGUES),
        "splits": sorted(split_set, key=split_sort_key),
        "schema_version": "2.1",
        "csv_files": [p.name for p in CSV_FILES],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"meta": meta, "slices": slices}
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote {OUT_PATH} ({size_kb:.1f} KB)")
    print(f"  Splits: {len(meta['splits'])}")
    print(f"  Slice keys: {len(slices)}")
    if UNMAPPED_WARNINGS:
        print(f"  Unmapped split warnings: {len(UNMAPPED_WARNINGS)}", file=sys.stderr)


if __name__ == "__main__":
    ingest()
