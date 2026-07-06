#!/usr/bin/env python3
"""
Export trained model + supporting lookups as JSON artifacts for the Deno edge
function (Phase 3, supabase/functions/agent-chat/helpers/predictionPacket.ts —
not built yet). v1 writes local files only (no Supabase Storage bucket exists
yet for ML artifacts); wiring an upload step is future Phase-3 scope.

Usage:
    python scripts/ml/export_artifacts.py

Reads:
    data/ml/models/series_model.{json|txt}
    data/ml/models/feature_schema.json
    data/ml/models/metrics.json
    data/ml/team_form_snapshot.parquet

Writes (data/ml/artifacts/):
    series_model.json          — raw booster dump (tree JSON; a Deno-side
                                  scorer can traverse these trees directly,
                                  no Python/ML runtime needed)
    feature_schema.json         — ordered feature list + categorical columns
    team_form_snapshot.json     — current per-team rolling form, keyed by
                                  canonical team name, restricted to the
                                  model's actually-used "team_*"/"opp_*" stats
    model_metadata.json         — algo, training window, walk-forward metrics,
                                  ship-gate result, export timestamp
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

MODEL_DIR = ROOT / "data" / "ml" / "models"
SNAPSHOT_PATH = ROOT / "data" / "ml" / "team_form_snapshot.parquet"
ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"


def _stat_suffix_from_feature(feature: str) -> str | None:
    """'team_top_dpm_last10' -> 'top_dpm_last10' (matches team_form_snapshot's 'current_' prefix)."""
    for prefix in ("team_", "opp_", "diff_"):
        if feature.startswith(prefix):
            return feature[len(prefix):]
    return None


def build_team_snapshot_json(schema: dict, snapshot: pd.DataFrame) -> dict:
    needed_stats = set()
    for feat in schema["features"]:
        stat = _stat_suffix_from_feature(feat)
        if stat:
            needed_stats.add(stat)

    out: dict[str, dict] = {}
    for row in snapshot.itertuples():
        team_stats = {}
        for stat in needed_stats:
            col = f"current_{stat}"
            if hasattr(row, col):
                val = getattr(row, col)
                if pd.notna(val):
                    team_stats[stat] = round(float(val), 4) if isinstance(val, float) else val
        out[row.canonical_team] = {
            "league": row.league,
            "region": row.region,
            "as_of": str(row.date.date()),
            "stats": team_stats,
        }
    return out


def main() -> None:
    schema_path = MODEL_DIR / "feature_schema.json"
    metrics_path = MODEL_DIR / "metrics.json"
    if not schema_path.exists():
        print(f"ERROR: {schema_path} not found — run train_series_model.py first", file=sys.stderr)
        sys.exit(1)

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}

    algo = schema["algo"]
    model_src = MODEL_DIR / ("series_model.txt" if algo == "lightgbm" else "series_model.json")
    if not model_src.exists():
        print(f"ERROR: {model_src} not found — run train_series_model.py first", file=sys.stderr)
        sys.exit(1)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    model_dst = ARTIFACTS_DIR / model_src.name
    shutil.copyfile(model_src, model_dst)
    shutil.copyfile(schema_path, ARTIFACTS_DIR / "feature_schema.json")

    if SNAPSHOT_PATH.exists():
        snapshot = pd.read_parquet(SNAPSHOT_PATH)
        snapshot["date"] = pd.to_datetime(snapshot["date"])
        team_snapshot_json = build_team_snapshot_json(schema, snapshot)
        with (ARTIFACTS_DIR / "team_form_snapshot.json").open("w", encoding="utf-8") as f:
            json.dump(team_snapshot_json, f, indent=2, default=str)
        print(f"  Exported current form for {len(team_snapshot_json)} teams")
    else:
        print(f"WARNING: {SNAPSHOT_PATH} not found; skipping team_form_snapshot.json", file=sys.stderr)

    metadata = {
        "exported_at": pd.Timestamp.utcnow().isoformat(),
        "algo": algo,
        "model_file": model_dst.name,
        "trained_rows": schema.get("trained_rows"),
        "trained_series": schema.get("trained_series"),
        "date_range": schema.get("date_range"),
        "feature_count": len(schema.get("features", [])),
        "walk_forward_metrics": metrics.get("pruned_model", {}),
        "ship_gate_passed": metrics.get("pruned_model", {}).get("beats_baseline", None),
    }
    with (ARTIFACTS_DIR / "model_metadata.json").open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nArtifacts written to {ARTIFACTS_DIR}:")
    for p in sorted(ARTIFACTS_DIR.glob("*")):
        print(f"  {p.name} ({p.stat().st_size / 1024:.1f} KB)")
    print(
        "\nNOTE: no Supabase Storage bucket exists yet for ML artifacts (per project decision, "
        "local-only for now). Phase 3 (predictionPacket.ts) will need a Deno-side tree-JSON "
        "scorer + an upload/sync step for these files — not implemented in this pass."
    )


if __name__ == "__main__":
    main()
