#!/usr/bin/env python3
"""
Stage and commit only CDN-sized OE year shards to git.

Historical year shards (2016-2025) routinely exceed GitHub's 100 MB per-file
limit once ingested from full Oracle's Elixir CSVs. Supabase oe_slices is the
source of truth for multi-year dashboard history; the git-backed CDN fallback
only carries the current competitive year (or an explicit OE_CDN_PUBLISH_YEARS scope).

Usage (typically from refresh-data.yml):
    python scripts/publish_oe_cdn_to_git.py

Environment:
    OE_CDN_PUBLISH_YEARS — 'current' (default), 'all', or comma-separated years
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
DATA_DIR = ROOT / "public" / "data"
MANIFEST_PATH = DATA_DIR / "oe_slices.json"
GITHUB_FILE_LIMIT_BYTES = 100 * 1024 * 1024

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import parse_download_years  # noqa: E402


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def main() -> None:
    if not MANIFEST_PATH.exists():
        print(f"ERROR: manifest not found at {MANIFEST_PATH}", file=sys.stderr)
        sys.exit(1)

    publish_years = parse_download_years(os.environ.get("OE_CDN_PUBLISH_YEARS", "current"))
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    year_files: dict[str, str] = dict(payload.get("year_files") or {})

    if publish_years is not None:
        year_files = {y: f for y, f in year_files.items() if y in publish_years}

    staged_files: list[Path] = []
    skipped_large: list[str] = []
    for year, filename in sorted(year_files.items()):
        shard_path = DATA_DIR / filename
        if not shard_path.exists():
            print(f"WARNING: manifest lists {filename} but file is missing — skipping", file=sys.stderr)
            year_files.pop(year, None)
            continue
        size = shard_path.stat().st_size
        if size >= GITHUB_FILE_LIMIT_BYTES:
            skipped_large.append(f"{filename} ({size / (1024 * 1024):.1f} MB)")
            year_files.pop(year, None)
            continue
        staged_files.append(shard_path)

    if skipped_large:
        print(
            "Skipping shard(s) over GitHub's 100 MB limit (seed Supabase instead):",
            file=sys.stderr,
        )
        for line in skipped_large:
            print(f"  - {line}", file=sys.stderr)

    if not year_files:
        print("No CDN shard files eligible to publish — skipping git commit.")
        return

    payload["year_files"] = year_files
    MANIFEST_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    run(["git", "config", "user.name", "github-actions[bot]"])
    run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"])
    run(["git", "add", str(MANIFEST_PATH.relative_to(ROOT))])
    for path in staged_files:
        run(["git", "add", str(path.relative_to(ROOT))])

    diff = subprocess.run(
        ["git", "diff", "--staged", "--quiet"],
        cwd=ROOT,
    )
    if diff.returncode == 0:
        print("OE CDN shards unchanged — skip commit.")
        return

    years_label = ", ".join(sorted(year_files))
    run(["git", "commit", "-m", f"chore(data): update OE CDN shards ({years_label})"])
    run(["git", "pull", "--rebase"])
    run(["git", "push"])


if __name__ == "__main__":
    main()
