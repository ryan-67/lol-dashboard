#!/usr/bin/env python3
"""Publish retrained ML artifacts to the paths nucky.gg actually reads.

Two publish surfaces:

1. ``public/data/`` — GitHub Pages / Vite static site
   (landing scorecard, power rankings, team Elo boards, freshness stamp)
2. ``supabase/functions/agent-chat/ml/`` — bundled into the Deno edge function
   (prediction packets, chat grounding). Live Supabase still needs
   ``supabase functions deploy agent-chat`` after this git commit.

``export_artifacts.py`` already copies into both trees; this script is the
explicit CI "publish" checkpoint: re-sync public/data from the deploy tree,
write ml_freshness.json, and fail loudly if required dashboard files are missing.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from write_ml_freshness import write_freshness  # noqa: E402

DEPLOY_DIR = ROOT / "supabase" / "functions" / "agent-chat" / "ml"
PUBLIC_DIR = ROOT / "public" / "data"
ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"

# Files the static site fetches from /data/*
PUBLIC_REQUIRED = (
    "player_ratings.json",
    "region_strength.json",
    "accuracy_scorecard.json",
    "model_metadata.json",
)


def _prefer_src(name: str) -> Path | None:
    for base in (DEPLOY_DIR, ARTIFACTS_DIR):
        path = base / name
        if path.exists():
            return path
    return None


def publish_public_dashboard_artifacts() -> list[str]:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    missing: list[str] = []
    for name in PUBLIC_REQUIRED:
        src = _prefer_src(name)
        if not src:
            missing.append(name)
            continue
        dest = PUBLIC_DIR / name
        shutil.copyfile(src, dest)
        copied.append(name)
        print(f"  public/data/{name} <- {src.relative_to(ROOT)}")
    if missing:
        raise SystemExit(
            "Missing required model artifacts for nucky.gg publish: "
            + ", ".join(missing)
            + ". Did export_artifacts.py finish?"
        )
    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--outcome",
        default="success",
        help="Retrain outcome stamped into ml_freshness.json",
    )
    args = parser.parse_args()

    print("Publishing model artifacts to nucky.gg surfaces…")
    if not DEPLOY_DIR.exists():
        raise SystemExit(f"Missing {DEPLOY_DIR} — run export_artifacts.py first")

    copied = publish_public_dashboard_artifacts()
    write_freshness(args.outcome)

    print(
        f"Published {len(copied)} dashboard artifacts + ml_freshness.json. "
        "Commit public/data/* and agent-chat/ml/, then deploy agent-chat for live chat."
    )


if __name__ == "__main__":
    main()
