#!/usr/bin/env python3
"""
Backfill per-minute gold timelines into public/data/gol_game_cache.json from gol.gg.

CitoAPI often lacks full gold graphs; the dashboard already falls back to this cache
(see src/lib/goldTimelineResolve.ts). Most cache entries were scraped before timeline
support (cache v3) and only have player advanced stats.

Usage:
  python scripts/backfill_gol_gold_timelines.py
  python scripts/backfill_gol_gold_timelines.py --max-fetch 40 --year 2026
  python scripts/backfill_gol_gold_timelines.py --missing-only --max-fetch 80
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from gol_game_stats import (  # noqa: E402
    CACHE_VERSION,
    collect_game_ids,
    fetch_game_stats,
    load_cache,
    save_cache,
)


def _has_gold(entry: dict | None) -> bool:
    if not entry or not isinstance(entry, dict):
        return False
    timeline = entry.get("goldTimelineBlue") or []
    return isinstance(timeline, list) and len(timeline) >= 4


def _needs_refresh(entry: dict | None) -> bool:
    if not entry or not isinstance(entry, dict):
        return True
    if entry.get("_cacheVersion") != CACHE_VERSION:
        return True
    return not _has_gold(entry)


def backfill(
    *,
    year: str = "2026",
    max_fetch: int = 60,
    missing_only: bool = True,
    discover: bool = True,
    delay_s: float = 0.2,
    verbose: bool = True,
) -> dict:
    cache = load_cache()
    before_gold = sum(1 for v in cache.values() if _has_gold(v))

    candidates: list[str] = []
    if discover:
        if verbose:
            print(f"Discovering gol.gg game ids for {year}...")
        try:
            discovered = collect_game_ids(year=year)
        except Exception as err:  # noqa: BLE001 — network discovery is best-effort
            print(f"Discovery failed ({err}); falling back to cache keys only.")
            discovered = []
        if verbose:
            print(f"  discovered {len(discovered)} game ids")
        candidates.extend(discovered)

    # Prefer refreshing known cache entries that lack gold.
    for key, entry in cache.items():
        if missing_only and not _needs_refresh(entry):
            continue
        if key not in candidates:
            candidates.append(str(key))

    # De-dupe; prefer newer game ids (MSI / recent playoffs) over early-season LPL.
    seen: set[str] = set()
    ordered: list[str] = []
    for gid in sorted(
        candidates,
        key=lambda g: int(g) if str(g).isdigit() else 0,
        reverse=True,
    ):
        key = str(gid)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(key)

    if missing_only:
        ordered = [gid for gid in ordered if _needs_refresh(cache.get(gid))]

    if max_fetch > 0:
        ordered = ordered[:max_fetch]

    if verbose:
        print(f"Fetching gold timelines for {len(ordered)} games (cache had {before_gold} with gold)...")

    fetched = 0
    gained = 0
    for i, gid in enumerate(ordered, start=1):
        # Force re-fetch when gold is missing by clearing the gold-complete short-circuit.
        existing = cache.get(gid)
        if existing and _needs_refresh(existing):
            # Keep players metadata if present; drop version so fetch_game_stats refreshes.
            stale = dict(existing)
            stale.pop("goldTimelineBlue", None)
            stale["_cacheVersion"] = 0
            cache[gid] = stale

        parsed = fetch_game_stats(gid, cache=cache, delay_s=delay_s)
        fetched += 1
        if _has_gold(parsed):
            gained += 1
        if verbose and (i % 10 == 0 or i == len(ordered)):
            print(f"  [{i}/{len(ordered)}] last={gid} gold={_has_gold(parsed)}")

    save_cache(cache)
    after_gold = sum(1 for v in cache.values() if _has_gold(v))
    summary = {
        "fetched": fetched,
        "gained_this_run": gained,
        "gold_before": before_gold,
        "gold_after": after_gold,
        "cache_entries": len(cache),
    }
    if verbose:
        print(
            f"Done. gold {before_gold} -> {after_gold} "
            f"(fetched {fetched}, with-gold this run {gained})",
        )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill gol.gg gold timelines into cache")
    parser.add_argument("--year", default="2026")
    parser.add_argument("--max-fetch", type=int, default=60, help="Max games to fetch (0 = all)")
    parser.add_argument(
        "--missing-only",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Only fetch games missing gold / outdated cache version (default: true)",
    )
    parser.add_argument(
        "--discover",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Discover tournament game ids from gol.gg (default: true)",
    )
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between requests (seconds)")
    args = parser.parse_args()
    backfill(
        year=args.year,
        max_fetch=args.max_fetch,
        missing_only=args.missing_only,
        discover=args.discover,
        delay_s=args.delay,
    )


if __name__ == "__main__":
    main()
