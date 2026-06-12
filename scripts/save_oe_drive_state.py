#!/usr/bin/env python3
"""
Record successful OE ingest metadata in Supabase oe_sync_state.

Run after verify_supabase_seed.py in the refresh pipeline.
Non-fatal if oe_sync_state is not set up yet — oe_slices are already seeded.
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_drive_client import build_drive_service, current_year_csv_meta, load_env
from oe_sync_state import latest_game_date_for_year, save_ingested, supabase_client, year_from_drive_meta


def main() -> None:
    load_env()
    service = build_drive_service()
    meta = current_year_csv_meta(service, years_scope="current")
    year = year_from_drive_meta(meta)
    latest_game_date = latest_game_date_for_year(year)
    client = supabase_client()
    try:
        saved = save_ingested(client, meta, latest_game_date=latest_game_date)
    except Exception as err:
        print(f"ERROR: failed to save oe_sync_state: {err}", file=sys.stderr)
        sys.exit(1)

    if saved:
        print(
            f"Saved oe_sync_state for {year} ({meta.get('name')}). "
            f"Drive modified={meta.get('modifiedTime')} · "
            f"latest game date={latest_game_date or 'unknown'}"
        )
    else:
        print(
            "Skipped oe_sync_state save (table not ready). "
            "Dashboard data was still updated in oe_slices.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
