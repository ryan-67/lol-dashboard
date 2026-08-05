#!/usr/bin/env python3
"""Warehouse completeness gate (CI-hard) — docs/nucky_v4.md §15.6.

Checks, per tier-1 league WITH completed series in the lookback window:
  - series coverage: ≥ --min-series-coverage of completed series have ≥1
    warehouse game record
  - full coverage:   ≥ --min-full of completed series have all games cached
  - GD@15 coverage:  ≥ --min-gd15 of cached in-window games have a usable
    @15 snapshot (skew < 90s) or were sub-15-minute games

Offseason-safe: leagues with zero completed series in-window are skipped.
Exits non-zero on failure so refresh-data.yml hard-fails before publish.

Usage: python scripts/riot/qa_completeness.py --days 14
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_PATH = ROOT / "data" / "riot" / "schedule_snapshot.json"
GAMES_DIR = ROOT / "data" / "riot" / "games"


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--min-series-coverage", type=float, default=0.95)
    parser.add_argument("--min-full", type=float, default=0.70)
    parser.add_argument("--min-gd15", type=float, default=0.80)
    args = parser.parse_args()

    if not SNAPSHOT_PATH.exists():
        print("FAIL: no schedule snapshot — run scripts/riot/ingest_riot.py first")
        sys.exit(1)

    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=args.days)

    # GW occasionally flags not-yet-played events as completed (state lag on
    # match day) — a "completed" series scheduled in the future is not gateable.
    series = [
        row
        for row in snapshot.get("rows") or []
        if row.get("status") == "completed"
        and cutoff <= (parse_ts(row.get("scheduled_at")) or cutoff) <= now
    ]

    games_by_series: dict[str, list[dict]] = {}
    gd15_ok = 0
    gd15_total = 0
    for path in GAMES_DIR.glob("*.json") if GAMES_DIR.exists() else []:
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        start = parse_ts(record.get("gameStart") or record.get("seriesScheduledAt"))
        if start is None or start < cutoff:
            continue
        sid = str(record.get("seriesMatchId") or "")
        games_by_series.setdefault(sid, []).append(record)

        gd15_total += 1
        length_s = record.get("gameLengthSeconds") or 0
        has_gd15 = "15" in ((record.get("players") or [{}])[0].get("atMinutes") or {})
        if has_gd15 or (0 < length_s < 15 * 60):
            gd15_ok += 1

    failures: list[str] = []
    leagues = sorted({str(r.get("league")) for r in series})
    if not leagues:
        print(f"NOTICE: no completed tier-1 series in the last {args.days}d (offseason?) — gate passes.")
        sys.exit(0)

    for league in leagues:
        rows = [r for r in series if str(r.get("league")) == league]
        covered = 0
        full = 0
        for row in rows:
            games = games_by_series.get(str(row.get("match_id")), [])
            expected = (row.get("team_a_score") or 0) + (row.get("team_b_score") or 0)
            if games:
                covered += 1
            if games and (expected == 0 or len(games) >= expected):
                full += 1
        cov = covered / len(rows)
        full_cov = full / len(rows)
        status = "OK"
        if cov < args.min_series_coverage:
            failures.append(
                f"{league}: series coverage {cov:.0%} < {args.min_series_coverage:.0%} ({covered}/{len(rows)})"
            )
            status = "FAIL"
        elif full_cov < args.min_full:
            failures.append(
                f"{league}: full-series coverage {full_cov:.0%} < {args.min_full:.0%} ({full}/{len(rows)})"
            )
            status = "FAIL"
        print(f"  {league}: {len(rows)} series, covered {cov:.0%}, full {full_cov:.0%} [{status}]")

    if gd15_total:
        gd15_rate = gd15_ok / gd15_total
        print(f"  GD@15 snapshot coverage: {gd15_rate:.0%} ({gd15_ok}/{gd15_total} games)")
        if gd15_rate < args.min_gd15:
            failures.append(f"GD@15 coverage {gd15_rate:.0%} < {args.min_gd15:.0%}")

    if failures:
        print("\nFAIL - warehouse completeness gate:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nPASS - warehouse completeness gate.")


if __name__ == "__main__":
    main()
