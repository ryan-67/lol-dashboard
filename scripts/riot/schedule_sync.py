"""Sync Riot Persisted GW schedules into the stores the product already reads.

Writes:
  - Supabase ``cito_schedules`` upserts (same `lol-match-{id}` key space Cito
    used — Cito was a GW wrapper, so dual-writing is idempotent)
  - ``public/data/riot_schedule_cache.json`` (upcoming rows, cito-cache shape)
  - ``data/riot/schedule_snapshot.json`` (all states; QA gate + box-score input)
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from riot.client import CITO_LEAGUE_ID, gw, parse_ts, resolve_tier1_leagues

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_PATH = ROOT / "data" / "riot" / "schedule_snapshot.json"
PUBLIC_CACHE_PATH = ROOT / "public" / "data" / "riot_schedule_cache.json"

ACADEMY_RE = re.compile(r"challengers?|academy|rookies|youth|\bcl\b", re.I)

STATE_TO_STATUS = {
    "completed": "completed",
    "inprogress": "live",
    "unstarted": "scheduled",
}


def _team_label(team: dict[str, Any]) -> str:
    return str(team.get("name") or team.get("code") or "TBD").strip() or "TBD"


def _event_to_row(event: dict[str, Any], league_name: str, fetched_at: str) -> dict[str, Any] | None:
    match = event.get("match") or {}
    match_id = match.get("id")
    if not match_id:
        return None
    teams = match.get("teams") or []
    team_a = _team_label(teams[0]) if len(teams) > 0 else "TBD"
    team_b = _team_label(teams[1]) if len(teams) > 1 else "TBD"
    if ACADEMY_RE.search(f"{team_a} {team_b} {event.get('blockName') or ''}"):
        return None

    def score(i: int) -> int | None:
        if len(teams) <= i:
            return None
        wins = (teams[i].get("result") or {}).get("gameWins")
        return int(wins) if isinstance(wins, (int, float)) else None

    def outcome(i: int) -> str:
        if len(teams) <= i:
            return ""
        return str((teams[i].get("result") or {}).get("outcome") or "").lower()

    score_a, score_b = score(0), score(1)
    winner = None
    if outcome(0) == "win":
        winner = team_a
    elif outcome(1) == "win":
        winner = team_b
    elif score_a is not None and score_b is not None and score_a != score_b:
        winner = team_a if score_a > score_b else team_b

    strategy = (match.get("strategy") or {}).get("count")
    state = str(event.get("state") or "unstarted").lower()
    return {
        "match_id": f"lol-match-{match_id}",
        "league": league_name,
        "cito_league_id": CITO_LEAGUE_ID.get(league_name, f"lol-{league_name.lower()}"),
        "tournament_name": event.get("blockName") or (event.get("league") or {}).get("name") or league_name,
        "team_a": team_a,
        "team_b": team_b,
        "scheduled_at": event.get("startTime"),
        "status": STATE_TO_STATUS.get(state, state),
        "block_name": event.get("blockName"),
        "team_a_score": score_a,
        "team_b_score": score_b,
        "winner_team": winner,
        "best_of": int(strategy) if isinstance(strategy, (int, float)) else None,
        "fetched_at": fetched_at,
        # snapshot-only extras (stripped before Supabase upsert)
        "_riot_match_id": str(match_id),
        "_state": state,
        "_team_codes": [str(t.get("code") or "") for t in teams[:2]],
    }


def walk_league_schedule(league_id: str, league_name: str, lookback_days: int, fetched_at: str) -> list[dict[str, Any]]:
    """Walk getSchedule pages (older until cutoff + a few newer pages for upcoming)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows: dict[str, dict[str, Any]] = {}

    def absorb(events: list[dict[str, Any]]) -> datetime | None:
        oldest: datetime | None = None
        for event in events:
            ts = parse_ts(event.get("startTime"))
            if ts is not None and (oldest is None or ts < oldest):
                oldest = ts
            row = _event_to_row(event, league_name, fetched_at)
            if row:
                rows[row["match_id"]] = row
        return oldest

    raw = gw("getSchedule", leagueId=league_id)
    sched = (raw.get("data") or {}).get("schedule") or {}
    oldest = absorb(sched.get("events") or [])
    pages = sched.get("pages") or {}

    older = pages.get("older")
    for _ in range(30):
        if not older or (oldest is not None and oldest < cutoff):
            break
        raw = gw("getSchedule", leagueId=league_id, pageToken=older)
        sched = (raw.get("data") or {}).get("schedule") or {}
        page_oldest = absorb(sched.get("events") or [])
        if page_oldest is not None and (oldest is None or page_oldest < oldest):
            oldest = page_oldest
        older = (sched.get("pages") or {}).get("older")

    newer = pages.get("newer")
    for _ in range(4):
        if not newer:
            break
        raw = gw("getSchedule", leagueId=league_id, pageToken=newer)
        sched = (raw.get("data") or {}).get("schedule") or {}
        absorb(sched.get("events") or [])
        newer = (sched.get("pages") or {}).get("newer")

    return list(rows.values())


