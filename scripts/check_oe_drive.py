#!/usr/bin/env python3
"""
Check Oracle's Elixir Drive CSV metadata against Supabase oe_sync_state.

Exits 0 always. Prints whether a full refresh is needed.

Usage:
    python scripts/check_oe_drive.py
    python scripts/check_oe_drive.py --format github   # prints true/false only
    python scripts/check_oe_drive.py --force           # always report changed

Environment:
    GOOGLE_SERVICE_ACCOUNT_KEY, OE_DRIVE_FOLDER_ID (optional)
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    OE_DOWNLOAD_YEARS — default current
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_drive_client import build_drive_service, current_year_csv_meta, load_env
from oe_sync_state import (
    drive_meta_changed,
    load_stored_state,
    supabase_client,
    table_missing_message,
    touch_checked,
    year_from_drive_meta,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Check OE Drive CSV for changes.")
    parser.add_argument(
        "--format",
        choices=("text", "github"),
        default="text",
        help="github: print true/false for GITHUB_OUTPUT",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Treat as changed regardless of stored metadata",
    )
    args = parser.parse_args()

    load_env()
    service = build_drive_service()
    meta = current_year_csv_meta(service)
    year = year_from_drive_meta(meta)

    try:
        client = supabase_client()
        stored = load_stored_state(client, year)
    except Exception as err:
        err_text = str(err).lower()
        if "oe_sync_state" in err_text and (
            "does not exist" in err_text or "could not find" in err_text or "404" in err_text
        ):
            print(table_missing_message(), file=sys.stderr)
            sys.exit(1)
        raise

    changed = args.force or drive_meta_changed(stored, meta)

    if not changed:
        touch_checked(client, meta)
        if args.format == "github":
            print("false")
            return
        name = meta.get("name", year)
        print(f"No changes for {name} (year={year}). Skipping refresh.")
        return

    if args.format == "github":
        print("true")
        return

    name = meta.get("name", year)
    print(f"Change detected for {name} (year={year}). Refresh required.")
    if stored:
        print(
            f"  stored: modified={stored.get('modified_time')} size={stored.get('size_bytes')}"
        )
    print(
        f"  remote: modified={meta.get('modifiedTime')} size={meta.get('size')} "
        f"md5={meta.get('md5Checksum') or 'n/a'}"
    )


if __name__ == "__main__":
    main()
