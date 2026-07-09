#!/usr/bin/env python3
"""Print nuckyAI's current team-strength inputs side by side, sorted by rating, so you can
eyeball the model's implied power ranking against your own read of the scene.

This does NOT retrain anything — it just reads the artifacts the live prediction blend
already uses (gpr_snapshot.json, region_strength.json, team_profiles.json) and prints them
together. Re-run after `export_artifacts.py` to see the latest snapshot.

Usage:
    python scripts/ml/print_power_rankings.py [--league LCK] [--top 30] [--include-non-gpr]

By default this only prints GPR-covered teams (the ~50 tracked tier-1/tier-2 orgs) — this
is what actually drives predictions for real matchups. Pass --include-non-gpr to also see
the home-grown region-Elo fallback ratings for wildcard/academy squads GPR doesn't track;
that fallback is NOT well-calibrated across leagues (a lower-division team's Elo, built from
walk-forward results entirely within a weaker pool, can outrank a GPR-covered top-tier team)
and is only ever used live for the small number of teams GPR has no entry for at all.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"


def load(name: str) -> dict:
    path = ARTIFACTS_DIR / name
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--league", help="Filter to one region, e.g. LCK/LPL/LEC/LCS")
    parser.add_argument("--top", type=int, default=40, help="Max rows to print (default 40)")
    parser.add_argument(
        "--include-non-gpr",
        action="store_true",
        help="Also include the home-grown region-Elo fallback for teams GPR doesn't cover "
        "(noisy/uncalibrated across leagues — off by default, see module docstring)",
    )
    args = parser.parse_args()

    gpr = load("gpr_snapshot.json")
    strength = load("region_strength.json")
    profiles = load("team_profiles.json").get("teams", {})
    if gpr.get("generatedAt"):
        print(
            f"(static gpr_snapshot.json from {gpr['generatedAt']} - the live prediction path "
            "re-fetches current GPR from CitoAPI at request time and can differ slightly)\n"
        )

    gpr_teams: dict = gpr.get("teams", {})
    strength_teams: dict = strength.get("teams", {})

    all_teams = sorted(set(gpr_teams) | set(strength_teams))
    rows = []
    for team in all_teams:
        gpr_entry = gpr_teams.get(team)
        strength_entry = strength_teams.get(team)
        profile = profiles.get(team, {})
        home_region = (strength_entry or {}).get("homeRegion") or (gpr_entry or {}).get("league") or "?"
        if args.league and home_region.upper() != args.league.upper():
            continue
        if not gpr_entry and not args.include_non_gpr:
            continue

        # Same "prefer GPR elo, fall back to region elo" rule the live blend uses.
        rating = gpr_entry["elo"] if gpr_entry else (strength_entry or {}).get("rating")
        source = "GPR" if gpr_entry else ("region_elo" if strength_entry else "—")

        recent_form = profile.get("recentForm") or {}
        rows.append({
            "team": team,
            "region": home_region,
            "rating": rating,
            "source": source,
            "gprRank": gpr_entry["rank"] if gpr_entry else None,
            "recentFormScore": recent_form.get("recentFormScore"),
            "momentum": recent_form.get("momentum"),
            "recentSummary": recent_form.get("summary", ""),
        })

    rows = [r for r in rows if r["rating"] is not None]
    rows.sort(key=lambda r: r["rating"], reverse=True)

    print(f"{'#':>3}  {'Team':<24} {'Region':<6} {'Rating':>7} {'Src':<10} {'GPR#':>5} {'Form':>5} {'Mom':<6}  Recent")
    print("-" * 130)
    for i, r in enumerate(rows[: args.top], start=1):
        rating = f"{r['rating']:.0f}" if r["rating"] is not None else "-"
        form = f"{r['recentFormScore']:.2f}" if r["recentFormScore"] is not None else "-"
        gpr_rank = str(r["gprRank"]) if r["gprRank"] is not None else "-"
        print(
            f"{i:>3}  {r['team']:<24} {r['region']:<6} {rating:>7} {r['source']:<10} "
            f"{gpr_rank:>5} {form:>5} {(r['momentum'] or '-'):<6}  {r['recentSummary'][:60]}"
        )

    metrics_path = ROOT / "data" / "ml" / "models" / "metrics.json"
    if metrics_path.exists():
        m = json.loads(metrics_path.read_text(encoding="utf-8"))
        pruned = m.get("pruned_model", {}).get("aggregate", {})
        baseline = m.get("pruned_model", {}).get("baseline_aggregate", {})
        print("\n--- Structural model accuracy (walk-forward holdout) ---")
        print(f"  Accuracy: {pruned.get('accuracy', 0) * 100:.1f}% (naive baseline: {baseline.get('accuracy', 0) * 100:.1f}%)")
        print(f"  Log-loss: {pruned.get('log_loss'):.3f} (baseline: {baseline.get('log_loss'):.3f}, lower is better)")
        print(f"  Brier:    {pruned.get('brier'):.3f} (baseline: {baseline.get('brier'):.3f}, lower is better)")
        top_shap = m.get("top_shap_features", {})
        if top_shap:
            print("  Top predictive features (SHAP importance):")
            for feat, val in list(top_shap.items())[:5]:
                print(f"    {feat}: {val:.3f}")


if __name__ == "__main__":
    main()
