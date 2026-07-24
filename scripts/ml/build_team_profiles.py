#!/usr/bin/env python3
"""Team-specific profiles: playstyle, player win conditions, strengths/weaknesses.

Exports team_profiles.json for nuckyAI prediction packets and future preview UI.

Usage:
    python scripts/ml/build_team_profiles.py
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
from oe_leagues import ALL_ALLOWED_LEAGUE_CODES, region_for_league_code, TIER1_REGIONS  # noqa: E402
from team_identity import canonical_team  # noqa: E402
from series_grouping import ChronoGame, group_games_into_series, count_series_wins  # noqa: E402

LOL_DIR = ROOT / "lol"
OUT_DIR = ROOT / "data" / "ml" / "artifacts"
ALLOWED_COMPLETENESS = {"complete", "partial"}
ROLES = ("top", "jungle", "mid", "adc", "support")
LANE_ROLES = ("top", "mid", "adc")
POSITION_MAP = {
    "top": "top", "jng": "jungle", "jungle": "jungle", "mid": "mid",
    "bot": "adc", "adc": "adc", "sup": "support", "support": "support",
}
MIN_PLAYER_GAMES = 12
MIN_PLAYER_SPLIT = 6
MIN_TEAM_PATTERN_GAMES = 18
MIN_LIFT_PP = 12
MIN_DEVIATION_INSIGHT_PP = 15
MIN_REGION_GD_DEVIATION = 55
CLUTCH_GD15_THRESHOLD = 1000.0
MIN_CLUTCH_SAMPLE = 8
MIN_CLUTCH_DEVIATION_PP = 10
# Jungle CS@15 lead over the jungle-role baseline (region, else global) required to call a
# team "jungle-centric" — i.e. the jungler builds his own farm/CS lead instead of ganking.
# Calibrated off real data: jungle CS@15 median ~112, std ~12; LYON/Inspired (the canonical
# jungle-centric example) sits ~+7.7 above median — the clear outlier among tier-1 teams.
JG_FARM_LEAD_CS15 = 6.0

# Eye-test overrides when stats are borderline (Inspired / LYON jungler-centric).
JG_CENTRIC_TEAMS = frozenset({"Lyon Gaming", "LYON"})


def _norm_pos(raw: str) -> str:
    return POSITION_MAP.get(str(raw or "").strip().lower(), "")


def _json_safe(obj):
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        return val if math.isfinite(val) else None
    raise TypeError(type(obj))


def _sanitize_nan(obj):
    """Recursively replace NaN/Infinity floats with None.

    Python's json.dump writes bare NaN/Infinity tokens (valid to Python's own
    json.loads) but Deno's JSON.parse rejects them, crashing the edge worker at
    boot. Every float that reaches the artifact must be finite or null.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        return val if math.isfinite(val) else None
    if isinstance(obj, dict):
        return {k: _sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_nan(v) for v in obj]
    return obj


