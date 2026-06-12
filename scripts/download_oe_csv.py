#!/usr/bin/env python3
"""
Download Oracle's Elixir yearly CSV files from Google Drive into lol/.

Usage:
    python scripts/download_oe_csv.py

Environment:
    GOOGLE_SERVICE_ACCOUNT_KEY — service account JSON with Drive read access
    OE_DRIVE_FOLDER_ID         — Drive folder ID (optional; uses OE public folder default)
    OE_DOWNLOAD_YEARS          — 'current' (default), 'all', or comma-separated years
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import filter_remote_files_by_years, parse_download_years, resolve_drive_folder_id
from oe_drive_client import (
    LOL_DIR,
    build_drive_service,
    download_file,
    list_csv_files,
    load_env,
)

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    load_env()
    folder_id = resolve_drive_folder_id(os.environ.get("OE_DRIVE_FOLDER_ID"))
    download_years = parse_download_years(os.environ.get("OE_DOWNLOAD_YEARS", "current"))

    service = build_drive_service()

    scope_label = "all years" if download_years is None else ", ".join(sorted(download_years))
    print(f"Listing OE CSV files in Drive folder {folder_id} (scope: {scope_label})...")
    remote_files = filter_remote_files_by_years(list_csv_files(service, folder_id), download_years)
    if not remote_files:
        print(
            "ERROR: No Oracle's Elixir CSV files found in Drive folder for the requested scope.",
            file=sys.stderr,
        )
        print(
            "Expected filenames like YYYY_LoL_esports_match_data_from_OraclesElixir.csv",
            file=sys.stderr,
        )
        print(
            "Ensure OE_DRIVE_FOLDER_ID points to the shared folder and the service account has Viewer access.",
            file=sys.stderr,
        )
        sys.exit(1)

    remote_files.sort(key=lambda f: f["name"])
    print(f"Found {len(remote_files)} CSV file(s) to download.")

    for meta in remote_files:
        name = meta["name"]
        dest = LOL_DIR / name
        size_mb = int(meta.get("size", 0) or 0) / (1024 * 1024)
        print(f"Downloading {name} ({size_mb:.1f} MB)...")
        download_file(service, meta["id"], dest)
        print(f"  Saved {dest}")

    print("Done.")


if __name__ == "__main__":
    main()
