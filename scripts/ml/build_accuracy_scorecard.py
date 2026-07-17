#!/usr/bin/env python3
"""Formal Phase 1 accuracy scorecard — walk-forward holdout sliced by context.

Produces an offline, leakage-free report of nucky's proprietary series model:
  - aggregate log-loss / Brier / accuracy vs naive recent-series-winrate baseline
  - slices by league, patch bucket, and confidence bucket
  - calibration curve
  - offline GPR rank-correlation benchmark (comparison only; never a live input)
  - Kalshi closing-line benchmark stub (blocked until a historical market archive exists)

Usage:
    python scripts/ml/build_accuracy_scorecard.py
    python scripts/ml/build_accuracy_scorecard.py --max-holdout-weeks 16
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from train_series_model import (  # noqa: E402
    BASELINE_COL,
    DEFAULT_MART,
    DEFAULT_MODEL_DIR,
    EPS,
    _score,
    calibration_curve,
    load_mart,
    make_model,
    to_model_frame,
)

ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"
DEFAULT_JSON_OUT = ARTIFACTS_DIR / "accuracy_scorecard.json"
DEFAULT_MD_OUT = ROOT / "docs" / "nucky_accuracy_scorecard.md"
MIN_SLICE_N = 40


def confidence_bucket(proba: float) -> str:
    """Map |p - 0.5| into coarse confidence buckets used by the scorecard."""
    edge = abs(float(proba) - 0.5)
    if edge < 0.08:
        return "coin_flip_<8pp"
    if edge < 0.15:
        return "lean_8_15pp"
    if edge < 0.25:
        return "clear_15_25pp"
    return "strong_>=25pp"


def patch_bucket(patch: object) -> str:
    text = str(patch or "").strip()
    parts = text.split(".")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1][:2].isdigit():
        return f"{parts[0]}.{parts[1][:2]}"
    return text or "unknown"


def spearman_rank_corr(rank_a: list[float], rank_b: list[float]) -> float:
    n = len(rank_a)
    if n < 2:
        return float("nan")
    d2 = sum((a - b) ** 2 for a, b in zip(rank_a, rank_b))
    return 1.0 - (6.0 * d2) / (n * (n * n - 1))


def gpr_rank_benchmark(artifacts_dir: Path = ARTIFACTS_DIR) -> dict:
    """Offline comparison of nucky team Elo ranks vs official GPR ranks."""
    strength_path = artifacts_dir / "region_strength.json"
    gpr_path = artifacts_dir / "gpr_snapshot.json"
    if not strength_path.exists() or not gpr_path.exists():
        return {"status": "missing_artifacts", "sharedTeams": 0}

    strength = json.loads(strength_path.read_text(encoding="utf-8")).get("teams", {})
    gpr = json.loads(gpr_path.read_text(encoding="utf-8")).get("teams", {})
    shared = sorted(set(strength) & set(gpr))
    if len(shared) < 5:
        return {"status": "insufficient_overlap", "sharedTeams": len(shared)}

    rows = [
        {
            "team": team,
            "ourRating": float(strength[team]["rating"]),
            "gprRank": int(gpr[team]["rank"]),
        }
        for team in shared
    ]
    rows.sort(key=lambda r: r["ourRating"], reverse=True)
    for i, row in enumerate(rows, start=1):
        row["ourRank"] = i

    rho = spearman_rank_corr([r["ourRank"] for r in rows], [r["gprRank"] for r in rows])
    top10_our = {r["team"] for r in rows[:10]}
    top10_gpr = {r["team"] for r in sorted(rows, key=lambda r: r["gprRank"])[:10]}
    return {
        "status": "ok",
        "sharedTeams": len(shared),
        "spearmanRho": round(float(rho), 3) if math.isfinite(rho) else None,
        "top10Overlap": len(top10_our & top10_gpr),
        "note": "Comparison benchmark only — GPR has 0% weight in live scoring.",
    }


def kalshi_closing_line_benchmark() -> dict:
    """Placeholder until a historical Kalshi closing-price archive is collected."""
    return {
        "status": "blocked_no_historical_archive",
        "note": (
            "No settled Kalshi closing-line archive is stored yet. Live markets remain "
            "comparison-only (0% model weight). Revisit once enough settled series markets "
            "are archived for offline CLV."
        ),
    }


def walk_forward_oof(
    mart: pd.DataFrame,
    feature_cols: list[str],
    algo: str,
    min_train_weeks: int,
    max_holdout_weeks: int,
) -> pd.DataFrame:
    """Walk-forward OOF predictions with row metadata for scorecard slices."""
    weeks = sorted(mart["wf_week"].unique())
    holdout_weeks = weeks[min_train_weeks:]
    if len(holdout_weeks) > max_holdout_weeks:
        holdout_weeks = holdout_weeks[-max_holdout_weeks:]

    frames: list[pd.DataFrame] = []
    for wk in holdout_weeks:
        train_df = mart[mart["wf_week"] < wk]
        test_df = mart[mart["wf_week"] == wk].copy()
        if len(test_df) < 4 or train_df["team_wins_series"].nunique() < 2:
            continue

        model = make_model(algo)
        model.fit(
            to_model_frame(train_df, feature_cols),
            train_df["team_wins_series"].to_numpy(),
            sample_weight=train_df["sample_weight"].to_numpy(),
        )
        proba = model.predict_proba(to_model_frame(test_df, feature_cols))[:, 1]
        test_df = test_df.reset_index(drop=True)
        test_df["model_proba"] = proba
        test_df["baseline_proba"] = (
            test_df[BASELINE_COL].fillna(0.5).clip(0.02, 0.98).to_numpy()
            if BASELINE_COL in test_df.columns
            else 0.5
        )
        test_df["confidence_bucket"] = [confidence_bucket(p) for p in proba]
        test_df["patch_bucket"] = test_df["patch"].map(patch_bucket)
        frames.append(test_df)

    if not frames:
        raise RuntimeError("No walk-forward holdout weeks produced OOF predictions")
    return pd.concat(frames, ignore_index=True)


def slice_metrics(df: pd.DataFrame, group_col: str) -> list[dict]:
    out: list[dict] = []
    for key, grp in df.groupby(group_col, dropna=False, observed=True):
        if len(grp) < MIN_SLICE_N:
            continue
        y = grp["team_wins_series"].to_numpy()
        w = grp["sample_weight"].to_numpy()
        model = _score(y, grp["model_proba"].to_numpy(), w)
        baseline = _score(y, grp["baseline_proba"].to_numpy(), w)
        out.append({
            "key": str(key),
            "n": int(len(grp)),
            "model": {k: round(v, 4) for k, v in model.items()},
            "baseline": {k: round(v, 4) for k, v in baseline.items()},
            "beatsBaseline": model["log_loss"] < baseline["log_loss"],
        })
    out.sort(key=lambda r: r["n"], reverse=True)
    return out


def build_scorecard(
    mart: pd.DataFrame,
    feature_cols: list[str],
    algo: str,
    min_train_weeks: int,
    max_holdout_weeks: int,
    artifacts_dir: Path = ARTIFACTS_DIR,
) -> dict:
    oof = walk_forward_oof(mart, feature_cols, algo, min_train_weeks, max_holdout_weeks)
    y = oof["team_wins_series"].to_numpy()
    p = oof["model_proba"].to_numpy()
    w = oof["sample_weight"].to_numpy()
    b = oof["baseline_proba"].to_numpy()
    model_agg = _score(y, p, w)
    baseline_agg = _score(y, b, w)

    return {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "algo": algo,
        "featureCount": len(feature_cols),
        "holdoutRows": int(len(oof)),
        "holdoutSeries": int(len(oof) // 2),
        "dateRange": [str(oof["date"].min().date()), str(oof["date"].max().date())],
        "aggregate": {
            "model": {k: round(v, 4) for k, v in model_agg.items()},
            "baseline": {k: round(v, 4) for k, v in baseline_agg.items()},
            "beatsBaseline": model_agg["log_loss"] < baseline_agg["log_loss"],
        },
        "byLeague": slice_metrics(oof, "league"),
        "byPatchBucket": slice_metrics(oof, "patch_bucket"),
        "byConfidenceBucket": slice_metrics(oof, "confidence_bucket"),
        "calibration": calibration_curve(y, np.clip(p, EPS, 1 - EPS)),
        "gprBenchmark": gpr_rank_benchmark(artifacts_dir),
        "kalshiClosingLineBenchmark": kalshi_closing_line_benchmark(),
        "methodology": (
            "Strict expanding-window walk-forward by ISO week on feature_mart.parquet. "
            "Uses the production pruned feature schema when available. Metrics are "
            "sample-weight decayed. GPR/Kalshi sections are offline comparison only."
        ),
    }


def render_markdown(scorecard: dict) -> str:
    agg = scorecard["aggregate"]
    lines = [
        "# nucky accuracy scorecard",
        "",
        f"> Generated `{scorecard['generatedAt']}` · algo `{scorecard['algo']}` · "
        f"{scorecard['holdoutRows']} holdout rows "
        f"({scorecard['dateRange'][0]} → {scorecard['dateRange'][1]})",
        "",
        "## Aggregate (walk-forward)",
        "",
        "| | log-loss | Brier | accuracy |",
        "| --- | --- | --- | --- |",
        f"| **nucky model** | {agg['model']['log_loss']:.4f} | {agg['model']['brier']:.4f} | {agg['model']['accuracy']:.3f} |",
        f"| naive baseline | {agg['baseline']['log_loss']:.4f} | {agg['baseline']['brier']:.4f} | {agg['baseline']['accuracy']:.3f} |",
        "",
        f"Ship gate (beats baseline on log-loss): **{'PASS' if agg['beatsBaseline'] else 'FAIL'}**",
        "",
        "## By league",
        "",
        "| League | n | Model LL | Baseline LL | Acc | Beats baseline |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in scorecard["byLeague"]:
        lines.append(
            f"| {row['key']} | {row['n']} | {row['model']['log_loss']:.4f} | "
            f"{row['baseline']['log_loss']:.4f} | {row['model']['accuracy']:.3f} | "
            f"{'yes' if row['beatsBaseline'] else 'no'} |"
        )

    lines += [
        "",
        "## By confidence bucket",
        "",
        "| Bucket | n | Model LL | Acc | Beats baseline |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in scorecard["byConfidenceBucket"]:
        lines.append(
            f"| {row['key']} | {row['n']} | {row['model']['log_loss']:.4f} | "
            f"{row['model']['accuracy']:.3f} | {'yes' if row['beatsBaseline'] else 'no'} |"
        )

    lines += [
        "",
        "## By patch bucket (top by n)",
        "",
        "| Patch | n | Model LL | Acc | Beats baseline |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in scorecard["byPatchBucket"][:12]:
        lines.append(
            f"| {row['key']} | {row['n']} | {row['model']['log_loss']:.4f} | "
            f"{row['model']['accuracy']:.3f} | {'yes' if row['beatsBaseline'] else 'no'} |"
        )

    gpr = scorecard["gprBenchmark"]
    lines += [
        "",
        "## Offline GPR rank benchmark",
        "",
        f"- Status: `{gpr.get('status')}`",
        f"- Shared teams: {gpr.get('sharedTeams')}",
        f"- Spearman ρ: {gpr.get('spearmanRho')}",
        f"- Top-10 overlap: {gpr.get('top10Overlap')}",
        f"- Note: {gpr.get('note')}",
        "",
        "## Kalshi closing-line benchmark",
        "",
        f"- Status: `{scorecard['kalshiClosingLineBenchmark']['status']}`",
        f"- {scorecard['kalshiClosingLineBenchmark']['note']}",
        "",
        "## Calibration",
        "",
        "| Bin | n | Predicted mean | Actual rate |",
        "| --- | --- | --- | --- |",
    ]
    for row in scorecard["calibration"]:
        lines.append(
            f"| {row['bin']} | {row['n']} | {row['predicted_mean']:.3f} | {row['actual_rate']:.3f} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mart", type=Path, default=DEFAULT_MART)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--min-train-weeks", type=int, default=8)
    parser.add_argument("--max-holdout-weeks", type=int, default=20)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_OUT)
    args = parser.parse_args()

    schema_path = args.model_dir / "feature_schema.json"
    metrics_path = args.model_dir / "metrics.json"
    if not schema_path.exists():
        print(f"ERROR: {schema_path} not found — run train_series_model.py first", file=sys.stderr)
        sys.exit(1)

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}
    algo = schema.get("algo") or metrics.get("winning_algo") or "xgboost"
    feature_cols = schema["features"]

    mart = load_mart(args.mart)
    print(
        f"Building scorecard on {len(mart)} rows with {len(feature_cols)} pruned features "
        f"({algo})...",
        file=sys.stderr,
    )
    scorecard = build_scorecard(
        mart, feature_cols, algo, args.min_train_weeks, args.max_holdout_weeks
    )

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(scorecard, indent=2), encoding="utf-8")
    args.md_out.parent.mkdir(parents=True, exist_ok=True)
    args.md_out.write_text(render_markdown(scorecard), encoding="utf-8")

    agg = scorecard["aggregate"]
    print(f"Wrote {args.json_out}")
    print(f"Wrote {args.md_out}")
    print(
        f"Aggregate: model LL={agg['model']['log_loss']:.4f} "
        f"acc={agg['model']['accuracy']:.3f} | baseline LL={agg['baseline']['log_loss']:.4f} | "
        f"gate={'PASS' if agg['beatsBaseline'] else 'FAIL'}"
    )


if __name__ == "__main__":
    main()
