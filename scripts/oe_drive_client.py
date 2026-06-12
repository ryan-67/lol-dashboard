"""
Google Drive helpers for Oracle's Elixir CSV discovery and download.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from oe_csv_io import filter_remote_files_by_years, parse_download_years, resolve_drive_folder_id

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
LOL_DIR = ROOT / "lol"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
DRIVE_FILE_FIELDS = "id, name, modifiedTime, size, md5Checksum"


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


def build_drive_service():
    try:
        from googleapiclient.discovery import build
    except ImportError as err:
        raise RuntimeError(
            "Install deps: pip install -r scripts/requirements-ingest.txt"
        ) from err

    return build("drive", "v3", credentials=credentials_from_env(), cache_discovery=False)


def list_csv_files(service, folder_id: str) -> list[dict]:
    files: list[dict] = []
    page_token = None
    query = f"'{folder_id}' in parents and trashed = false"
    while True:
        response = (
            service.files()
            .list(
                q=query,
                fields=f"nextPageToken, files({DRIVE_FILE_FIELDS})",
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
    return files


def current_year_csv_meta(
    service,
    folder_id: str | None = None,
    years_scope: str | None = "current",
) -> dict:
    folder = resolve_drive_folder_id(folder_id or os.environ.get("OE_DRIVE_FOLDER_ID"))
    years = parse_download_years(years_scope)
    matched = filter_remote_files_by_years(list_csv_files(service, folder), years)
    if not matched:
        raise RuntimeError(
            "No Oracle's Elixir CSV files found in Drive for the requested scope."
        )
    if len(matched) > 1:
        matched.sort(key=lambda f: f.get("name", ""))
    return matched[-1]


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
                print(f"  {dest.name}: {int(downloader.progress() * 100)}%", file=sys.stderr)
