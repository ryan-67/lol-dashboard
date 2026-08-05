#!/usr/bin/env python3
"""Riot GW + Live Stats warehouse ingest (Current SoR) — CI + local CLI.

Pipeline (docs/nucky_v4.md §15):
  1. Sync tier-1 schedules → cito_schedules upserts + riot_schedule_cache.json
     + data/riot/schedule_snapshot.json
  2. For completed tier-1 series in the lookback window, fetch game ids via
     getEventDetails and pull Live Stats box scores + @minute snapshots for
     games not already cached in data/riot/games/
  3. Cito gap-fill for any series still missing warehouse games
  4. Export data/ml/riot_oe_supplement.csv (ML mart + dashboard shards)
  5. Merge public/data/cito_player_stats_cache.json + upsert
     cito_player_game_stats (recap SeriesFacts)

Incremental: cached games are never re-fetched, so steady-state runs only cost
schedule pagination + new games.

Usage:
  python scripts/riot/ingest_riot.py --days 14
  python scripts/riot/ingest_riot.py --days 180 --max-series 400   # backfill
  python scripts/riot/ingest_riot.py --days 14 --no-supabase       # local dry
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from riot.client import gw, parse_ts  # noqa: E402
from riot.livestats import fetch_game_feed  # noqa: E402
from riot.normalize import build_game_record  # noqa: E402
from riot.schedule_sync import sync_schedules, upsert_cito_schedules  # noqa: E402
from riot.export_supplement import write_supplement  # noqa: E402
from riot.player_stats import merge_cache, record_to_cache_rows, upsert_player_stats  # noqa: E402

ROOT = SCRIPTS_DIR.parent
GAMES_DIR = ROOT / "data" / "riot" / "games"
SUMMARY_PATH = ROOT / "data" / "riot" / "last_ingest.json"


def _load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass


def completed_series(rows: list[dict], days: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    out = []
    for row in rows:
        if row.get("status") != "completed":
            continue
        ts = parse_ts(row.get("scheduled_at"))
        # GW sometimes flags today's unplayed events as completed — a series
        # scheduled in the future cannot have box scores yet; skip it.
        if ts is None or ts < cutoff or ts > now:
            continue
        out.append(row)
    out.sort(key=lambda r: r.get("scheduled_at") or "", reverse=True)
    return out


def fetch_series_games(series: dict) -> tuple[list[dict], dict[str, str]]:
    """Completed game entries + {team label: esportsTeamId} for a series."""
    match_id = str(series.get("_riot_match_id") or series.get("match_id", "").replace("lol-match-", ""))
    detail = gw("getEventDetails", id=match_id)
    match = (((detail.get("data") or {}).get("event") or {}).get("match")) or {}
    teams = match.get("teams") or []
    team_ids = {
        str(t.get("name") or t.get("code") or ""): str(t.get("id") or "")
        for t in teams
    }
    games = [
        g for g in (match.get("games") or [])
        if g.get("state") == "completed" and g.get("id")
    ]
    return games, team_ids


def _is_complete_record(path: Path) -> bool:
    """Records missing game start / snapshots get one repair attempt per run."""
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    if len(record.get("players") or []) < 8:
        return False
    # Cito gap-fill rows are final box scores without Live Stats frames.
    if record.get("source") == "cito_gapfill":
        return True
    length_s = record.get("gameLengthSeconds")
    if not length_s:
        return False
    # Sub-12-minute remakes legitimately have no @minute snapshots.
    return bool((record.get("qa") or {}).get("snapshotMinutes")) or length_s < 12 * 60


def ingest_box_scores(rows: list[dict], days: int, max_series: int) -> tuple[int, int]:
    """Fetch livestats for uncached completed games. Returns (new_games, failures)."""
    GAMES_DIR.mkdir(parents=True, exist_ok=True)
    cached_ids = {p.stem for p in GAMES_DIR.glob("*.json") if _is_complete_record(p)}
    new_games = 0
    failures = 0

    series_list = completed_series(rows, days)[:max_series]
    print(f"Checking {len(series_list)} completed tier-1 series (lookback {days}d)...")

    for series in series_list:
        expected = (series.get("team_a_score") or 0) + (series.get("team_b_score") or 0)
        label = f"{series.get('league')} {series.get('team_a')} vs {series.get('team_b')}"
        try:
            games, team_ids = fetch_series_games(series)
        except Exception as err:  # noqa: BLE001
            print(f"  ! {label}: event details failed — {err}")
            failures += 1
            continue
        missing = [g for g in games if str(g["id"]) not in cached_ids]
        if not missing:
            continue

        event_start = parse_ts(series.get("scheduled_at")) or datetime.now(timezone.utc)
        series_ctx = {**series, "_team_ids": team_ids}
        got = 0
        for game in missing:
            game_id = str(game["id"])
            try:
                feed = fetch_game_feed(game_id, event_start)
                record = (
                    build_game_record(
                        game_id=game_id,
                        game_number=game.get("number"),
                        series=series_ctx,
                        feed=feed,
                    )
                    if feed
                    else None
                )
            except Exception as err:  # noqa: BLE001
                print(f"  ! {label} G{game.get('number')}: {err}")
                record = None
            if record is None:
                failures += 1
                continue
            (GAMES_DIR / f"{game_id}.json").write_text(
                json.dumps(record, separators=(",", ":")), encoding="utf-8"
            )
            cached_ids.add(game_id)
            new_games += 1
            got += 1
        print(f"  + {label}: {got}/{len(missing)} new games (series games={len(games)}, score sum={expected})")

    return new_games, failures


def write_summary(payload: dict) -> None:
    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"riot_new_games={payload['new_games']}\n")
            f.write(f"riot_new={'true' if payload['new_games'] > 0 else 'false'}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=14, help="Completed-series lookback window")
    parser.add_argument("--schedule-days", type=int, default=None, help="Schedule walk lookback (default: max(days, 21))")
    parser.add_argument("--max-series", type=int, default=120, help="Max completed series to check per run")
    parser.add_argument("--supplement-days", type=int, default=400, help="Supplement CSV window from game cache")
    parser.add_argument("--no-supabase", action="store_true", help="Skip Supabase upserts (local dry)")
    parser.add_argument("--no-gap-fill", action="store_true", help="Skip Cito gap-fill for uncovered series")
    args = parser.parse_args()

    _load_env()
    if args.no_supabase:
        os.environ.pop("SUPABASE_URL", None)
        os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)

    print("== Riot schedule sync ==")
    rows = sync_schedules(lookback_days=args.schedule_days or max(args.days, 21))
    upsert_cito_schedules(rows)

    print("== Live Stats box scores ==")
    new_games, failures = ingest_box_scores(rows, args.days, args.max_series)

    gap_new = 0
    gap_targets = 0
    gap_still = 0
    if not args.no_gap_fill:
        print("== Cito gap-fill (uncovered / partial series) ==")
        from riot.gap_fill import gap_fill_uncovered

        gap_new, gap_targets, gap_still = gap_fill_uncovered(rows, args.days)
        new_games += gap_new

    print("== Export OE supplement ==")
    supplement_rows = write_supplement(days=args.supplement_days)

    print("== Player-stats cache ==")
    from riot.export_supplement import load_game_records

    recent_records = load_game_records(days=args.days + 7)
    cache_rows: list[dict] = []
    for record in recent_records:
        cache_rows.extend(record_to_cache_rows(record))
    merge_cache(cache_rows)
    upsert_player_stats(cache_rows)

    summary = {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "lookback_days": args.days,
        "schedule_rows": len(rows),
        "new_games": new_games,
        "fetch_failures": failures,
        "gap_fill_games": gap_new,
        "gap_fill_targets": gap_targets,
        "gap_fill_still_open": gap_still,
        "supplement_rows": supplement_rows,
        "player_cache_rows": len(cache_rows),
    }
    write_summary(summary)
    print(f"Done. {json.dumps(summary)}")


if __name__ == "__main__":
    main()
