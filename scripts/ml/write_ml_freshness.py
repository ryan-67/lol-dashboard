#!/usr/bin/env python3
"""Write public/data/ml_freshness.json so the UI can show OE vs model lag.

Always safe to run after OE ingest — even when ML soft-fails — so the dashboard
can explain why rankings look stale relative to weekly recaps / OE dates.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public" / "data"
AGENT_ML = ROOT / "supabase" / "functions" / "agent-chat" / "ml"
LOL_DIR = ROOT / "lol"


def _max_oe_date() -> str | None:
    """Best-effort latest date string from local OE CSVs (YYYY-MM-DD)."""
    if not LOL_DIR.exists():
        return None
    latest: str | None = None
    date_re = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
    for path in sorted(LOL_DIR.glob("*.csv")):
        # Only scan recent years for speed.
        if not any(path.name.startswith(y) for y in ("2025", "2026")):
            continue
        try:
            # Read date column only when possible; fall back to raw scan of tail.
            import pandas as pd

            df = pd.read_csv(path, usecols=lambda c: str(c).strip().lower() == "date", low_memory=False)
            if df.empty:
                continue
            col = df.columns[0]
            dates = df[col].astype(str).str.slice(0, 10)
            mx = dates.max()
            if isinstance(mx, str) and date_re.fullmatch(mx):
                if latest is None or mx > latest:
                    latest = mx
        except Exception:  # noqa: BLE001
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")[-200_000:]
                found = date_re.findall(text)
                if found:
                    mx = max(found)
                    if latest is None or mx > latest:
                        latest = mx
            except Exception:  # noqa: BLE001
                continue
    return latest


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--outcome",
        default="unknown",
        help="CI step outcome: success | failure | skipped | unknown",
    )
    args = parser.parse_args()

    meta = _read_json(AGENT_ML / "model_metadata.json")
    ratings = _read_json(PUBLIC / "player_ratings.json") or _read_json(AGENT_ML / "player_ratings.json")
    scorecard = _read_json(PUBLIC / "accuracy_scorecard.json")

    oe_max = _max_oe_date()
    model_exported = meta.get("exported_at") or ratings.get("generatedAt") or scorecard.get("generatedAt")
    date_range = meta.get("date_range") or scorecard.get("dateRange")
    holdout_end = None
    if isinstance(date_range, (list, tuple)) and len(date_range) >= 2:
        holdout_end = date_range[1]

    lag_days = None
    if oe_max and holdout_end:
        try:
            lag_days = (
                datetime.strptime(oe_max[:10], "%Y-%m-%d")
                - datetime.strptime(str(holdout_end)[:10], "%Y-%m-%d")
            ).days
        except ValueError:
            lag_days = None

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "retrainOutcome": args.outcome,
        "oeDataThrough": oe_max,
        "modelExportedAt": model_exported,
        "modelHoldoutEnd": holdout_end,
        "oeAheadOfModelDays": lag_days,
        "note": (
            "Team Elo + player ratings only update when ML retrain commits successfully. "
            "OE shards can advance while model artifacts stay frozen if retrain soft-fails."
        ),
    }

    PUBLIC.mkdir(parents=True, exist_ok=True)
    out = PUBLIC / "ml_freshness.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)} — retrain={args.outcome} oe={oe_max} holdout_end={holdout_end}")


if __name__ == "__main__":
    main()
