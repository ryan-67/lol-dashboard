#!/usr/bin/env python3
"""
Backfill jungle campsStolen from Riot Match-V5 when OE omits monsterkillsenemyjungle.

Oracle's Elixir only populates monsterkillsenemyjungle for LPL partial rows (regional
feed). LCK/LEC/LCS complete rows leave the column empty. OE gameids like LOLTMNT03_337058
are valid esports match-v5 IDs — participant.neutralMinionsKilledEnemyJungle is the
same metric.

Requires RIOT_API_KEY (dev portal). Skips quietly when unset.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
OUT_DIR = ROOT / "public" / "data"
CACHE_PATH = OUT_DIR / "riot_match_cache.json"

RIOT_MATCH_ID_RE = re.compile(r"^LOLTMNT\d+_\d+$", re.I)
USER_AGENT = "nucky-dashboard-ingest/1.0"

# Esports routing by league (first region tried; 404 falls through alternates).
REGIONS_BY_LEAGUE: dict[str, list[str]] = {
    "LCK": ["asia"],
    "LPL": ["asia"],
    "LEC": ["europe", "sea"],
    "LCS": ["americas"],
    "MSI": ["asia", "americas", "europe"],
    "WLDs": ["asia", "americas", "europe"],
}

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


def normalize_position(raw: str) -> str:
    return POSITION_MAP.get((raw or "").lower(), (raw or "").lower())


def normalize_champion(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def normalize_player_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def riot_api_key() -> str | None:
    key = (os.environ.get("RIOT_API_KEY") or os.environ.get("RIOT_API_TOKEN") or "").strip()
    return key or None


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")


def fetch_match(match_id: str, regions: list[str], api_key: str, cache: dict, delay_s: float = 0.12) -> dict | None:
    cached = cache.get(match_id)
    if cached is not None:
        if cached.get("error"):
            return None
        return cached

    last_err = ""
    for region in regions:
        url = (
            f"https://{region}.api.riotgames.com/lol/match/v5/matches/"
            f"{urllib.parse.quote(match_id, safe='')}?api_key={api_key}"
        )
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            cache[match_id] = data
            if delay_s:
                time.sleep(delay_s)
            return data
        except urllib.error.HTTPError as err:
            last_err = f"{region}:{err.code}"
            if err.code == 404:
                continue
            if err.code == 403:
                cache[match_id] = {"error": "forbidden"}
                return None
            if err.code == 429:
                time.sleep(2.0)
                continue
            cache[match_id] = {"error": last_err}
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_err = str(err)
            continue

    cache[match_id] = {"error": last_err or "not_found"}
    return None


def participant_camps_by_champion_side(match: dict) -> dict[tuple[str, int], int]:
    """Map (championKey, teamId) -> neutralMinionsKilledEnemyJungle."""
    out: dict[tuple[str, int], int] = {}
    for part in match.get("info", {}).get("participants", []) or []:
        champ = normalize_champion(part.get("championName") or "")
        team_id = int(part.get("teamId") or 0)
        if not champ or team_id not in (100, 200):
            continue
        camps = int(part.get("neutralMinionsKilledEnemyJungle") or 0)
        out[(champ, team_id)] = camps
    return out


def side_to_team_id(side: str | None) -> int | None:
    s = (side or "").strip().lower()
    if s == "blue":
        return 100
    if s == "red":
        return 200
    return None


def enrich_slice_players(players: list[dict], cache: dict, api_key: str, verbose: bool) -> int:
    patched = 0
    pending_by_match: dict[str, list[tuple[dict, dict, str]]] = {}

    for player in players:
        if normalize_position(player.get("position", "")) != "jungle":
            continue
        league = player.get("league", "")
        for oe_game in player.get("gameLog") or []:
            if (oe_game.get("campsStolen") or 0) > 0:
                continue
            game_id = oe_game.get("gameId") or ""
            if not RIOT_MATCH_ID_RE.match(game_id):
                continue
            pending_by_match.setdefault(game_id, []).append((oe_game, player, league))

    for idx, (match_id, entries) in enumerate(sorted(pending_by_match.items())):
        league = entries[0][2] if entries else ""
        regions = REGIONS_BY_LEAGUE.get(league, ["asia", "americas", "europe"])
        match = fetch_match(match_id, regions, api_key, cache)
        if not match:
            continue
        by_champ_side = participant_camps_by_champion_side(match)
        if not by_champ_side:
            continue

        for oe_game, player, _ in entries:
            champ_key = normalize_champion(oe_game.get("champion") or "")
            team_id = side_to_team_id(oe_game.get("side"))
            camps = None
            if champ_key and team_id:
                camps = by_champ_side.get((champ_key, team_id))
            if camps is None and champ_key:
                # Fallback: champion unique in game (jungler only).
                matches = [v for (c, _t), v in by_champ_side.items() if c == champ_key]
                if len(matches) == 1:
                    camps = matches[0]
            if camps is None:
                continue
            oe_game["campsStolen"] = int(camps)
            patched += 1

        if verbose and (idx + 1) % 50 == 0:
            print(f"  riot camps: processed {idx + 1}/{len(pending_by_match)} matches…")

    # Recompute player-level averages for touched junglers.
    touched = {id(p) for entries in pending_by_match.values() for _, p, _ in entries}
    for player in players:
        if id(player) not in touched:
            continue
        game_log = player.get("gameLog") or []
        games = player.get("games") or len(game_log)
        if games > 0 and game_log:
            player["campsStolen"] = round(
                sum(g.get("campsStolen", 0) for g in game_log) / games,
                2,
            )

    return patched


def enrich_year_shard(shard_path: Path, cache: dict, api_key: str, verbose: bool) -> int:
    payload = json.loads(shard_path.read_text(encoding="utf-8"))
    total = 0
    for slice_data in (payload.get("slices") or {}).values():
        players = slice_data.get("players") or []
        total += enrich_slice_players(players, cache, api_key, verbose)
    shard_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return total


def enrich_slices(year: str = "2026", verbose: bool = True) -> int:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass

    api_key = riot_api_key()
    if not api_key:
        if verbose:
            print("  Riot camps stolen enrichment skipped (RIOT_API_KEY not set)")
        return 0

    shard = OUT_DIR / f"oe_slices_{year}.json"
    if not shard.exists():
        raise FileNotFoundError(f"Missing shard {shard}")

    cache = load_cache()
    if verbose:
        print(f"Enriching camps stolen from Riot Match-V5 ({shard.name})…")
    patched = enrich_year_shard(shard, cache, api_key, verbose)
    save_cache(cache)
    if verbose:
        print(f"  Patched {patched} jungle game-log rows via Riot Match-V5")
    return patched


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill campsStolen from Riot Match-V5")
    parser.add_argument("--year", default="2026", help="Shard year (default: 2026)")
    args = parser.parse_args()
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass
    enrich_slices(year=args.year)


if __name__ == "__main__":
    main()
