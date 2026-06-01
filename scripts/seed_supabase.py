#!/usr/bin/env python3
"""
Seed Supabase oe_slices table from public/data year shard JSON files.

Usage:
    python scripts/seed_supabase.py
    python scripts/seed_supabase.py --clear-existing

Environment:
    SUPABASE_URL              — project URL (e.g. https://xxx.supabase.co)
    SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)

Optional: loads the same variables from a .env file in the repo root.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
TABLE = "oe_slices"
BATCH_SIZE = 50
MANIFEST_NAME = "oe_slices.json"

logger = logging.getLogger(__name__)


def load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        logger.error("Missing required environment variable: %s", name)
        sys.exit(1)
    return value


def parse_slice_key(key: str) -> tuple[str, str]:
    if "|" not in key:
        raise ValueError(f"Invalid slice key (expected 'split|league'): {key!r}")
    split, league = key.rsplit("|", 1)
    if not split or not league:
        raise ValueError(f"Invalid slice key (expected 'split|league'): {key!r}")
    return split, league


def shard_files() -> list[Path]:
    paths = sorted(DATA_DIR.glob("oe_slices_*.json"))
    return [p for p in paths if p.name != MANIFEST_NAME]


def rows_from_shard(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        payload = json.load(f)

    slices = payload.get("slices")
    if not isinstance(slices, dict):
        raise ValueError(f"{path.name}: missing or invalid 'slices' object")

    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for key, data in slices.items():
        split, league = parse_slice_key(key)
        rows.append(
            {
                "split": split,
                "league": league,
                "data": data,
                "updated_at": now,
            }
        )
    return rows


def clear_table(client) -> None:
    logger.warning("clear_existing=True: deleting all rows from %s", TABLE)
    # PostgREST requires a filter; matches every serial id >= 0.
    response = client.table(TABLE).delete().gte("id", 0).execute()
    deleted = len(response.data) if response.data else 0
    logger.info("Cleared %s (%d rows reported in response)", TABLE, deleted)


def upsert_batches(client, rows: list[dict]) -> int:
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        client.table(TABLE).upsert(batch, on_conflict="split,league").execute()
        total += len(batch)
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed oe_slices in Supabase from JSON shards.")
    parser.add_argument(
        "--clear-existing",
        action="store_true",
        help="Delete all rows in oe_slices before seeding (truncate-equivalent).",
    )
    args = parser.parse_args()
    clear_existing: bool = args.clear_existing

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_env()

    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    try:
        from supabase import create_client
    except ImportError:
        logger.error(
            "supabase package not installed. Run: pip install -r scripts/requirements-seed.txt"
        )
        sys.exit(1)

    paths = shard_files()
    if not paths:
        logger.error("No shard files found in %s", DATA_DIR)
        sys.exit(1)

    client = create_client(url, key)

    if clear_existing:
        clear_table(client)

    files_processed = 0
    slices_upserted = 0
    errors = 0

    for path in paths:
        try:
            rows = rows_from_shard(path)
            if not rows:
                logger.info("%s: 0 slices (skipped upsert)", path.name)
                files_processed += 1
                continue
            count = upsert_batches(client, rows)
            slices_upserted += count
            files_processed += 1
            logger.info("%s: upserted %d slice(s)", path.name, count)
        except Exception:
            errors += 1
            logger.exception("Failed processing %s", path.name)

    logger.info(
        "Done — files_processed=%d slices_upserted=%d errors=%d clear_existing=%s",
        files_processed,
        slices_upserted,
        errors,
        clear_existing,
    )

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
