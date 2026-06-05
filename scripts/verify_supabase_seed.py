#!/usr/bin/env python3
"""
Post-seed health check: confirm oe_slices has rows for splits just ingested.

Uses the Supabase Python client (same as seed_supabase.py) to avoid PostgREST
filter encoding issues with split labels containing spaces.

Exits 0 on success, 1 on failure. Uses service role key.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "data" / "oe_slices.json"

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import REGIONAL_SPLIT_MARKERS, TIER1_LEAGUES  # noqa: E402


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


def load_manifest() -> dict:
    if not MANIFEST.is_file():
        print(f"ERROR: manifest not found: {MANIFEST}", file=sys.stderr)
        sys.exit(1)
    with MANIFEST.open(encoding="utf-8") as f:
        return json.load(f)


def latest_split_from_manifest(payload: dict) -> str:
    splits = payload.get("meta", {}).get("splits") or []
    if not splits:
        print("ERROR: manifest has no splits.", file=sys.stderr)
        sys.exit(1)
    return splits[-1]


def is_regional_split(split: str) -> bool:
    return any(marker in split for marker in REGIONAL_SPLIT_MARKERS)


def leagues_for_split(client, split: str) -> list[str]:
    response = (
        client.table("oe_slices")
        .select("league")
        .eq("split", split)
        .execute()
    )
    rows = response.data or []
    return sorted({row["league"] for row in rows if row.get("league")})


def count_rows_for_split(client, split: str) -> int:
    response = (
        client.table("oe_slices")
        .select("id", count="exact")
        .eq("split", split)
        .limit(1)
        .execute()
    )
    return int(response.count or 0)


def main() -> None:
    load_env()
    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    try:
        from supabase import create_client
    except ImportError:
        print(
            "ERROR: supabase package not installed. Run: pip install -r scripts/requirements-ingest.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    payload = load_manifest()
    split = latest_split_from_manifest(payload)
    client = create_client(url, key)

    print(f"Checking oe_slices for latest split: {split!r}")
    try:
        count = count_rows_for_split(client, split)
        leagues = leagues_for_split(client, split)
    except Exception as err:
        print(f"ERROR: Supabase query failed: {err}", file=sys.stderr)
        sys.exit(1)

    if count <= 0:
        print(f"ERROR: no rows for split {split!r} in oe_slices.", file=sys.stderr)
        sys.exit(1)

    print(f"OK: {count} row(s) for split {split!r} — leagues: {', '.join(leagues)}")

    if is_regional_split(split):
        missing = [league for league in TIER1_LEAGUES if league not in leagues]
        if missing:
            print(
                f"WARNING: tier-1 leagues missing for {split!r}: {', '.join(missing)} "
                "(ingest may lack enough complete games for those leagues).",
                file=sys.stderr,
            )


if __name__ == "__main__":
    main()
