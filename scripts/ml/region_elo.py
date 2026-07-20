"""
Team Power Rating & Region/League Strength — self-contained, series-grain Elo.

Phase 1 (docs/nucky_v2.md) replaces the old per-game flat-K Elo with a system
modeled on Riot's own published Global Power Rankings methodology (Elo-based;
Team Elo blended 80/20 with League Elo; K-factor scaled by context of play —
see lolesports.com/en-US/news/dev-diary-unveiling-the-global-power-rankings)
plus two ideas borrowed from other rating systems:

  - Massey/Colley cross-group rating propagation: League Elo is a *live
    aggregate* of its member teams' current Elo, not a separately hand-tuned
    parallel rating. Cross-region games (MSI/Worlds/First Stand) move League
    Elo automatically because they move the member Team Elo the aggregate is
    computed from — no explicit region-vs-region update step, no hardcoded
    region-strength priors.
  - Glicko-2 rating deviation: a team's rating gets an inactivity-driven
    uncertainty band (`ratingDeviation`) instead of holding a stale precise
    number after a long layoff (e.g. off-season).

This module is intentionally self-contained: no lolesports GPR, no Kalshi.
Those remain useful only as an *offline* comparison benchmark (see
scripts/ml/backtest_power_rating.py once that ships) — never a live input
into these ratings.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_leagues import TIER1_REGIONS  # noqa: E402
from series_grouping import ChronoGame, group_games_into_series  # noqa: E402

ELO_SCALE = 400.0
BASE_RATING = 1500.0

# Team Power Score = TEAM_WEIGHT * teamElo + LEAGUE_WEIGHT * leagueElo — matches
# the 80/20 weighting Riot's own dev diary found optimal for GPR. leagueElo
# here is *derived* (mean of member teams' current Elo), not a separate model.
TEAM_WEIGHT = 0.8
LEAGUE_WEIGHT = 0.2

# K-factor by context of play. OE only gives us a binary `playoffs` flag (not
# Riot's finer play-in/main-stage/playoffs split), so this collapses to four
# tiers: domestic regular season < domestic playoffs <= international group
# stage < international playoffs. Values are a reasonable starting prior
# (same ordering/spirit as Riot's published 8/16/20 domestic and 12/20/36
# international tiers, scaled up since we start every team from a neutral
# BASE_RATING with no historical prior and need faster convergence) —
# tune against backtested calibration once scripts/ml/backtest_power_rating.py
# exists.
K_BY_TIER: dict[str, float] = {
    "domestic_regular": 16.0,
    "domestic_playoffs": 24.0,
    "international_group": 24.0,
    "international_playoffs": 40.0,
}

KEY_TEAM_STATS = ("golddiffat15", "golddiffat20", "dpm", "xpdiffat15", "csdiffat15")


def infer_home_regions(team_games: pd.DataFrame) -> dict[str, str]:
    """Canonical home region per team from domestic league history."""
    domestic = team_games[~team_games["is_international"].fillna(False)]
    if domestic.empty:
        return {}
    counts = (
        domestic.groupby(["canonical_team", "region"])
        .size()
        .reset_index(name="n")
        .sort_values(["canonical_team", "n"], ascending=[True, False])
    )
    top = counts.drop_duplicates("canonical_team", keep="first")
    return dict(zip(top["canonical_team"], top["region"]))


def _expected(score_a: float, score_b: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((score_b - score_a) / ELO_SCALE))


def _update_pair(elo_a: float, elo_b: float, a_won: bool, k: float) -> tuple[float, float]:
    exp_a = _expected(elo_a, elo_b)
    delta = k * ((1.0 if a_won else 0.0) - exp_a)
    return elo_a + delta, elo_b - delta


def _tier_for(is_international: bool, is_playoffs: bool) -> str:
    if is_international:
        return "international_playoffs" if is_playoffs else "international_group"
    return "domestic_playoffs" if is_playoffs else "domestic_regular"


def _margin_multiplier(wins_for: int, wins_against: int) -> float:
    """Scale K by series scoreline — but never below 1.0 for a decided series.

    Series outcome (win/loss) is always the Elo event unit. Margin only adds a
    modest bump for sweeps so a hard-fought 3-2 still moves ratings fully —
    winning the series itself is what matters for momentum/form; blowouts get
    a little extra, close wins are not down-weighted.
    """
    margin = abs(wins_for - wins_against)
    return min(1.25, 1.0 + 0.08 * max(0, margin - 1))


def _series_from_team_games(team_games: pd.DataFrame):
    """Group per-game team rows into Bo3/Bo5 series (ChronoGame payload carries
    the context-of-play flags needed for K-factor tiering)."""
    games_for_grouping = [
        ChronoGame(
            id=row.gameid,
            game_date=row.date.date(),
            winner=row.winner_canonical,
            loser=row.loser_canonical,
            payload={
                "is_international": bool(row.is_international),
                "is_playoffs": bool(getattr(row, "playoffs", 0)),
            },
        )
        for row in team_games.itertuples()
        if row.result == 1  # one ChronoGame per game (dedup the 2 team-rows)
    ]
    return group_games_into_series(games_for_grouping)


def walk_forward_ratings(
    team_games: pd.DataFrame,
) -> tuple[dict[str, str], dict[str, float], dict[str, float], pd.DataFrame]:
    """Chronological series-grain Elo pass.

    Returns (home_region_map, final_region_elo, final_team_elo, timeline) where
    timeline has one row per (team, series) with that team's Elo and its home
    region's (live-aggregate) Elo immediately after the series concluded.
    """
    home = infer_home_regions(team_games)
    region_members: dict[str, set[str]] = {}
    for team, region in home.items():
        region_members.setdefault(region, set()).add(team)

    team_elo: dict[str, float] = {}

    def region_mean(region: str | None) -> float | None:
        if not region:
            return None
        members = region_members.get(region)
        if not members:
            return BASE_RATING
        return float(np.mean([team_elo.get(t, BASE_RATING) for t in members]))

    buckets = _series_from_team_games(team_games)
    buckets.sort(key=lambda bkt: max(g.game_date for g in bkt.games))

    timeline_rows: list[dict] = []
    for bkt in buckets:
        team_a, team_b = bkt.team_a, bkt.team_b
        wins_a = sum(1 for g in bkt.games if g.winner == team_a)
        wins_b = len(bkt.games) - wins_a
        if wins_a == wins_b:
            continue  # shouldn't happen (is_valid_series_score guarantees a winner)
        a_won = wins_a > wins_b

        last_game = max(bkt.games, key=lambda g: g.game_date)
        payload = last_game.payload or {}
        tier = _tier_for(bool(payload.get("is_international")), bool(payload.get("is_playoffs")))
        k = K_BY_TIER[tier] * _margin_multiplier(wins_a, wins_b)

        ea = team_elo.get(team_a, BASE_RATING)
        eb = team_elo.get(team_b, BASE_RATING)
        ea, eb = _update_pair(ea, eb, a_won, k)
        team_elo[team_a] = ea
        team_elo[team_b] = eb

        end_date = pd.Timestamp(last_game.game_date)
        ha, hb = home.get(team_a), home.get(team_b)
        ra, rb = region_mean(ha), region_mean(hb)

        for team, elo, region, region_val in ((team_a, ea, ha, ra), (team_b, eb, hb, rb)):
            timeline_rows.append({
                "date": end_date,
                "team": team,
                "team_elo": elo,
                "home_region": region,
                "region_elo": region_val if region_val is not None else np.nan,
            })

    timeline = pd.DataFrame(timeline_rows)
    if not timeline.empty:
        timeline = timeline.sort_values(["team", "date"]).drop_duplicates(["team", "date"], keep="last")

    final_region_elo = {region: (region_mean(region) or BASE_RATING) for region in region_members}
    return home, final_region_elo, team_elo, timeline


def _lookup_elo_before(
    history: dict[str, list[tuple[pd.Timestamp, float, float]]],
    team: str,
    as_of: pd.Timestamp,
) -> tuple[float, float]:
    """Strictly-prior lookup (`day < as_of`, not `<=`) so a series can never see
    its own concluding Elo update as a "pre-series" feature — same-day Bo3s
    (first game date == last game date, the common case in tier-1) would leak
    under an inclusive comparison."""
    entries = history.get(team, [])
    team_elo = float("nan")
    region_elo = float("nan")
    for day, te, re in entries:
        if day < as_of:
            team_elo, region_elo = te, re
        else:
            break
    return team_elo, region_elo


def attach_strength_features(mart: pd.DataFrame, timeline: pd.DataFrame, home: dict[str, str]) -> pd.DataFrame:
    """Point-in-time team/region Elo on series rows (strictly prior series only)."""
    mart = mart.copy()
    mart["date"] = pd.to_datetime(mart["date"]).dt.tz_localize(None)
    mart["team_home_region"] = mart["team"].map(home)
    mart["opp_home_region"] = mart["opponent"].map(home)

    if timeline.empty:
        mart["team_strength_elo"] = np.nan
        mart["opp_strength_elo"] = np.nan
        mart["diff_strength_elo"] = np.nan
        mart["diff_region_strength_elo"] = np.nan
        return mart

    tl = timeline.copy()
    tl["date"] = pd.to_datetime(tl["date"]).dt.tz_localize(None)
    history: dict[str, list[tuple[pd.Timestamp, float, float]]] = {}
    for row in tl.itertuples():
        history.setdefault(row.team, []).append((row.date, float(row.team_elo), float(row.region_elo)))
    for team in history:
        history[team].sort(key=lambda x: x[0])

    team_strength: list[float] = []
    opp_strength: list[float] = []
    team_region_strength: list[float] = []
    opp_region_strength: list[float] = []

    for row in mart.itertuples():
        te, tre = _lookup_elo_before(history, row.team, row.date)
        oe, ore = _lookup_elo_before(history, row.opponent, row.date)
        team_strength.append(te)
        opp_strength.append(oe)
        team_region_strength.append(tre)
        opp_region_strength.append(ore)

    mart["team_strength_elo"] = team_strength
    mart["opp_strength_elo"] = opp_strength
    mart["team_region_strength_elo"] = team_region_strength
    mart["opp_region_strength_elo"] = opp_region_strength
    mart["diff_strength_elo"] = mart["team_strength_elo"] - mart["opp_strength_elo"]
    mart["diff_region_strength_elo"] = mart["team_region_strength_elo"] - mart["opp_region_strength_elo"]
    return mart


def build_region_stat_baselines(team_games: pd.DataFrame, home: dict[str, str]) -> dict[str, dict]:
    """Per-home-region medians for key stats (SOS context for narratives)."""
    domestic = team_games[~team_games["is_international"].fillna(False)].copy()
    domestic["home_region"] = domestic["canonical_team"].map(home)
    out: dict[str, dict] = {}
    global_medians: dict[str, float] = {}
    for stat in KEY_TEAM_STATS:
        if stat in domestic.columns:
            global_medians[stat] = float(domestic[stat].median())

    for region in TIER1_REGIONS:
        sub = domestic[domestic["home_region"] == region]
        if len(sub) < 20:
            continue
        entry: dict = {"games": int(len(sub))}
        for stat in KEY_TEAM_STATS:
            if stat not in sub.columns:
                continue
            med = float(sub[stat].median())
            entry[f"{stat}_median"] = round(med, 2)
            g = global_medians.get(stat)
            if g is not None:
                entry[f"{stat}_vs_global"] = round(med - g, 2)
        out[region] = entry

    out["_global"] = {f"{s}_median": round(v, 2) for s, v in global_medians.items()}
    return out


def build_strength_snapshot(
    team_games: pd.DataFrame,
    home: dict[str, str] | None = None,
    region_elo: dict[str, float] | None = None,
    team_elo: dict[str, float] | None = None,
    timeline: pd.DataFrame | None = None,
) -> dict:
    """Export JSON for Deno inference blend + power-ranking display."""
    if home is None or region_elo is None or team_elo is None or timeline is None:
        home, region_elo, team_elo, timeline = walk_forward_ratings(team_games)

    baselines = build_region_stat_baselines(team_games, home)

    last_seen: dict[str, pd.Timestamp] = {}
    as_of = pd.Timestamp.utcnow().tz_localize(None)
    if not timeline.empty:
        last_seen = timeline.groupby("team")["date"].max().to_dict()
        as_of = max(as_of, timeline["date"].max())

    teams: dict[str, dict] = {}
    for team, region in home.items():
        team_rating = team_elo.get(team, BASE_RATING)
        region_rating = region_elo.get(region, BASE_RATING)
        power_score = TEAM_WEIGHT * team_rating + LEAGUE_WEIGHT * region_rating

        last_date = last_seen.get(team)
        inactivity_days = int((as_of - last_date).days) if last_date is not None else None
        # Glicko-2-lite: rating deviation widens after a ~45-day layoff (roughly
        # an off-season gap) instead of holding a stale precise number.
        rating_deviation = 30.0
        if inactivity_days is not None and inactivity_days > 45:
            rating_deviation = min(200.0, 30.0 + (inactivity_days - 45) * 0.6)

        teams[team] = {
            "homeRegion": region,
            "rating": round(float(power_score), 1),
            "teamEloOnly": round(float(team_rating), 1),
            "regionRating": round(float(region_rating), 1),
            "ratingDeviation": round(float(rating_deviation), 1),
            "daysSinceLastSeries": inactivity_days,
        }

    return {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "eloScale": ELO_SCALE,
        "baseRating": BASE_RATING,
        "teamWeight": TEAM_WEIGHT,
        "leagueWeight": LEAGUE_WEIGHT,
        "methodology": (
            "Self-contained series-grain Elo. Team Power Score = "
            f"{TEAM_WEIGHT}*teamElo + {LEAGUE_WEIGHT}*leagueElo, where leagueElo is a live "
            "recency-implicit aggregate (mean) of member teams' current Elo — not a "
            "separately hand-tuned rating and not sourced from any external ranking. "
            "K-factor scales with context of play (regular season < playoffs < "
            "international group < international playoffs) and series margin."
        ),
        "regions": {r: round(float(v), 1) for r, v in region_elo.items()},
        "teams": teams,
        "statBaselines": baselines,
    }


def _sanitize_nan(obj):
    """Replace NaN/Infinity floats with None — Deno's JSON.parse rejects them."""
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


def write_strength_snapshot(team_games: pd.DataFrame, out_path: Path) -> dict:
    payload = _sanitize_nan(build_strength_snapshot(team_games))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), allow_nan=False)
    return payload


if __name__ == "__main__":
    from oe_loader import build_team_game_rows, LOL_DIR  # noqa: E402

    years = [str(y) for y in range(2024, 2027)]
    tg = build_team_game_rows(years, LOL_DIR)
    snap = build_strength_snapshot(tg)
    print(json.dumps({"regions": snap["regions"], "T1": snap["teams"].get("T1"), "G2": snap["teams"].get("G2 Esports")}, indent=2))
