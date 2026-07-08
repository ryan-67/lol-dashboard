#!/usr/bin/env python3
"""Build draft/comp artifacts from OE CSVs (Phase 3b).

Exports:
  champ_meta.json       — patch-bucketed pick/win/ban/presence per champion
  draft_synergy.json    — co-pick pair win-rate lift vs independence
  player_champ_ratings.json — player × champion comfort (patch-global + patch-specific)

Usage:
    python scripts/ml/train_draft_model.py
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
SCRIPTS_ROOT = SCRIPTS_DIR.parent
ROOT = SCRIPTS_DIR.parents[1]
for p in (SCRIPTS_DIR, SCRIPTS_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from oe_csv_io import discover_local_csv_files, normalize_oe_row  # noqa: E402
from oe_leagues import ALL_ALLOWED_LEAGUE_CODES  # noqa: E402

ALLOWED_COMPLETENESS = {"complete", "partial"}
LOL_DIR = ROOT / "lol"
OUT_DIR = ROOT / "data" / "ml" / "artifacts"
MIN_CHAMP_GAMES = 8
MIN_PAIR_GAMES = 12
MIN_PLAYER_CHAMP = 3
MIN_ROLE_GAMES = 5
MIN_SCALING_GAMES = 10
RECENT_WINDOW_DAYS = 45
DURATION_BUCKETS = [("lt25", 0, 1500), ("25to35", 1500, 2100), ("gt35", 2100, 10 ** 9)]
POSITION_MAP = {
    "top": "top", "jng": "jungle", "jungle": "jungle", "mid": "mid",
    "bot": "adc", "adc": "adc", "sup": "support", "support": "support",
}


def _sanitize_nan(obj):
    """Recursively replace NaN/Infinity with None (Deno's JSON.parse rejects bare NaN)."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        return val if math.isfinite(val) else None
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_nan(v) for v in obj]
    return obj


def patch_bucket(raw: str) -> str:
    parts = str(raw or "").strip().split(".")
    return f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else str(raw or "unknown")


def load_game_drafts(years: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        print(f"  Draft scan: {path.name}", file=sys.stderr)
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "patch", "position", "teamname", "result",
            "champion", "playername", "name", "datacompleteness",
            "ban1", "ban2", "ban3", "ban4", "ban5",
            "pick1", "pick2", "pick3", "pick4", "pick5",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            if str(row.get("position", "")).lower() != "team":
                continue
            game_id = str(row.get("gameid", "")).strip()
            team = str(row.get("teamname", "")).strip()
            if not game_id or not team:
                continue
            picks = [str(row.get(f"pick{i}", "") or "").strip() for i in range(1, 6)]
            picks = [p for p in picks if p]
            bans = [str(row.get(f"ban{i}", "") or "").strip() for i in range(1, 6)]
            bans = [b for b in bans if b]
            rows.append({
                "gameid": game_id,
                "date": str(row.get("date", ""))[:10],
                "league": str(row.get("league", "")).strip(),
                "patch": patch_bucket(row.get("patch", "")),
                "team": team,
                "won": int(float(row.get("result", 0) or 0) == 1),
                "picks": picks,
                "bans": bans,
            })
    if not rows:
        raise RuntimeError("No team draft rows found")
    return pd.DataFrame(rows)


def _norm_pos(raw: str) -> str:
    return POSITION_MAP.get(str(raw or "").strip().lower(), "")


def load_player_champ_rows(years: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "patch", "position", "teamname", "result",
            "champion", "playername", "name", "datacompleteness",
            "golddiffat15", "csdiffat15", "damageshare", "dpm", "killparticipation",
            "gamelength",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        pos = df["position"].astype(str).str.lower()
        df = df[~pos.eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            player = str(row.get("playername") or row.get("name") or "").strip()
            champ = str(row.get("champion", "") or "").strip()
            if not player or not champ:
                continue
            gd15 = row.get("golddiffat15")
            csd15 = row.get("csdiffat15")
            gamelength = row.get("gamelength")
            rows.append({
                "player": player,
                "champion": champ,
                "team": str(row.get("teamname", "")).strip(),
                "role": _norm_pos(row.get("position", "")),
                "date": str(row.get("date", ""))[:10],
                "patch": patch_bucket(row.get("patch", "")),
                "won": int(float(row.get("result", 0) or 0) == 1),
                "gd15": float(gd15) if gd15 not in (None, "") else np.nan,
                "csd15": float(csd15) if csd15 not in (None, "") else np.nan,
                "dmg_share": float(row.get("damageshare", 0) or 0) * 100,
                "dpm": float(row.get("dpm", 0) or 0) if row.get("dpm") not in (None, "") else np.nan,
                "kp": float(row.get("killparticipation", 0) or 0) * 100,
                "gamelength": float(gamelength) if gamelength not in (None, "") else np.nan,
            })
    return pd.DataFrame(rows)


def build_champ_meta(games: pd.DataFrame) -> dict:
    pick_stats: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"picks": 0, "wins": 0, "bans": 0}))
    game_counts: dict[str, int] = defaultdict(int)

    for game_id, grp in games.groupby("gameid"):
        patch = grp["patch"].iloc[0]
        game_counts[patch] += 1
        seen_picks: set[str] = set()
        for _, row in grp.iterrows():
            for champ in row["picks"]:
                pick_stats[patch][champ]["picks"] += 1
                pick_stats[patch][champ]["wins"] += row["won"]
                seen_picks.add(champ)
            for champ in row["bans"]:
                pick_stats[patch][champ]["bans"] += 1

    out: dict[str, dict] = {}
    for patch, champs in pick_stats.items():
        denom = max(game_counts[patch], 1)
        out[patch] = {}
        for champ, s in champs.items():
            picks = s["picks"]
            if picks < MIN_CHAMP_GAMES:
                continue
            pick_rate = picks / denom
            ban_rate = s["bans"] / denom
            out[patch][champ] = {
                "picks": picks,
                "wins": s["wins"],
                "winrate": round(s["wins"] / picks * 100, 1),
                "pickRate": round(pick_rate * 100, 1),
                "banRate": round(ban_rate * 100, 1),
                "presence": round(min(200, (pick_rate + ban_rate) * 100), 1),
            }
    return out


