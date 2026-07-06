#!/usr/bin/env python3
"""Threshold-based win/loss trend insights for nuckyAI (Phase 3).

Identifies conditions (GD@15 buckets, DPM, objective stats, champion presence)
that correlate with winning or losing, for use in prediction packets and
future pre-match preview UI.

Usage:
    python scripts/ml/build_trend_insights.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
SCRIPTS_ROOT = SCRIPTS_DIR.parent
for p in (SCRIPTS_DIR, SCRIPTS_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from oe_csv_io import discover_local_csv_files, normalize_oe_row  # noqa: E402
from oe_leagues import ALL_ALLOWED_LEAGUE_CODES  # noqa: E402

LOL_DIR = ROOT / "lol"
OUT_DIR = ROOT / "data" / "ml" / "artifacts"
ALLOWED_COMPLETENESS = {"complete", "partial"}
MIN_BUCKET_GAMES = 40


def _json_safe(obj):
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    raise TypeError(type(obj))


def patch_bucket(raw: str) -> str:
    parts = str(raw or "").strip().split(".")
    return f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else str(raw or "unknown")


def load_team_games(years: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "patch", "position", "teamname", "result",
            "golddiffat15", "golddiffat20", "golddiffat25", "dpm", "damageshare",
            "firstdragon", "firstherald", "firsttower", "towers", "inhibitors",
            "datacompleteness", "champion",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        df = df[df["position"].astype(str).str.lower().eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            gd15 = row.get("golddiffat15")
            gd20 = row.get("golddiffat20")
            rows.append({
                "gameid": str(row.get("gameid", "")).strip(),
                "patch": patch_bucket(row.get("patch", "")),
                "league": str(row.get("league", "")).strip(),
                "won": int(float(row.get("result", 0) or 0) == 1),
                "gd15": float(gd15) if gd15 not in (None, "") else np.nan,
                "gd20": float(gd20) if gd20 not in (None, "") else np.nan,
                "dpm": float(row.get("dpm", 0) or 0),
                "firstdragon": int(float(row.get("firstdragon", 0) or 0) == 1),
                "firstherald": int(float(row.get("firstherald", 0) or 0) == 1),
                "firsttower": int(float(row.get("firsttower", 0) or 0) == 1),
            })
    return pd.DataFrame(rows)


def bucket_insight(
    df: pd.DataFrame,
    metric: str,
    threshold: float,
    direction: str,
    label: str,
    scope: str = "global",
) -> dict | None:
    if metric not in df.columns:
        return None
    baseline = df["won"].mean()
    if direction == "above":
        subset = df[df[metric] >= threshold]
        cond_label = f"{metric} ≥ {threshold:g}"
    else:
        subset = df[df[metric] <= threshold]
        cond_label = f"{metric} ≤ {threshold:g}"
    n = len(subset)
    if n < MIN_BUCKET_GAMES:
        return None
    wr = subset["won"].mean()
    lift = (wr - baseline) * 100
    if abs(lift) < 3:
        return None
    return {
        "scope": scope,
        "metric": metric,
        "threshold": threshold,
        "direction": direction,
        "games": n,
        "winrate": round(wr * 100, 1),
        "baselineWinrate": round(baseline * 100, 1),
        "lift": round(lift, 1),
        "label": label or f"When {cond_label}, teams win {wr*100:.1f}% vs {baseline*100:.1f}% baseline",
        "favorable": lift > 0,
    }


def build_team_trends(games: pd.DataFrame) -> dict:
    thresholds = [
        ("gd15", 1500, "above", "Teams ahead 1500+ gold at 15m"),
        ("gd15", 1000, "above", "Teams ahead 1000+ gold at 15m"),
        ("gd15", 500, "above", "Teams ahead 500+ gold at 15m"),
        ("gd15", -500, "below", "Teams behind 500+ gold at 15m"),
        ("gd15", -1000, "below", "Teams behind 1000+ gold at 15m"),
        ("gd15", -1500, "below", "Teams behind 1500+ gold at 15m"),
        ("gd20", 2000, "above", "Teams ahead 2000+ gold at 20m"),
        ("gd20", -2000, "below", "Teams behind 2000+ gold at 20m"),
        ("dpm", 600, "above", "Teams with 600+ team DPM"),
        ("dpm", 450, "below", "Teams with sub-450 team DPM"),
    ]
    global_insights: list[dict] = []
    for metric, thr, direction, lbl in thresholds:
        ins = bucket_insight(games, metric, thr, direction, lbl)
        if ins:
            global_insights.append(ins)

    for flag, col in [("first dragon", "firstdragon"), ("first herald", "firstherald"), ("first tower", "firsttower")]:
        if col not in games.columns:
            continue
        sub = games[games[col] == 1]
        if len(sub) >= MIN_BUCKET_GAMES:
            wr = sub["won"].mean()
            base = games["won"].mean()
            lift = (wr - base) * 100
            if abs(lift) >= 3:
                global_insights.append({
                    "scope": "global",
                    "metric": col,
                    "threshold": 1,
                    "direction": "above",
                    "games": len(sub),
                    "winrate": round(wr * 100, 1),
                    "baselineWinrate": round(base * 100, 1),
                    "lift": round(lift, 1),
                    "label": f"Teams securing {flag} win {wr*100:.1f}% vs {base*100:.1f}% baseline",
                    "favorable": lift > 0,
                })

    global_insights.sort(key=lambda x: abs(x["lift"]), reverse=True)

    by_patch: dict[str, list[dict]] = {}
    for patch, pgrp in games.groupby("patch"):
        patch_ins: list[dict] = []
        for metric, thr, direction, lbl in thresholds[:6]:
            ins = bucket_insight(pgrp, metric, thr, direction, f"[{patch}] {lbl}", scope=patch)
            if ins:
                patch_ins.append(ins)
        if patch_ins:
            patch_ins.sort(key=lambda x: abs(x["lift"]), reverse=True)
            by_patch[patch] = patch_ins[:15]

    return {"global": global_insights[:25], "byPatch": by_patch}


def build_champion_conditions(years: list[str]) -> list[dict]:
    """Champion pick presence vs win rate (patch-global)."""
    pick_rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "league", "patch", "position", "teamname", "result",
            "pick1", "pick2", "pick3", "pick4", "pick5", "datacompleteness",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        df = df[df["position"].astype(str).str.lower().eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            patch = patch_bucket(row.get("patch", ""))
            won = int(float(row.get("result", 0) or 0) == 1)
            for i in range(1, 6):
                champ = str(row.get(f"pick{i}", "") or "").strip()
                if champ:
                    pick_rows.append({"patch": patch, "champion": champ, "won": won})

    if not pick_rows:
        return []
    pdf = pd.DataFrame(pick_rows)
    baseline = pdf["won"].mean()
    out: list[dict] = []
    for (patch, champ), grp in pdf.groupby(["patch", "champion"]):
        if len(grp) < 25:
            continue
        wr = grp["won"].mean()
        lift = (wr - baseline) * 100
        if abs(lift) < 4:
            continue
        out.append({
            "patch": patch,
            "champion": champ,
            "games": len(grp),
            "winrate": round(wr * 100, 1),
            "lift": round(lift, 1),
            "favorable": lift > 0,
            "label": f"{champ} on {patch}: {wr*100:.1f}% WR ({lift:+.1f}pp vs baseline)",
        })
    out.sort(key=lambda x: abs(x["lift"]), reverse=True)
    return out[:200]


def main() -> None:
    years = [str(y) for y in range(datetime.now(timezone.utc).year - 1, datetime.now(timezone.utc).year + 1)]
    print(f"Building trend insights from years {years}...")
    games = load_team_games(years)
    print(f"  {len(games)} team-game rows")

    payload = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "teamTrends": build_team_trends(games),
        "championConditions": build_champion_conditions(years),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "trend_insights.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), default=_json_safe)
    print(f"  Wrote {path} ({path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
