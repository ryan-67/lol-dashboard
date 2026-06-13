"""
Persist Oracle's Elixir Drive CSV metadata in Supabase oe_sync_state.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = "oe_sync_state"
DATA_DIR = ROOT / "public" / "data"


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


def latest_game_date_from_shard(year: str) -> str | None:
    """Read max match date from ingested JSON shard (avoids re-scanning the full CSV)."""
    path = DATA_DIR / f"oe_slices_{year}.json"
    if not path.is_file():
        return None
    latest: str | None = None
    with path.open(encoding="utf-8") as fh:
        payload = json.load(fh)
    slices = payload.get("slices")
    if not isinstance(slices, dict):
        return None
    for slice_data in slices.values():
        if not isinstance(slice_data, dict):
            continue
        for player in slice_data.get("players") or []:
            if not isinstance(player, dict):
                continue
            for game in player.get("gameLog") or []:
                if not isinstance(game, dict):
                    continue
                date_raw = str(game.get("date", "")).strip()[:10]
                if len(date_raw) == 10 and (latest is None or date_raw > latest):
                    latest = date_raw
    return latest


def latest_game_date_for_year(year: str) -> str | None:
    return latest_game_date_from_shard(year)


def drive_meta_changed(stored: dict | None, meta: dict) -> bool:
    if not stored:
        return True

    if not stored.get("last_ingested_at"):
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


def row_from_drive_meta(
    meta: dict,
    *,
    ingested: bool,
    latest_game_date: str | None = None,
) -> dict:
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
    if latest_game_date:
        row["latest_game_date"] = latest_game_date
    if ingested:
        row["last_ingested_at"] = now
    return row


def preserve_ingest_fields(row: dict, existing: dict | None) -> dict:
    if not existing:
        return row
    for key in ("last_ingested_at", "latest_game_date"):
        if existing.get(key) and key not in row:
            row[key] = existing[key]
    return row


def touch_checked(client, meta: dict) -> None:
    year = year_from_drive_meta(meta)
    existing = load_stored_state(client, year)
    row = row_from_drive_meta(meta, ingested=False)
    row = preserve_ingest_fields(row, existing)
    client.table(TABLE).upsert(row, on_conflict="year").execute()


def save_ingested(client, meta: dict, *, latest_game_date: str | None = None) -> bool:
    """Persist sync metadata. Returns False on non-fatal setup issues (e.g. missing table)."""
    year = year_from_drive_meta(meta)
    if latest_game_date is None:
        latest_game_date = latest_game_date_for_year(year)
    row = row_from_drive_meta(meta, ingested=True, latest_game_date=latest_game_date)
    try:
        client.table(TABLE).upsert(row, on_conflict="year").execute()
        return True
    except Exception as err:
        err_text = str(err).lower()
        if "latest_game_date" in err_text and "latest_game_date" in row:
            print(
                "WARNING: oe_sync_state.latest_game_date column missing — "
                "run supabase/migrations/oe_sync_state.sql then re-save.",
                file=sys.stderr,
            )
            row.pop("latest_game_date", None)
            try:
                client.table(TABLE).upsert(row, on_conflict="year").execute()
                return True
            except Exception as retry_err:
                err = retry_err
                err_text = str(retry_err).lower()

        if _is_missing_sync_table_error(err_text):
            print(table_missing_message(), file=sys.stderr)
            print(
                "WARNING: oe_slices were seeded successfully; only sync-state bookkeeping failed.",
                file=sys.stderr,
            )
            return False
        if _is_sync_state_permission_error(err_text):
            print(sync_state_access_error_message(), file=sys.stderr)
            print(
                "WARNING: oe_slices were seeded successfully; only sync-state bookkeeping failed.",
                file=sys.stderr,
            )
            return False
        raise


def _is_missing_sync_table_error(err_text: str) -> bool:
    return "oe_sync_state" in err_text and (
        "does not exist" in err_text
        or "could not find" in err_text
        or "404" in err_text
        or "42p01" in err_text
        or "pgrst205" in err_text
    )


def _is_sync_state_permission_error(err_text: str) -> bool:
    return "oe_sync_state" in err_text and (
        "permission denied" in err_text or "42501" in err_text
    )


def is_sync_state_access_error(err_text: str) -> bool:
    return _is_missing_sync_table_error(err_text) or _is_sync_state_permission_error(err_text)


def sync_state_access_error_message() -> str:
    return (
        "ERROR: Supabase role cannot access oe_sync_state (permission denied).\n"
        "Re-run supabase/migrations/oe_sync_state.sql in the Supabase SQL editor — "
        "especially the GRANT lines for service_role."
    )


def table_missing_message() -> str:
    return (
        "ERROR: Supabase table oe_sync_state not found.\n"
        "Run the SQL in supabase/migrations/oe_sync_state.sql on your Supabase project "
        "(SQL editor or CLI), then re-run this workflow."
    )