def build_synergy(games: pd.DataFrame) -> dict:
    """Co-pick pair win-rate lift vs product of marginal win rates."""
    pair: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    champ_wr: dict[tuple[str, str], list[int]] = defaultdict(list)

    for _, row in games.iterrows():
        patch = row["patch"]
        won = row["won"]
        picks = row["picks"]
        for c in picks:
            champ_wr[(patch, c)].append(won)
        for i, a in enumerate(picks):
            for b in picks[i + 1:]:
                key = tuple(sorted([a, b]))
                pair[(patch, key[0], key[1])].append(won)

    out: dict[str, list[dict]] = defaultdict(list)
    for (patch, a, b), results in pair.items():
        if len(results) < MIN_PAIR_GAMES:
            continue
        wr_ab = sum(results) / len(results)
        wr_a = sum(champ_wr[(patch, a)]) / max(len(champ_wr[(patch, a)]), 1)
        wr_b = sum(champ_wr[(patch, b)]) / max(len(champ_wr[(patch, b)]), 1)
        expected = wr_a * wr_b + (1 - wr_a) * (1 - wr_b)  # naive independence proxy
        lift = wr_ab - expected
        out[patch].append({
            "a": a,
            "b": b,
            "games": len(results),
            "winrate": round(wr_ab * 100, 1),
            "lift": round(lift * 100, 2),
        })
    for patch in out:
        out[patch].sort(key=lambda x: abs(x["lift"]), reverse=True)
        out[patch] = out[patch][:500]
    return dict(out)


def build_player_champ_ratings(players: pd.DataFrame) -> dict:
    out: dict[str, dict] = {}
    if players.empty:
        return out
    for (player, champ), grp in players.groupby(["player", "champion"]):
        games = len(grp)
        if games < MIN_PLAYER_CHAMP:
            continue
        entry = {
            "games": games,
            "winrate": round(grp["won"].mean() * 100, 1),
            "avgGd15": round(float(grp["gd15"].mean()), 1) if grp["gd15"].notna().any() else None,
            "avgDmgShare": round(float(grp["dmg_share"].mean()), 1),
            "avgDpm": round(float(grp["dpm"].mean()), 1),
            "avgKp": round(float(grp["kp"].mean()), 1),
            "byPatch": {},
        }
        for patch, pgrp in grp.groupby("patch"):
            if len(pgrp) < MIN_PLAYER_CHAMP:
                continue
            entry["byPatch"][patch] = {
                "games": len(pgrp),
                "winrate": round(pgrp["won"].mean() * 100, 1),
                "avgGd15": round(float(pgrp["gd15"].mean()), 1) if pgrp["gd15"].notna().any() else None,
            }
        out.setdefault(player, {})[champ] = entry
    return out


