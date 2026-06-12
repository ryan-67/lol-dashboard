"""
Persist Oracle's Elixir Drive CSV metadata in Supabase oe_sync_state.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = "oe_sync_state"


def load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip().rstrip("/")
    if not value:
        print(f"ERROR: missing {name}", file=sys.stderr)
        sys.exit(1)
    return value


def supabase_client():
    try:
        from supabase import create_client
    except ImportError:
        print(
            "ERROR: supabase package not installed. Run: pip install -r scripts/requirements-ingest.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def year_from_drive_meta(meta: dict) -> str:
    from oe_csv_io import extract_csv_year

    year = extract_csv_year(meta.get("name", ""))
    if not year:
        raise ValueError(f"Could not parse year from Drive file name: {meta.get('name')!r}")
    return year


def remote_signature(meta: dict) -> tuple[str, str, int, str | None]:
    return (
        meta.get("id", ""),
        meta.get("modifiedTime", ""),
        int(meta.get("size") or 0),
        meta.get("md5Checksum"),
    )


def drive_meta_changed(stored: dict | None, meta: dict) -> bool:
    if not stored:
        return True

    remote_id, remote_modified, remote_size, remote_md5 = remote_signature(meta)
    if stored.get("drive_file_id") != remote_id:
        return True
    if stored.get("modified_time") != remote_modified:
        return True
    if int(stored.get("size_bytes") or 0) != remote_size:
        return True

    stored_md5 = stored.get("md5_checksum")
    if remote_md5 and stored_md5 and stored_md5 != remote_md5:
        return True
    return False


def load_stored_state(client, year: str) -> dict | None:
    response = client.table(TABLE).select("*").eq("year", year).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def row_from_drive_meta(meta: dict, *, ingested: bool) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    year = year_from_drive_meta(meta)
    row = {
        "year": year,
        "drive_file_id": meta.get("id", ""),
        "drive_file_name": meta.get("name", ""),
        "modified_time": meta.get("modifiedTime", ""),
        "size_bytes": int(meta.get("size") or 0),
        "md5_checksum": meta.get("md5Checksum"),
        "last_checked_at": now,
        "updated_at": now,
    }
    if ingested:
        row["last_ingested_at"] = now
    return row


def touch_checked(client, meta: dict) -> None:
    year = year_from_drive_meta(meta)
    existing = load_stored_state(client, year)
    row = row_from_drive_meta(meta, ingested=False)
    if existing and existing.get("last_ingested_at"):
        row["last_ingested_at"] = existing["last_ingested_at"]
    client.table(TABLE).upsert(row, on_conflict="year").execute()


def save_ingested(client, meta: dict) -> None:
    row = row_from_drive_meta(meta, ingested=True)
    client.table(TABLE).upsert(row, on_conflict="year").execute()


def table_missing_message() -> str:
    return (
        "ERROR: Supabase table oe_sync_state not found.\n"
        "Run the SQL in supabase/migrations/oe_sync_state.sql on your Supabase project "
        "(SQL editor or CLI), then re-run this workflow."
    )
