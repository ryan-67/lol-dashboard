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
import sys
from collections import defaultdict
from datetime import datetime, timezone
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


def safe_float(val, default=0.0):
    try:
        return float(val) if val not in (None, "") else default
    except ValueError:
        return default


def safe_int(val, default=0):
    try:
        return int(float(val)) if val not in (None, "") else default
    except ValueError:
        return default


def normalize_position(raw: str) -> str:
    return POSITION_MAP.get((raw or "").lower(), raw or "")


def split_key(year: str, split: str, playoffs: str) -> str:
    label = split.strip() if split and split.strip() else "Unknown"
    suffix = " Playoffs" if str(playoffs) == "1" else ""
    return f"{year} {label}{suffix}"


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
    }


def slice_store():
    return {
        "players": defaultdict(player_bucket),
        "teams": defaultdict(team_bucket),
        "champions": defaultdict(champ_bucket),
        "team_champions": defaultdict(lambda: {"picks": 0, "wins": 0}),
        "game_teams": defaultdict(list),
        "team_games": 0,
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
            }
        )
    out.sort(key=lambda x: x["winrate"], reverse=True)
    return out


def compile_champions(champs_dict, team_games: int):
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
                "winrate": round(c["wins"] / picks * 100, 1) if picks else 0,
                "avgKda": round((c["kills"] + c["assists"]) / deaths, 2),
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
        "champions": compile_champions(store["champions"], store["team_games"]),
        "matchups": compile_matchups(store["game_teams"]),
        "teamChampions": compile_team_champions(store["team_champions"]),
    }


def process_row(row, buckets: dict):
    league = row.get("league", "")
    if league not in TARGET_LEAGUES:
        return
    completeness = row.get("datacompleteness", "")
    if completeness not in ALLOWED_COMPLETENESS:
        return

    sk = split_key(row.get("year", ""), row.get("split", ""), row.get("playoffs", "0"))
    bucket = buckets[(sk, league)]

    position = row.get("position", "")
    team_name = row.get("teamname", "")
    player_name = row.get("playername") or row.get("name", "")
    champion = row.get("champion", "")
    result = row.get("result", "")
    game_id = row.get("gameid", "")

    if position == "team":
        if not team_name:
            return
        t = bucket["teams"][team_name]
        t["games"] += 1
        t["league"] = league
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
        if game_id:
            bucket["game_teams"][game_id].append(
                {"team": team_name, "result": result, "league": league}
            )
        for i in range(1, 6):
            ban = row.get(f"ban{i}", "")
            if ban:
                bucket["champions"][ban]["bans"] += 1
        return

    pos = normalize_position(position)
    if pos not in {"top", "jungle", "mid", "adc", "support"}:
        return

    if player_name:
        p = bucket["players"][player_name]
        p["games"] += 1
        p["team"] = team_name
        p["league"] = league
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

    if champion and team_name:
        c = bucket["champions"][champion]
        c["picks"] += 1
        c["positions"].add(pos)
        c["kills"] += safe_int(row.get("kills", 0))
        c["deaths"] += safe_int(row.get("deaths", 0))
        c["assists"] += safe_int(row.get("assists", 0))
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

    for csv_path in CSV_FILES:
        print(f"Reading {csv_path.name}...")
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                process_row(row, buckets)

    slices = {}
    split_set = set()
    for (sk, league), store in buckets.items():
        split_set.add(sk)
        slices[f"{sk}|{league}"] = compile_slice(store)

    meta = {
        "source": "Oracle's Elixir",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "leagues": sorted(TARGET_LEAGUES),
        "splits": sorted(split_set),
        "schema_version": "2.0",
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


if __name__ == "__main__":
    ingest()
