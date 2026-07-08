#!/usr/bin/env python3
"""
Export trained model + supporting lookups as JSON artifacts for the Deno edge
function (Phase 3 — supabase/functions/agent-chat/helpers/predictionPacket.ts).

Usage:
    python scripts/ml/export_artifacts.py

Reads:
    data/ml/models/series_model.{json|txt}
    data/ml/models/feature_schema.json
    data/ml/models/metrics.json
    data/ml/feature_mart.parquet
    data/ml/team_form_snapshot.parquet
    data/ml/artifacts/{champ_meta,draft_synergy,player_champ_ratings,trend_insights,team_profiles}.json

Writes (data/ml/artifacts/ + supabase/functions/agent-chat/ml/):
    series_model.json, feature_schema.json, team_form_snapshot.json
    team_inference_state.json  — series win rates + side win rates per team
    h2h_lookup.json            — decayed H2H win rate per team|opponent pair
    inference_bundle.json      — logistic linear approximation for Deno v1 scoring
    champ_meta.json, draft_synergy.json, player_champ_ratings.json, trend_insights.json
    model_metadata.json
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

SCRIPTS_DIR = Path(__file__).resolve().parent
SCRIPTS_ROOT = SCRIPTS_DIR.parent
ROOT = SCRIPTS_DIR.parents[1]
for p in (SCRIPTS_DIR, SCRIPTS_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from team_identity import load_team_rebrand_map  # noqa: E402
from region_elo import write_strength_snapshot  # noqa: E402
from oe_loader import build_team_game_rows, LOL_DIR  # noqa: E402
from cito_supplement import write_gpr_snapshot  # noqa: E402

MODEL_DIR = ROOT / "data" / "ml" / "models"
MART_PATH = ROOT / "data" / "ml" / "feature_mart.parquet"
SNAPSHOT_PATH = ROOT / "data" / "ml" / "team_form_snapshot.parquet"
ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"
DEPLOY_DIR = ROOT / "supabase" / "functions" / "agent-chat" / "ml"
STATIC_DIR = SCRIPTS_DIR / "static"

CATEGORICAL_COLS = ["league", "region", "patch", "split", "oe_year"]
SERIES_STATE_COLS = [
    "team_series_winrate_last5",
    "team_series_winrate_last10",
    "team_series_winrate_last20",
    "team_side_winrate_last10",
    "team_side_winrate_last20",
    "team_rest_days",
    "team_roster_continuity",
]
DRIVER_LABELS = {
    "diff_earned gpm_last20": "Earned gold per minute advantage (20-game)",
    "diff_top_earnedgoldshare_last10": "Top lane gold share differential",
    "diff_gspd_last20": "Gold spent percentage differential",
    "diff_deaths_last10": "Death count differential",
    "diff_golddiffat25_last20": "Gold lead at 25 minutes",
    "team_series_winrate_last20": "Recent series win rate (20)",
    "diff_adc_csdiffat20_last20": "ADC CS differential at 20m",
    "team_h2h_winrate_decayed": "Head-to-head win rate vs opponent",
    "diff_csdiffat15_last10": "CS differential at 15m",
    "diff_towers_last20": "Tower differential",
}


def _stat_suffix_from_feature(feature: str) -> str | None:
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


def build_team_inference_state(mart: pd.DataFrame) -> dict:
    mart = mart.sort_values("date")
    latest = mart.groupby("team", as_index=False).tail(1)
    out: dict[str, dict] = {}
    for row in latest.itertuples():
        entry = {"league": row.league, "region": getattr(row, "region", None)}
        for col in SERIES_STATE_COLS:
            if hasattr(row, col):
                val = getattr(row, col)
                if pd.notna(val):
                    key = col.replace("team_", "")
                    entry[key] = round(float(val), 4)
        out[row.team] = entry
    return out


def build_h2h_lookup(mart: pd.DataFrame) -> dict:
    mart = mart.sort_values("date")
    latest = mart.groupby(["team", "opponent"], as_index=False).tail(1)
    out: dict[str, dict] = {}
    for row in latest.itertuples():
        if pd.isna(row.team_h2h_winrate_decayed):
            continue
        key = f"{row.team}|{row.opponent}"
        out[key] = {
            "winrate": round(float(row.team_h2h_winrate_decayed), 4),
            "games": int(row.team_h2h_games) if pd.notna(row.team_h2h_games) else 0,
        }
    return out


def build_team_aliases() -> dict[str, str]:
    return load_team_rebrand_map()


def build_inference_bundle(mart: pd.DataFrame, features: list[str]) -> dict:
    """Logistic linear approximation for Deno-side scoring (no tree runtime)."""
    df = mart.copy()
    y = df["team_wins_series"].astype(int).values
    w = df["sample_weight"].astype(float).values if "sample_weight" in df.columns else np.ones(len(df))

    X_parts: list[pd.DataFrame] = []
    medians: dict[str, float] = {}
    categoricals: dict[str, dict[str, int]] = {}

    for feat in features:
        if feat not in df.columns:
            medians[feat] = 0.0
            X_parts.append(pd.Series(0.0, index=df.index, name=feat))
            continue
        if feat in CATEGORICAL_COLS:
            codes = df[feat].astype(str).fillna("unknown")
            cats = sorted(codes.unique())
            mapping = {c: i for i, c in enumerate(cats)}
            categoricals[feat] = mapping
            X_parts.append(codes.map(mapping).fillna(-1).astype(float).rename(feat))
        else:
            series = pd.to_numeric(df[feat], errors="coerce")
            med = float(series.median()) if series.notna().any() else 0.0
            medians[feat] = round(med, 6)
            X_parts.append(series.fillna(med).rename(feat))

    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import make_pipeline

    X = pd.concat(X_parts, axis=1)
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000, C=1.0, solver="lbfgs"))
    lr.fit(X.values, y, logisticregression__sample_weight=w)
    model = lr.named_steps["logisticregression"]
    scaler = lr.named_steps["standardscaler"]

    weights = {}
    for feat, c in zip(features, model.coef_[0]):
        weights[feat] = round(float(c), 8)

    return {
        "version": 1,
        "kind": "logistic_linear_scaled",
        "intercept": round(float(model.intercept_[0]), 8),
        "features": features,
        "weights": weights,
        "medians": medians,
        "categoricals": categoricals,
        "driverLabels": DRIVER_LABELS,
        "scalerMean": {f: round(float(m), 6) for f, m in zip(features, scaler.mean_)},
        "scalerScale": {f: round(float(s), 6) for f, s in zip(features, scaler.scale_)},
    }


def deploy_artifacts() -> None:
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    names = [
        "series_model.json",
        "feature_schema.json",
        "team_form_snapshot.json",
        "team_inference_state.json",
        "h2h_lookup.json",
        "inference_bundle.json",
        "team_aliases.json",
        "champ_meta.json",
        "draft_synergy.json",
        "player_champ_ratings.json",
        "trend_insights.json",
        "team_profiles.json",
        "region_strength.json",
        "gpr_snapshot.json",
        "champ_role_profile.json",
        "champ_scaling.json",
        "champion_archetypes.json",
        "model_metadata.json",
    ]
    for name in names:
        src = ARTIFACTS_DIR / name
        if src.exists():
            shutil.copyfile(src, DEPLOY_DIR / name)
    print(f"  Deployed {len(list(DEPLOY_DIR.glob('*.json')))} files -> {DEPLOY_DIR}")


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

    shutil.copyfile(model_src, ARTIFACTS_DIR / model_src.name)
    shutil.copyfile(schema_path, ARTIFACTS_DIR / "feature_schema.json")

    features = schema["features"]

    if SNAPSHOT_PATH.exists():
        snapshot = pd.read_parquet(SNAPSHOT_PATH)
        snapshot["date"] = pd.to_datetime(snapshot["date"])
        team_snapshot_json = build_team_snapshot_json(schema, snapshot)
        with (ARTIFACTS_DIR / "team_form_snapshot.json").open("w", encoding="utf-8") as f:
            json.dump(team_snapshot_json, f, separators=(",", ":"))
        print(f"  Exported current form for {len(team_snapshot_json)} teams")
    else:
        print(f"WARNING: {SNAPSHOT_PATH} not found; skipping team_form_snapshot.json", file=sys.stderr)

    if MART_PATH.exists():
        mart = pd.read_parquet(MART_PATH)
        mart["date"] = pd.to_datetime(mart["date"])
        with (ARTIFACTS_DIR / "team_inference_state.json").open("w", encoding="utf-8") as f:
            json.dump(build_team_inference_state(mart), f, separators=(",", ":"))
        with (ARTIFACTS_DIR / "h2h_lookup.json").open("w", encoding="utf-8") as f:
            json.dump(build_h2h_lookup(mart), f, separators=(",", ":"))
        bundle = build_inference_bundle(mart, features)
        with (ARTIFACTS_DIR / "inference_bundle.json").open("w", encoding="utf-8") as f:
            json.dump(bundle, f, separators=(",", ":"))
        print(f"  Exported inference bundle ({len(features)} features)")
    else:
        print(f"WARNING: {MART_PATH} not found; skipping inference state / bundle", file=sys.stderr)

    with (ARTIFACTS_DIR / "team_aliases.json").open("w", encoding="utf-8") as f:
        json.dump(build_team_aliases(), f, separators=(",", ":"))

    metadata = {
        "exported_at": pd.Timestamp.utcnow().isoformat(),
        "algo": algo,
        "inference_mode": "logistic_linear_v1",
        "model_file": model_src.name,
        "trained_rows": schema.get("trained_rows"),
        "trained_series": schema.get("trained_series"),
        "date_range": schema.get("date_range"),
        "feature_count": len(features),
        "walk_forward_metrics": metrics.get("pruned_model", {}),
        "ship_gate_passed": metrics.get("pruned_model", {}).get("beats_baseline", None),
        "phase3_modes": ["prematch", "draft", "full"],
    }
    with (ARTIFACTS_DIR / "model_metadata.json").open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    strength_path = ARTIFACTS_DIR / "region_strength.json"
    if not strength_path.exists():
        try:
            years = [str(y) for y in range(pd.Timestamp.utcnow().year - 1, pd.Timestamp.utcnow().year + 1)]
            tg = build_team_game_rows(years, LOL_DIR)
            write_strength_snapshot(tg, strength_path)
            print(f"  Built region_strength.json ({len(json.loads(strength_path.read_text())['teams'])} teams)")
        except Exception as exc:
            print(f"WARNING: could not build region_strength.json: {exc}", file=sys.stderr)

    gpr_path = ARTIFACTS_DIR / "gpr_snapshot.json"
    try:
        payload = write_gpr_snapshot(gpr_path)
        if not payload and not gpr_path.exists():
            print("WARNING: gpr_snapshot.json unavailable (no CITO_API_KEY or Cito unreachable) "
                  "— live inference will fall back to region_strength.json", file=sys.stderr)
    except Exception as exc:
        print(f"WARNING: could not build gpr_snapshot.json: {exc}", file=sys.stderr)

    archetypes_src = STATIC_DIR / "champion_archetypes.json"
    if archetypes_src.exists():
        shutil.copyfile(archetypes_src, ARTIFACTS_DIR / "champion_archetypes.json")
        print(f"  Copied {archetypes_src.name} (hand-curated, static)")
    else:
        print(f"WARNING: {archetypes_src} not found; skipping champion_archetypes.json", file=sys.stderr)

    deploy_artifacts()

    print(f"\nArtifacts written to {ARTIFACTS_DIR}:")
    for p in sorted(ARTIFACTS_DIR.glob("*")):
        print(f"  {p.name} ({p.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
