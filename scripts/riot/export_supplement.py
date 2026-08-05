#!/usr/bin/env python3
"""Export warehouse game records as OE-shaped supplement rows (offline).

Reads committed ``data/riot/games/*.json`` and writes
``data/ml/riot_oe_supplement.csv`` — consumed by ``scripts/ml/oe_loader.py``
(feature mart / ratings) and ``scripts/ingest_csv.py`` (dashboard shards).
Deterministic and network-free, so any CI job can materialize it.

Usage: python scripts/riot/export_supplement.py [--days N]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from riot.normalize import ROLE_TO_OE  # noqa: E402

ROOT = SCRIPTS_DIR.parent
GAMES_DIR = ROOT / "data" / "riot" / "games"
OUT_PATH = ROOT / "data" / "ml" / "riot_oe_supplement.csv"

DRAGON_TYPES = ("infernal", "mountain", "cloud", "ocean", "chemtech", "hextech")
DRAGON_COL = {
    "infernal": "infernals",
    "mountain": "mountains",
    "cloud": "clouds",
    "ocean": "oceans",
    "chemtech": "chemtechs",
    "hextech": "hextechs",
}

# Stable superset header (OE naming). Unavailable stats stay blank — never 0 —
# so dashboard/ML averages skip them instead of absorbing fake zeros.
COLUMNS = [
    "gameid", "datacompleteness", "url", "league", "year", "split", "playoffs",
    "date", "game", "patch", "participantid", "side", "position", "playername",
    "playerid", "teamname", "teamid", "champion", "result", "gamelength",
    "kills", "deaths", "assists", "teamkills", "teamdeaths",
    "team kpm", "ckpm",
    "damageshare", "totalgold", "earned gpm", "earnedgoldshare",
    "total cs", "cspm", "wardsplaced", "wpm", "wardskilled", "wcpm",
    "dpm", "damagetochampions", "visionscore", "vspm", "xpdiffat15",
    "dragons", "opp_dragons", "elementaldrakes", "opp_elementaldrakes",
    "infernals", "mountains", "clouds", "oceans", "chemtechs", "hextechs",
    "elders", "opp_elders", "barons", "opp_barons",
    "towers", "opp_towers", "inhibitors", "opp_inhibitors",
]
for _m in (10, 15, 20, 25):
    COLUMNS += [
        f"goldat{_m}", f"csat{_m}", f"opp_goldat{_m}", f"opp_csat{_m}",
        f"golddiffat{_m}", f"csdiffat{_m}",
        f"killsat{_m}", f"assistsat{_m}", f"deathsat{_m}",
        f"opp_killsat{_m}", f"opp_assistsat{_m}", f"opp_deathsat{_m}",
    ]
COLUMNS += ["cito_source", "riot_source"]


def load_game_records(days: int | None = None) -> list[dict]:
    if not GAMES_DIR.exists():
        return []
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=days) if days is not None else None
    )
    records = []
    for path in sorted(GAMES_DIR.glob("*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        start = record.get("gameStart") or record.get("seriesScheduledAt") or ""
        if cutoff is not None:
            try:
                ts = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
            except ValueError:
                continue
            if ts < cutoff:
                continue
        if len(record.get("players") or []) >= 8:
            records.append(record)
    return records


def _num(v, digits: int | None = None):
    if v is None:
        return ""
    if digits is not None and isinstance(v, float):
        return round(v, digits)
    return v


def _at_minute_cols(at: dict, minute: int, prefix_own: bool = True) -> dict:
    entry = (at or {}).get(str(minute)) or {}
    out = {}
    out[f"goldat{minute}"] = _num(entry.get("gold"))
    out[f"csat{minute}"] = _num(entry.get("cs"))
    out[f"opp_goldat{minute}"] = _num(entry.get("opp_gold"))
    out[f"opp_csat{minute}"] = _num(entry.get("opp_cs"))
    out[f"golddiffat{minute}"] = _num(entry.get("gold_diff"))
    out[f"csdiffat{minute}"] = _num(entry.get("cs_diff"))
    for k in ("kills", "assists", "deaths"):
        out[f"{k}at{minute}"] = _num(entry.get(k))
        out[f"opp_{k}at{minute}"] = _num(entry.get(f"opp_{k}"))
    return out


def _oe_date(record: dict) -> str:
    raw = str(record.get("gameStart") or record.get("seriesScheduledAt") or "")
    raw = raw.replace("T", " ").replace("Z", "")
    return raw[:19] if raw else ""


def _playoffs_flag(record: dict) -> int:
    import re

    block = str(record.get("blockName") or "")
    return 1 if re.search(r"playoff|knockout|bracket|final", block, re.I) else 0


def game_to_oe_rows(record: dict) -> list[dict]:
    length_s = record.get("gameLengthSeconds")
    minutes = (length_s / 60.0) if length_s else None
    date = _oe_date(record)
    year = date[:4]
    is_gapfill = record.get("source") == "cito_gapfill" or (record.get("qa") or {}).get("gapFill")
    base = {
        "gameid": f"lol-game-{record['gameId']}",
        "datacompleteness": "partial",
        "url": "",
        "league": record.get("oeLeagueCode") or record.get("league") or "",
        "year": year,
        "split": "",
        "playoffs": _playoffs_flag(record),
        "date": date,
        "game": record.get("gameNumber") or 1,
        "patch": record.get("patch") or "",
        "playerid": "",
        "teamid": "",
        "gamelength": length_s if length_s else "",
        "cito_source": 1,
        "riot_source": 0 if is_gapfill else 1,
    }

    players = record.get("players") or []
    by_side: dict[str, list[dict]] = {"blue": [], "red": []}
    for p in players:
        if p.get("side") in by_side:
            by_side[p["side"]].append(p)

    team_stats = record.get("teams") or {}
    rows: list[dict] = []

    def side_sum(side: str, key: str):
        vals = [p.get(key) for p in by_side[side] if isinstance(p.get(key), (int, float))]
        return sum(vals) if vals else None

    for side in ("blue", "red"):
        group = by_side[side]
        opp = "red" if side == "blue" else "blue"
        team = team_stats.get(side) or {}
        opp_team = team_stats.get(opp) or {}
        team_kills = side_sum(side, "kills") or team.get("kills") or 0
        team_deaths = side_sum(opp, "kills") or opp_team.get("kills") or 0
        team_gold = side_sum(side, "gold")
        result = 1 if record.get("winnerSide") == side else 0
        team_name = team.get("name") or (group[0].get("teamName") if group else "")

        for p in group:
            gold = p.get("gold")
            cs = p.get("cs")
            dmg_share = p.get("damageShare")
            rows.append({
                **base,
                "participantid": p.get("participantId"),
                "side": side.capitalize(),
                "position": ROLE_TO_OE.get(str(p.get("role") or "").lower(), ""),
                "playername": p.get("name") or "",
                "teamname": team_name,
                "champion": p.get("champion") or "",
                "result": result,
                "kills": _num(p.get("kills")),
                "deaths": _num(p.get("deaths")),
                "assists": _num(p.get("assists")),
                "teamkills": _num(team_kills),
                "teamdeaths": _num(team_deaths),
                "damageshare": _num(dmg_share, 4),
                "totalgold": _num(gold),
                "earned gpm": _num(gold / minutes, 1) if isinstance(gold, (int, float)) and minutes else "",
                "earnedgoldshare": _num(gold / team_gold, 4) if isinstance(gold, (int, float)) and team_gold else "",
                "total cs": _num(cs),
                "cspm": _num(cs / minutes, 2) if isinstance(cs, (int, float)) and minutes else "",
                "wardsplaced": _num(p.get("wardsPlaced")),
                "wpm": _num(p.get("wardsPlaced") / minutes, 2) if isinstance(p.get("wardsPlaced"), (int, float)) and minutes else "",
                "wardskilled": _num(p.get("wardsDestroyed")),
                "wcpm": _num(p.get("wardsDestroyed") / minutes, 2) if isinstance(p.get("wardsDestroyed"), (int, float)) and minutes else "",
                **_at_minute_cols(p.get("atMinutes") or {}, 10),
                **_at_minute_cols(p.get("atMinutes") or {}, 15),
                **_at_minute_cols(p.get("atMinutes") or {}, 20),
                **_at_minute_cols(p.get("atMinutes") or {}, 25),
            })

        # Synthetic team row (OE position="team").
        dragons = [str(d).lower() for d in team.get("dragons") or []]
        opp_dragons = [str(d).lower() for d in opp_team.get("dragons") or []]
        elem = sum(1 for d in dragons if d in DRAGON_TYPES)
        opp_elem = sum(1 for d in opp_dragons if d in DRAGON_TYPES)

        def team_at(minute: int) -> dict:
            agg: dict[str, float] = {}
            found = False
            for p in group:
                entry = (p.get("atMinutes") or {}).get(str(minute)) or {}
                for k in ("gold", "cs", "kills", "assists", "deaths", "opp_gold", "opp_cs", "opp_kills", "opp_assists", "opp_deaths"):
                    v = entry.get(k)
                    if isinstance(v, (int, float)):
                        agg[k] = agg.get(k, 0) + v
                        found = True
            if not found:
                return {}
            out = {
                f"goldat{minute}": _num(agg.get("gold")),
                f"csat{minute}": _num(agg.get("cs")),
                f"opp_goldat{minute}": _num(agg.get("opp_gold")),
                f"opp_csat{minute}": _num(agg.get("opp_cs")),
            }
            if "gold" in agg and "opp_gold" in agg:
                out[f"golddiffat{minute}"] = agg["gold"] - agg["opp_gold"]
            if "cs" in agg and "opp_cs" in agg:
                out[f"csdiffat{minute}"] = agg["cs"] - agg["opp_cs"]
            for k in ("kills", "assists", "deaths"):
                out[f"{k}at{minute}"] = _num(agg.get(k))
                out[f"opp_{k}at{minute}"] = _num(agg.get(f"opp_{k}"))
            return out

        team_row = {
            **base,
            "side": side.capitalize(),
            "position": "team",
            "playername": "",
            "teamname": team_name,
            "champion": "",
            "result": result,
            "kills": _num(team_kills),
            "deaths": _num(team_deaths),
            "assists": _num(side_sum(side, "assists")),
            "teamkills": _num(team_kills),
            "teamdeaths": _num(team_deaths),
            "team kpm": _num(team_kills / minutes, 3) if minutes else "",
            "ckpm": _num((team_kills + team_deaths) / minutes, 3) if minutes else "",
            "totalgold": _num(team.get("totalGold") or team_gold),
            "total cs": _num(side_sum(side, "cs")),
            "wardsplaced": _num(side_sum(side, "wardsPlaced")),
            "wardskilled": _num(side_sum(side, "wardsDestroyed")),
            "dragons": len(dragons),
            "opp_dragons": len(opp_dragons),
            "elementaldrakes": elem,
            "opp_elementaldrakes": opp_elem,
            "elders": sum(1 for d in dragons if d == "elder"),
            "opp_elders": sum(1 for d in opp_dragons if d == "elder"),
            "barons": _num(team.get("barons")),
            "opp_barons": _num(opp_team.get("barons")),
            "towers": _num(team.get("towers")),
            "opp_towers": _num(opp_team.get("towers")),
            "inhibitors": _num(team.get("inhibitors")),
            "opp_inhibitors": _num(opp_team.get("inhibitors")),
            **{DRAGON_COL[t]: sum(1 for d in dragons if d == t) for t in DRAGON_TYPES},
            **team_at(10), **team_at(15), **team_at(20), **team_at(25),
        }
        rows.append(team_row)

    return rows


def write_supplement(days: int | None = None) -> int:
    records = load_game_records(days)
    rows: list[dict] = []
    for record in records:
        rows.extend(game_to_oe_rows(record))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} OE-shaped rows from {len(records)} games -> {OUT_PATH}")
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=None, help="Only include games from the last N days")
    args = parser.parse_args()
    write_supplement(args.days)


if __name__ == "__main__":
    main()
