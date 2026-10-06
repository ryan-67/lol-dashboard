#!/usr/bin/env python3
"""
Post-seed health check: confirm oe_slices has rows for every split the
published shards actually contain.

Uses the Supabase Python client (same as seed_supabase.py) to avoid PostgREST
filter encoding issues with split labels containing spaces.

The manifest is cross-checked against shard slice keys first:

- A ``meta.splits`` entry with zero slice keys is a manifest ghost and fails
  with that explicit message (not "no rows").
- A split that shard keys reference but Supabase has 0 rows for fails.
- A regional split that is missing tier-1 leagues warns and does not fail.

``--offline`` runs only the manifest-vs-shards audit (no Supabase credentials).

Exits 0 on success, 1 on failure. Live mode uses the service role key.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
MANIFEST = DATA_DIR / "oe_slices.json"

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import REGIONAL_SPLIT_MARKERS, TIER1_LEAGUES  # noqa: E402
from oe_manifest import audit_manifest_splits  # noqa: E402


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


def report_manifest_shard_audit(payload: dict) -> tuple[list[str], bool]:
    """Print ghost/omitted splits. Return referenced splits and whether to fail."""
    referenced, ghosts, omitted = audit_manifest_splits(payload, DATA_DIR)
    failed = False
    if not referenced and not (payload.get("meta") or {}).get("splits"):
        print("ERROR: manifest has no splits and shards have no slice keys.", file=sys.stderr)
        return referenced, True

    for split in ghosts:
        print(
            f"ERROR: manifest ghost split {split!r} is listed in meta.splits but no "
            f"slice key in year_files shards references it. Drop it from meta.splits; "
            f"ingest and CDN publish now keep only splits that have shard slice keys.",
            file=sys.stderr,
        )
        failed = True

    for split in omitted:
        print(
            f"ERROR: shard slice keys reference split {split!r} but meta.splits omits it.",
            file=sys.stderr,
        )
        failed = True

    if not failed:
        print(
            f"OK: meta.splits matches {len(referenced)} split(s) referenced by shard slice keys: "
            + ", ".join(referenced)
        )
    return referenced, failed


def check_supabase_splits(client, splits: list[str]) -> bool:
    """Fail when a shard-backed split has no Supabase rows. Regional gaps warn."""
    failed = False
    for split in splits:
        print(f"Checking oe_slices for split: {split!r}")
        try:
            count = count_rows_for_split(client, split)
            leagues = leagues_for_split(client, split)
        except Exception as err:
            print(f"ERROR: Supabase query failed for split {split!r}: {err}", file=sys.stderr)
            failed = True
            continue

        if count <= 0:
            print(
                f"ERROR: split {split!r} is referenced by shard slice keys but "
                f"oe_slices has 0 rows.",
                file=sys.stderr,
            )
            failed = True
            continue

        print(f"OK: {count} row(s) for split {split!r} — leagues: {', '.join(leagues)}")

        if is_regional_split(split):
            missing = [league for league in TIER1_LEAGUES if league not in leagues]
            if missing:
                print(
                    f"WARNING: tier-1 leagues missing for {split!r}: {', '.join(missing)} "
                    "(ingest may lack enough complete games for those leagues).",
                    file=sys.stderr,
                )
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify OE manifest splits against shards and Supabase.")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Audit meta.splits against shard slice keys only (no Supabase).",
    )
    args = parser.parse_args()

    payload = load_manifest()
    referenced, manifest_failed = report_manifest_shard_audit(payload)
    if args.offline:
        if manifest_failed:
            sys.exit(1)
        print("Offline audit only — Supabase row counts were not checked.")
        return

    if manifest_failed:
        sys.exit(1)

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

    client = create_client(url, key)
    if check_supabase_splits(client, referenced):
        sys.exit(1)


if __name__ == "__main__":
    main()