def load_player_rows(years: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        print(f"  Profile scan: {path.name}", file=sys.stderr)
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "patch", "position", "teamname", "result",
            "playername", "name", "datacompleteness",
            "golddiffat15", "golddiffat10", "csdiffat15", "csat15", "xpdiffat15",
            "killsat15", "assistsat15", "deathsat15",
            "killsat10", "assistsat10",
            "damageshare", "dpm", "killparticipation",
            "firstdragon", "firstherald", "firsttower",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        pos = df["position"].astype(str).str.lower()
        df = df[~pos.eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            role = _norm_pos(row.get("position", ""))
            if role not in ROLES:
                continue
            player = str(row.get("playername") or row.get("name") or "").strip()
            team_raw = str(row.get("teamname", "")).strip()
            if not player or not team_raw:
                continue
            gd15 = row.get("golddiffat15")
            csd15 = row.get("csdiffat15")
            cs15 = row.get("csat15")
            xpd15 = row.get("xpdiffat15")
            k15 = row.get("killsat15")
            a15 = row.get("assistsat15")
            ka15 = None
            if k15 not in (None, "") and a15 not in (None, ""):
                ka15 = float(k15) + float(a15)
            rows.append({
                "gameid": str(row.get("gameid", "")).strip(),
                "date": str(row.get("date", ""))[:10],
                "league": str(row.get("league", "")).strip(),
                "team": canonical_team(team_raw),
                "player": player,
                "role": role,
                "won": int(float(row.get("result", 0) or 0) == 1),
                "gd15": float(gd15) if gd15 not in (None, "") else np.nan,
                "csd15": float(csd15) if csd15 not in (None, "") else np.nan,
                "cs15": float(cs15) if cs15 not in (None, "") else np.nan,
                "xpd15": float(xpd15) if xpd15 not in (None, "") else np.nan,
                "ka15": ka15,
                "kp": float(row.get("killparticipation", 0) or 0) * 100,
                "dmg_share": float(row.get("damageshare", 0) or 0) * 100,
                "dpm": float(row.get("dpm", 0) or 0) if row.get("dpm") not in (None, "") else np.nan,
            })
    return pd.DataFrame(rows)


def add_kp15(player_df: pd.DataFrame) -> pd.DataFrame:
    """Early KP share = player K+A@15 / team K+A@15 per game."""
    if player_df.empty:
        return player_df
    df = player_df.copy()
    df["kp15"] = np.nan
    valid = df["ka15"].notna()
    if not valid.any():
        return df
    team_ka = df.loc[valid].groupby(["gameid", "team"])["ka15"].transform("sum")
    df.loc[valid, "kp15"] = (df.loc[valid, "ka15"] / team_ka.replace(0, np.nan)) * 100.0
    return df


def load_team_rows(years: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "teamname", "result", "position", "datacompleteness",
            "golddiffat15", "golddiffat20", "firstdragon", "firstherald", "firsttower", "dpm",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        df = df[df["position"].astype(str).str.lower().eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            gd15 = row.get("golddiffat15")
            rows.append({
                "team": canonical_team(str(row.get("teamname", "")).strip()),
                "won": int(float(row.get("result", 0) or 0) == 1),
                "gd15": float(gd15) if gd15 not in (None, "") else np.nan,
                "dpm": float(row.get("dpm", 0) or 0) if row.get("dpm") not in (None, "") else np.nan,
                "firstdragon": int(float(row.get("firstdragon", 0) or 0) == 1),
                "firstherald": int(float(row.get("firstherald", 0) or 0) == 1),
                "firsttower": int(float(row.get("firsttower", 0) or 0) == 1),
            })
    return pd.DataFrame(rows)


def load_chrono_games(years: list[str]) -> list[ChronoGame]:
    """Build ChronoGame list for series grouping from OE team rows."""
    by_game: dict[str, dict] = {}
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "teamname", "result", "position", "datacompleteness", "league",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        df = df[df["position"].astype(str).str.lower().eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            gid = str(row.get("gameid", "")).strip()
            team = canonical_team(str(row.get("teamname", "")).strip())
            if not gid or not team:
                continue
            won = int(float(row.get("result", 0) or 0) == 1)
            date_str = str(row.get("date", ""))[:10]
            entry = by_game.setdefault(gid, {"date": date_str, "teams": {}})
            entry["teams"][team] = won

    games: list[ChronoGame] = []
    for gid, payload in by_game.items():
        teams = payload["teams"]
        if len(teams) != 2:
            continue
        try:
            gdate = datetime.strptime(payload["date"], "%Y-%m-%d").date()
        except ValueError:
            continue
        winner = next((t for t, w in teams.items() if w == 1), None)
        loser = next((t for t, w in teams.items() if w == 0), None)
        if not winner or not loser:
            continue
        games.append(ChronoGame(id=gid, game_date=gdate, winner=winner, loser=loser))
    return games


def infer_team_home_region(player_df: pd.DataFrame, team: str) -> str | None:
    sub = player_df[player_df["team"] == team]
    if sub.empty:
        return None
    domestic = sub[~sub["league"].isin({"MSI", "WLDs", "FST", "EWC"})]
    src = domestic if not domestic.empty else sub
    regions = src["league"].map(region_for_league_code).dropna()
    if regions.empty:
        return None
    return str(regions.mode().iloc[0])


def build_home_region_map(player_df: pd.DataFrame, teams: list[str]) -> dict[str, str]:
    return {t: r for t in teams if (r := infer_team_home_region(player_df, t))}


def build_region_stat_baselines_from_players(
    player_df: pd.DataFrame, home_map: dict[str, str],
) -> dict[str, dict]:
    """Per-region team GD@15 / DPM medians for deviation narratives."""
    team_stats = (
        player_df.groupby("team")
        .agg(gd15=("gd15", "mean"), dpm=("dpm", "mean"))
        .reset_index()
    )
    team_stats["home_region"] = team_stats["team"].map(home_map)
    baselines: dict[str, dict] = {
        "_global": {
            "golddiffat15_median": round(float(player_df["gd15"].median()), 1),
            "dpm_median": round(float(player_df["dpm"].median()), 1),
        },
    }
    for region in TIER1_REGIONS:
        rg = team_stats[team_stats["home_region"] == region]
        if len(rg) < 4:
            continue
        baselines[region] = {
            "golddiffat15_median": round(float(rg["gd15"].median()), 1),
            "dpm_median": round(float(rg["dpm"].median()), 1),
            "teams": int(len(rg)),
        }
    return baselines


def build_region_role_medians(
    player_df: pd.DataFrame, home_map: dict[str, str],
) -> dict[tuple[str, str], dict[str, float]]:
    df = player_df.copy()
    df["home_region"] = df["team"].map(home_map)
    out: dict[tuple[str, str], dict[str, float]] = {}
    for (region, role), grp in df.groupby(["home_region", "role"]):
        if pd.isna(region) or role not in LANE_ROLES + ("jungle", "support"):
            continue
        valid = grp["gd15"].dropna()
        if len(valid) < 40:
            continue
        entry: dict[str, float] = {"gd15": float(valid.median())}
        if "cs15" in grp.columns:
            cs_valid = grp["cs15"].dropna()
            if len(cs_valid) >= 40:
                entry["cs15"] = float(cs_valid.median())
        out[(str(region), str(role))] = entry

    # Global per-role fallback for regions with too thin a sample (e.g. jungle CS@15
    # baseline used to detect "team plays for jungler's own farm" regardless of region).
    if "cs15" in df.columns:
        for role, grp in df.groupby("role"):
            if role not in LANE_ROLES + ("jungle", "support"):
                continue
            cs_valid = grp["cs15"].dropna()
            gd_valid = grp["gd15"].dropna()
            if len(cs_valid) < 40 and len(gd_valid) < 40:
                continue
            out[("_global", str(role))] = {
                **({"gd15": float(gd_valid.median())} if len(gd_valid) >= 40 else {}),
                **({"cs15": float(cs_valid.median())} if len(cs_valid) >= 40 else {}),
            }
    return out


def build_stat_deviations(
    team_games: pd.DataFrame,
    team: str,
    home_region: str | None,
    baselines: dict[str, dict],
) -> list[dict]:
    """Highlight where a team differs from regional / global tier-1 medians."""
    if not home_region:
        return []
    sub = team_games[team_games["team"] == team]
    if len(sub) < MIN_TEAM_PATTERN_GAMES:
        return []
    region_base = baselines.get(home_region, {})
    global_base = baselines.get("_global", {})
    out: list[dict] = []

    checks = [
        ("golddiffat15", "gd15", "GD@15", MIN_REGION_GD_DEVIATION),
        ("dpm", "dpm", "DPM", 25),
    ]
    for stat_key, col, label, min_dev in checks:
        if col not in sub.columns or f"{stat_key}_median" not in region_base:
            continue
        col_valid = sub[col].dropna()
        if col_valid.empty:
            continue
        team_avg = float(col_valid.mean())
        reg_med = float(region_base[f"{stat_key}_median"])
        glob_med = float(global_base.get(f"{stat_key}_median", reg_med))
        # NaN guard: abs(NaN) < min_dev is False, so an unguarded NaN would
        # slip through and serialize as invalid JSON (Deno rejects `NaN`).
        if not np.isfinite(team_avg) or not np.isfinite(reg_med):
            continue
        vs_region = team_avg - reg_med
        if abs(vs_region) < min_dev:
            continue
        vs_global = team_avg - glob_med
        out.append({
            "stat": stat_key,
            "teamAvg": round(team_avg, 1),
            "regionMedian": round(reg_med, 1),
            "globalMedian": round(glob_med, 1),
            "vsRegion": round(vs_region, 1),
            "vsGlobal": round(vs_global, 1),
            "favorable": vs_region > 0,
            "label": (
                f"{team} {label} {team_avg:+.0f} vs {home_region} median {reg_med:+.0f} "
                f"(global tier-1 {glob_med:+.0f}) — "
                f"{'stronger' if vs_region > 0 else 'weaker'} than typical {home_region} competition"
            ),
        })
    out.sort(key=lambda x: abs(x["vsRegion"]), reverse=True)
    return out[:4]


# Same 400-point logistic scale as region_elo.py's walk-forward Elo, so a strength gap
# read from region_strength.json maps onto a comparable "how much did beating/losing to
# this opponent matter" adjustment.
FORM_ELO_SCALE = 400.0
# How much an opponent's relative strength can shift a series' quality score. A ~140-elo
# gap (STRONG_OPPONENT_GAP) shifts qualityScore by ~0.35*0.4=0.14 — enough to matter, not
# enough for one series to flip a team's whole recent-form read.
STRENGTH_ADJ_WEIGHT = 0.4
STRONG_OPPONENT_GAP = 0.35


def build_recent_form(
    chrono_games: list[ChronoGame],
    team: str,
    team_strength: dict[str, float] | None = None,
    limit: int = 3,
) -> dict:
    """Last N completed series — quality score = competitiveness (sweep vs narrow win/loss)
    adjusted for opponent strength, so a convincing win over a top-tier opponent counts for
    more than an equally convincing win over a weak one (and a loss to a stronger team is
    less damning than an upset loss to a weaker one). Opponent strength comes from the
    walk-forward region/team Elo (region_strength.json) — the same signal used for the
    live SOS blend, so "recent form" and "strength of schedule" stay consistent with
    each other instead of recent form being pure win/loss record."""
    buckets = group_games_into_series(chrono_games)
    series_rows: list[dict] = []
    for bkt in buckets:
        if team not in (bkt.team_a, bkt.team_b):
            continue
        ta, tb = bkt.team_a, bkt.team_b
        w_team = count_series_wins(bkt.games, team)
        w_opp = count_series_wins(bkt.games, tb if team == ta else ta)
        if w_team + w_opp < 2:
            continue
        opponent = tb if team == ta else ta
        competitive = w_team / (w_team + w_opp)
        won_series = w_team > w_opp
        end_date = bkt.games[-1].game_date.isoformat()

        strength_gap = None
        quality = competitive
        own_rating = (team_strength or {}).get(team)
        opp_rating = (team_strength or {}).get(opponent)
        if own_rating is not None and opp_rating is not None:
            strength_gap = (opp_rating - own_rating) / FORM_ELO_SCALE
            quality = min(1.0, max(0.0, competitive + STRENGTH_ADJ_WEIGHT * strength_gap))

        quality_tag = ""
        if strength_gap is not None:
            if strength_gap >= STRONG_OPPONENT_GAP:
                quality_tag = " [strong opponent]"
            elif strength_gap <= -STRONG_OPPONENT_GAP:
                quality_tag = " [lower-rated opponent]"

        series_rows.append({
            "date": end_date,
            "opponent": opponent,
            "score": f"{w_team}-{w_opp}",
            "won": won_series,
            "competitiveScore": round(competitive, 3),
            "qualityScore": round(quality, 3),
            "opponentStrengthGap": round(strength_gap, 2) if strength_gap is not None else None,
            "label": (
                f"{'W' if won_series else 'L'} {w_team}-{w_opp} vs {opponent}{quality_tag} ({end_date})"
            ),
        })

    series_rows.sort(key=lambda r: r["date"], reverse=True)
    recent = series_rows[:limit]
    if not recent:
        return {"recentFormScore": 0.5, "momentum": "unknown", "series": [], "summary": ""}

    weights = [0.5, 0.3, 0.2]
    score = 0.0
    w_sum = 0.0
    for i, s in enumerate(recent):
        w = weights[i] if i < len(weights) else 0.1
        score += w * s["qualityScore"]
        w_sum += w
    form_score = score / w_sum if w_sum else 0.5

    last = recent[0]
    if last["qualityScore"] >= 0.6:
        momentum = "hot"
    elif last["qualityScore"] <= 0.25:
        momentum = "cold"
    else:
        momentum = "mixed"

    summary = f"Recent form: {recent[0]['label']}"
    if len(recent) > 1:
        summary += f"; prior {recent[1]['label']}"

    return {
        "recentFormScore": round(form_score, 3),
        "momentum": momentum,
        "series": recent,
        "summary": summary,
    }


def load_team_strength_ratings() -> dict[str, float]:
    """Walk-forward team Elo from region_strength.json (written earlier in the pipeline
    by build_feature_mart.py) — used only to quality-weight recent-form narrative/blend
    inputs, never re-attached to historical training rows."""
    path = OUT_DIR / "region_strength.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    teams = data.get("teams", {})
    out: dict[str, float] = {}
    for team, entry in teams.items():
        rating = entry.get("rating") if isinstance(entry, dict) else None
        if rating is not None:
            out[team] = float(rating)
    return out


def infer_roster(player_df: pd.DataFrame, team: str) -> dict[str, str]:
    sub = player_df[player_df["team"] == team].sort_values("date")
    if sub.empty:
        return {}
    recent = sub.groupby("role").tail(15)
    roster: dict[str, str] = {}
    for role in ROLES:
        role_rows = recent[recent["role"] == role]
        if role_rows.empty:
            continue
        roster[role] = role_rows["player"].value_counts().index[0]
    return roster


def build_playstyle(
    player_df: pd.DataFrame,
    team: str,
    roster: dict[str, str],
    home_region: str | None = None,
    role_medians: dict[tuple[str, str], dict[str, float]] | None = None,
) -> dict:
    """Early focus = which LANE (top/mid/adc) gets jungle/support attention via K+A@15 / KP@15.

    Jungle/support naturally have high K+A — they are not default "focus" unless
    jungle-centric.

    IMPORTANT distinction (jungle K+A@15 vs jungle CSD@15):
    - High jungle K+A@15 alone just means the jungler ganks/fights a lot early — it does
      NOT mean the team plays "for" the jungler. Jungle/support are the two enabling roles
      and naturally rack up K+A by ganking other lanes.
    - "Team plays for the jungler" (e.g. LYON/Inspired) means the jungler is allowed to
      build their OWN early lead — reflected by a jungle CS diff @15 that's meaningfully
      above the jungle-role baseline (they prioritize clearing/farming over proactive ganks
      that would otherwise help a lane or contest objectives at the cost of their own CS).
    """
    role_medians = role_medians or {}
    sub = player_df[player_df["team"] == team]
    role_ka: dict[str, float] = {}
    role_kp: dict[str, float] = {}
    for role in ROLES:
        role_sub = sub[sub["role"] == role]
        if role_sub.empty:
            continue
        if role_sub["ka15"].notna().any():
            role_ka[role] = float(role_sub["ka15"].mean())
        if role_sub["kp15"].notna().any():
            role_kp[role] = float(role_sub["kp15"].mean())
        elif role_sub["kp"].notna().any():
            role_kp[role] = float(role_sub["kp"].mean())

    role_labels = {"top": "top", "jungle": "jungle", "mid": "mid", "adc": "bot", "support": "support"}

    lane_ka = {r: role_ka[r] for r in LANE_ROLES if r in role_ka}
    lane_kp = {r: role_kp.get(r, 0.0) for r in LANE_ROLES if r in role_ka}
    jg_ka = role_ka.get("jungle", 0.0)
    lane_values = [lane_ka[r] for r in LANE_ROLES if r in lane_ka]
    avg_lane = sum(lane_values) / len(lane_values) if lane_values else 0.0
    max_lane_ka = max(lane_values) if lane_values else 0.0

    # "Plays for the jungler" — jungle CS@15 (absolute farm, not diff-vs-enemy-jungler)
    # meaningfully above the jungle-role baseline (region if available, else global), i.e.
    # the jungler builds their own farm lead instead of spending that time on ganks/objectives.
    # Absolute CS beats CSD@15 (diff vs opposing jungler) here: two junglers who both just
    # farm still cancel out to ~0 diff, hiding the "farms a lot" signal CSD@15 was meant to catch.
    jg_sub = sub[sub["role"] == "jungle"]
    jg_cs15_games = int(jg_sub["cs15"].notna().sum()) if not jg_sub.empty else 0
    jg_cs15 = float(jg_sub["cs15"].mean()) if jg_cs15_games else None
    jg_cs15_baseline = (
        role_medians.get((home_region or "", "jungle"), {}).get("cs15")
        if home_region
        else None
    )
    if jg_cs15_baseline is None:
        jg_cs15_baseline = role_medians.get(("_global", "jungle"), {}).get("cs15")
    jg_cs15_dev = (
        jg_cs15 - jg_cs15_baseline if jg_cs15 is not None and jg_cs15_baseline is not None else None
    )

    jungle_centric = team in JG_CENTRIC_TEAMS or (
        jg_cs15_games >= MIN_CLUTCH_SAMPLE
        and jg_cs15_dev is not None
        and jg_cs15_dev >= JG_FARM_LEAD_CS15
    )

    # Distinct signal: jungler is unusually involved in early kills/assists (ganks/fights a
    # lot) — worth noting, but NOT the same claim as "team plays for the jungler".
    jungle_aggressive = (
        jg_ka > 0
        and max_lane_ka > 0
        and max_lane_ka < jg_ka * 0.78
        and jg_ka >= avg_lane * 1.25
    )

    if jungle_centric:
        focus = ["jungle"]
        secondary: list[str] = []
        jg_name = roster.get("jungle", "jungle")
        dev_str = f"+{jg_cs15_dev:.0f}" if jg_cs15_dev is not None else "n/a"
        cs_str = f"{jg_cs15:.0f}" if jg_cs15 is not None else "n/a"
        summary = (
            f"{team} plays for their jungler ({jg_name}) — {jg_name} averages {cs_str} CS@15 "
            f"({dev_str} vs {'region' if home_region else 'global'} jungle median), well above normal, "
            f"meaning {team} lets him build his own early farm/lead rather than proactively ganking lanes."
        )
        skirmish_note = f"{team}'s jungle pathing prioritizes {jg_name}'s own camps/farm over lane ganks — rare jungler-centric setup."
        focus_mode = "jungle_centric"
    else:
        # Lane focus: share of (top+mid+adc) early involvement
        lane_pool_ka = sum(lane_ka.values()) or 1.0
        lane_pool_kp = sum(lane_kp.values()) or 1.0
        combined: dict[str, float] = {}
        for r in lane_ka:
            ka_share = lane_ka[r] / lane_pool_ka
            kp_share = lane_kp.get(r, 0.0) / lane_pool_kp if lane_pool_kp else 0.0
            combined[r] = 0.55 * ka_share + 0.45 * kp_share

        ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        focus = [r for r, share in ranked[:2] if share >= 0.28]
        if not focus and ranked:
            focus = [ranked[0][0]]
        secondary = [r for r, _ in ranked[2:4] if r not in focus]

        focus_str = "/".join(role_labels.get(r, r) for r in focus)
        roster_focus = [roster.get(r, role_labels.get(r, r)) for r in focus if r in roster]
        roster_note = f" (through {', '.join(roster_focus)})" if roster_focus else ""
        summary = (
            f"{team} tends to play around {focus_str} in the early game{roster_note} — "
            f"highest lane K+A@15 / KP share among top/mid/bot."
        )
        focus_mode = "lane_focus"
        skirmish_note = None
        if "top" in focus:
            skirmish_note = f"Look out for early topside skirmishes from {team} — top lane gets jungle attention."
        elif "mid" in focus:
            skirmish_note = f"{team} often funnels early resources mid — watch for mid prio and river fights."
        elif "adc" in focus:
            skirmish_note = f"{team} plays toward bot side early — bot lane K+A/KP lead the team."

        if jungle_aggressive:
            jg_name = roster.get("jungle", "jungle")
            summary += (
                f" {jg_name} is a highly proactive jungler (team-high early K+A@15 of {jg_ka:.1f}) — "
                f"he ganks/fights a lot early to set up {focus_str}, not a sign the team plays for his own farm."
            )

    avg_team_gd = float(sub["gd15"].mean()) if sub["gd15"].notna().any() else 0.0
    if avg_team_gd >= 200:
        tempo = "early_aggressive"
        summary += " Team averages positive GD@15 — proactive early tempo."
    elif avg_team_gd <= -100:
        tempo = "scaling"
        summary += " Often absorbs early pressure — win conditions skew late."
    else:
        tempo = "balanced"

    return {
        "focusMode": focus_mode,
        "earlyFocusRoles": focus,
        "secondaryRoles": secondary if not jungle_centric else [],
        "roleEarlyKa15": {k: round(v, 2) for k, v in role_ka.items()},
        "roleEarlyKp15": {k: round(v, 1) for k, v in role_kp.items()},
        "roleAvgGd15": {k: round(v, 1) for k, v in {
            r: float(sub[sub["role"] == r]["gd15"].mean())
            for r in ROLES if not sub[sub["role"] == r].empty and sub[sub["role"] == r]["gd15"].notna().any()
        }.items()},
        "tempo": tempo,
        "summary": summary,
        "skirmishNote": skirmish_note,
    }


def build_player_win_conditions(
    player_df: pd.DataFrame,
    team: str,
    roster: dict[str, str],
    home_region: str | None,
    role_medians: dict[tuple[str, str], dict[str, float]],
) -> list[dict]:
    sub = player_df[player_df["team"] == team]
    out: list[dict] = []
    roster_players = set(roster.values()) if roster else None
    team_baseline_wr = float(sub["won"].mean()) if len(sub) else 0.5

    for player, grp in sub.groupby("player"):
        if roster_players and player not in roster_players:
            continue
        if len(grp) < MIN_PLAYER_GAMES:
            continue
        valid = grp[grp["gd15"].notna()]
        if len(valid) < MIN_PLAYER_SPLIT * 2:
            continue
        role = grp["role"].mode().iloc[0] if not grp["role"].empty else "unknown"
        median_gd = role_medians.get((home_region or "", role), {}).get("gd15", 0.0)
        ahead = valid[valid["gd15"] >= median_gd]
        behind = valid[valid["gd15"] < median_gd]
        if len(ahead) < MIN_PLAYER_SPLIT or len(behind) < MIN_PLAYER_SPLIT:
            continue
        ahead_wr = ahead["won"].mean() * 100
        behind_wr = behind["won"].mean() * 100
        lift = ahead_wr - behind_wr
        if abs(lift) < MIN_DEVIATION_INSIGHT_PP:
            continue
        if lift > 0:
            label = (
                f"When {player} beats {home_region or 'role'} {role} median GD@15 ({median_gd:+.0f}), "
                f"{team} wins {ahead_wr:.0f}% ({lift:+.0f}pp vs {team_baseline_wr*100:.0f}% team baseline)"
            )
        else:
            label = (
                f"When {player} trails {home_region or 'role'} {role} median GD@15 ({median_gd:+.0f}), "
                f"{team} wins only {behind_wr:.0f}% ({abs(lift):.0f}pp below baseline)"
            )
        out.append({
            "player": player,
            "role": role,
            "medianGd15": round(median_gd, 1),
            "games": len(valid),
            "aheadGames": len(ahead),
            "aheadWinrate": round(ahead_wr, 1),
            "behindGames": len(behind),
            "behindWinrate": round(behind_wr, 1),
            "liftPp": round(lift, 1),
            "favorableWhenAhead": lift > 0,
            "label": label,
        })
    out.sort(key=lambda x: abs(x["liftPp"]), reverse=True)
    return out[:6]


def _team_pattern(
    team_games: pd.DataFrame, team: str, metric: str, threshold: float,
    direction: str, label_prefix: str, favorable: bool,
) -> dict | None:
    sub = team_games[team_games["team"] == team]
    if len(sub) < MIN_TEAM_PATTERN_GAMES:
        return None
    baseline = sub["won"].mean()
    if direction == "above":
        bucket = sub[sub[metric] >= threshold]
        cond = f"{metric} ≥ {threshold:g}"
    else:
        bucket = sub[sub[metric] <= threshold]
        cond = f"{metric} ≤ {threshold:g}"
    if len(bucket) < MIN_TEAM_PATTERN_GAMES // 2:
        return None
    wr = bucket["won"].mean()
    lift = (wr - baseline) * 100
    if abs(lift) < 8:
        return None
    return {
        "metric": metric,
        "threshold": threshold,
        "direction": direction,
        "games": len(bucket),
        "winrate": round(wr * 100, 1),
        "baselineWinrate": round(baseline * 100, 1),
        "liftPp": round(lift, 1),
        "favorable": favorable if lift > 0 else not favorable,
        "label": f"{label_prefix}: when {cond}, {team} wins {wr*100:.0f}% vs {baseline*100:.0f}% baseline",
    }


def build_team_patterns(team_games: pd.DataFrame, team: str) -> tuple[list[dict], list[dict]]:
    """Team-specific patterns — exclude generic gd15 snowball (too obvious for narrative)."""
    win_p: list[dict] = []
    loss_p: list[dict] = []

    sub = team_games[team_games["team"] == team]
    baseline = sub["won"].mean() if len(sub) else 0.5
    for flag, col, name in [
        ("first dragon", "firstdragon", "first dragon"),
        ("first herald", "firstherald", "first herald"),
        ("first tower", "firsttower", "first tower"),
    ]:
        bucket = sub[sub[col] == 1]
        if len(bucket) < MIN_TEAM_PATTERN_GAMES // 2:
            continue
        wr = bucket["won"].mean()
        lift = (wr - baseline) * 100
        if abs(lift) < 12:
            continue
        entry = {
            "metric": col,
            "games": len(bucket),
            "winrate": round(wr * 100, 1),
            "baselineWinrate": round(baseline * 100, 1),
            "liftPp": round(lift, 1),
            "favorable": lift > 0,
            "generic": False,
            "label": f"{team} after securing {name}: {wr*100:.0f}% WR ({lift:+.0f}pp vs baseline)",
        }
        if lift > 0:
            win_p.append(entry)
        else:
            loss_p.append(entry)

    win_p.sort(key=lambda x: abs(x.get("liftPp", 0)), reverse=True)
    loss_p.sort(key=lambda x: abs(x.get("liftPp", 0)), reverse=True)
    return win_p[:4], loss_p[:3]


def compute_league_clutch_baseline(team_games: pd.DataFrame) -> dict:
    """League-wide blown-lead / comeback rates — the reference point for a team's clutch factor."""
    valid = team_games.dropna(subset=["gd15"])
    ahead = valid[valid["gd15"] >= CLUTCH_GD15_THRESHOLD]
    behind = valid[valid["gd15"] <= -CLUTCH_GD15_THRESHOLD]
    return {
        "blownLeadRate": round(float((1 - ahead["won"]).mean()) * 100, 1) if len(ahead) else None,
        "comebackRate": round(float(behind["won"].mean()) * 100, 1) if len(behind) else None,
    }


def build_clutch_factor(team_games: pd.DataFrame, team: str, league_baseline: dict) -> dict | None:
    """Single-game 'should have won but choked' / 'stole one back' detection.

    Complements build_recent_form (series-level momentum) with a per-game signal:
    teams that build a big gold lead at 15 and still lose it (a real "choke", not
    just "losing while ahead once"), and the mirror case — teams that steal wins
    from a big deficit. Both are compared against the league baseline so the
    narrative only fires when a team is a real outlier, not just unlucky once.
    """
    sub = team_games[team_games["team"] == team].dropna(subset=["gd15"])
    if len(sub) < MIN_TEAM_PATTERN_GAMES:
        return None

    ahead = sub[sub["gd15"] >= CLUTCH_GD15_THRESHOLD]
    behind = sub[sub["gd15"] <= -CLUTCH_GD15_THRESHOLD]

    out: dict = {"gd15Threshold": CLUTCH_GD15_THRESHOLD}
    notes: list[str] = []

    if len(ahead) >= MIN_CLUTCH_SAMPLE:
        blown = ahead[ahead["won"] == 0]
        blown_rate = float(len(blown) / len(ahead) * 100)
        league_rate = league_baseline.get("blownLeadRate")
        out["leadGames"] = int(len(ahead))
        out["blownLeadGames"] = int(len(blown))
        out["blownLeadRate"] = round(blown_rate, 1)
        if league_rate is not None:
            dev = blown_rate - league_rate
            out["blownLeadVsLeague"] = round(dev, 1)
            if dev >= MIN_CLUTCH_DEVIATION_PP:
                notes.append({
                    "kind": "blown_lead",
                    "favorable": False,
                    "label": (
                        f"{team} blow winnable games: {len(blown)}/{len(ahead)} losses "
                        f"({blown_rate:.0f}%) when up {CLUTCH_GD15_THRESHOLD:.0f}+ gold at 15, "
                        f"vs {league_rate:.0f}% league-wide"
                    ),
                })
            elif dev <= -MIN_CLUTCH_DEVIATION_PP:
                notes.append({
                    "kind": "closes_leads",
                    "favorable": True,
                    "label": (
                        f"{team} close out leads well: only {blown_rate:.0f}% losses "
                        f"when up {CLUTCH_GD15_THRESHOLD:.0f}+ gold at 15, vs {league_rate:.0f}% league-wide"
                    ),
                })

    if len(behind) >= MIN_CLUTCH_SAMPLE:
        comeback = behind[behind["won"] == 1]
        comeback_rate = float(len(comeback) / len(behind) * 100)
        league_rate = league_baseline.get("comebackRate")
        out["deficitGames"] = int(len(behind))
        out["comebackGames"] = int(len(comeback))
        out["comebackRate"] = round(comeback_rate, 1)
        if league_rate is not None:
            dev = comeback_rate - league_rate
            out["comebackVsLeague"] = round(dev, 1)
            if dev >= MIN_CLUTCH_DEVIATION_PP:
                notes.append({
                    "kind": "comeback",
                    "favorable": True,
                    "label": (
                        f"{team} can steal games back: {len(comeback)}/{len(behind)} wins "
                        f"({comeback_rate:.0f}%) when down {CLUTCH_GD15_THRESHOLD:.0f}+ gold at 15, "
                        f"vs {league_rate:.0f}% league-wide"
                    ),
                })
            elif dev <= -MIN_CLUTCH_DEVIATION_PP:
                notes.append({
                    "kind": "cant_comeback",
                    "favorable": False,
                    "label": (
                        f"{team} rarely come back from behind: only {comeback_rate:.0f}% wins "
                        f"when down {CLUTCH_GD15_THRESHOLD:.0f}+ gold at 15, vs {league_rate:.0f}% league-wide"
                    ),
                })

    if not notes:
        return out or None
    out["notes"] = notes
    return out


def derive_strengths_weaknesses(
    playstyle: dict,
    win_patterns: list[dict],
    loss_patterns: list[dict],
    player_conditions: list[dict],
    stat_deviations: list[dict],
    recent_form: dict | None = None,
    clutch_factor: dict | None = None,
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    weaknesses: list[str] = []

    for dev in stat_deviations[:2]:
        if dev.get("favorable"):
            strengths.append(dev["label"])
        else:
            weaknesses.append(dev["label"])

    for note in (clutch_factor or {}).get("notes", []):
        if note.get("favorable"):
            strengths.append(note["label"])
        else:
            weaknesses.append(note["label"])

    strengths.append(playstyle["summary"])
    if playstyle.get("skirmishNote"):
        strengths.append(playstyle["skirmishNote"])

    if recent_form and recent_form.get("summary"):
        if recent_form.get("momentum") == "hot":
            strengths.append(recent_form["summary"])
        elif recent_form.get("momentum") == "cold":
            weaknesses.append(recent_form["summary"])
        else:
            strengths.append(recent_form["summary"])

    for pc in player_conditions[:2]:
        if pc["favorableWhenAhead"] and pc.get("liftPp", 0) >= MIN_DEVIATION_INSIGHT_PP:
            strengths.append(pc["label"])

    for pc in player_conditions[:4]:
        if not pc["favorableWhenAhead"] and pc.get("liftPp", 0) <= -MIN_DEVIATION_INSIGHT_PP:
            weaknesses.append(pc["label"])

    for p in win_patterns[:1]:
        if not p.get("generic"):
            strengths.append(p["label"])
    for p in loss_patterns[:1]:
        if not p.get("generic"):
            weaknesses.append(p["label"])

    return strengths[:5], weaknesses[:4]


def build_profiles(
    player_df: pd.DataFrame,
    team_games: pd.DataFrame,
    chrono_games: list[ChronoGame],
) -> dict:
    teams = sorted(set(player_df["team"].unique()) | set(team_games["team"].unique()))
    home_map = build_home_region_map(player_df, teams)
    baselines = build_region_stat_baselines_from_players(player_df, home_map)
    role_medians = build_region_role_medians(player_df, home_map)
    league_clutch_baseline = compute_league_clutch_baseline(team_games)
    team_strength = load_team_strength_ratings()
    out: dict[str, dict] = {}
    as_of = player_df["date"].max() if not player_df.empty else ""

    for team in teams:
        if not team:
            continue
        team_player = player_df[player_df["team"] == team]
        if len(team_player) < MIN_TEAM_PATTERN_GAMES:
            continue
        home_region = home_map.get(team)
        roster = infer_roster(player_df, team)
        playstyle = build_playstyle(player_df, team, roster, home_region, role_medians)
        player_conditions = build_player_win_conditions(
            player_df, team, roster, home_region, role_medians,
        )
        stat_deviations = build_stat_deviations(team_games, team, home_region, baselines)
        win_patterns, loss_patterns = build_team_patterns(team_games, team)
        recent_form = build_recent_form(chrono_games, team, team_strength)
        clutch_factor = build_clutch_factor(team_games, team, league_clutch_baseline)
        strengths, weaknesses = derive_strengths_weaknesses(
            playstyle, win_patterns, loss_patterns, player_conditions, stat_deviations, recent_form,
            clutch_factor,
        )
        league_rows = team_player.sort_values("date")
        out[team] = {
            "league": league_rows["league"].iloc[-1] if not league_rows.empty else "",
            "homeRegion": home_region,
            "gamesAnalyzed": len(team_player["gameid"].unique()),
            "asOf": as_of,
            "roster": roster,
            "playstyle": playstyle,
            "recentForm": recent_form,
            "statDeviations": stat_deviations,
            "playerWinConditions": player_conditions,
            "winPatterns": win_patterns,
            "lossPatterns": loss_patterns,
            "clutchFactor": clutch_factor,
            "strengths": strengths,
            "weaknesses": weaknesses,
        }
    return out


def main() -> None:
    years = [str(y) for y in range(datetime.now(timezone.utc).year - 1, datetime.now(timezone.utc).year + 1)]
    print(f"Building team profiles from years {years}...")
    player_df = add_kp15(load_player_rows(years))
    team_games = load_team_rows(years)
    chrono_games = load_chrono_games(years)
    print(f"  {len(player_df)} player-game rows, {player_df['team'].nunique()} teams")

    profiles = build_profiles(player_df, team_games, chrono_games)
    payload = _sanitize_nan({
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "teams": profiles,
    })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "team_profiles.json"
    with path.open("w", encoding="utf-8") as f:
        # allow_nan=False makes a stray NaN raise here at build time instead of
        # silently producing JSON that Deno's JSON.parse rejects at worker boot.
        json.dump(payload, f, separators=(",", ":"), default=_json_safe, allow_nan=False)
    print(f"  Wrote {path} ({path.stat().st_size / 1024:.1f} KB, {len(profiles)} teams)")


if __name__ == "__main__":
    main()