def _role_bucket_stats(grp: pd.DataFrame) -> dict[str, dict]:
    out: dict[str, dict] = {}
    total = len(grp)
    if total == 0:
        return out
    for role, role_grp in grp.groupby("role"):
        if not role or len(role_grp) < 1:
            continue
        out[role] = {
            "games": int(len(role_grp)),
            "share": round(len(role_grp) / total * 100, 1),
            "winrate": round(float(role_grp["won"].mean() * 100), 1),
        }
    return out


def build_champ_role_profile(players: pd.DataFrame) -> dict:
    """Per-champion role/position distribution — season-wide AND recency-weighted.

    Fixes a real hallucination class: without this, the LLM falls back to stale
    training-era priors (e.g. "Camille is a top laner") even when the actual pro
    meta has shifted (e.g. Camille support surpassing Camille top in recent games).
    """
    out: dict[str, dict] = {}
    if players.empty:
        return out
    df = players.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    max_date = df["date"].max()
    recent_cutoff = max_date - pd.Timedelta(days=RECENT_WINDOW_DAYS) if pd.notna(max_date) else None

    for champ, grp in df.groupby("champion"):
        grp = grp[grp["role"] != ""]
        total_games = len(grp)
        if total_games < MIN_ROLE_GAMES:
            continue
        roles = _role_bucket_stats(grp)
        if not roles:
            continue
        primary_role = max(roles.items(), key=lambda kv: kv[1]["games"])[0]

        recent_roles: dict[str, dict] = {}
        recent_primary_role = primary_role
        role_shift = False
        if recent_cutoff is not None:
            recent_grp = grp[grp["date"] >= recent_cutoff]
            if len(recent_grp) >= MIN_ROLE_GAMES:
                recent_roles = _role_bucket_stats(recent_grp)
                if recent_roles:
                    recent_primary_role = max(recent_roles.items(), key=lambda kv: kv[1]["games"])[0]
                    role_shift = recent_primary_role != primary_role

        out[champ] = {
            "totalGames": int(total_games),
            "roles": roles,
            "recentRoles": recent_roles,
            "recentWindowDays": RECENT_WINDOW_DAYS,
            "primaryRole": primary_role,
            "recentPrimaryRole": recent_primary_role,
            "roleShift": role_shift,
        }
    return out


def build_champ_scaling(players: pd.DataFrame) -> dict:
    """Per-champion empirical lane-strength + late-game scaling signal.

    Derived purely from OE stats (no hand-curation): early lane strength via
    GD@15 vs role peers (a clean, low-confound signal), late-game scaling via
    DPM trend across game-duration buckets, ranked *relative to role peers*
    (raw DPM naturally rises with game length for every champion, so an
    absolute cutoff would flag almost the whole role — only the top/bottom
    tercile within a role gets flagged as a real outlier). Lets nuckyAI say
    e.g. "Caitlyn wins lane" or "Sivir scales harder than most ADCs" from data
    instead of guessing from stale training-era priors.
    """
    out: dict[str, dict] = {}
    if players.empty:
        return out
    df = players.copy()
    role_gd_median = df.groupby("role")["gd15"].median()

    prelim: dict[str, dict] = {}
    for champ, grp in df.groupby("champion"):
        games = len(grp)
        if games < MIN_SCALING_GAMES:
            continue
        role = grp["role"].mode().iloc[0] if not grp["role"].mode().empty else ""

        gd_valid = grp["gd15"].dropna()
        csd_valid = grp["csd15"].dropna()
        avg_gd15 = float(gd_valid.mean()) if not gd_valid.empty else None
        avg_csd15 = float(csd_valid.mean()) if not csd_valid.empty else None
        gd_role_med = float(role_gd_median.get(role, np.nan)) if role else None
        vs_role_gd15 = (
            round(avg_gd15 - gd_role_med, 1)
            if avg_gd15 is not None and gd_role_med is not None and np.isfinite(gd_role_med)
            else None
        )

        dpm_by_duration: dict[str, float] = {}
        dur_valid = grp.dropna(subset=["dpm", "gamelength"])
        for label, lo, hi in DURATION_BUCKETS:
            bucket = dur_valid[(dur_valid["gamelength"] >= lo) & (dur_valid["gamelength"] < hi)]
            if len(bucket) >= 4:
                dpm_by_duration[label] = round(float(bucket["dpm"].mean()), 1)

        scaling_index = None
        if "lt25" in dpm_by_duration and "gt35" in dpm_by_duration and dpm_by_duration["lt25"] > 0:
            scaling_index = round(
                (dpm_by_duration["gt35"] - dpm_by_duration["lt25"]) / dpm_by_duration["lt25"], 3
            )

        avg_dpm = float(grp["dpm"].dropna().mean()) if grp["dpm"].notna().any() else None

        prelim[champ] = {
            "role": role,
            "games": int(games),
            "avgGd15": round(avg_gd15, 1) if avg_gd15 is not None else None,
            "avgCsd15": round(avg_csd15, 1) if avg_csd15 is not None else None,
            "vsRoleMedianGd15": vs_role_gd15,
            "laneBully": bool(vs_role_gd15 is not None and vs_role_gd15 >= 150),
            "weakSide": bool(vs_role_gd15 is not None and vs_role_gd15 <= -150),
            "avgDpm": round(avg_dpm, 1) if avg_dpm is not None else None,
            "dpmByDuration": dpm_by_duration,
            "scalingIndex": scaling_index,
        }

    # Role-relative scaling percentile: top/bottom ~30% of champs with a valid
    # scalingIndex, within the same role, are flagged as real outliers.
    by_role: dict[str, list[str]] = defaultdict(list)
    for champ, entry in prelim.items():
        if entry["scalingIndex"] is not None:
            by_role[entry["role"]].append(champ)

    for role, champs in by_role.items():
        if len(champs) < 5:
            continue
        ranked = sorted(champs, key=lambda c: prelim[c]["scalingIndex"])
        n = len(ranked)
        cutoff = max(1, round(n * 0.3))
        late_scalers = set(ranked[-cutoff:])
        front_loaded = set(ranked[:cutoff])
        for c in champs:
            prelim[c]["lateGameScaler"] = c in late_scalers
            prelim[c]["frontLoaded"] = c in front_loaded
            prelim[c]["scalingPercentileInRole"] = round(
                (ranked.index(c) + 1) / n * 100, 1
            )

    for champ, entry in prelim.items():
        entry.setdefault("lateGameScaler", False)
        entry.setdefault("frontLoaded", False)
        out[champ] = entry
    return out


