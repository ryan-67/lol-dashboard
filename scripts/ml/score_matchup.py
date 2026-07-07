#!/usr/bin/env python3
"""Local prematch scorer — mirrors Deno inference + recent-form blend.

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

    if team_a not in snap or team_b not in snap:
        raise SystemExit(f"Team not in snapshot: {team_a in snap}, {team_b in snap}")

    ts, os_ = snap[team_a]["stats"], snap[team_b]["stats"]
    series = state.get(team_a, {})
    h2h_wr = h2h.get(f"{team_a}|{team_b}", {}).get("winrate")

    logit = bundle["intercept"]
    for feat in bundle["features"]:
        v = bundle["medians"].get(feat, 0)
        if feat.startswith("team_"):
            s = feat[5:]
            if s == "h2h_winrate_decayed" and h2h_wr is not None:
                v = h2h_wr
            elif s in series:
                v = series[s]
            elif s in ts:
                v = ts[s]
        elif feat.startswith("opp_"):
            s = feat[4:]
            if s in os_:
                v = os_[s]
        elif feat.startswith("diff_"):
            s = feat[5:]
            if s in ts and s in os_:
                v = ts[s] - os_[s]
        mean = bundle.get("scalerMean", {}).get(feat)
        scale = bundle.get("scalerScale", {}).get(feat)
        if mean is not None and scale:
            v = (v - mean) / scale
        logit += bundle["weights"].get(feat, 0) * v
    return sigmoid(logit)


def blend_recent_form(team_a: str, team_b: str, base: float, weight: float = 0.35) -> tuple[float, str]:
    profiles = json.loads((ML / "team_profiles.json").read_text(encoding="utf-8")).get("teams", {})
    sa = profiles.get(team_a, {}).get("recentForm", {}).get("recentFormScore", 0.5)
    sb = profiles.get(team_b, {}).get("recentForm", {}).get("recentFormScore", 0.5)
    form_a = sa / (sa + sb)
    blended = (1 - weight) * base + weight * form_a
    note = profiles.get(team_a, {}).get("recentForm", {}).get("summary", "")
    return blended, note


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--team-a", required=True)
    p.add_argument("--team-b", required=True)
    args = p.parse_args()

    base = score_structural(args.team_a, args.team_b)
    blended, form_note = blend_recent_form(args.team_a, args.team_b, base)

    print(f"\n{args.team_a} vs {args.team_b}")
    print(f"  Structural model P({args.team_a}): {base*100:.1f}%")
    print(f"  With recent-form blend:        {blended*100:.1f}%")
    if form_note:
        print(f"  {args.team_a} form: {form_note}")


if __name__ == "__main__":
    main()
