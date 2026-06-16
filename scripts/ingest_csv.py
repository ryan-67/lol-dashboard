#!/usr/bin/env python3
"""
Ingest Oracle's Elixir CSV files from lol/ into a slice-indexed JSON store.

Usage:
    python scripts/ingest_csv.py

Reads:
    lol/*_LoL_esports_match_data_from_OraclesElixir.csv
    lol/*_oracle_elixir.csv (legacy mirror naming)

Writes:
    public/data/oe_slices.json (manifest with year_files; not read by the frontend)
    public/data/oe_slices_YYYY.json (year shards — source for scripts/seed_supabase.py)
"""

from __future__ import annotations

import json
import csv
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import (  # noqa: E402
    REGIONAL_SPLIT_MARKERS,
    TIER1_LEAGUES,
    discover_local_csv_files,
    normalize_oe_row,
)

LOL_DIR = ROOT / "lol"
OUT_DIR = ROOT / "public" / "data"
OUT_PATH = OUT_DIR / "oe_slices.json"

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


def row_lookup(row, keys, default=0, as_float=False):
    for key in keys:
        val = row.get(key)
        if val not in (None, ""):
            return safe_float(val) if as_float else safe_int(val)
    return default


def aggregate_advanced_from_gamelog(game_log, games):
    if not game_log:
        return {}
    valid_dgr = []
    for g in game_log:
        ratio = g.get("dmgGoldRatio")
        if not ratio and g.get("goldShare", 0) > 0:
            ratio = (g.get("dmgShare", 0) or 0) / g["goldShare"]
        if ratio and ratio > 0:
            valid_dgr.append(ratio)
    valid_dpg = []
    for g in game_log:
        dpg = g.get("dmgPerGold")
        if not dpg and g.get("dpm") and g.get("gpm", 0) > 0:
            dpg = g["dpm"] / g["gpm"]
        if dpg and dpg > 0:
            valid_dpg.append(dpg)
    return {
        "soloKills": round(sum(g.get("soloKills", 0) for g in game_log) / games, 2),
        "objectivesStolen": int(sum(g.get("objectivesStolen", 0) for g in game_log)),
        "wardsDestroyed": round(sum(g.get("wardsDestroyed", 0) for g in game_log) / games, 1),
        "kaPerMin": round(sum(g.get("kaPerMin", 0) for g in game_log) / len(game_log), 2),
        "dmgGoldRatio": round(sum(valid_dgr) / len(valid_dgr), 3) if valid_dgr else 0,
        "dmgPerGold": round(sum(valid_dpg) / len(valid_dpg), 4) if valid_dpg else 0,
    }


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
    date_raw: str = "",
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

    if not (combined or split_text):
        text = str(date_raw).strip()[:10]
        try:
            month = datetime.strptime(text, "%Y-%m-%d").month
            return ("Spring" if month <= 6 else "Summer"), False
        except ValueError:
            pass

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


def canonical_split_key(league: str, year: str, raw_split: str, playoffs: str, date_raw: str = "") -> str:
    label, _ = normalize_split(league, year, raw_split, playoffs, date_raw)
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
        "gameLog": [],
        "champions": defaultdict(lambda: {"picks": 0, "wins": 0}),
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
        "void_grubs": 0,
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
        "weekly": defaultdict(lambda: {"picks": 0, "bans": 0, "wins": 0}),
        "gameDates": [],
    }


def slice_store():
    return {
        "players": defaultdict(player_bucket),
        "teams": defaultdict(team_bucket),
        "champions": defaultdict(champ_bucket),
        "team_champions": defaultdict(lambda: {"picks": 0, "wins": 0, "pick_slots": []}),
        "game_teams": defaultdict(list),
        "game_team_gold": defaultdict(dict),
        "team_games": 0,
        "weekly_team_games": defaultdict(int),
    }


