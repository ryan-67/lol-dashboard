#!/usr/bin/env python3
"""
Build feature_mart.parquet — one row per (series, team perspective) with
walk-forward-safe pre-series features for Bo3/Bo5 series win prediction.

Usage:
    python scripts/ml/build_feature_mart.py
    python scripts/ml/build_feature_mart.py --months 24 --warmup-years 1 --no-cito

Pipeline:
    lol/*.csv (OE raw) --> oe_loader (per-team-per-game rows, canonical teams)
        --> cito_supplement (optional gold-timeline throw features, historical only)
        --> feature_engineering.add_rolling_game_features (prior-form rolling stats)
        --> feature_engineering.build_series_rows (Bo3/Bo5 grouping + pre-series snapshot)
        --> feature_engineering.add_diff_features / add_series_history_features
        --> filter to the last N months, add decay sample_weight + wf_week fold
        --> data/ml/feature_mart.parquet
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from cito_supplement import merge_gold_throw_features  # noqa: E402
from feature_engineering import (  # noqa: E402
    add_current_form_snapshot,
    add_diff_features,
    add_rolling_game_features,
    add_sample_weight,
    add_series_history_features,
    add_walk_forward_fold,
    build_series_rows,
)
from oe_loader import LOL_DIR, build_team_game_rows  # noqa: E402

DEFAULT_OUT = ROOT / "data" / "ml" / "feature_mart.parquet"
DEFAULT_SNAPSHOT_OUT = ROOT / "data" / "ml" / "team_form_snapshot.parquet"


def years_to_load(months: int, warmup_years: int, as_of: datetime) -> list[str]:
    cutoff_year = (as_of - pd.DateOffset(months=months)).year
    start_year = cutoff_year - warmup_years
    return [str(y) for y in range(start_year, as_of.year + 1)]


def _stringify_object_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Parquet/pyarrow can't reliably infer mixed tuple/NaN object columns."""
    for col in ("team_roster", "opponent_roster"):
        if col in df.columns:
            df[col] = df[col].apply(lambda v: ",".join(v) if isinstance(v, (tuple, list, set)) else "")
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=24, help="Training window in months (default 24)")
    parser.add_argument("--warmup-years", type=int, default=1, help="Extra prior years loaded for cold-start rolling history")
    parser.add_argument("--lol-dir", type=Path, default=LOL_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--snapshot-out", type=Path, default=DEFAULT_SNAPSHOT_OUT)
    parser.add_argument("--no-cito", action="store_true", help="Skip CitoAPI/Supabase gold-timeline supplement")
    args = parser.parse_args()

    # Series dates are plain calendar dates (tz-naive) — keep as_of/cutoff naive too.
    as_of = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff_date = pd.Timestamp(as_of) - pd.DateOffset(months=args.months)
    years = years_to_load(args.months, args.warmup_years, as_of)
    print(f"Loading OE years {years} (cutoff={cutoff_date.date()}, as_of={as_of.date()})")

    team_games = build_team_game_rows(years, args.lol_dir)
    print(f"  {len(team_games)} team-game rows across {team_games['gameid'].nunique()} games")

    if not args.no_cito:
        print("Fetching Cito gold-timeline supplement...")
        team_games = merge_gold_throw_features(team_games)
    else:
        for col in ("cito_max_lead", "cito_lead_flips", "cito_time_ahead_share"):
            team_games[col] = float("nan")

    print("Computing prior-form rolling features (walk-forward safe)...")
    team_games_rolled = add_rolling_game_features(team_games)

    print("Computing current (as-of-now) team form snapshot for live inference...")
    snapshot = add_current_form_snapshot(team_games_rolled)
    args.snapshot_out.parent.mkdir(parents=True, exist_ok=True)
    snapshot.to_parquet(args.snapshot_out, index=False)
    print(f"  {len(snapshot)} teams -> {args.snapshot_out}")

    print("Grouping games into Bo3/Bo5 series...")
    mart = build_series_rows(team_games_rolled)
    print(f"  {len(mart) // 2} series ({len(mart)} perspective rows)")

    print("Adding diff features + series-grain history (H2H, streaks, roster, rest)...")
    mart = add_diff_features(mart)
    mart = add_series_history_features(mart)

    before = len(mart)
    mart = mart[mart["date"] >= cutoff_date].reset_index(drop=True)
    print(f"  Filtered warmup rows: {before} -> {len(mart)} (window: last {args.months} months)")

    mart = add_sample_weight(mart, as_of=pd.Timestamp(as_of))
    mart = add_walk_forward_fold(mart)
    mart = _stringify_object_columns(mart)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    mart.to_parquet(args.out, index=False)

    numeric_cols = mart.select_dtypes(include="number").columns
    print("\n=== feature_mart.parquet summary ===")
    print(f"  Path: {args.out}")
    print(f"  Rows: {len(mart)}  (series: {len(mart) // 2})")
    print(f"  Columns: {len(mart.columns)} ({len(numeric_cols)} numeric)")
    print(f"  Date range: {mart['date'].min().date()} .. {mart['date'].max().date()}")
    print(f"  Leagues: {sorted(mart['region'].dropna().unique().tolist())}")
    print(f"  Label balance (team_wins_series=1): {mart['team_wins_series'].mean():.3f}")
    print(f"  Best-of distribution:\n{mart['best_of'].value_counts().to_string()}")


if __name__ == "__main__":
    main()
