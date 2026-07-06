#!/usr/bin/env python3
"""Team-specific profiles: playstyle, player win conditions, strengths/weaknesses.

Exports team_profiles.json for nuckyAI prediction packets and future preview UI.

Usage:
    python scripts/ml/build_team_profiles.py
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
SCRIPTS_ROOT = SCRIPTS_DIR.parent
ROOT = SCRIPTS_DIR.parents[1]
for p in (SCRIPTS_DIR, SCRIPTS_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from oe_csv_io import discover_local_csv_files, normalize_oe_row  # noqa: E402
from oe_leagues import ALL_ALLOWED_LEAGUE_CODES  # noqa: E402
from team_identity import canonical_team  # noqa: E402

LOL_DIR = ROOT / "lol"
OUT_DIR = ROOT / "data" / "ml" / "artifacts"
ALLOWED_COMPLETENESS = {"complete", "partial"}
ROLES = ("top", "jungle", "mid", "adc", "support")
POSITION_MAP = {
    "top": "top", "jng": "jungle", "jungle": "jungle", "mid": "mid",
    "bot": "adc", "adc": "adc", "sup": "support", "support": "support",
}
MIN_PLAYER_GAMES = 12
MIN_PLAYER_SPLIT = 6
MIN_TEAM_PATTERN_GAMES = 18
MIN_LIFT_PP = 12


def _norm_pos(raw: str) -> str:
    return POSITION_MAP.get(str(raw or "").strip().lower(), "")


def _json_safe(obj):
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    raise TypeError(type(obj))


def load_player_rows(years: list[str]) -> pd.DataFrame:
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        print(f"  Profile scan: {path.name}", file=sys.stderr)
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "patch", "position", "teamname", "result",
            "playername", "name", "datacompleteness",
            "golddiffat15", "golddiffat10", "csdiffat15", "xpdiffat15",
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
                "ka15": ka15,
                "kp": float(row.get("killparticipation", 0) or 0) * 100,
                "dmg_share": float(row.get("damageshare", 0) or 0) * 100,
            })
    return pd.DataFrame(rows)


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
                "firstdragon": int(float(row.get("firstdragon", 0) or 0) == 1),
                "firstherald": int(float(row.get("firstherald", 0) or 0) == 1),
                "firsttower": int(float(row.get("firsttower", 0) or 0) == 1),
            })
    return pd.DataFrame(rows)


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


def build_playstyle(player_df: pd.DataFrame, team: str, roster: dict[str, str]) -> dict:
    sub = player_df[player_df["team"] == team]
    role_ka: dict[str, float] = {}
    role_gd: dict[str, float] = {}
    for role in ROLES:
        role_sub = sub[sub["role"] == role]
        if role_sub.empty:
            continue
        if role_sub["ka15"].notna().any():
            role_ka[role] = round(float(role_sub["ka15"].mean()), 2)
        if role_sub["gd15"].notna().any():
            role_gd[role] = round(float(role_sub["gd15"].mean()), 1)

    ranked = sorted(role_ka.items(), key=lambda x: x[1], reverse=True)
    focus = [r for r, _ in ranked[:2]] if ranked else []
    secondary = [r for r, _ in ranked[2:4]] if len(ranked) > 2 else []

    role_labels = {
        "top": "top", "jungle": "jungle", "mid": "mid", "adc": "bot", "support": "support",
    }
    focus_str = "/".join(role_labels.get(r, r) for r in focus) if focus else "balanced map"

    avg_team_gd = float(sub["gd15"].mean()) if sub["gd15"].notna().any() else 0.0
    if avg_team_gd >= 200:
        tempo = "early_aggressive"
    elif avg_team_gd <= -100:
        tempo = "scaling"
    else:
        tempo = "balanced"

    roster_focus = [roster.get(r, role_labels.get(r, r)) for r in focus if r in roster]
    roster_note = ""
    if roster_focus:
        roster_note = f" (through {', '.join(roster_focus)})"

    summary = (
        f"{team} tends to play around {focus_str} in the early game"
        f"{roster_note} — highest avg K+A@15 on {focus_str}."
    )
    if tempo == "early_aggressive":
        summary += " Team averages positive GD@15 — proactive early tempo."
    elif tempo == "scaling":
        summary += " Often absorbs early pressure — win conditions skew late."

    skirmish_note = None
    if "top" in focus or "jungle" in focus:
        skirmish_note = f"Look out for strong early skirmishing from {team} topside."
    elif "mid" in focus and "jungle" in secondary:
        skirmish_note = f"{team} mid/jungle duo is a common early pivot — watch for mid prio setups."

    return {
        "earlyFocusRoles": focus,
        "secondaryRoles": secondary,
        "roleEarlyKa15": role_ka,
        "roleAvgGd15": role_gd,
        "tempo": tempo,
        "summary": summary,
        "skirmishNote": skirmish_note,
    }


def build_player_win_conditions(
    player_df: pd.DataFrame, team: str, roster: dict[str, str],
) -> list[dict]:
    sub = player_df[player_df["team"] == team]
    out: list[dict] = []
    roster_players = set(roster.values()) if roster else None

    for player, grp in sub.groupby("player"):
        if roster_players and player not in roster_players:
            continue
        if len(grp) < MIN_PLAYER_GAMES:
            continue
        valid = grp[grp["gd15"].notna()]
        if len(valid) < MIN_PLAYER_SPLIT * 2:
            continue
        ahead = valid[valid["gd15"] >= 0]
        behind = valid[valid["gd15"] < 0]
        if len(ahead) < MIN_PLAYER_SPLIT or len(behind) < MIN_PLAYER_SPLIT:
            continue
        ahead_wr = ahead["won"].mean() * 100
        behind_wr = behind["won"].mean() * 100
        lift = ahead_wr - behind_wr
        if abs(lift) < MIN_LIFT_PP:
            continue
        role = grp["role"].mode().iloc[0] if not grp["role"].empty else "unknown"
        if lift > 0:
            label = (
                f"{team} wins significantly more when {player} is ahead at 15m "
                f"({ahead_wr:.0f}% in {len(ahead)}g vs {behind_wr:.0f}% when behind)"
            )
        else:
            label = (
                f"{team} win rate drops when {player} is behind at 15m "
                f"({behind_wr:.0f}% behind vs {ahead_wr:.0f}% ahead)"
            )
        out.append({
            "player": player,
            "role": role,
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
    return out[:8]


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
    checks = [
        ("gd15", 500, "above", f"{team} early leads", True),
        ("gd15", -500, "below", f"{team} early deficits", False),
        ("gd15", 1000, "above", f"{team} snowball starts", True),
        ("gd15", -1000, "below", f"{team} early holes", False),
    ]
    win_p: list[dict] = []
    loss_p: list[dict] = []
    for metric, thr, direction, prefix, fav in checks:
        p = _team_pattern(team_games, team, metric, thr, direction, prefix, fav)
        if not p:
            continue
        if p["liftPp"] > 0:
            win_p.append(p)
        else:
            loss_p.append(p)

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
        if abs(lift) < 8:
            continue
        entry = {
            "metric": col,
            "games": len(bucket),
            "winrate": round(wr * 100, 1),
            "baselineWinrate": round(baseline * 100, 1),
            "liftPp": round(lift, 1),
            "favorable": lift > 0,
            "label": f"{team} after securing {name}: {wr*100:.0f}% WR ({lift:+.0f}pp vs baseline)",
        }
        if lift > 0:
            win_p.append(entry)
        else:
            loss_p.append(entry)

    win_p.sort(key=lambda x: abs(x.get("liftPp", 0)), reverse=True)
    loss_p.sort(key=lambda x: abs(x.get("liftPp", 0)), reverse=True)
    return win_p[:6], loss_p[:4]


def derive_strengths_weaknesses(
    playstyle: dict, win_patterns: list[dict], loss_patterns: list[dict],
    player_conditions: list[dict],
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    weaknesses: list[str] = []

    if playstyle.get("tempo") == "early_aggressive":
        strengths.append(playstyle["summary"])
    elif playstyle.get("tempo") == "scaling":
        weaknesses.append("Vulnerable to early snowball — tends to absorb pressure before scaling.")

    if playstyle.get("skirmishNote"):
        strengths.append(playstyle["skirmishNote"])

    for p in win_patterns[:3]:
        strengths.append(p["label"])
    for p in loss_patterns[:2]:
        weaknesses.append(p["label"])

    for pc in player_conditions[:2]:
        if pc["favorableWhenAhead"]:
            strengths.append(pc["label"])
        else:
            weaknesses.append(pc["label"])

    return strengths[:5], weaknesses[:4]


def build_profiles(player_df: pd.DataFrame, team_games: pd.DataFrame) -> dict:
    teams = sorted(set(player_df["team"].unique()) | set(team_games["team"].unique()))
    out: dict[str, dict] = {}
    as_of = player_df["date"].max() if not player_df.empty else ""

    for team in teams:
        if not team:
            continue
        team_player = player_df[player_df["team"] == team]
        if len(team_player) < MIN_TEAM_PATTERN_GAMES:
            continue
        roster = infer_roster(player_df, team)
        playstyle = build_playstyle(player_df, team, roster)
        player_conditions = build_player_win_conditions(player_df, team, roster)
        win_patterns, loss_patterns = build_team_patterns(team_games, team)
        strengths, weaknesses = derive_strengths_weaknesses(
            playstyle, win_patterns, loss_patterns, player_conditions,
        )
        league_rows = team_player.sort_values("date")
        out[team] = {
            "league": league_rows["league"].iloc[-1] if not league_rows.empty else "",
            "gamesAnalyzed": len(team_player["gameid"].unique()),
            "asOf": as_of,
            "roster": roster,
            "playstyle": playstyle,
            "playerWinConditions": player_conditions,
            "winPatterns": win_patterns,
            "lossPatterns": loss_patterns,
            "strengths": strengths,
            "weaknesses": weaknesses,
        }
    return out


def main() -> None:
    years = [str(y) for y in range(datetime.now(timezone.utc).year - 1, datetime.now(timezone.utc).year + 1)]
    print(f"Building team profiles from years {years}...")
    player_df = load_player_rows(years)
    team_games = load_team_rows(years)
    print(f"  {len(player_df)} player-game rows, {player_df['team'].nunique()} teams")

    profiles = build_profiles(player_df, team_games)
    payload = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "teams": profiles,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "team_profiles.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), default=_json_safe)
    print(f"  Wrote {path} ({path.stat().st_size / 1024:.1f} KB, {len(profiles)} teams)")


if __name__ == "__main__":
    main()
