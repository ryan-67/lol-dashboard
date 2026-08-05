"""Export warehouse player box scores into the player-stats stores.

Same shapes the Cito sync produced, so recaps / SeriesFacts keep working:
  - ``public/data/cito_player_stats_cache.json`` (CitoNormalizedPlayerRow rows)
  - Supabase ``cito_player_game_stats`` upserts (best-effort)

Riot game/match ids share Cito's ``lol-game-{id}`` / ``lol-match-{id}`` key
space, so merging is idempotent and riot rows naturally replace empty cito rows.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CACHE_PATH = ROOT / "public" / "data" / "cito_player_stats_cache.json"

ROLE_TO_CACHE = {
    "top": "top",
    "jungle": "jungle",
    "mid": "mid",
    "bottom": "adc",
    "support": "support",
}


def record_to_cache_rows(record: dict[str, Any]) -> list[dict[str, Any]]:
    length_s = record.get("gameLengthSeconds")
    minutes = round(length_s / 60.0, 2) if length_s else None
    date = str(record.get("gameStart") or record.get("seriesScheduledAt") or "")[:10]
    league = str(record.get("league") or "")
    rows: list[dict[str, Any]] = []

    players = record.get("players") or []
    team_gold: dict[str, float] = {}
    for p in players:
        side = p.get("side")
        if isinstance(p.get("gold"), (int, float)):
            team_gold[side] = team_gold.get(side, 0) + p["gold"]

    for p in players:
        kills = p.get("kills") or 0
        deaths = p.get("deaths") or 0
        assists = p.get("assists") or 0
        at15 = (p.get("atMinutes") or {}).get("15") or {}
        at25 = (p.get("atMinutes") or {}).get("25") or {}
        gold = p.get("gold")
        side = p.get("side")
        rows.append(
            {
                "citoGameId": f"lol-game-{record['gameId']}",
                "citoMatchId": record.get("seriesMatchId") or "",
                "gameNumber": record.get("gameNumber"),
                "league": league,
                "gameDate": date,
                "playerName": p.get("name") or "",
                "teamName": p.get("teamName") or "",
                "teamSlug": None,
                "side": side,
                "role": ROLE_TO_CACHE.get(str(p.get("role") or "").lower()),
                "champion": p.get("champion") or "",
                "result": p.get("result") or 0,
                "kills": kills,
                "deaths": deaths,
                "assists": assists,
                "kda": (kills + assists) if deaths == 0 else round((kills + assists) / deaths, 2),
                "cs": p.get("cs") or 0,
                "gold": gold or 0,
                "damage": 0,
                "dpm": 0,
                "damageShare": p.get("damageShare") or 0,
                "goldShare": round(gold / team_gold[side], 4)
                if isinstance(gold, (int, float)) and team_gold.get(side)
                else 0,
                "visionScore": 0,
                "wardsPlaced": p.get("wardsPlaced") or 0,
                "wardsDestroyed": p.get("wardsDestroyed") or 0,
                "gd15": at15.get("gold_diff") or 0,
                "csd15": at15.get("cs_diff") or 0,
                "xpd15": 0,
                "gd25": at25.get("gold_diff"),
                "gameLengthMinutes": minutes,
                "payload": {
                    "source": "riot_livestats",
                    "killParticipation": p.get("killParticipation"),
                    "atMinutes": p.get("atMinutes") or {},
                },
            }
        )
    return rows


def merge_cache(new_rows: list[dict[str, Any]]) -> int:
    prior: list[dict[str, Any]] = []
    if CACHE_PATH.exists():
        try:
            prior = (json.loads(CACHE_PATH.read_text(encoding="utf-8")) or {}).get("rows") or []
        except (json.JSONDecodeError, OSError):
            prior = []

    merged: dict[str, dict[str, Any]] = {}
    for row in prior:
        merged[f"{row.get('citoGameId')}|{row.get('playerName')}"] = row
    for row in new_rows:
        merged[f"{row.get('citoGameId')}|{row.get('playerName')}"] = row

    rows = sorted(merged.values(), key=lambda r: str(r.get("gameDate") or ""), reverse=True)
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(
            {
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "rowCount": len(rows),
                "rows": rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Player-stats cache -> {CACHE_PATH.name} ({len(rows)} rows, +{len(new_rows)} riot)")
    return len(rows)


def upsert_player_stats(rows: list[dict[str, Any]]) -> int:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key or not rows:
        if rows:
            print("  cito_player_game_stats upsert skipped (no Supabase creds)")
        return 0
    try:
        from supabase import create_client
    except ImportError:
        print("  cito_player_game_stats upsert skipped (supabase package missing)")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    payload = [
        {
            "cito_game_id": r["citoGameId"],
            "cito_match_id": r["citoMatchId"],
            "game_number": r["gameNumber"],
            "league": r["league"],
            "game_date": r["gameDate"],
            "player_name": r["playerName"],
            "team_name": r["teamName"],
            "team_slug": r["teamSlug"],
            "side": r["side"],
            "role": r["role"],
            "champion": r["champion"],
            "result": r["result"],
            "kills": r["kills"],
            "deaths": r["deaths"],
            "assists": r["assists"],
            "kda": r["kda"],
            "cs": r["cs"],
            "gold": r["gold"],
            "damage": r["damage"],
            "dpm": r["dpm"],
            "damage_share": r["damageShare"],
            "gold_share": r["goldShare"],
            "vision_score": r["visionScore"],
            "wards_placed": r["wardsPlaced"],
            "wards_destroyed": r["wardsDestroyed"],
            "gd15": r["gd15"],
            "csd15": r["csd15"],
            "xpd15": r["xpd15"],
            "gd25": r["gd25"],
            "game_length_minutes": r["gameLengthMinutes"],
            "payload": r["payload"],
            "fetched_at": now,
            "updated_at": now,
        }
        for r in rows
        if r.get("playerName")
    ]

    client = create_client(url, key)
    total = 0
    for i in range(0, len(payload), 100):
        chunk = payload[i : i + 100]
        try:
            client.table("cito_player_game_stats").upsert(
                chunk, on_conflict="cito_game_id,player_name"
            ).execute()
            total += len(chunk)
        except Exception as err:  # noqa: BLE001
            print(f"  cito_player_game_stats upsert failed: {str(err)[:200]}")
            break
    if total:
        print(f"  Upserted {total} player-game rows into cito_player_game_stats")
    return total
