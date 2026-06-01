#!/usr/bin/env python3
"""
Post-seed health check: confirm oe_slices has rows for the latest split in the manifest.

Exits 0 on success, 1 on failure. Uses Supabase REST (service role).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "data" / "oe_slices.json"


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


def latest_split_from_manifest() -> str:
    if not MANIFEST.is_file():
        print(f"ERROR: manifest not found: {MANIFEST}", file=sys.stderr)
        sys.exit(1)
    with MANIFEST.open(encoding="utf-8") as f:
        payload = json.load(f)
    splits = payload.get("meta", {}).get("splits") or []
    if not splits:
        print("ERROR: manifest has no splits.", file=sys.stderr)
        sys.exit(1)
    return splits[-1]


def count_rows_for_split(base_url: str, key: str, split: str) -> int:
    # PostgREST: quote split labels that contain spaces (e.g. "2026 Spring")
    filter_val = urllib.parse.quote(f'"{split}"', safe="")
    query = f"select=id&split=eq.{filter_val}&limit=1"
    url = f"{base_url}/rest/v1/oe_slices?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        content_range = resp.headers.get("Content-Range", "")
        if "/" in content_range:
            total = content_range.split("/")[-1]
            if total.isdigit():
                return int(total)
        body = resp.read().decode("utf-8")
        rows = json.loads(body) if body.strip() else []
        return len(rows)


def main() -> None:
    load_env()
    base_url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    split = latest_split_from_manifest()

    print(f"Checking oe_slices for latest split: {split!r}")
    try:
        count = count_rows_for_split(base_url, key, split)
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        print(f"ERROR: Supabase HTTP {err.code}: {body}", file=sys.stderr)
        sys.exit(1)

    if count <= 0:
        print(f"ERROR: no rows for split {split!r} in oe_slices.", file=sys.stderr)
        sys.exit(1)

    print(f"OK: {count} row(s) for split {split!r}.")


if __name__ == "__main__":
    main()
