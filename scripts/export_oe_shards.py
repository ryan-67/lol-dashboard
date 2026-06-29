#!/usr/bin/env python3
"""
Export oe_slices rows from Supabase into public/data CDN shard files.

Writes:
  public/data/oe_slices.json          — manifest (meta + year_files map)
  public/data/oe_slices_YYYY.json     — per-year slice payloads

Usage:
    python scripts/export_oe_shards.py

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or .env in repo root)
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "data"
MANIFEST_NAME = "oe_slices.json"

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import TIER1_LEAGUES  # noqa: E402


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


def split_sort_key(label: str) -> tuple[int, int, str]:
    parts = label.split()
    year = int(parts[0]) if parts and parts[0].isdigit() else 0
    playoffs = 1 if "playoffs" in label.lower() else 0
    season = " ".join(parts[1:]) if len(parts) > 1 else ""
    return (year, playoffs, season)


def main() -> None:
    load_env()
    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    from supabase import create_client

    client = create_client(url, key)

    print("Listing oe_slices keys…")
    keys: list[dict] = []
    page_size = 500
    offset = 0
    while True:
        batch = (
            client.table("oe_slices")
            .select("split, league, updated_at")
            .order("split")
            .order("league")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = batch.data or []
        keys.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    if not keys:
        print("ERROR: no oe_slices rows in Supabase", file=sys.stderr)
        sys.exit(1)

    slices: dict[str, dict] = {}
    split_set: set[str] = set()
    league_set: set[str] = set()
    latest_updated: str | None = None

    for i, row in enumerate(keys, start=1):
        split = str(row.get("split") or "")
        league = str(row.get("league") or "")
        if not split or not league:
            continue

        print(f"  [{i}/{len(keys)}] {split}|{league}")
        slice_resp = (
            client.table("oe_slices")
            .select("data, updated_at")
            .eq("split", split)
            .eq("league", league)
            .maybe_single()
            .execute()
        )
        data = (slice_resp.data or {}).get("data")
        if not data:
            continue

        key = f"{split}|{league}"
        slices[key] = data
        split_set.add(split)
        league_set.add(league)
        updated_at = str(row.get("updated_at") or (slice_resp.data or {}).get("updated_at") or "")
        if updated_at and (not latest_updated or updated_at > latest_updated):
            latest_updated = updated_at

    if not slices:
        print("ERROR: no slice payloads exported", file=sys.stderr)
        sys.exit(1)

    meta = {
        "source": "Oracle's Elixir",
        "generated_at": latest_updated or datetime.now(timezone.utc).isoformat(),
        "leagues": sorted(l for l in TIER1_LEAGUES if l in league_set),
        "splits": sorted(split_set, key=split_sort_key),
        "schema_version": "2.1",
    }

    slices_by_year: dict[str, dict] = defaultdict(dict)
    for key, value in slices.items():
        year = key.split(" ", 1)[0]
        slices_by_year[year][key] = value

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    year_files: dict[str, str] = {}
    for year, year_slices in sorted(slices_by_year.items()):
        shard_name = f"oe_slices_{year}.json"
        shard_path = OUT_DIR / shard_name
        with shard_path.open("w", encoding="utf-8") as f:
            json.dump({"slices": year_slices}, f, separators=(",", ":"))
        year_files[year] = shard_name
        print(f"Wrote {shard_name} ({shard_path.stat().st_size / 1024 / 1024:.2f} MB)")

    manifest_path = OUT_DIR / MANIFEST_NAME
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump({"meta": meta, "year_files": year_files}, f, separators=(",", ":"))
    print(f"Wrote {MANIFEST_NAME} ({manifest_path.stat().st_size / 1024:.1f} KB)")
    print(f"Exported {len(slices)} slice keys across {len(year_files)} year shard(s)")


if __name__ == "__main__":
    main()