def sync_schedules(lookback_days: int = 21) -> list[dict[str, Any]]:
    """Fetch all tier-1 schedules; write snapshot + public upcoming cache."""
    fetched_at = datetime.now(timezone.utc).isoformat()
    leagues = resolve_tier1_leagues()
    all_rows: list[dict[str, Any]] = []
    for league_name, league_id in leagues.items():
        try:
            rows = walk_league_schedule(league_id, league_name, lookback_days, fetched_at)
            print(f"  {league_name}: {len(rows)} schedule rows")
            all_rows.extend(rows)
        except Exception as err:  # noqa: BLE001 — one league must not kill the sync
            print(f"  {league_name}: schedule walk failed — {err}")

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(
        json.dumps({"generated_at": fetched_at, "lookback_days": lookback_days, "rows": all_rows}, indent=0),
        encoding="utf-8",
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    upcoming = sorted(
        (
            {k: v for k, v in row.items() if not k.startswith("_")}
            for row in all_rows
            if row["status"] in ("scheduled", "live") and (row.get("scheduled_at") or "") >= now_iso[:19]
        ),
        key=lambda r: r.get("scheduled_at") or "",
    )[:500]
    PUBLIC_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_CACHE_PATH.write_text(
        json.dumps({"generated_at": now_iso, "rows": upcoming}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"  Wrote {PUBLIC_CACHE_PATH.name} ({len(upcoming)} upcoming rows)")
    return all_rows


def upsert_cito_schedules(rows: list[dict[str, Any]]) -> int:
    """Upsert schedule rows into Supabase cito_schedules (best-effort)."""
    import os

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("  Supabase upsert skipped (no SUPABASE_URL/SERVICE_ROLE_KEY)")
        return 0
    try:
        from supabase import create_client
    except ImportError:
        print("  Supabase upsert skipped (supabase package not installed)")
        return 0

    payload = [{k: v for k, v in row.items() if not k.startswith("_")} for row in rows]
    client = create_client(url, key)
    total = 0
    for i in range(0, len(payload), 200):
        chunk = payload[i : i + 200]
        try:
            client.table("cito_schedules").upsert(chunk, on_conflict="match_id").execute()
            total += len(chunk)
        except Exception as err:  # noqa: BLE001
            msg = str(err)
            if "best_of" in msg:
                stripped = [{k: v for k, v in r.items() if k != "best_of"} for r in chunk]
                client.table("cito_schedules").upsert(stripped, on_conflict="match_id").execute()
                total += len(chunk)
            else:
                print(f"  cito_schedules upsert chunk failed: {msg[:200]}")
    print(f"  Upserted {total} rows into cito_schedules")
    return total
