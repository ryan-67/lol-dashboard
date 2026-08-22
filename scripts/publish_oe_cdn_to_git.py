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


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, check=check, cwd=ROOT)


def tracked_shard_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "public/data/oe_slices_*.json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [ROOT / line.strip() for line in result.stdout.splitlines() if line.strip()]


def shard_year_from_stem(stem: str) -> str | None:
    rest = stem.replace("oe_slices_", "", 1)
    if len(rest) >= 4 and rest[:4].isdigit():
        return rest[:4]
    return None


def flatten_year_ref(value: str | list[str] | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def restore_unpublished_shards(publish_years: set[str] | None) -> None:
    """Drop accidental on-disk regenerations of historical shards we are not publishing.

    Ingest may run with download_scope=all (manual dispatch) while CDN publish stays
    current-only. Those regenerated multi-hundred-MB files remain tracked in git from
    older commits — leaving them modified but unstaged breaks `git pull --rebase`.
    """
    for path in tracked_shard_paths():
        year = shard_year_from_stem(path.stem)
        if publish_years is not None and year in publish_years:
            continue
        rel = path.relative_to(ROOT)
        if path.exists():
            run(["git", "restore", "--staged", "--worktree", str(rel)], check=False)
        else:
            run(["git", "restore", "--staged", "--worktree", str(rel)], check=False)


def remove_unpublished_shards_from_git(publish_years: set[str] | None) -> None:
    """Stop tracking historical CDN shards — Supabase is the multi-year source of truth."""
    if publish_years is None:
        return
    for path in tracked_shard_paths():
        year = shard_year_from_stem(path.stem)
        if year in publish_years:
            continue
        rel = path.relative_to(ROOT)
        run(["git", "rm", "-f", "--cached", str(rel)], check=False)
        path.unlink(missing_ok=True)


def main() -> None:
    if not MANIFEST_PATH.exists():
        print(f"ERROR: manifest not found at {MANIFEST_PATH}", file=sys.stderr)
        sys.exit(1)

    publish_years = parse_download_years(os.environ.get("OE_CDN_PUBLISH_YEARS", "current"))
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    year_files: dict[str, str | list[str]] = dict(payload.get("year_files") or {})

    if publish_years is not None:
        year_files = {y: f for y, f in year_files.items() if y in publish_years}

    staged_files: list[Path] = []
    skipped_large: list[str] = []
    kept: dict[str, str | list[str]] = {}
    for year, ref in sorted(year_files.items()):
        filenames = flatten_year_ref(ref)
        if not filenames:
            continue
        year_paths: list[Path] = []
        drop_year = False
        for filename in filenames:
            shard_path = DATA_DIR / filename
            if not shard_path.exists():
                print(
                    f"WARNING: manifest lists {filename} but file is missing — skipping year {year}",
                    file=sys.stderr,
                )
                drop_year = True
                break
            size = shard_path.stat().st_size
            if size >= GITHUB_FILE_LIMIT_BYTES:
                skipped_large.append(f"{filename} ({size / (1024 * 1024):.1f} MB)")
                drop_year = True
                break
            year_paths.append(shard_path)
        if drop_year:
            continue
        staged_files.extend(year_paths)
        kept[year] = filenames if len(filenames) > 1 else filenames[0]
    year_files = kept

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

    restore_unpublished_shards(publish_years)
    remove_unpublished_shards_from_git(publish_years)

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
    # Ingest/Riot leave other tracked files dirty. A raw rebase dies with
    # "unstaged changes" when Cloud Agents moved main during this job.
    helper = ROOT / "scripts" / "ci" / "push-main-with-rebase.sh"
    run(["bash", str(helper)])


if __name__ == "__main__":
    main()
