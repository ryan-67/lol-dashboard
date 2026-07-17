#!/usr/bin/env python3
"""Offline benchmark: our self-contained Team Power Rating vs official lolesports GPR.

GPR/Kalshi are never a live input into region_elo.py's ratings (see docs/nucky_v2.md
Phase 1) — this script is the *only* place they're used, purely to sanity-check that our
independently-derived rankings land in the same neighborhood as Riot's own, per rank
correlation and top-N overlap. Does not retrain or modify anything.

Usage:
    python scripts/ml/compare_power_rating_vs_gpr.py [--top 20]
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


def spearman(rank_a: list[float], rank_b: list[float]) -> float:
    n = len(rank_a)
    if n < 2:
        return float("nan")
    d2 = sum((a - b) ** 2 for a, b in zip(rank_a, rank_b))
    return 1 - (6 * d2) / (n * (n**2 - 1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args()

    strength = load("region_strength.json").get("teams", {})
    gpr = load("gpr_snapshot.json").get("teams", {})

    shared = sorted(set(strength) & set(gpr))
    print(f"Teams covered by both our system and GPR: {len(shared)} / GPR total {len(gpr)}\n")

    rows = []
    for team in shared:
        rows.append({
            "team": team,
            "region": strength[team].get("homeRegion"),
            "ourRating": strength[team]["rating"],
            "gprElo": gpr[team]["elo"],
            "gprRank": gpr[team]["rank"],
        })

    rows.sort(key=lambda r: r["ourRating"], reverse=True)
    for i, r in enumerate(rows, start=1):
        r["ourRank"] = i

    our_ranks = [r["ourRank"] for r in rows]
    gpr_ranks = [r["gprRank"] for r in rows]
    rho = spearman(our_ranks, gpr_ranks)

    print(f"{'OurRank':>7}  {'GPRRank':>7}  {'Diff':>4}  {'Team':<24} {'Region':<6} {'OurRating':>9} {'GPRElo':>7}")
    print("-" * 80)
    for r in rows[: args.top]:
        delta = r["gprRank"] - r["ourRank"]
        print(
            f"{r['ourRank']:>7}  {r['gprRank']:>7}  {delta:>+4d}  {r['team']:<24} "
            f"{(r['region'] or '?'):<6} {r['ourRating']:>9.1f} {r['gprElo']:>7.0f}"
        )

    top_n = min(args.top, len(rows))
    our_top = {r["team"] for r in rows[:top_n]}
    gpr_top = {r["team"] for r in sorted(rows, key=lambda r: r["gprRank"])[:top_n]}
    overlap = len(our_top & gpr_top)

    print(f"\nSpearman rank correlation (our rank vs GPR rank, n={len(rows)}): {rho:.3f}")
    print(f"Top-{top_n} overlap: {overlap}/{top_n} teams in common")

    biggest = sorted(rows, key=lambda r: abs(r["gprRank"] - r["ourRank"]), reverse=True)[:5]
    print("\nBiggest disagreements:")
    for r in biggest:
        print(f"  {r['team']:<24} our #{r['ourRank']} vs GPR #{r['gprRank']} (diff {r['gprRank']-r['ourRank']:+d})")


if __name__ == "__main__":
    main()