def score_comp(
    picks: list[str],
    patch: str,
    champ_meta: dict,
    synergy: dict,
) -> tuple[float, list[dict]]:
    """Return comp strength score 0-1 and per-champ edges."""
    meta = champ_meta.get(patch) or champ_meta.get("global") or {}
    if not meta:
        return 0.5, []
    wrs = []
    edges = []
    for c in picks:
        m = meta.get(c)
        if m:
            wr = m["winrate"] / 100.0
            wrs.append(wr)
            edges.append({"champion": c, "edge": round(wr - 0.5, 3), "winrate": m["winrate"]})
    base = float(np.mean(wrs)) if wrs else 0.5
    syn = synergy.get(patch) or []
    pick_set = set(picks)
    syn_bonus = 0.0
    for s in syn:
        if s["a"] in pick_set and s["b"] in pick_set:
            syn_bonus += s["lift"] / 100.0 * 0.05
    return float(np.clip(base + syn_bonus, 0.05, 0.95)), edges


def main() -> None:
    years = [str(y) for y in range(datetime.now(timezone.utc).year - 1, datetime.now(timezone.utc).year + 1)]
    print(f"Building draft artifacts from years {years}...")
    games = load_game_drafts(years)
    players = load_player_champ_rows(years)
    print(f"  {len(games)} team-game draft rows, {games['gameid'].nunique()} games")

    champ_meta = build_champ_meta(games)
    # Global fallback bucket (all patches merged)
    global_games = games.copy()
    global_games["patch"] = "global"
    champ_meta["global"] = build_champ_meta(global_games).get("global", {})

    synergy = build_synergy(games)
    player_champ = build_player_champ_ratings(players)
    role_profile = build_champ_role_profile(players)
    scaling = build_champ_scaling(players)
    print(f"  {len(role_profile)} champs with role profiles, {len(scaling)} with scaling stats")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, payload in (
        ("champ_meta.json", champ_meta),
        ("draft_synergy.json", synergy),
        ("player_champ_ratings.json", player_champ),
        ("champ_role_profile.json", role_profile),
        ("champ_scaling.json", scaling),
    ):
        path = OUT_DIR / name
        with path.open("w", encoding="utf-8") as f:
            json.dump(_sanitize_nan(payload), f, separators=(",", ":"), allow_nan=False)
        print(f"  Wrote {path} ({path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
