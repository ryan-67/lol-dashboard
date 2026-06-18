#!/usr/bin/env python3
"""
Enrich oe_slices JSON shards with per-game objectives stolen from gol.gg.

Oracle's Elixir CSVs do not ship objectives-stolen columns; gol.gg fullstats pages do.
Run after ingest_csv.py (or let ingest invoke this automatically).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from gol_game_stats import (  # noqa: E402
    CACHE_PATH,
    collect_game_ids,
    fetch_game_stats,
    load_cache,
    save_cache,
)

OUT_DIR = ROOT / "public" / "data"

# OE full name -> gol.gg abbreviations (subset of src/lib/entities/entityMap.ts)
TEAM_ALIASES: dict[str, set[str]] = {
    "Gen.G": {"GEN", "GEN.G", "GEN G", "GENG"},
    "T1": {"T1", "SKT", "SK TELECOM T1"},
    "Dplus Kia": {"DK", "DWG KIA", "DPLUS KIA", "DKIA"},
    "Hanwha Life Esports": {"HLE"},
    "KT Rolster": {"KT"},
    "DRX": {"DRX"},
    "Nongshim RedForce": {"NS", "NS REDFORCE"},
    "OKSavingsBank BRION": {"BRO", "BRION"},
    "BNK FEARX": {"BFX", "FEARX"},
    "DN Freecs": {"DNF", "DN FREECS"},
    "Bilibili Gaming": {"BLG"},
    "Weibo Gaming": {"WBG"},
    "Top Esports": {"TES"},
    "JD Gaming": {"JDG"},
    "Anyone's Legend": {"AL"},
    "LNG Esports": {"LNG"},
    "Invictus Gaming": {"IG"},
    "EDward Gaming": {"EDG"},
    "FunPlus Phoenix": {"FPX"},
    "Fnatic": {"FNC"},
    "G2 Esports": {"G2"},
    "Team Heretics": {"TH"},
    "MAD Lions KOI": {"MKOI", "MAD"},
    "Team Vitality": {"VIT"},
    "SK Gaming": {"SK"},
    "Team BDS": {"BDS"},
    "Cloud9": {"C9"},
    "Team Liquid": {"TL"},
    "FlyQuest": {"FLY"},
    "Shopify Rebellion": {"SR"},
    "100 Thieves": {"100", "100T"},
}


def _normalize_team(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _team_keys(name: str) -> set[str]:
    keys = {_normalize_team(name)}
    for canonical, aliases in TEAM_ALIASES.items():
        pool = {canonical, *aliases}
        if name in pool or any(_normalize_team(a) == _normalize_team(name) for a in pool):
            for label in pool:
                keys.add(_normalize_team(label))
    return keys


def _normalize_champion(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _aggregate_advanced(game_log: list[dict], games: int) -> dict:
    if not game_log or games <= 0:
        return {}
    return {
        "objectivesStolen": int(sum(g.get("objectivesStolen", 0) for g in game_log)),
    }


def _avg_from_gamelog(game_log: list[dict], key: str) -> float | None:
    vals = [g[key] for g in game_log if key in g and g[key] is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 1)


def recompute_player_lane_aggregates(player: dict) -> None:
    """Recompute gd15/csd15/xpd15 player averages from gameLog after gol backfill."""
    game_log = player.get("gameLog") or []
    if not game_log:
        return
    for key in ("gd15", "csd15", "xpd15"):
        avg = _avg_from_gamelog(game_log, key)
        if avg is not None:
            player[key] = avg


def _match_game_entry(gol_game: dict, oe_game: dict, player_name: str, player_team: str) -> bool:
    if not gol_game.get("players"):
        return False
    oe_date = (oe_game.get("date") or "")[:10]
    gol_date = (gol_game.get("date") or "")[:10]
    if oe_date and gol_date and oe_date != gol_date:
        return False

    player_keys = _team_keys(player_team)
    opponent_keys = _team_keys(oe_game.get("opponent") or "")
    gol_team_keys: set[str] = set()
    for team in gol_game.get("teams") or []:
        gol_team_keys |= _team_keys(team)

    if player_keys.isdisjoint(gol_team_keys):
        return False
    if opponent_keys and not opponent_keys.isdisjoint(gol_team_keys):
        pass
    elif opponent_keys and opponent_keys.isdisjoint(gol_team_keys):
        if gol_team_keys.isdisjoint(opponent_keys):
            return False

    champ_key = _normalize_champion(oe_game.get("champion") or "")
    for row in gol_game["players"]:
        if row.get("name", "").lower() != player_name.lower():
            continue
        if champ_key and row.get("championKey") and row["championKey"] != champ_key:
            continue
        return True
    return False


def _apply_gol_stats_to_game(oe_game: dict, gol_game: dict, player_name: str, player_team: str) -> bool:
    for row in gol_game.get("players") or []:
        if row.get("name", "").lower() != player_name.lower():
            continue
        champ_key = _normalize_champion(oe_game.get("champion") or "")
        if champ_key and row.get("championKey") and row["championKey"] != champ_key:
            continue
        oe_game["objectivesStolen"] = row.get("objectivesStolen", 0)
        patched = False
        for stat in ("gd15", "csd15", "xpd15"):
            val = row.get(stat)
            if val is not None:
                oe_game[stat] = round(float(val), 1)
                oe_game["at15Source"] = "gol.gg"
                patched = True
        return True
    return False


def build_gol_index(game_ids: list[str], cache: dict, verbose: bool = True) -> list[dict]:
    games: list[dict] = []
    for idx, gid in enumerate(game_ids):
        parsed = fetch_game_stats(gid, cache=cache)
        if parsed.get("players"):
            games.append(parsed)
        if verbose and (idx + 1) % 25 == 0:
            print(f"  fetched {idx + 1}/{len(game_ids)} gol games…")
    save_cache(cache)
    return games


def enrich_slice_players(players: list[dict], gol_games: list[dict]) -> int:
    patched = 0
    for player in players:
        game_log = player.get("gameLog") or []
        if not game_log:
            continue
        for oe_game in game_log:
            for gol_game in gol_games:
                if _match_game_entry(gol_game, oe_game, player["name"], player.get("team", "")):
                    if _apply_gol_stats_to_game(oe_game, gol_game, player["name"], player.get("team", "")):
                        patched += 1
                    break
        recompute_player_lane_aggregates(player)
        adv = _aggregate_advanced(game_log, player.get("games") or len(game_log))
        player.update(adv)
    return patched


def enrich_year_shard(shard_path: Path, gol_games: list[dict]) -> int:
    payload = json.loads(shard_path.read_text(encoding="utf-8"))
    slices = payload.get("slices") or {}
    total = 0
    for slice_data in slices.values():
        players = slice_data.get("players") or []
        total += enrich_slice_players(players, gol_games)
    shard_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return total


def enrich_slices(
    year: str = "2026",
    season: str = "Spring",
    max_games: int = 0,
    skip_fetch: bool = False,
    verbose: bool = True,
) -> int:
    cache = load_cache()
    if skip_fetch:
        gol_games = [v for v in cache.values() if v.get("players")]
    else:
        if verbose:
            print(f"Discovering gol.gg tournaments (season S16, split {season})…")
        game_ids = collect_game_ids(season=season, year=year)
        if max_games:
            game_ids = game_ids[:max_games]
        if verbose:
            print(f"Fetching {len(game_ids)} gol game pages (cache: {CACHE_PATH.name})…")
        gol_games = build_gol_index(game_ids, cache, verbose=verbose)

    if verbose:
        print(f"Loaded {len(gol_games)} parsed gol games")

    shard = OUT_DIR / f"oe_slices_{year}.json"
    if not shard.exists():
        raise FileNotFoundError(f"Missing shard {shard}")

    patched = enrich_year_shard(shard, gol_games)
    if verbose:
        print(f"Patched {patched} game-log rows in {shard.name}")
    return patched


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich oe_slices with gol.gg objectives stolen")
    parser.add_argument("--year", default="2026", help="Shard year to patch (default: 2026)")
    parser.add_argument("--season", default="Spring", help="gol.gg split label for tournament discovery")
    parser.add_argument("--max-games", type=int, default=0, help="Limit gol games fetched (0 = all)")
    parser.add_argument("--skip-fetch", action="store_true", help="Only use gol_game_cache.json")
    args = parser.parse_args()
    enrich_slices(
        year=args.year,
        season=args.season,
        max_games=args.max_games,
        skip_fetch=args.skip_fetch,
    )


if __name__ == "__main__":
    main()
