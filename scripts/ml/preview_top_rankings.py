#!/usr/bin/env python3
"""Preview top-N teams / players (by role) / champions for sanity-checking against
eye-test knowledge before Component 2/3/4 (matchup matrix, full player rating with
outcome-regression, archetype validation) are built.

Teams: reads the already-shipped self-contained Team Power Rating (region_strength.json,
Component 1 — see docs/nucky_v2.md).

Players: a v0 preview of Component 3's *first* layer only (box-score composite, no
outcome-regression yet) — per-role z-score across early-game/damage/KP stats vs
role+region baseline, recency-weighted (120-day half-life) and lightly SOS-adjusted using
the Component 1 Team Power Rating of each game's opponent. Not the final Component 3
rating: no team-demeaned outcome-regression layer, no vision/objective stats yet.

Champions: a v0 preview only — current-meta performance composite (winrate + presence
z-score across the last 3 patches, recency-weighted). Not informed by the matchup matrix
or archetype validation (Components 2/4) yet.

Usage:
    python scripts/ml/preview_top_rankings.py [--top 10] [--out docs/nucky_power_rankings_preview.md]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from build_team_profiles import add_kp15, load_player_rows  # noqa: E402

ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"
ROLES = ("top", "jungle", "mid", "adc", "support")
MIN_PLAYER_GAMES = 10
HALF_LIFE_DAYS = 120.0  # player "current form/quality" half-life — longer than the
# 45-day series-form half-life used elsewhere since this is a standing power rating,
# not a hot/cold recent-form read.

# Provisional per-role stat weights for the v0 box-score composite. Roles differ in what
# "good" looks like (a support isn't expected to carry damage share) so weights favor the
# stats that actually distinguish good players within that role, not overall damage output.
ROLE_STAT_WEIGHTS: dict[str, dict[str, float]] = {
    "top": {"gd15": 0.30, "dmg_share": 0.25, "kp15": 0.15, "dpm": 0.20, "csd15": 0.10},
    "jungle": {"kp15": 0.35, "gd15": 0.25, "dmg_share": 0.15, "dpm": 0.15, "csd15": 0.10},
    "mid": {"gd15": 0.30, "dmg_share": 0.25, "kp15": 0.15, "dpm": 0.20, "csd15": 0.10},
    "adc": {"gd15": 0.25, "dmg_share": 0.30, "kp15": 0.15, "dpm": 0.20, "csd15": 0.10},
    "support": {"kp15": 0.45, "gd15": 0.20, "dmg_share": 0.10, "csd15": 0.05, "dpm": 0.20},
}
STAT_COLS = ("gd15", "dmg_share", "kp15", "dpm", "csd15")

RECENT_PATCH_WEIGHTS = [1.0, 0.6, 0.35]  # most-recent-patch-first


def load_json(name: str) -> dict:
    path = ARTIFACTS_DIR / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


# ---------------------------------------------------------------------------
# Teams (Component 1 — already shipped, just reading + printing here)
# ---------------------------------------------------------------------------

def top_teams(n: int) -> pd.DataFrame:
    strength = load_json("region_strength.json").get("teams", {})
    rows = [
        {"team": t, "region": v.get("homeRegion"), "rating": v.get("rating"), "gamesRecent": v.get("daysSinceLastSeries")}
        for t, v in strength.items()
    ]
    df = pd.DataFrame(rows).dropna(subset=["rating"]).sort_values("rating", ascending=False)
    return df.head(n).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Players (v0 preview of Component 3 layer 1: box-score composite)
# ---------------------------------------------------------------------------

def _patch_years_needed() -> list[str]:
    # Player rows need the same OE years the rest of the pipeline uses; last 2 calendar
    # years is enough for a 120-day-half-life "current" read with headroom for cold-start.
    import datetime
    y = datetime.datetime.utcnow().year
    return [str(y - 1), str(y)]


def top_players_by_role(n: int) -> dict[str, pd.DataFrame]:
    years = _patch_years_needed()
    print(f"  Loading player rows for {years}...", file=sys.stderr)
    df = load_player_rows(years)
    df = add_kp15(df)
    if df.empty:
        return {}

    strength = load_json("region_strength.json").get("teams", {})
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    as_of = df["date"].max()
    days_ago = (as_of - df["date"]).dt.days.clip(lower=0)
    df["recency_weight"] = np.exp(-np.log(2) * days_ago / HALF_LIFE_DAYS)

    # Opponent strength (SOS) per game: map each player-game's OWN team to a rating, then
    # for a given gameid look up the *other* team's rating as the opponent's strength.
    team_rating = {t: v.get("rating") for t, v in strength.items()}
    team_by_game = df.groupby("gameid")["team"].apply(lambda s: sorted(set(s)))
    opp_rating_by_game_team: dict[tuple[str, str], float] = {}
    for gid, teams in team_by_game.items():
        if len(teams) != 2:
            continue
        a, b = teams
        ra, rb = team_rating.get(a), team_rating.get(b)
        if ra is not None:
            opp_rating_by_game_team[(gid, b)] = ra
        if rb is not None:
            opp_rating_by_game_team[(gid, a)] = rb
    global_avg_rating = float(np.mean(list(team_rating.values()))) if team_rating else 1500.0
    df["opp_rating"] = [
        opp_rating_by_game_team.get((gid, team), global_avg_rating)
        for gid, team in zip(df["gameid"], df["team"])
    ]
    # SOS adjustment: playing a +400 Elo stronger-than-average opponent nudges the
    # per-game weight up ~1.4x; a much weaker opponent dampens it. Same 400pt Elo scale
    # the rest of the pipeline uses, capped so one extreme game can't dominate.
    df["sos_multiplier"] = np.clip(np.exp((df["opp_rating"] - global_avg_rating) / 400.0), 0.6, 1.6)
    df["weight"] = df["recency_weight"] * df["sos_multiplier"]

    out: dict[str, pd.DataFrame] = {}
    for role in ROLES:
        role_df = df[df["role"] == role].copy()
        if role_df.empty:
            continue
        region_col = role_df["league"].map(lambda lg: lg if lg in {"LCK", "LPL", "LEC", "LCS"} else None)
        role_df["region_bucket"] = region_col.fillna("OTHER")

        baselines: dict[str, dict] = {}
        for region, grp in role_df.groupby("region_bucket"):
            baselines[region] = {stat: (grp[stat].mean(), grp[stat].std(ddof=0) or 1.0) for stat in STAT_COLS}

        z_cols = {}
        for stat in STAT_COLS:
            means = role_df["region_bucket"].map(lambda r: baselines[r][stat][0])
            stds = role_df["region_bucket"].map(lambda r: baselines[r][stat][1] or 1.0)
            z_cols[f"z_{stat}"] = ((role_df[stat] - means) / stds).clip(-3, 3)
        role_df = pd.concat([role_df, pd.DataFrame(z_cols, index=role_df.index)], axis=1)

        weights = ROLE_STAT_WEIGHTS[role]
        role_df["composite_z"] = sum(
            role_df[f"z_{stat}"].fillna(0) * w for stat, w in weights.items()
        )

        agg_rows = []
        for player, grp in role_df.groupby("player"):
            valid = grp.dropna(subset=["composite_z"])
            if len(valid) < MIN_PLAYER_GAMES:
                continue
            w_sum = valid["weight"].sum()
            score = float((valid["composite_z"] * valid["weight"]).sum() / w_sum) if w_sum else np.nan
            team = grp["team"].mode().iloc[0] if not grp["team"].empty else "?"
            region = grp["region_bucket"].mode().iloc[0] if not grp["region_bucket"].empty else "?"
            agg_rows.append({
                "player": player, "team": team, "region": region,
                "games": len(valid), "powerScore": round(score, 3),
            })
        role_out = pd.DataFrame(agg_rows).sort_values("powerScore", ascending=False)
        out[role] = role_out.head(n).reset_index(drop=True)

    return out


# ---------------------------------------------------------------------------
# Champions (v0 preview — current-meta performance composite, no matchup/archetype yet)
# ---------------------------------------------------------------------------

def _patch_sort_key(p: str) -> tuple[float, float]:
    m = re.match(r"^(\d+)\.(\d+)$", p)
    if not m:
        return (-1.0, -1.0)
    return (float(m.group(1)), float(m.group(2)))


def top_champions(n: int, min_weighted_picks: float = 10.0) -> pd.DataFrame:
    meta = load_json("champ_meta.json")
    patches = sorted((p for p in meta if p != "global"), key=_patch_sort_key)
    if not patches:
        return pd.DataFrame()
    recent = patches[-len(RECENT_PATCH_WEIGHTS):]
    weights = RECENT_PATCH_WEIGHTS[-len(recent):]

    agg: dict[str, dict] = {}
    for patch, w in zip(reversed(recent), weights):
        for champ, stats in meta.get(patch, {}).items():
            picks = stats.get("picks", 0) or 0
            wins = stats.get("wins", 0) or 0
            presence = stats.get("presence", 0) or 0
            entry = agg.setdefault(champ, {"wpicks": 0.0, "wwins": 0.0, "wpresence": 0.0, "wsum": 0.0})
            entry["wpicks"] += picks * w
            entry["wwins"] += wins * w
            entry["wpresence"] += presence * w
            entry["wsum"] += w

    rows = []
    for champ, e in agg.items():
        if e["wpicks"] < min_weighted_picks:
            continue
        winrate = 100.0 * e["wwins"] / e["wpicks"] if e["wpicks"] else 50.0
        presence = e["wpresence"] / e["wsum"] if e["wsum"] else 0.0
        rows.append({"champion": champ, "weightedPicks": round(e["wpicks"], 1), "winrate": round(winrate, 1), "presence": round(presence, 1)})

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    wr_z = (df["winrate"] - df["winrate"].mean()) / (df["winrate"].std(ddof=0) or 1.0)
    pres_z = (df["presence"] - df["presence"].mean()) / (df["presence"].std(ddof=0) or 1.0)
    df["powerScore"] = round(0.5 * wr_z + 0.5 * pres_z, 3)
    return df.sort_values("powerScore", ascending=False).head(n).reset_index(drop=True)


# ---------------------------------------------------------------------------

def render_markdown(teams: pd.DataFrame, players: dict[str, pd.DataFrame], champs: pd.DataFrame, n: int) -> str:
    lines = [
        "# Power rankings preview — sanity-check pass",
        "",
        f"> Generated by `scripts/ml/preview_top_rankings.py` — **teams** are the shipped",
        "> Component 1 self-contained Team Power Rating. **Players** and **champions** are",
        "> v0 previews only (box-score composite / current-meta composite), ahead of the",
        "> full Component 2 (matchup matrix), Component 3 (outcome-regression layer), and",
        "> Component 4 (archetype validation) builds — expect these two lists to move once",
        "> those ship. See `docs/nucky_v2.md` Phase 1 build log.",
        "",
        "## Teams (Team Power Rating)",
        "",
        "| # | Team | Region | Rating |",
        "| --- | --- | --- | --- |",
    ]
    for i, row in teams.iterrows():
        lines.append(f"| {i+1} | {row['team']} | {row['region']} | {row['rating']:.1f} |")

    lines += ["", "## Players by role (v0 box-score composite, SOS + recency weighted)", ""]
    for role in ROLES:
        role_df = players.get(role)
        if role_df is None or role_df.empty:
            continue
        lines += [f"### {role.capitalize()}", "", "| # | Player | Team | Region | Games | Power score (z) |", "| --- | --- | --- | --- | --- | --- |"]
        for i, row in role_df.iterrows():
            lines.append(f"| {i+1} | {row['player']} | {row['team']} | {row['region']} | {row['games']} | {row['powerScore']:.2f} |")
        lines.append("")

    lines += ["## Champions (v0 current-meta performance composite)", "", "| # | Champion | Weighted picks | Winrate | Presence | Power score (z) |", "| --- | --- | --- | --- | --- | --- |"]
    for i, row in champs.iterrows():
        lines.append(f"| {i+1} | {row['champion']} | {row['weightedPicks']} | {row['winrate']}% | {row['presence']}% | {row['powerScore']:.2f} |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--out", type=Path, default=ROOT / "docs" / "nucky_power_rankings_preview.md")
    args = parser.parse_args()

    print("Computing team rankings...", file=sys.stderr)
    teams = top_teams(args.top)
    print("Computing player rankings by role (this scans OE CSVs, may take a bit)...", file=sys.stderr)
    players = top_players_by_role(args.top)
    print("Computing champion rankings...", file=sys.stderr)
    champs = top_champions(args.top)

    md = render_markdown(teams, players, champs, args.top)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(md, encoding="utf-8")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
