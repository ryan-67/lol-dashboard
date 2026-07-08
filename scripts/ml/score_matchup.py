#!/usr/bin/env python3
"""Local prematch scorer — mirrors Deno inference + form + region/SOS blend.

Usage:
    python scripts/ml/score_matchup.py --team-a T1 --team-b "G2 Esports"
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ML = ROOT / "supabase" / "functions" / "agent-chat" / "ml"


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x)) if x >= 0 else math.exp(x) / (1 + math.exp(x))


def score_structural(team_a: str, team_b: str) -> float:
    bundle = json.loads((ML / "inference_bundle.json").read_text(encoding="utf-8"))
    snap = json.loads((ML / "team_form_snapshot.json").read_text(encoding="utf-8"))
    h2h = json.loads((ML / "h2h_lookup.json").read_text(encoding="utf-8"))
    state = json.loads((ML / "team_inference_state.json").read_text(encoding="utf-8"))
    strength = json.loads((ML / "region_strength.json").read_text(encoding="utf-8")).get("teams", {})

    if team_a not in snap or team_b not in snap:
        raise SystemExit(f"Team not in snapshot: {team_a in snap}, {team_b in snap}")

    ts, os_ = snap[team_a]["stats"], snap[team_b]["stats"]
    series = state.get(team_a, {})
    h2h_wr = h2h.get(f"{team_a}|{team_b}", {}).get("winrate")
    ra = strength.get(team_a, {}).get("rating")
    rb = strength.get(team_b, {}).get("rating")

    logit = bundle["intercept"]
    for feat in bundle["features"]:
        v = bundle["medians"].get(feat, 0)
        if feat.startswith("team_"):
            s = feat[5:]
            if s == "h2h_winrate_decayed" and h2h_wr is not None:
                v = h2h_wr
            elif s == "strength_elo" and ra is not None:
                v = ra
            elif s in series:
                v = series[s]
            elif s in ts:
                v = ts[s]
        elif feat.startswith("opp_"):
            s = feat[4:]
            if s == "strength_elo" and rb is not None:
                v = rb
            elif s in os_:
                v = os_[s]
        elif feat.startswith("diff_"):
            s = feat[5:]
            if s in ("strength_elo", "region_strength_elo") and ra is not None and rb is not None:
                v = ra - rb
            elif s in ts and s in os_:
                v = ts[s] - os_[s]
        mean = bundle.get("scalerMean", {}).get(feat)
        scale = bundle.get("scalerScale", {}).get(feat)
        if mean is not None and scale:
            v = (v - mean) / scale
        logit += bundle["weights"].get(feat, 0) * v
    return sigmoid(logit)


def blend_recent_form(team_a: str, team_b: str, base: float) -> tuple[float, float]:
    profiles = json.loads((ML / "team_profiles.json").read_text(encoding="utf-8")).get("teams", {})
    sa = profiles.get(team_a, {}).get("recentForm", {}).get("recentFormScore", 0.5)
    sb = profiles.get(team_b, {}).get("recentForm", {}).get("recentFormScore", 0.5)
    form_a = sa / (sa + sb)
    blended = 0.65 * base + 0.35 * form_a
    return blended, form_a


def team_strength_rating(team: str) -> tuple[float | None, str | None]:
    """Mirrors mlArtifacts.ts teamStrengthRating: prefer official GPR elo, fall back to region_strength.json."""
    gpr = json.loads((ML / "gpr_snapshot.json").read_text(encoding="utf-8")).get("teams", {}) if (ML / "gpr_snapshot.json").exists() else {}
    if team in gpr:
        return gpr[team]["elo"], "gpr"
    strength = json.loads((ML / "region_strength.json").read_text(encoding="utf-8")).get("teams", {})
    if team in strength:
        return strength[team]["rating"], "region_elo"
    return None, None


def strength_prob(team_a: str, team_b: str, cross_region: bool = False) -> float | None:
    ra, _ = team_strength_rating(team_a)
    rb, _ = team_strength_rating(team_b)
    if ra is None or rb is None:
        return None
    scale = 72 if cross_region else 130
    return sigmoid((ra - rb) / scale)


def blend_all(team_a: str, team_b: str, structural: float, form_a: float) -> float:
    profiles = json.loads((ML / "team_profiles.json").read_text(encoding="utf-8")).get("teams", {})
    home_a = profiles.get(team_a, {}).get("homeRegion")
    home_b = profiles.get(team_b, {}).get("homeRegion")
    cross = bool(home_a and home_b and home_a != home_b)
    sp = strength_prob(team_a, team_b, cross)
    if sp is None:
        return 0.65 * structural + 0.35 * form_a
    if cross:
        return 0.07 * structural + 0.05 * form_a + 0.88 * sp
    return 0.20 * structural + 0.15 * form_a + 0.65 * sp


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--team-a", required=True)
    p.add_argument("--team-b", required=True)
    args = p.parse_args()

    profiles = json.loads((ML / "team_profiles.json").read_text(encoding="utf-8")).get("teams", {})
    home_a = profiles.get(args.team_a, {}).get("homeRegion")
    home_b = profiles.get(args.team_b, {}).get("homeRegion")
    cross = bool(home_a and home_b and home_a != home_b)

    base = score_structural(args.team_a, args.team_b)
    _, form_a = blend_recent_form(args.team_a, args.team_b, base)
    final = blend_all(args.team_a, args.team_b, base, form_a)
    sp = strength_prob(args.team_a, args.team_b, cross)

    ra, source_a = team_strength_rating(args.team_a)
    rb, source_b = team_strength_rating(args.team_b)

    print(f"\n{args.team_a} vs {args.team_b}")
    print(f"  Structural model P({args.team_a}): {base*100:.1f}%")
    print(f"  Recent form P({args.team_a}):       {form_a*100:.1f}%")
    print(f"  Strength source: {args.team_a}={source_a} ({ra}) [{home_a}], {args.team_b}={source_b} ({rb}) [{home_b}]  cross_region={cross}")
    if sp is not None:
        print(f"  Strength-implied P({args.team_a}):     {sp*100:.1f}%")
    print(f"  Final blended P({args.team_a}):          {final*100:.1f}%")


if __name__ == "__main__":
    main()