def backfill_game_log_opponents(players_dict, game_teams):
    """Resolve opponent team names and side after all rows are processed."""
    for p in players_dict.values():
        team_name = p.get("team") or ""
        for g in p["gameLog"]:
            game_id = g.get("gameId") or g.pop("_gameId", "")
            if not g.get("opponent") and game_id:
                sides = game_teams.get(game_id) or []
                for side in sides:
                    opp_team = side.get("team") or ""
                    if opp_team and opp_team != team_name:
                        g["opponent"] = opp_team
                        break
            if not g.get("side") and game_id:
                sides = game_teams.get(game_id) or []
                for side in sides:
                    if side.get("team") == team_name and side.get("side"):
                        g["side"] = side["side"]
                        break
            if g.get("side"):
                g["side"] = str(g["side"]).strip().lower()


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
                **aggregate_advanced_from_gamelog(
                    sorted(p["gameLog"], key=lambda g: (g.get("date", ""), g.get("gameId", ""))),
                    games,
                ),
                "gameLog": sorted(p["gameLog"], key=lambda g: (g.get("date", ""), g.get("gameId", ""))),
                "championPool": [
                    {
                        "champion": champ,
                        "games": stats["picks"],
                        "wins": stats["wins"],
                        "losses": stats["picks"] - stats["wins"],
                        "winrate": round(stats["wins"] / stats["picks"] * 100, 1)
                        if stats["picks"]
                        else 0,
                    }
                    for champ, stats in sorted(
                        p["champions"].items(), key=lambda item: item[1]["picks"], reverse=True
                    )
                ],
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
                "voidGrubs": t["void_grubs"],
                "dragonsPerGame": round(t["dragons"] / games, 2),
                "baronsPerGame": round(t["barons"] / games, 2),
                "towersPerGame": round(t["towers"] / games, 2),
                "heraldsPerGame": round(t["heralds"] / games, 2),
                "voidGrubsPerGame": round(t["void_grubs"] / games, 2),
                "killsPerGame": round(t["kills"] / games, 2),
                "deathsPerGame": round(t["deaths"] / games, 2),
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
    # team_games counts team-rows (2 per match)
    denom = max(team_games / 2, 1)
    for name, c in champs_dict.items():
        picks = c["picks"]
        if picks < MIN_CHAMP_PICKS:
            continue
        deaths = max(c["deaths"], 1)
        pick_rate = min(100.0, round(picks / denom * 100, 1))
        ban_rate = min(100.0, round(c["bans"] / denom * 100, 1))
        presence = min(200.0, round(pick_rate + ban_rate, 1))
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
                "presence": presence,
                "pickRate": pick_rate,
                "banRate": ban_rate,
                "winrate": round(c["wins"] / picks * 100, 1) if picks else 0,
                "avgKda": round((c["kills"] + c["assists"]) / deaths, 2),
                "games": picks,
                "avgCsd15": round(sum(c["csd15"]) / len(c["csd15"]), 1) if c["csd15"] else 0,
                "avgDpm": round(sum(c["dpm"]) / len(c["dpm"]), 1) if c["dpm"] else 0,
                "avgGoldPerMin": round(sum(c["goldpermin"]) / len(c["goldpermin"]), 1)
                if c["goldpermin"]
                else 0,
                "sparkline": list(c["recentresults"][-10:]),
                "primaryRole": sorted(c["positions"])[0] if c["positions"] else "",
                "weeklyStats": [
                    {
                        "weekStart": wk,
                        "picks": c["weekly"][wk]["picks"],
                        "bans": c["weekly"][wk]["bans"],
                        "wins": c["weekly"][wk]["wins"],
                        "winrate": round(
                            c["weekly"][wk]["wins"] / c["weekly"][wk]["picks"] * 100, 1
                        )
                        if c["weekly"][wk]["picks"]
                        else 0,
                        "presence": min(
                            200.0,
                            round(
                                min(100.0, c["weekly"][wk]["picks"] / max(weekly_team_games.get(wk, 0) / 2, 1) * 100)
                                + min(100.0, c["weekly"][wk]["bans"] / max(weekly_team_games.get(wk, 0) / 2, 1) * 100),
                                1,
                            ),
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
        pick_slots = stats.get("pick_slots") or []
        avg_pick_order = None
        if pick_slots:
            avg_pick_order = round(sum(pick_slots) / len(pick_slots), 2)
        row = {
            "team": team,
            "champion": champion,
            "picks": picks,
            "winrate": round(stats["wins"] / picks * 100, 1) if picks else 0,
        }
        if avg_pick_order is not None:
            row["avgPickOrder"] = avg_pick_order
        out.append(row)
    return out


def compile_slice(store):
    backfill_game_log_opponents(store["players"], store["game_teams"])
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

    date_raw = row.get("date", "")
    sk = canonical_split_key(league, year, raw_split, playoffs, date_raw)
    _, is_international = normalize_split(league, year, raw_split, playoffs, date_raw)

    if league in TARGET_LEAGUES:
        return sk, league

    if league in INTERNATIONAL_LEAGUES or is_international:
        home_league = team_to_league.get(team_name)
        if home_league not in TARGET_LEAGUES:
            return None
        return sk, home_league

    return None


def log_tier1_coverage(slices: dict[str, dict]) -> None:
    by_split: dict[str, set[str]] = defaultdict(set)
    for key in slices:
        split, league = key.rsplit("|", 1)
        by_split[split].add(league)

    for split in sorted(by_split.keys(), key=split_sort_key):
        if not any(marker in split for marker in REGIONAL_SPLIT_MARKERS):
            continue
        leagues = sorted(by_split[split])
        missing = [league for league in TIER1_LEAGUES if league not in by_split[split]]
        print(f"  Tier-1 coverage {split}: {', '.join(leagues)}")
        if missing:
            print(
                f"  WARNING: missing tier-1 leagues for {split}: {', '.join(missing)}",
                file=sys.stderr,
            )


def process_row(row, buckets: dict, team_to_league: dict[str, str]):
    row = normalize_oe_row(row)
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
        t["void_grubs"] += safe_int(row.get("void_grubs", 0))
        t["kills"] += safe_int(row.get("kills", 0))
        t["deaths"] += safe_int(row.get("deaths", 0))
        t["assists"] += safe_int(row.get("assists", 0))
        t["gd15"].append(safe_float(row.get("golddiffat15", 0)))
        gl = safe_float(row.get("gamelength", 0))
        if gl > 0:
            t["gamelength"].append(gl)
            t["totalgold"].append(safe_float(row.get("totalgold", 0)))
            t["wardsplaced"].append(safe_float(row.get("wardsplaced", 0)))
        if game_id:
            timeline = []
            for minute in (10, 15, 20, 25, 30):
                raw = row.get(f"golddiffat{minute}")
                if raw not in (None, ""):
                    timeline.append({"minute": minute, "goldDiff": round(safe_float(raw), 1)})
            if timeline:
                bucket["game_team_gold"][game_id][team_name] = {
                    "timeline": timeline,
                    "gameLength": round(gl / 60, 1) if gl > 0 else None,
                }
        t["firstbloodgames"].append(1 if safe_int(row.get("firstblood", 0)) else 0)
        week_key = week_start_key(row.get("date", ""))
        if week_key:
            bucket["weekly_team_games"][week_key] += 1
        if game_id:
            side_val = str(row.get("side", "")).strip().lower()
            bucket["game_teams"][game_id].append(
                {"team": team_name, "result": result, "league": bucket_league, "side": side_val}
            )
        for i in range(1, 6):
            ban = row.get(f"ban{i}", "")
            if ban:
                bucket["champions"][ban]["bans"] += 1
                if week_key:
                    bucket["champions"][ban]["weekly"][week_key]["bans"] += 1
        for i in range(1, 6):
            pick = row.get(f"pick{i}", "")
            if pick and team_name:
                tc = bucket["team_champions"][(team_name, pick)]
                tc["pick_slots"].append(i)
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
        opponent = ""
        if game_id and game_id in bucket["game_teams"]:
            for side in bucket["game_teams"][game_id]:
                if side.get("team") and side["team"] != team_name:
                    opponent = side["team"]
                    break
        deaths_g = max(safe_int(row.get("deaths", 0)), 1)
        kills_g = safe_int(row.get("kills", 0))
        assists_g = safe_int(row.get("assists", 0))
        gl = safe_float(row.get("gamelength", 0))
        earned_gold = safe_float(row.get("earnedgold", 0))
        total_dmg = safe_float(row.get("damagetochampions", 0))
        dmg_share_pct = safe_float(row.get("damageshare", 0)) * 100
        gold_share_pct = safe_float(row.get("earnedgoldshare", 0)) * 100
        solo_kills = row_lookup(
            row,
            ("solokills", "solo_kills", "solokill", "solokillsat15"),
            0,
            as_float=False,
        )
        obj_stolen = row_lookup(
            row,
            ("objectivesstolen", "enemyobjectivesstolen", "stolenobjectives", "objstolen"),
            0,
            as_float=False,
        )
        wards_destroyed = row_lookup(
            row,
            ("wardskilled", "wardsdestroyed", "wards_destroyed", "wardscleared"),
            0,
            as_float=True,
        )
        ka_per_min = (kills_g + assists_g) / (gl / 60) if gl > 0 else 0.0
        dmg_per_gold = (total_dmg / earned_gold) if earned_gold > 0 else 0.0
        dmg_gold_ratio = (dmg_share_pct / gold_share_pct) if gold_share_pct > 0 else 0.0
        gpm = (earned_gold / gl * 60) if gl > 0 else 0.0
        date_only = str(row.get("date", "")).strip()[:10] if row.get("date") else ""
        entry = {
                "date": date_only,
                "result": 1 if result == "1" else 0,
                "champion": champion or "",
                "opponent": opponent,
                "split": sk,
                "league": bucket_league,
                "kda": round((kills_g + assists_g) / deaths_g, 2),
                "kp": round(kp_val, 1),
                "dmgShare": round(safe_float(row.get("damageshare", 0)) * 100, 1),
                "gd15": round(safe_float(row.get("golddiffat15", 0)), 1),
                "csd15": round(safe_float(row.get("csdiffat15", 0)), 1),
                "xpd15": round(safe_float(row.get("xpdiffat15", 0)), 1),
                "dpm": round(safe_float(row.get("dpm", 0)), 1),
                "visionScore": round(safe_float(row.get("visionscore", 0)), 1),
                "goldShare": round(safe_float(row.get("earnedgoldshare", 0)) * 100, 1),
                "firstBloodRate": 100.0 if fb_involved else 0.0,
                "objControl": float(obj_total),
                "soloKills": solo_kills,
                "objectivesStolen": obj_stolen,
                "wardsDestroyed": round(wards_destroyed, 1),
                "kaPerMin": round(ka_per_min, 2),
                "dmgGoldRatio": round(dmg_gold_ratio, 3),
                "dmgPerGold": round(dmg_per_gold, 4),
                "gpm": round(gpm, 1),
                "gameLength": round(gl / 60, 1) if gl > 0 else None,
            }
        side_val = str(row.get("side", "")).strip().lower()
        if side_val:
            entry["side"] = side_val
        if game_id:
            entry["gameId"] = game_id
            gold_meta = bucket["game_team_gold"].get(game_id, {}).get(team_name)
            if gold_meta:
                entry["goldTimeline"] = gold_meta.get("timeline") or []
                if gold_meta.get("gameLength"):
                    entry["gameLength"] = gold_meta["gameLength"]
        p["gameLog"].append(entry)
        if champion:
            cp = p["champions"][champion]
            cp["picks"] += 1
            if result == "1":
                cp["wins"] += 1

    if champion and team_name:
        c = bucket["champions"][champion]
        week_key = week_start_key(row.get("date", ""))
        date_only = str(row.get("date", "")).strip()[:10] if row.get("date") else None
        c["picks"] += 1
        c["positions"].add(pos)
        if week_key:
            c["weekly"][week_key]["picks"] += 1
            if result == "1":
                c["weekly"][week_key]["wins"] += 1
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
        if len(c["recentresults"]) > 14:
            c["recentresults"] = c["recentresults"][-14:]
        if result == "1":
            c["wins"] += 1
        tc = bucket["team_champions"][(team_name, champion)]
        tc["picks"] += 1
        if result == "1":
            tc["wins"] += 1


def ingest():
    csv_files = discover_local_csv_files(LOL_DIR)
    if not csv_files:
        if OUT_PATH.exists():
            print("WARNING: No OE CSV files found in lol/; keeping existing data store.", file=sys.stderr)
            print(f"Using existing {OUT_PATH}", file=sys.stderr)
            return
        print("ERROR: No Oracle's Elixir CSV files found and no existing data store:", file=sys.stderr)
        print("Place Oracle's Elixir CSV files in lol/ or run from project root.", file=sys.stderr)
        sys.exit(1)

    missing = [str(p) for p in csv_files if not p.exists()]
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
    for csv_path in csv_files:
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
    for csv_path in csv_files:
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
        "csv_files": [p.name for p in csv_files],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    slices_by_year: dict[str, dict] = defaultdict(dict)
    for key, value in slices.items():
        year = key.split(" ", 1)[0]
        slices_by_year[year][key] = value

    shard_files: dict[str, str] = {}
    for year, year_slices in sorted(slices_by_year.items()):
        shard_name = f"oe_slices_{year}.json"
        shard_path = OUT_DIR / shard_name
        with shard_path.open("w", encoding="utf-8") as f:
            json.dump({"slices": year_slices}, f, separators=(",", ":"))
        shard_files[year] = shard_name
        print(f"  Wrote shard {shard_name} ({shard_path.stat().st_size / 1024:.1f} KB)")

    # Remove old shard files no longer present.
    keep = {"oe_slices.json", *shard_files.values()}
    for existing in OUT_DIR.glob("oe_slices_*.json"):
        if existing.name not in keep:
            existing.unlink(missing_ok=True)

    payload = {"meta": meta, "year_files": shard_files}
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote manifest {OUT_PATH} ({size_kb:.1f} KB)")
    print(f"  Splits: {len(meta['splits'])}")
    print(f"  Slice keys: {len(slices)}")
    log_tier1_coverage(slices)
    if UNMAPPED_WARNINGS:
        print(f"  Unmapped split warnings: {len(UNMAPPED_WARNINGS)}", file=sys.stderr)


if __name__ == "__main__":
    ingest()
