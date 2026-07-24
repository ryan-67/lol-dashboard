#!/usr/bin/env python3
"""
Train the Bo3/Bo5 series win-probability model on feature_mart.parquet.

Usage:
    python scripts/ml/train_series_model.py
    python scripts/ml/train_series_model.py --algo lightgbm --max-holdout-weeks 16

Pipeline:
    1. Strict walk-forward validation by calendar week (never random-split —
       each holdout week is scored using only strictly-earlier weeks as
       training data), for both XGBoost and LightGBM, decay-weighted by
       `sample_weight` from the feature mart.
    2. Compare both algorithms + a naive "own recent series win-rate" baseline
       on log-loss / Brier score / accuracy; the better algorithm is selected
       for the production model (ship gate: must beat the naive baseline).
    3. Fit the winning algorithm on the full mart, compute SHAP importances,
       drop zero-importance features, and refit on the pruned feature set.
    4. Save the model, feature schema, and a metrics report to data/ml/models/.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

DEFAULT_MART = ROOT / "data" / "ml" / "feature_mart.parquet"
DEFAULT_MODEL_DIR = ROOT / "data" / "ml" / "models"

NON_FEATURE_COLS = {
    "series_id", "date", "end_date", "team", "opponent", "team_wins_series",
    "score_for", "score_against", "sample_weight", "wf_week",
    "team_roster", "opponent_roster",
    "team_home_region", "opp_home_region",
    # total_games (how many games the series actually took) is only known
    # AFTER the series ends — e.g. it reveals a sweep vs a full-distance
    # series — so it must never be a pre-series feature. best_of (Bo3 vs Bo5)
    # is genuinely known in advance (tournament format) and stays a feature.
    "total_games",
}
CATEGORICAL_COLS = ["league", "region", "patch", "split", "oe_year"]
BASELINE_COL = "team_series_winrate_last10"

EPS = 1e-6


def load_mart(path: Path) -> pd.DataFrame:
    df = pd.read_parquet(path)
    df["date"] = pd.to_datetime(df["date"])
    # Categorical dtype must be set ONCE on the full mart so every walk-forward
    # train/test slice shares the same category codes — otherwise a later
    # holdout week with a value unseen in its own slice (e.g. a new patch
    # string) errors out instead of being treated as a known-but-unused category.
    for c in CATEGORICAL_COLS:
        if c in df.columns:
            df[c] = df[c].astype("category")
    return df


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in NON_FEATURE_COLS]


def to_model_frame(df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
    return df[feature_cols]


def make_model(algo: str):
    if algo == "lightgbm":
        import lightgbm as lgb

        return lgb.LGBMClassifier(
            n_estimators=400,
            learning_rate=0.03,
            num_leaves=31,
            min_child_samples=20,
            subsample=0.8,
            subsample_freq=1,
            colsample_bytree=0.7,
            reg_alpha=0.2,
            reg_lambda=0.5,
            objective="binary",
            random_state=42,
            verbosity=-1,
        )
    if algo == "xgboost":
        import xgboost as xgb

        return xgb.XGBClassifier(
            n_estimators=400,
            learning_rate=0.03,
            max_depth=4,
            subsample=0.8,
            colsample_bytree=0.7,
            reg_alpha=0.2,
            reg_lambda=1.0,
            objective="binary:logistic",
            enable_categorical=True,
            tree_method="hist",
            random_state=42,
        )
    raise ValueError(f"Unknown algo: {algo}")


def _score(y_true, proba, weight) -> dict:
    proba = np.clip(proba, EPS, 1 - EPS)
    return {
        "log_loss": float(log_loss(y_true, proba, sample_weight=weight, labels=[0, 1])),
        "brier": float(brier_score_loss(y_true, proba, sample_weight=weight)),
        "accuracy": float(np.average((proba > 0.5).astype(int) == y_true, weights=weight)),
    }


def walk_forward_eval(
    mart: pd.DataFrame,
    feature_cols: list[str],
    algo: str,
    min_train_weeks: int,
    max_holdout_weeks: int,
) -> tuple[list[dict], np.ndarray, np.ndarray, np.ndarray]:
    """Expanding-window walk-forward validation by ISO calendar week.

    Returns (per_week_results, oof_y_true, oof_proba, oof_weight) where the
    oof_* arrays concatenate every holdout week's predictions (for a
    leakage-free calibration curve).
    """
    weeks = sorted(mart["wf_week"].unique())
    if len(weeks) <= min_train_weeks:
        raise ValueError(f"Only {len(weeks)} weeks available; need > {min_train_weeks} for walk-forward eval")

    holdout_weeks = weeks[min_train_weeks:]
    if len(holdout_weeks) > max_holdout_weeks:
        holdout_weeks = holdout_weeks[-max_holdout_weeks:]

    results = []
    oof_y, oof_p, oof_w = [], [], []

    for wk in holdout_weeks:
        train_df = mart[mart["wf_week"] < wk]
        test_df = mart[mart["wf_week"] == wk]
        if len(test_df) < 4 or train_df["team_wins_series"].nunique() < 2:
            continue

        X_train = to_model_frame(train_df, feature_cols)
        X_test = to_model_frame(test_df, feature_cols)
        y_train = train_df["team_wins_series"].to_numpy()
        y_test = test_df["team_wins_series"].to_numpy()
        w_train = train_df["sample_weight"].to_numpy()
        w_test = test_df["sample_weight"].to_numpy()

        model = make_model(algo)
        model.fit(X_train, y_train, sample_weight=w_train)
        proba = model.predict_proba(X_test)[:, 1]

        model_scores = _score(y_test, proba, w_test)
        baseline_proba = test_df[BASELINE_COL].fillna(0.5).clip(0.02, 0.98).to_numpy()
        baseline_scores = _score(y_test, baseline_proba, w_test)

        results.append({"week": wk, "n": int(len(test_df)), "model": model_scores, "baseline": baseline_scores})
        oof_y.append(y_test)
        oof_p.append(proba)
        oof_w.append(w_test)

    return results, np.concatenate(oof_y), np.concatenate(oof_p), np.concatenate(oof_w)


def _aggregate(results: list[dict], key: str) -> dict:
    n_total = sum(r["n"] for r in results)
    agg = {}
    for metric in ("log_loss", "brier", "accuracy"):
        agg[metric] = float(sum(r[key][metric] * r["n"] for r in results) / n_total) if n_total else float("nan")
    return agg


def calibration_curve(y_true: np.ndarray, proba: np.ndarray, n_bins: int = 10) -> list[dict]:
    bins = np.linspace(0, 1, n_bins + 1)
    idx = np.digitize(proba, bins[1:-1])
    out = []
    for b in range(n_bins):
        mask = idx == b
        if mask.sum() == 0:
            continue
        out.append(
            {
                "bin": f"{bins[b]:.1f}-{bins[b + 1]:.1f}",
                "n": int(mask.sum()),
                "predicted_mean": float(proba[mask].mean()),
                "actual_rate": float(y_true[mask].mean()),
            }
        )
    return out


def shap_importance(model, X: pd.DataFrame, algo: str) -> pd.Series:
    """Mean |SHAP| per feature for pruning.

    XGBoost is trained with ``enable_categorical=True``, but SHAP's TreeExplainer
    builds a fresh ``DMatrix`` that does *not* inherit that flag — pandas
    ``category`` columns then crash with KeyError/ValueError. Convert
    categoricals to codes for the SHAP pass only (importance ranking still
    ranks those columns; the production model keeps native categoricals).
    """
    import shap

    X_shap = X.copy()
    for c in CATEGORICAL_COLS:
        if c in X_shap.columns and isinstance(X_shap[c].dtype, pd.CategoricalDtype):
            X_shap[c] = X_shap[c].cat.codes.astype(np.float32)

    # Any remaining non-numeric object/category cols (defensive).
    for c in list(X_shap.columns):
        dtype = X_shap[c].dtype
        if isinstance(dtype, pd.CategoricalDtype) or dtype == object:
            X_shap[c] = pd.Categorical(X_shap[c]).codes.astype(np.float32)

    booster = model.get_booster() if algo == "xgboost" else model.booster_
    explainer = shap.TreeExplainer(booster)
    shap_values = explainer.shap_values(X_shap)
    if isinstance(shap_values, list):
        shap_values = shap_values[1]
    shap_values = np.asarray(shap_values)
    if shap_values.ndim == 3:  # some SHAP/XGBoost combos return (n, features, classes)
        shap_values = shap_values[:, :, -1]
    mean_abs = np.abs(shap_values).mean(axis=0)
    return pd.Series(mean_abs, index=X.columns).sort_values(ascending=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mart", type=Path, default=DEFAULT_MART)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--algo", choices=["auto", "lightgbm", "xgboost"], default="auto")
    parser.add_argument("--min-train-weeks", type=int, default=8)
    parser.add_argument("--max-holdout-weeks", type=int, default=20)
    parser.add_argument("--shap-threshold-frac", type=float, default=0.001, help="Drop features below this fraction of max |SHAP|")
    args = parser.parse_args()

    mart = load_mart(args.mart)
    feature_cols = feature_columns(mart)
    print(f"Loaded {len(mart)} rows ({len(mart) // 2} series), {len(feature_cols)} candidate features")

    candidate_algos = ["lightgbm", "xgboost"] if args.algo == "auto" else [args.algo]
    algo_reports: dict[str, dict] = {}
    oof_by_algo: dict[str, tuple] = {}

    for algo in candidate_algos:
        print(f"\n--- Walk-forward validation: {algo} ---")
        results, oof_y, oof_p, oof_w = walk_forward_eval(
            mart, feature_cols, algo, args.min_train_weeks, args.max_holdout_weeks
        )
        model_agg = _aggregate(results, "model")
        baseline_agg = _aggregate(results, "baseline")
        print(f"  Holdout weeks: {len(results)}  Rows: {sum(r['n'] for r in results)}")
        print(f"  {algo:9s} log_loss={model_agg['log_loss']:.4f} brier={model_agg['brier']:.4f} acc={model_agg['accuracy']:.3f}")
        print(f"  baseline  log_loss={baseline_agg['log_loss']:.4f} brier={baseline_agg['brier']:.4f} acc={baseline_agg['accuracy']:.3f}")
        algo_reports[algo] = {
            "per_week": results,
            "aggregate": model_agg,
            "baseline_aggregate": baseline_agg,
            "beats_baseline": model_agg["log_loss"] < baseline_agg["log_loss"],
        }
        oof_by_algo[algo] = (oof_y, oof_p, oof_w)

    winner = min(algo_reports, key=lambda a: algo_reports[a]["aggregate"]["log_loss"])
    print(f"\nSelected algorithm for production model: {winner}")

    print(f"\nFitting final {winner} model on full mart ({len(mart)} rows)...")
    X_full = to_model_frame(mart, feature_cols)
    y_full = mart["team_wins_series"].to_numpy()
    w_full = mart["sample_weight"].to_numpy()

    full_model = make_model(winner)
    full_model.fit(X_full, y_full, sample_weight=w_full)

    print("Computing SHAP importances for zero-importance pruning...")
    importance = shap_importance(full_model, X_full, winner)
    threshold = importance.max() * args.shap_threshold_frac
    kept_features = importance[importance >= threshold].index.tolist()
    dropped_features = importance[importance < threshold].index.tolist()
    print(f"  Kept {len(kept_features)}/{len(feature_cols)} features (dropped {len(dropped_features)} near-zero-importance)")

    print(f"Refitting {winner} on pruned feature set...")
    X_pruned = X_full[kept_features]
    pruned_model = make_model(winner)
    pruned_model.fit(X_pruned, y_full, sample_weight=w_full)

    # Re-run walk-forward with the pruned feature set for the final reported metrics
    # (guards against the SHAP step having overfit feature selection to the full data).
    print("Re-validating pruned model on walk-forward holdout...")
    pruned_results, pruned_oof_y, pruned_oof_p, pruned_oof_w = walk_forward_eval(
        mart, kept_features, winner, args.min_train_weeks, args.max_holdout_weeks
    )
    pruned_agg = _aggregate(pruned_results, "model")
    pruned_baseline_agg = _aggregate(pruned_results, "baseline")
    print(f"  pruned    log_loss={pruned_agg['log_loss']:.4f} brier={pruned_agg['brier']:.4f} acc={pruned_agg['accuracy']:.3f}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.out_dir / f"series_model.{'txt' if winner == 'lightgbm' else 'json'}"
    if winner == "lightgbm":
        pruned_model.booster_.save_model(str(model_path))
    else:
        pruned_model.get_booster().save_model(str(model_path))

    schema = {
        "algo": winner,
        "features": kept_features,
        "categorical_features": [c for c in CATEGORICAL_COLS if c in kept_features],
        "target": "team_wins_series",
        "trained_rows": int(len(mart)),
        "trained_series": int(len(mart) // 2),
        "date_range": [str(mart["date"].min().date()), str(mart["date"].max().date())],
    }
    with (args.out_dir / "feature_schema.json").open("w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)

    metrics = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "winning_algo": winner,
        "algo_comparison": {
            algo: {k: v for k, v in report.items() if k != "per_week"} for algo, report in algo_reports.items()
        },
        "full_feature_count": len(feature_cols),
        "pruned_feature_count": len(kept_features),
        "dropped_zero_importance": dropped_features,
        "top_shap_features": importance.head(30).round(6).to_dict(),
        "pruned_model": {
            "aggregate": pruned_agg,
            "baseline_aggregate": pruned_baseline_agg,
            "beats_baseline": pruned_agg["log_loss"] < pruned_baseline_agg["log_loss"],
            "holdout_weeks": len(pruned_results),
            "holdout_rows": sum(r["n"] for r in pruned_results),
        },
        "calibration": calibration_curve(pruned_oof_y, pruned_oof_p),
    }
    with (args.out_dir / "metrics.json").open("w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nSaved model -> {model_path}")
    print(f"Saved feature schema -> {args.out_dir / 'feature_schema.json'}")
    print(f"Saved metrics -> {args.out_dir / 'metrics.json'}")
    gate = "PASS" if metrics["pruned_model"]["beats_baseline"] else "FAIL"
    print(f"\nShip gate (beat naive baseline on holdout log-loss): {gate}")


if __name__ == "__main__":
    main()
