#!/usr/bin/env python3
"""
Download Oracle's Elixir yearly CSV files from Google Drive into lol/.

Usage:
    python scripts/download_oe_csv.py

Environment:
    GOOGLE_SERVICE_ACCOUNT_KEY — JSON key for a service account with Drive read access
    OE_DRIVE_FOLDER_ID         — Drive folder containing *_oracle_elixir.csv (optional)
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOL_DIR = ROOT / "lol"

# Community mirror folder (daily-updated OE CSV bundle). Override via secret/env.
DEFAULT_FOLDER_ID = "1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH"

CSV_NAME_RE = re.compile(r"^(\d{4})_oracle_elixir\.csv$", re.I)
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass


def credentials_from_env():
    from google.oauth2 import service_account

    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY", "").strip()
    if not raw:
        raise RuntimeError(
            "Missing GOOGLE_SERVICE_ACCOUNT_KEY (service account JSON for Google Drive)."
        )
    info = json.loads(raw)
    return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)


def list_csv_files(service, folder_id: str) -> list[dict]:
    files: list[dict] = []
    page_token = None
    query = f"'{folder_id}' in parents and trashed = false"
    while True:
        response = (
            service.files()
            .list(
                q=query,
                fields="nextPageToken, files(id, name, modifiedTime, size)",
                pageSize=200,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    return [f for f in files if CSV_NAME_RE.match(f.get("name", ""))]


def download_file(service, file_id: str, dest: Path) -> None:
    from googleapiclient.http import MediaIoBaseDownload

    dest.parent.mkdir(parents=True, exist_ok=True)
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    with dest.open("wb") as fh:
        downloader = MediaIoBaseDownload(fh, request, chunksize=50 * 1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()
            if not done:
                print(f"  {dest.name}: {int(downloader.progress() * 100)}%")


def main() -> None:
    load_env()
    folder_id = os.environ.get("OE_DRIVE_FOLDER_ID", DEFAULT_FOLDER_ID).strip()
    if not folder_id:
        print("ERROR: OE_DRIVE_FOLDER_ID is empty.", file=sys.stderr)
        sys.exit(1)

    try:
        from googleapiclient.discovery import build
    except ImportError:
        print("Install deps: pip install -r scripts/requirements-ingest.txt", file=sys.stderr)
        sys.exit(1)

    creds = credentials_from_env()
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    print(f"Listing CSV files in Drive folder {folder_id}...")
    remote_files = list_csv_files(service, folder_id)
    if not remote_files:
        print("ERROR: No *_oracle_elixir.csv files found in Drive folder.", file=sys.stderr)
        sys.exit(1)

    remote_files.sort(key=lambda f: f["name"])
    print(f"Found {len(remote_files)} CSV file(s).")

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
