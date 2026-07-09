#!/usr/bin/env python3
"""
Ensure enough historical Oracle's Elixir CSV years exist locally in lol/ for ML training.

The "Refresh Dashboard Data" GitHub Action (and its underlying `download_oe_csv.py`) only
downloads the *current* year's CSV on its normal scheduled runs — that's all the live
dashboard ingest needs, and keeps the 2-hourly job fast. The ML pipeline, though, needs
multiple years of history for rolling/team-form features, walk-forward validation, and
region Elo — so on a bare CI runner (or a fresh checkout with no persisted lol/), a
current-year-only download isn't enough to retrain from.

This script is a no-op when enough history is already present locally (e.g. a cached
lol/ from a previous CI run, or a local dev machine that already keeps multiple years
around) — it only triggers a one-time full-history download (OE_DOWNLOAD_YEARS=all) on
a genuine cache miss, so the common case stays cheap.

Usage:
    python scripts/ensure_oe_history.py [--min-years 4]

--min-years defaults to 4 to match build_feature_mart.py's defaults (--months 24
--warmup-years 1 needs ~4 distinct calendar years covered near a year boundary,
e.g. 2023-2026 as of mid-2026) — loading fewer years than that just means a shorter
cold-start warmup for the earliest few weeks of the training window (oe_loader.py logs
a warning per missing year rather than failing), so this is a soft floor, not a hard
requirement.

Environment (only read if a full-history download is actually triggered):
    GOOGLE_SERVICE_ACCOUNT_KEY, OE_DRIVE_FOLDER_ID — same as download_oe_csv.py
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import discover_local_csv_files  # noqa: E402
from oe_drive_client import LOL_DIR  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--min-years",
        type=int,
        default=4,
        help="Minimum distinct OE CSV years required locally before skipping the full download (default 4)",
    )
    args = parser.parse_args()

    existing = discover_local_csv_files(LOL_DIR)
    if len(existing) >= args.min_years:
        years = ", ".join(sorted(p.name.split("_")[0] for p in existing))
        print(f"{len(existing)} OE CSV year(s) already present locally ({years}) — skipping full-history download.")
        return

    print(
        f"Only {len(existing)} OE CSV year(s) present locally (< {args.min_years} required for ML training) "
        "— downloading full Oracle's Elixir history from Drive."
    )
    env = dict(os.environ)
    env["OE_DOWNLOAD_YEARS"] = "all"
    subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "download_oe_csv.py")],
        check=True,
        env=env,
    )


if __name__ == "__main__":
    main()
