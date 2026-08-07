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

Environment:
    OE_DOWNLOAD_YEARS — optional scope for which CSV years to ingest into dashboard
    shards (default: all local CSVs). CI sets this to `current` so ML's full lol/
    history backfill does not regenerate every historical year shard for git.
"""

from __future__ import annotations

import json
import csv
import os
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
    extract_csv_year,
    normalize_oe_row,
    parse_download_years,
    parse_playoffs_flag,
    resolve_playoffs_from_row,
)

LOL_DIR = ROOT / "lol"
OUT_DIR = ROOT / "public" / "data"
OUT_PATH = OUT_DIR / "oe_slices.json"
# Cloudflare Pages rejects any single static asset over 25 MiB. Pack year
# shards into parts under this ceiling (headroom for JSON framing).
CLOUDFLARE_PAGES_MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_SHARD_BYTES = 24 * 1024 * 1024

TARGET_LEAGUES = {"LCK", "LPL", "LEC", "LCS"}
INTERNATIONAL_LEAGUES = {"MSI", "WLDs", "FST", "EWC"}
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
    "EWC": 4,
    "Summer": 5,
    "Worlds": 6,
}

INTERNATIONAL_FROM_LEAGUE = {
    "MSI": "MSI",
    "WLDs": "Worlds",
    "FST": "First Stand",
    "EWC": "EWC",
}

INTERNATIONAL_SPLIT_MARKERS = ("MSI", "Worlds", "First Stand", "EWC")

# Alternate OE team names → home tier-1 league (used when MSI/Worlds rows arrive before regional map).
TEAM_HOME_LEAGUE_FALLBACK: dict[str, str] = {
    "Disguised": "LCS",
    "DSG": "LCS",
    "Movistar KOI": "LEC",
    "GIANTX": "LEC",
    "GiantX": "LEC",
    "GX": "LEC",
    "FlyQuest": "LCS",
    "FLY": "LCS",
    "Shopify Rebellion": "LCS",
    "SR": "LCS",
    "100 Thieves": "LCS",
    "100T": "LCS",
    "NRG Esports": "LCS",
    "NRG": "LCS",
    "LYON": "LEC",
    "Team Heretics": "LEC",
    "TH": "LEC",
  "Deep Cross Gaming": "INT",
  "DCG": "INT",
  "Deep Cross": "INT",
}

MINOR_LEAGUE = "INT"
GUEST_LOOKBACK_YEARS = 1

INTERNATIONAL_PATTERNS = [
    (re.compile(r"first\s*stand|\bfst\b", re.I), "First Stand"),
    (re.compile(r"\bmsi\b", re.I), "MSI"),
    (re.compile(r"\bewc\b|esports\s*world\s*cup", re.I), "EWC"),
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
        (re.compile(r"split\s*1\b", re.I), "Winter"),
        (re.compile(r"split\s*2\b", re.I), "Spring"),
        (re.compile(r"split\s*3\b", re.I), "Summer"),
    ],
    "LCS": [
        (re.compile(r"lock[\s-]?in", re.I), "Winter"),
    ],
    "LEC": [
        (re.compile(r"versus", re.I), "Winter"),
        # NOTE: do NOT map bare "finals" → Summer. LEC Spring Finals historically
        # used "Finals" in the split string and must stay under Spring; Summer
        # Finals will match SUMMER_PATTERNS via "summer" / date once that split
        # actually starts.
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
    lower = {str(k).lower(): v for k, v in row.items()}
    for key in keys:
        val = lower.get(str(key).lower())
        if val not in (None, ""):
            return safe_float(val) if as_float else safe_int(val)
    return default


def row_has_value(row, keys) -> bool:
    lower = {str(k).lower(): v for k, v in row.items()}
    for key in keys:
        val = lower.get(str(key).lower())
        if val not in (None, ""):
            return True
    return False


def resolve_at15_from_row(row) -> tuple[float | None, float | None, float | None]:
    """
    Resolve lane diffs at 15 from OE row.

    LPL rows are datacompleteness=partial and often omit golddiffat15/csdiffat15/xpdiffat15
    entirely (not zero). Return None when missing so ingest does not average fake zeros.
    """
    gd = row.get("golddiffat15")
    csd = row.get("csdiffat15")
    xpd = row.get("xpdiffat15")

    def diff_or_compute(val, at_key, opp_at_key):
        if val not in (None, ""):
            return safe_float(val)
        at = row.get(at_key)
        opp = row.get(opp_at_key)
        if at not in (None, "") and opp not in (None, ""):
            return safe_float(at) - safe_float(opp)
        return None

    return (
        diff_or_compute(gd, "goldat15", "opp_goldat15"),
        diff_or_compute(csd, "csat15", "opp_csat15"),
        diff_or_compute(xpd, "xpat15", "opp_xpat15"),
    )


def append_if_present(bucket_list: list, value: float | None) -> None:
    if value is not None:
        bucket_list.append(value)


def resolve_camps_stolen(row, position: str) -> int:
    """
    Enemy jungle camps stolen (OE monsterkillsenemyjungle).

    LPL partial rows include the column; LCK/LEC/LCS complete rows do not.
    """
    if normalize_position(position) != "jungle":
        return 0

    enemy_keys = ("monsterkillsenemyjungle", "monster_kills_enemy_jungle")
    if row_has_value(row, enemy_keys):
        return row_lookup(row, enemy_keys, 0, as_float=False)

    own_keys = ("monsterkillsownjungle", "monster_kills_own_jungle")
    if row_has_value(row, own_keys):
        mk = row_lookup(row, ("monsterkills", "monster_kills"), 0, as_float=False)
        own = row_lookup(row, own_keys, 0, as_float=False)
        if mk > own:
            return mk - own

    return 0


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
        "campsStolen": round(sum(g.get("campsStolen", 0) for g in game_log) / games, 2),
        "wardsDestroyed": round(sum(g.get("wardsDestroyed", 0) for g in game_log) / games, 1),
        "kaPerMin": round(sum(g.get("kaPerMin", 0) for g in game_log) / len(game_log), 2),
        "dmgGoldRatio": round(sum(valid_dgr) / len(valid_dgr), 3) if valid_dgr else 0,
        "dmgPerGold": round(sum(valid_dpg) / len(valid_dpg), 4) if valid_dpg else 0,
        "turretPlates": round(sum(g.get("turretPlates", 0) for g in game_log) / games, 2),
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
    if parse_playoffs_flag(playoffs) and split_text:
        combined = f"{split_text} Playoffs"

    if league in INTERNATIONAL_LEAGUES:
        return INTERNATIONAL_FROM_LEAGUE.get(league, league), True

    for pattern, label in INTERNATIONAL_PATTERNS:
        if pattern.search(combined) or pattern.search(league):
            return label, True

    for pattern, label in LEAGUE_OVERRIDES.get(league, []):
        if pattern.search(combined) or pattern.search(split_text):
            return label, False

    is_playoff_row = parse_playoffs_flag(playoffs) or bool(PLAYOFF_MARKERS.search(combined))
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
        "csd15": [],
        "xpd15": [],
        "ka15": [],
        "gamelength": [],
        "totalgold": [],
        "wardsplaced": [],
        "firstbloodgames": [],
        "firstbloodvictimgames": [],
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
        "game_team_meta": defaultdict(dict),
        "game_catalog": defaultdict(
            lambda: {"teams": {}, "patch": "", "gameLength": None}
        ),
        "team_games": 0,
        "weekly_team_games": defaultdict(int),
        # Guards against double-counting when the same game appears in more than one
        # source CSV (overlapping dumps). Keyed by (gameid, entity).
        "seen_rows": set(),
        # Per (team, game): True if any player on that team was first-blood victim.
        "team_fb_victim": {},
        "team_fb_victim_seen": set(),
    }


def teams_name_match(a: str, b: str) -> bool:
    return a.lower().strip() == b.lower().strip()


def backfill_game_log_opponents(players_dict, game_teams):
    """Resolve opponent team names and side after all rows are processed."""
    for p in players_dict.values():
        team_name = p.get("team") or ""
        for g in p["gameLog"]:
            game_id = g.get("gameId") or g.pop("_gameId", "")
            if not game_id:
                continue
            sides = game_teams.get(game_id) or []
            teams_in_game: list[str] = []
            for side in sides:
                t = (side.get("team") or "").strip()
                if t and not any(teams_name_match(t, x) for x in teams_in_game):
                    teams_in_game.append(t)
            opponents = [t for t in teams_in_game if not teams_name_match(t, team_name)]
            if len(teams_in_game) >= 2 and opponents:
                g["opponent"] = opponents[0]
            elif not g.get("opponent") and len(opponents) == 1:
                g["opponent"] = opponents[0]
            if not g.get("side") and game_id:
                sides = game_teams.get(game_id) or []
                for side in sides:
                    if side.get("team") == team_name and side.get("side"):
                        g["side"] = side["side"]
                        break
            if g.get("side"):
                g["side"] = str(g["side"]).strip().lower()


def backfill_game_log_turret_plates(players_dict, game_team_meta):
    """OE stores turretplates on team rows, which are processed after player rows in the CSV."""
    for p in players_dict.values():
        team_name = p.get("team") or ""
        for g in p["gameLog"]:
            if g.get("turretPlates") is not None:
                continue
            game_id = g.get("gameId") or ""
            if not game_id:
                continue
            team_meta = game_team_meta.get(game_id, {}).get(team_name)
            if team_meta and team_meta.get("turretPlates") is not None:
                g["turretPlates"] = team_meta["turretPlates"]


def avg_lane_stat(bucket_list, game_log, key: str):
    if bucket_list:
        return round(sum(bucket_list) / len(bucket_list), 1)
    vals = [g[key] for g in (game_log or []) if g.get(key) is not None]
    if vals:
        return round(sum(vals) / len(vals), 1)
    return None


def is_international_split_key(split_key: str) -> bool:
    return any(marker in split_key for marker in INTERNATIONAL_SPLIT_MARKERS)


def compile_players(players_dict, min_games: int = MIN_PLAYER_GAMES):
    out = []
    for name, p in players_dict.items():
        games = p["games"]
        if games < min_games:
            continue
        deaths = max(p["deaths"], 1)
        game_log = sorted(p["gameLog"], key=lambda g: (g.get("date", ""), g.get("gameId", "")))
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
                "gd15": avg_lane_stat(p["gd15"], game_log, "gd15"),
                "csd15": avg_lane_stat(p["csd15"], game_log, "csd15"),
                "xpd15": avg_lane_stat(p["xpd15"], game_log, "xpd15"),
                "dpm": round(sum(p["dpm"]) / len(p["dpm"]), 1) if p["dpm"] else 0,
                "visionScore": round(sum(p["visionScore"]) / len(p["visionScore"]), 1)
                if p["visionScore"]
                else 0,
                "goldShare": round(sum(p["goldShare"]) / len(p["goldShare"]), 1) if p["goldShare"] else 0,
                "firstBloodRate": round(sum(p["firstBloodGames"]) / games * 100, 1) if games else 0,
                "objControl": round(sum(p["objControl"]) / len(p["objControl"]), 2) if p["objControl"] else 0,
                **aggregate_advanced_from_gamelog(game_log, games),
                "gameLog": game_log,
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


def compile_teams(teams_dict, min_games: int = MIN_TEAM_GAMES):
    out = []
    for name, t in teams_dict.items():
        games = t["games"]
        if games < min_games:
            continue
        deaths = max(t["deaths"], 1)
        team_entry = {
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
        if t["gd15"]:
            team_entry["avgGd15"] = round(sum(t["gd15"]) / len(t["gd15"]), 1)
        if t["csd15"]:
            team_entry["avgCsd15"] = round(sum(t["csd15"]) / len(t["csd15"]), 1)
        if t["xpd15"]:
            team_entry["avgXpd15"] = round(sum(t["xpd15"]) / len(t["xpd15"]), 1)
        if t["ka15"]:
            team_entry["avgKaAt15"] = round(sum(t["ka15"]) / len(t["ka15"]), 1)
        if t["firstbloodvictimgames"]:
            team_entry["firstBloodVictimRate"] = round(
                sum(t["firstbloodvictimgames"]) / len(t["firstbloodvictimgames"]) * 100, 1
            )
        out.append(team_entry)
    out.sort(key=lambda x: x["winrate"], reverse=True)
    return out


def compile_champions(champs_dict, team_games: int, weekly_team_games: dict, min_picks: int = MIN_CHAMP_PICKS):
    out = []
    # team_games counts team-rows (2 per match)
    denom = max(team_games / 2, 1)
    for name, c in champs_dict.items():
        picks = c["picks"]
        if picks < min_picks:
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


def compile_roster_depth(players_dict):
    """Full roster including subs (games >= 1), with starter/sub flags per team+role.

    Unlike compile_players (MIN_PLAYER_GAMES floor for leaderboards), this keeps every
    player who logged at least one game so substitutes (e.g. a 3-game sub jungler)
    remain visible across the dashboard and to nuckyAI.
    """
    by_team_role: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for name, p in players_dict.items():
        games = p["games"]
        if games < 1:
            continue
        role = normalize_position(p["position"])
        if role not in {"top", "jungle", "mid", "adc", "support"}:
            continue
        by_team_role[(p["team"], p["league"], role)].append(
            {"name": name, "games": games}
        )

    out = []
    for (team, league, role), members in by_team_role.items():
        members.sort(key=lambda m: m["games"], reverse=True)
        starter_games = members[0]["games"]
        for idx, member in enumerate(members):
            is_starter = idx == 0 and starter_games > 0
            out.append(
                {
                    "name": member["name"],
                    "team": team,
                    "league": league,
                    "position": role,
                    "games": member["games"],
                    "isStarter": is_starter,
                    "isSub": not is_starter,
                }
            )
    out.sort(key=lambda r: (r["team"], r["position"], -r["games"]))
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


def compile_game_catalog(game_catalog, game_teams):
    out = {}
    for game_id, cat in game_catalog.items():
        teams_out = {}
        for team_name, draft in (cat.get("teams") or {}).items():
            teams_out[team_name] = {
                "bans": list(draft.get("bans") or []),
                "picks": list(draft.get("picks") or []),
                "side": draft.get("side") or "",
                "won": str(draft.get("result", "0")) == "1",
            }
        out[game_id] = {
            "patch": str(cat.get("patch") or "").strip(),
            "gameLength": cat.get("gameLength"),
            "teams": teams_out,
        }
    return out


def finalize_team_fb_victims(store):
    """Roll per-game first-blood victim flags into team aggregates."""
    for (team_name, _game_id), was_victim in store.get("team_fb_victim", {}).items():
        team = store["teams"].get(team_name)
        if team is not None:
            team["firstbloodvictimgames"].append(1 if was_victim else 0)


def compile_slice(store, split_key: str = "", bucket_league: str = ""):
    backfill_game_log_opponents(store["players"], store["game_teams"])
    backfill_game_log_turret_plates(store["players"], store["game_team_meta"])
    finalize_team_fb_victims(store)
    # Always keep games>=1 rows in the published slice so early-split weeks
    # (e.g. LEC Summer week 1 with 1–2 games/player) still surface in
    # tournaments, weekly hub, and entity gameLogs. Leaderboard UIs apply their
    # own sample floors (mergeSlices / isDisplayable*).
    # International + guest buckets stay at the same floor (explicit for clarity).
    intl = is_international_split_key(split_key)
    guest = bucket_league == MINOR_LEAGUE
    sparse = intl or guest
    min_player = 1
    min_team = 1
    min_champ = 1 if sparse else MIN_CHAMP_PICKS
    return {
        "players": compile_players(store["players"], min_games=min_player),
        "rosterDepth": compile_roster_depth(store["players"]),
        "teams": compile_teams(store["teams"], min_games=min_team),
        "champions": compile_champions(
            store["champions"], store["team_games"], dict(store["weekly_team_games"]), min_picks=min_champ
        ),
        "weeklyTeamGames": dict(store["weekly_team_games"]),
        "matchups": compile_matchups(store["game_teams"]),
        "teamChampions": compile_team_champions(store["team_champions"]),
        "gameCatalog": compile_game_catalog(store["game_catalog"], store["game_teams"]),
    }


def resolve_bucket_key(
    row,
    team_to_league: dict[str, str],
    guest_teams: set[str] | None = None,
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
    guests = guest_teams or set()

    if league in TARGET_LEAGUES:
        return sk, league

    if league in INTERNATIONAL_LEAGUES or is_international:
        home_league = team_to_league.get(team_name) or TEAM_HOME_LEAGUE_FALLBACK.get(team_name)
        if home_league in TARGET_LEAGUES:
            return sk, home_league
        if team_name in guests or home_league == MINOR_LEAGUE:
            return sk, MINOR_LEAGUE
        return None

    return None


def resolve_guest_regional_bucket(
    row,
    guest_teams: set[str],
    team_to_league: dict[str, str],
) -> tuple[str, str] | None:
    """Regional-league rows for minor-region teams discovered at international events."""
    team_name = row.get("teamname", "")
    if not team_name or team_name not in guest_teams:
        return None
    if team_to_league.get(team_name) in TARGET_LEAGUES:
        return None
    if row.get("datacompleteness", "") not in ALLOWED_COMPLETENESS:
        return None

    league = row.get("league", "")
    if league in INTERNATIONAL_LEAGUES:
        return None

    try:
        year = int(row.get("year") or 0)
    except ValueError:
        return None
    current_year = datetime.now(timezone.utc).year
    if year < current_year - GUEST_LOOKBACK_YEARS or year > current_year:
        return None

    date_raw = row.get("date", "")
    sk = canonical_split_key(league, str(year), row.get("split", ""), row.get("playoffs", "0"), date_raw)
    return sk, MINOR_LEAGUE


def collect_international_guest_teams(csv_files, team_to_league: dict[str, str]) -> set[str]:
    guests: set[str] = set()
    for csv_path in csv_files:
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row = normalize_oe_row(row)
                if row.get("datacompleteness", "") not in ALLOWED_COMPLETENESS:
                    continue
                team_name = row.get("teamname", "")
                if not team_name:
                    continue
                league = row.get("league", "")
                date_raw = row.get("date", "")
                is_int_event = league in INTERNATIONAL_LEAGUES
                if league in TARGET_LEAGUES:
                    _, is_int_event = normalize_split(
                        league,
                        row.get("year", ""),
                        row.get("split", ""),
                        row.get("playoffs", "0"),
                        date_raw,
                    )
                if not is_int_event:
                    continue
                home = team_to_league.get(team_name) or TEAM_HOME_LEAGUE_FALLBACK.get(team_name)
                if home in TARGET_LEAGUES:
                    continue
                guests.add(team_name)
    return guests


def build_global_game_teams_and_catalog(buckets: dict):
    global_teams: dict[str, list] = defaultdict(list)
    global_catalog_teams: dict[str, dict] = defaultdict(dict)
    for store in buckets.values():
        for gid, sides in store["game_teams"].items():
            existing = {s.get("team") for s in global_teams[gid]}
            for side in sides:
                team = side.get("team")
                if team and team not in existing:
                    global_teams[gid].append(side)
                    existing.add(team)
        for gid, cat in store["game_catalog"].items():
            for team, draft in (cat.get("teams") or {}).items():
                if team not in global_catalog_teams[gid]:
                    global_catalog_teams[gid][team] = draft
    return global_teams, global_catalog_teams


def log_msi_coverage(slices: dict[str, dict]) -> None:
    """Log international event coverage and latest game dates."""
    for marker in INTERNATIONAL_SPLIT_MARKERS:
        keys = [
            k for k in slices
            if k.rsplit("|", 1)[0].endswith(f" {marker}") or k.rsplit("|", 1)[0] == marker
        ]
        if not keys:
            continue
        total_players = 0
        total_games = 0
        latest_date = ""
        leagues_seen: set[str] = set()
        for key in keys:
            split, league = key.rsplit("|", 1)
            leagues_seen.add(league)
            slice_data = slices[key]
            players = slice_data.get("players") or []
            total_players += len(players)
            for player in players:
                for game in player.get("gameLog") or []:
                    total_games += 1
                    date = str(game.get("date") or "")
                    if date > latest_date:
                        latest_date = date
        print(
            f"  {marker} coverage: {len(keys)} slice keys ({', '.join(sorted(leagues_seen))}), "
            f"{total_players} players, {total_games} game-log rows, latest={latest_date or 'n/a'}"
        )
        if total_games == 0:
            print(f"  WARNING: {marker} split keys exist but no player game logs were compiled", file=sys.stderr)


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


def process_row(row, buckets: dict, team_to_league: dict[str, str], guest_teams: set[str] | None = None):
    row = normalize_oe_row(row)
    league = row.get("league", "")
    guests = guest_teams or set()

    if league not in ALLOWED_LEAGUES:
        bucket_ref = resolve_guest_regional_bucket(row, guests, team_to_league)
        if not bucket_ref:
            return
        sk, bucket_league = bucket_ref
        bucket = buckets[(sk, bucket_league)]
    else:
        completeness = row.get("datacompleteness", "")
        if completeness not in ALLOWED_COMPLETENESS:
            return

        team_name = row.get("teamname", "")
        if league in TARGET_LEAGUES and team_name:
            team_to_league[team_name] = league

        bucket_ref = resolve_bucket_key(row, team_to_league, guests)
        if not bucket_ref:
            return
        sk, bucket_league = bucket_ref
        bucket = buckets[(sk, bucket_league)]

    team_name = row.get("teamname", "")
    position = row.get("position", "")
    player_name = row.get("playername") or row.get("name", "")
    champion = row.get("champion", "")
    result = row.get("result", "")
    game_id = row.get("gameid", "")

    if position == "team":
        if not team_name:
            return
        # Skip duplicate game rows (same game present in multiple source CSVs) so
        # game counts / aggregates aren't doubled.
        if game_id:
            dedup_key = (game_id, f"team:{team_name}")
            if dedup_key in bucket["seen_rows"]:
                return
            bucket["seen_rows"].add(dedup_key)
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
        gd15, csd15, xpd15 = resolve_at15_from_row(row)
        append_if_present(t["gd15"], gd15)
        append_if_present(t["csd15"], csd15)
        append_if_present(t["xpd15"], xpd15)
        kills_at15 = row.get("killsat15")
        assists_at15 = row.get("assistsat15")
        if kills_at15 not in (None, "") and assists_at15 not in (None, ""):
            append_if_present(t["ka15"], safe_float(kills_at15) + safe_float(assists_at15))
        elif kills_at15 not in (None, ""):
            append_if_present(t["ka15"], safe_float(kills_at15))
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
            cat = bucket["game_catalog"][game_id]
            patch_val = str(row.get("patch", "")).strip()
            if patch_val and not cat.get("patch"):
                cat["patch"] = patch_val
            if gl > 0 and not cat.get("gameLength"):
                cat["gameLength"] = round(gl / 60, 1)
            team_draft = cat["teams"].setdefault(
                team_name,
                {"bans": [], "picks": [], "side": side_val, "result": result},
            )
            for i in range(1, 6):
                ban = str(row.get(f"ban{i}", "") or "").strip()
                if ban and ban not in team_draft["bans"]:
                    team_draft["bans"].append(ban)
                pick = str(row.get(f"pick{i}", "") or "").strip()
                if pick and pick not in team_draft["picks"]:
                    team_draft["picks"].append(pick)
            plates = row_lookup(
                row,
                ("turretplates", "turret_plates", "turretplate", "turretplate"),
                0,
                as_float=False,
            )
            bucket["game_team_meta"][game_id][team_name] = {"turretPlates": plates}
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
        # Skip duplicate game rows (same game across multiple source CSVs).
        if game_id:
            dedup_key = (game_id, f"player:{player_name}")
            if dedup_key in bucket["seen_rows"]:
                return
            bucket["seen_rows"].add(dedup_key)
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
        gd15, csd15, xpd15 = resolve_at15_from_row(row)
        append_if_present(p["gd15"], gd15)
        append_if_present(p["csd15"], csd15)
        append_if_present(p["xpd15"], xpd15)
        p["dpm"].append(safe_float(row.get("dpm", 0)))
        p["visionScore"].append(safe_float(row.get("visionscore", 0)))
        p["goldShare"].append(safe_float(row.get("earnedgoldshare", 0)) * 100)
        fb_involved = 1 if (
            safe_int(row.get("firstbloodkill", 0)) or safe_int(row.get("firstbloodassist", 0))
        ) else 0
        p["firstBloodGames"].append(fb_involved)
        fb_victim = safe_int(row.get("firstbloodvictim", 0))
        if game_id and team_name and row_has_value(row, ("firstbloodvictim",)):
            victim_key = (team_name, game_id)
            if victim_key not in bucket["team_fb_victim_seen"]:
                bucket["team_fb_victim_seen"].add(victim_key)
                bucket["team_fb_victim"][victim_key] = fb_victim > 0
            elif fb_victim > 0:
                bucket["team_fb_victim"][victim_key] = True
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
        deaths_actual = safe_int(row.get("deaths", 0))
        total_cs = row_lookup(row, ("totalcs", "total cs", "total_cs"), 0, as_float=False)
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
        camps_stolen = resolve_camps_stolen(row, pos)
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
        year = str(row.get("year", "")).strip()
        raw_split = str(row.get("split", "")).strip()
        is_playoffs = resolve_playoffs_from_row(row)
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
                "dpm": round(safe_float(row.get("dpm", 0)), 1),
                "visionScore": round(safe_float(row.get("visionscore", 0)), 1),
                "goldShare": round(safe_float(row.get("earnedgoldshare", 0)) * 100, 1),
                "firstBloodRate": 100.0 if fb_involved else 0.0,
                "objControl": float(obj_total),
                "campsStolen": camps_stolen,
                "wardsDestroyed": round(wards_destroyed, 1),
                "kaPerMin": round(ka_per_min, 2),
                "dmgGoldRatio": round(dmg_gold_ratio, 3),
                "dmgPerGold": round(dmg_per_gold, 4),
                "gpm": round(gpm, 1),
                "gameLength": round(gl / 60, 1) if gl > 0 else None,
                "kills": kills_g,
                "deaths": deaths_actual,
                "assists": assists_g,
            }
        if total_cs > 0:
            entry["totalCs"] = total_cs
        if year:
            entry["oeYear"] = year
        if raw_split:
            entry["rawSplit"] = raw_split
        if gd15 is not None:
            entry["gd15"] = round(gd15, 1)
        if csd15 is not None:
            entry["csd15"] = round(csd15, 1)
        if xpd15 is not None:
            entry["xpd15"] = round(xpd15, 1)
        if row_has_value(row, ("solokills", "solo_kills", "solokill", "solokillsat15")):
            entry["soloKills"] = solo_kills
        if row_has_value(row, ("firstbloodvictim",)):
            entry["firstBloodVictim"] = fb_victim > 0
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
            team_meta = bucket["game_team_meta"].get(game_id, {}).get(team_name)
            if team_meta and team_meta.get("turretPlates") is not None:
                entry["turretPlates"] = team_meta["turretPlates"]
        if is_playoffs:
            entry["playoffs"] = True
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
        _, csd15_champ, _ = resolve_at15_from_row(row)
        append_if_present(c["csd15"], csd15_champ)
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


def filter_csv_files_by_years(csv_files: list[Path], years: set[str] | None) -> list[Path]:
    """When years is set, only ingest those calendar years (dashboard/CDN scope)."""
    if years is None:
        return csv_files
    scoped = [p for p in csv_files if extract_csv_year(p.name) in years]
    if not scoped:
        print(
            f"WARNING: no OE CSV files in lol/ match OE_DOWNLOAD_YEARS={sorted(years)!r}; "
            f"available years: {sorted({extract_csv_year(p.name) for p in csv_files if extract_csv_year(p.name)})}",
            file=sys.stderr,
        )
    return scoped


YearFilesMap = dict[str, str | list[str]]


def year_from_shard_stem(stem: str) -> str | None:
    """oe_slices_2026 / oe_slices_2026_p01 → '2026'."""
    rest = stem.replace("oe_slices_", "", 1)
    if len(rest) >= 4 and rest[:4].isdigit():
        return rest[:4]
    return None


def flatten_year_filenames(year_files: YearFilesMap) -> list[str]:
    out: list[str] = []
    for value in year_files.values():
        if isinstance(value, list):
            out.extend(value)
        elif isinstance(value, str):
            out.append(value)
    return out


def pack_year_slice_parts(
    year_slices: dict[str, dict],
) -> list[dict[str, dict]]:
    """Greedily pack split groups into parts under MAX_SHARD_BYTES."""
    by_split: dict[str, dict[str, dict]] = defaultdict(dict)
    for key, value in year_slices.items():
        split = key.split("|", 1)[0]
        by_split[split][key] = value

    # Size each split blob once (compact JSON).
    split_order = sorted(by_split.keys(), key=split_sort_key)
    split_payloads: list[tuple[str, dict[str, dict], int]] = []
    for split in split_order:
        chunk = by_split[split]
        encoded = json.dumps({"slices": chunk}, separators=(",", ":")).encode("utf-8")
        split_payloads.append((split, chunk, len(encoded)))

    parts: list[dict[str, dict]] = []
    current: dict[str, dict] = {}
    # {"slices":{}} framing overhead
    current_bytes = len(b'{"slices":{}}')

    def flush() -> None:
        nonlocal current, current_bytes
        if current:
            parts.append(current)
            current = {}
            current_bytes = len(b'{"slices":{}}')

    for _split, chunk, size in split_payloads:
        # Oversized single split: still emit alone (better than silent drop).
        if size > MAX_SHARD_BYTES and not current:
            print(
                f"  WARNING: split exceeds {MAX_SHARD_BYTES / (1024 * 1024):.0f} MiB "
                f"pack budget ({size / (1024 * 1024):.2f} MiB) — writing as its own part",
                file=sys.stderr,
            )
            parts.append(chunk)
            continue
        if current and current_bytes + size > MAX_SHARD_BYTES:
            flush()
        current.update(chunk)
        current_bytes += size
    flush()
    return parts or [{}]


def write_year_shards(year: str, year_slices: dict[str, dict]) -> str | list[str]:
    """Write one or more part files for a year; return manifest year_files entry."""
    parts = pack_year_slice_parts(year_slices)
    if len(parts) == 1:
        name = f"oe_slices_{year}.json"
        path = OUT_DIR / name
        with path.open("w", encoding="utf-8") as f:
            json.dump({"slices": parts[0]}, f, separators=(",", ":"))
        size = path.stat().st_size
        print(f"  Wrote shard {name} ({size / 1024:.1f} KB)")
        if size >= CLOUDFLARE_PAGES_MAX_FILE_BYTES:
            print(
                f"  ERROR: {name} is {size / (1024 * 1024):.2f} MiB — "
                f"Cloudflare Pages limit is 25 MiB",
                file=sys.stderr,
            )
        return name

    names: list[str] = []
    for idx, part in enumerate(parts, start=1):
        name = f"oe_slices_{year}_p{idx:02d}.json"
        path = OUT_DIR / name
        with path.open("w", encoding="utf-8") as f:
            json.dump({"slices": part}, f, separators=(",", ":"))
        size = path.stat().st_size
        print(f"  Wrote shard part {name} ({size / 1024:.1f} KB)")
        if size >= CLOUDFLARE_PAGES_MAX_FILE_BYTES:
            print(
                f"  ERROR: {name} is {size / (1024 * 1024):.2f} MiB — "
                f"Cloudflare Pages limit is 25 MiB",
                file=sys.stderr,
            )
        names.append(name)
    return names


def load_existing_manifest() -> tuple[YearFilesMap, list[str]]:
    if not OUT_PATH.exists():
        return {}, []
    try:
        payload = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, []
    year_files = payload.get("year_files") if isinstance(payload.get("year_files"), dict) else {}
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    splits = meta.get("splits") if isinstance(meta.get("splits"), list) else []
    return dict(year_files), list(splits)


RIOT_SUPPLEMENT_PATH = ROOT / "data" / "ml" / "riot_oe_supplement.csv"


def iter_riot_supplement_rows(scoped_years):
    """OE-shaped rows from the Riot warehouse export (Current SoR).

    Regenerate with: python scripts/riot/export_supplement.py
    """
    if not RIOT_SUPPLEMENT_PATH.exists():
        return
    with RIOT_SUPPLEMENT_PATH.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            year = str(row.get("year", "")).strip()
            if scoped_years is not None and year not in scoped_years:
                continue
            yield row


def ingest():
    csv_files = discover_local_csv_files(LOL_DIR)
    ingest_scope = os.environ.get("OE_DOWNLOAD_YEARS", "").strip()
    scoped_years = parse_download_years(ingest_scope) if ingest_scope else None
    if scoped_years is not None:
        csv_files = filter_csv_files_by_years(csv_files, scoped_years)
        print(
            f"Ingest scope OE_DOWNLOAD_YEARS={ingest_scope!r} "
            f"-> {len(csv_files)} CSV file(s): {[p.name for p in csv_files]}"
        )
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
    team_to_league: dict[str, str] = dict(TEAM_HOME_LEAGUE_FALLBACK)

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

    # Pass 1b: discover minor-region teams at international events.
    guest_teams = collect_international_guest_teams(csv_files, team_to_league)
    if guest_teams:
        print(f"  International guest teams ({len(guest_teams)}): {', '.join(sorted(guest_teams)[:12])}")

    # Pass 1c: Riot warehouse supplement teams (OE mapping wins on conflicts).
    for row in iter_riot_supplement_rows(scoped_years):
        league = row.get("league", "")
        team_name = (row.get("teamname") or "").strip()
        if league in TARGET_LEAGUES and team_name:
            team_to_league.setdefault(team_name, league)

    # Pass 2: aggregate into canonical split/league buckets.
    oe_day_teams: set[tuple[str, str]] = set()
    for csv_path in csv_files:
        print(f"Reading {csv_path.name}...")
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                day = str(row.get("date", "")).strip()[:10]
                team = str(row.get("teamname", "")).strip()
                if day and team:
                    oe_day_teams.add((day, team))
                process_row(row, buckets, team_to_league, guest_teams)

    # Pass 2b: Riot warehouse supplement (Current SoR) — fills the OE freshness
    # hole so Form/gameLogs include this week's games. OE rows win on the same
    # (calendar day, team); riot-only games flow through the same aggregator.
    supplement_used = 0
    supplement_skipped = 0
    for row in iter_riot_supplement_rows(scoped_years):
        day = str(row.get("date", "")).strip()[:10]
        team = str(row.get("teamname", "")).strip()
        if day and team and (day, team) in oe_day_teams:
            supplement_skipped += 1
            continue
        process_row(row, buckets, team_to_league, guest_teams)
        supplement_used += 1
    if supplement_used or supplement_skipped:
        print(
            f"Riot warehouse supplement: ingested {supplement_used} rows "
            f"(skipped {supplement_skipped} already covered by OE)"
        )

    global_game_teams, global_catalog_teams = build_global_game_teams_and_catalog(buckets)

    slices = {}
    split_set = set()
    for (sk, league), store in buckets.items():
        for gid, teams in global_catalog_teams.items():
            cat = store["game_catalog"].setdefault(gid, {"teams": {}, "patch": "", "gameLength": None})
            cat.setdefault("teams", {}).update(teams)
        for gid, sides in global_game_teams.items():
            existing = {s.get("team") for s in store["game_teams"].get(gid, [])}
            for side in sides:
                team = side.get("team")
                if team and team not in existing:
                    store["game_teams"][gid].append(side)
                    existing.add(team)
        split_set.add(sk)
        slices[f"{sk}|{league}"] = compile_slice(store, sk, league)

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

    shard_files: YearFilesMap = {}
    for year, year_slices in sorted(slices_by_year.items()):
        shard_files[year] = write_year_shards(year, year_slices)

    existing_year_files, existing_splits = load_existing_manifest()
    merged_year_files: YearFilesMap = {**existing_year_files, **shard_files}
    # Drop stale splits for years we just re-ingested (e.g. ghost "2026 Summer"
    # left in the manifest after the slice itself disappeared).
    if scoped_years is not None:
        existing_splits = [
            s for s in existing_splits
            if not any(str(s).startswith(f"{y} ") for y in scoped_years)
        ]
    merged_splits = sorted(set(existing_splits) | split_set, key=split_sort_key)

    # Only remove shard files for years we just re-ingested; leave other CDN years alone.
    if scoped_years is not None:
        removable_years = scoped_years
    else:
        removable_years = set(shard_files.keys())
    keep = {"oe_slices.json", *flatten_year_filenames(merged_year_files)}
    for existing in OUT_DIR.glob("oe_slices_*.json"):
        year = year_from_shard_stem(existing.stem)
        if year and year in removable_years and existing.name not in keep:
            existing.unlink(missing_ok=True)
            # Drop orphan year keys only when no kept files remain for that year.
            if year in merged_year_files and year not in shard_files:
                merged_year_files.pop(year, None)

    meta["splits"] = merged_splits
    payload = {"meta": meta, "year_files": merged_year_files}
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote manifest {OUT_PATH} ({size_kb:.1f} KB)")
    print(f"  Splits: {len(meta['splits'])}")
    print(f"  Slice keys: {len(slices)}")
    log_tier1_coverage(slices)
    log_msi_coverage(slices)
    if UNMAPPED_WARNINGS:
        print(f"  Unmapped split warnings: {len(UNMAPPED_WARNINGS)}", file=sys.stderr)

    try:
        from enrich_gol_advanced_stats import enrich_slices

        print("Enriching advanced stats (gol.gg: objectives stolen + LPL at-15 lane diffs)…")
        enrich_slices(year="2026", season="Spring")
    except Exception as err:
        print(f"  WARNING: gol.gg enrichment skipped: {err}", file=sys.stderr)

    try:
        from build_hub_bootstrap import build_bootstrap

        years = sorted(
            (y for y in merged_year_files if str(y).isdigit()),
            key=lambda y: int(y),
        )
        current_year = years[-1] if years else "2026"
        print(f"Building hub_bootstrap.json for {current_year}…")
        payload = build_bootstrap(current_year, form_days=45, max_form_games=24)
        boot_path = OUT_DIR / "hub_bootstrap.json"
        boot_path.write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"  Wrote {boot_path.name} ({boot_path.stat().st_size / 1e6:.2f} MB)")
    except Exception as err:
        print(f"  WARNING: hub_bootstrap build skipped: {err}", file=sys.stderr)


if __name__ == "__main__":
    ingest()
