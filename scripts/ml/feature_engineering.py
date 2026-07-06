"""
Point-in-time feature engineering for the series-outcome feature mart.

Everything here is walk-forward safe: every rolling/history feature for a
series is computed strictly from games/series that happened before that
series' first game. Two layers:

1. Per-game rolling form (team-level + per-role) via shift(1)+rolling over the
   chronological team_game_rows DataFrame — vectorized, fast.
2. Series-grain context (series win-rate streaks, head-to-head, roster
   continuity, rest days) via a single chronological pass, since these are
   keyed by unordered team pairs and don't vectorize cleanly.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from series_grouping import ChronoGame, group_games_into_series

ROLL_WINDOWS = (10, 20)
MIN_PERIODS = 3
SERIES_WINDOWS = (5, 10, 20)
HALF_LIFE_DAYS = 45.0
DECAY_LAMBDA = math.log(2) / HALF_LIFE_DAYS

TEAM_ROLL_STATS = [
    "kills", "deaths", "assists",
    "golddiffat10", "golddiffat15", "golddiffat20", "golddiffat25",
    "xpdiffat15", "csdiffat15",
    "dpm", "damagetakenperminute", "damagemitigatedperminute",
    "wardsplaced", "wpm", "wardskilled", "wcpm", "controlwardsbought", "visionscore", "vspm",
    "totalgold", "earnedgold", "earned gpm", "goldspent", "gspd", "gpr",
    "cspm",
    "dragons", "elementaldrakes", "heralds", "void_grubs", "barons", "towers", "turretplates", "inhibitors",
    "firstblood", "firstdragon", "firstherald", "firstbaron", "firsttower", "firstmidtower", "firsttothreetowers",
    "gamelength", "max_dmg_share",
]

ROLE_BASE_STATS = [
    "dpm", "damageshare", "damagetakenperminute", "earnedgoldshare",
    "visionscore", "vspm", "wardskilled", "controlwardsbought",
    "golddiffat10", "csdiffat10", "xpdiffat10",
    "golddiffat15", "csdiffat15", "xpdiffat15",
    "golddiffat20", "csdiffat20", "xpdiffat20",
    "kp", "kills", "deaths", "assists",
]
ROLES = ("top", "jungle", "mid", "adc", "support")
ROLE_ROLL_STATS = [f"{role}_{stat}" for role in ROLES for stat in ROLE_BASE_STATS]

CITO_ROLL_STATS = ["cito_max_lead", "cito_lead_flips", "cito_time_ahead_share"]


def _rolling_prior_mean(df: pd.DataFrame, group_col: str, col: str, window: int) -> pd.Series:
    return df.groupby(group_col)[col].transform(
        lambda s: s.shift(1).rolling(window, min_periods=MIN_PERIODS).mean()
    )


def _rolling_prior_std(df: pd.DataFrame, group_col: str, col: str, window: int) -> pd.Series:
    return df.groupby(group_col)[col].transform(
        lambda s: s.shift(1).rolling(window, min_periods=MIN_PERIODS).std()
    )


def add_rolling_game_features(team_games: pd.DataFrame) -> pd.DataFrame:
    """Add `<stat>_last{N}` prior-form columns (team + per-role) for each roll window."""
    df = team_games.sort_values(["canonical_team", "date", "gameid"]).reset_index(drop=True)

    all_stats = [c for c in (TEAM_ROLL_STATS + ROLE_ROLL_STATS + CITO_ROLL_STATS) if c in df.columns]
    new_cols: dict[str, pd.Series] = {}
    for col in all_stats:
        for w in ROLL_WINDOWS:
            new_cols[f"{col}_last{w}"] = _rolling_prior_mean(df, "canonical_team", col, w)

    # Volatility / throw-rate signals (early-game consistency vs late-game execution).
    df["_ahead20_but_lost"] = ((df.get("golddiffat20", np.nan) > 0) & (df["result"] == 0)).astype(float)
    df["_ahead20"] = (df.get("golddiffat20", np.nan) > 0).astype(float)
    for w in ROLL_WINDOWS:
        new_cols[f"golddiffat15_std_last{w}"] = _rolling_prior_std(df, "canonical_team", "golddiffat15", w)
        new_cols[f"throw_rate_last{w}"] = _rolling_prior_mean(df, "canonical_team", "_ahead20_but_lost", w)
        new_cols[f"lead_at20_rate_last{w}"] = _rolling_prior_mean(df, "canonical_team", "_ahead20", w)

    # Side-conditional win rate (blue vs red form), same shift+rolling pattern
    # but grouped by (team, side) so only that side's prior games count.
    df["_side_group"] = df["canonical_team"] + "|" + df["side"].fillna("")
    for w in ROLL_WINDOWS:
        new_cols[f"side_winrate_last{w}"] = _rolling_prior_mean(df, "_side_group", "result", w)

    df = pd.concat([df, pd.DataFrame(new_cols, index=df.index)], axis=1)
    return df.drop(columns=["_ahead20_but_lost", "_ahead20", "_side_group"])


def _series_id(bucket_teams: tuple[str, str], date_str: str, session_index: int) -> str:
    base = f"{'|'.join(bucket_teams)}|{date_str}"
    return base if session_index == 0 else f"{base}|{session_index}"


def build_series_rows(team_games_rolled: pd.DataFrame) -> pd.DataFrame:
    """Group per-game rows into Bo3/Bo5 series and attach pre-series snapshots.

    Returns one row per (series, perspective) with the perspective team's
    pre-series rolling snapshot, its opponent's, series outcome, and series
    context (patch/league/playoffs/international/date). Two perspective rows
    per series (A-vs-B and B-vs-A) for symmetric training data.
    """
    games_for_grouping = [
        ChronoGame(
            id=row.gameid,
            game_date=row.date.date(),
            winner=row.winner_canonical,
            loser=row.loser_canonical,
        )
        for row in team_games_rolled.itertuples()
        if row.result == 1  # one ChronoGame per game (dedup the 2 team-rows)
    ]
    buckets = group_games_into_series(games_for_grouping)

    # Index rolling snapshots by (gameid, canonical_team) for O(1) lookup of the
    # "state entering this game" row when reconstructing series.
    snapshot_idx = team_games_rolled.set_index(["gameid", "canonical_team"])

    rows: list[dict] = []
    for bucket in buckets:
        ordered_games = sorted(bucket.games, key=lambda g: (g.game_date, g.id))
        first_game = ordered_games[0]
        last_game = ordered_games[-1]
        team_a, team_b = bucket.team_a, bucket.team_b

        try:
            snap_a = snapshot_idx.loc[(first_game.id, team_a)]
            snap_b = snapshot_idx.loc[(first_game.id, team_b)]
        except KeyError:
            continue  # first game missing a side's row (shouldn't happen post-loader filter)
        if isinstance(snap_a, pd.DataFrame):
            snap_a = snap_a.iloc[0]
        if isinstance(snap_b, pd.DataFrame):
            snap_b = snap_b.iloc[0]

        wins_a = sum(1 for g in ordered_games if g.winner == team_a)
        wins_b = len(ordered_games) - wins_a
        series_id = _series_id((team_a, team_b), str(first_game.game_date), bucket.session_index)

        base_ctx = {
            "series_id": series_id,
            "date": pd.Timestamp(first_game.game_date),
            "end_date": pd.Timestamp(last_game.game_date),
            "league": snap_a.get("league", ""),
            "region": snap_a.get("region", ""),
            "is_international": bool(snap_a.get("is_international", False)),
            "is_playoffs": bool(snap_a.get("playoffs", 0)),
            "patch": snap_a.get("patch", ""),
            "split": snap_a.get("split", ""),
            "oe_year": snap_a.get("year", ""),
            "best_of": 5 if max(wins_a, wins_b) == 3 else 3,
            "total_games": len(ordered_games),
        }

        for persp_team, opp_team, persp_snap, opp_snap, persp_wins, opp_wins in (
            (team_a, team_b, snap_a, snap_b, wins_a, wins_b),
            (team_b, team_a, snap_b, snap_a, wins_b, wins_a),
        ):
            row: dict = {
                **base_ctx,
                "team": persp_team,
                "opponent": opp_team,
                "team_wins_series": int(persp_wins > opp_wins),
                "score_for": persp_wins,
                "score_against": opp_wins,
                "team_roster": persp_snap.get("roster"),
                "opponent_roster": opp_snap.get("roster"),
            }
            for col, val in persp_snap.items():
                if col.endswith(tuple(f"_last{w}" for w in ROLL_WINDOWS)):
                    row[f"team_{col}"] = val
            for col, val in opp_snap.items():
                if col.endswith(tuple(f"_last{w}" for w in ROLL_WINDOWS)):
                    row[f"opp_{col}"] = val
            rows.append(row)

    return pd.DataFrame(rows)


def add_diff_features(mart: pd.DataFrame) -> pd.DataFrame:
    """Add team-minus-opponent diff columns for every paired rolling stat."""
    team_cols = [c for c in mart.columns if c.startswith("team_") and not c.startswith("team_wins")]
    diffs = {}
    for tc in team_cols:
        oc = "opp_" + tc[len("team_"):]
        if oc in mart.columns and pd.api.types.is_numeric_dtype(mart[tc]):
            diffs[f"diff_{tc[len('team_'):]}"] = mart[tc] - mart[oc]
    return pd.concat([mart, pd.DataFrame(diffs, index=mart.index)], axis=1)


def add_series_history_features(mart: pd.DataFrame) -> pd.DataFrame:
    """Series-grain features needing a single chronological pass: series win-rate
    streaks, decayed head-to-head, roster continuity, and rest days.

    Both perspective rows of a series (team=A/opponent=B and team=B/opponent=A)
    share the same date and pair-history key, so features for BOTH rows are
    computed first from the state as of strictly before this series, and the
    history dicts are only updated once both rows have read from them.
    Otherwise the second perspective row would see the first row's just-appended
    entry for this exact series (a same-day, same-pair H2H leak).
    """
    mart = mart.sort_values(["date", "series_id", "team"]).reset_index(drop=True)

    team_series_history: dict[str, list[tuple[pd.Timestamp, int]]] = {}
    team_last_end_date: dict[str, pd.Timestamp] = {}
    team_last_roster: dict[str, frozenset] = {}
    pair_history: dict[frozenset, list[tuple[pd.Timestamp, str]]] = {}

    n = len(mart)
    out_cols = {
        **{f"team_series_winrate_last{w}": [np.nan] * n for w in SERIES_WINDOWS},
        "team_h2h_winrate_decayed": [np.nan] * n,
        "team_h2h_games": [0] * n,
        "team_rest_days": [np.nan] * n,
        "team_roster_continuity": [np.nan] * n,
    }

    for _, group in mart.groupby("series_id", sort=False):
        rows = list(group.itertuples())

        for row in rows:
            team, opponent, date, idx = row.team, row.opponent, row.date, row.Index

            hist = team_series_history.get(team, [])
            for w in SERIES_WINDOWS:
                recent = [r for _, r in hist[-w:]]
                out_cols[f"team_series_winrate_last{w}"][idx] = (
                    float(np.mean(recent)) if len(recent) >= min(3, w) else np.nan
                )

            pair_key = frozenset((team, opponent))
            pair_hist = pair_history.get(pair_key, [])
            if pair_hist:
                weights = [math.exp(-DECAY_LAMBDA * (date - d).days) for d, _ in pair_hist]
                wins = [1.0 if winner == team else 0.0 for _, winner in pair_hist]
                out_cols["team_h2h_winrate_decayed"][idx] = (
                    float(np.average(wins, weights=weights)) if sum(weights) > 0 else np.nan
                )
                out_cols["team_h2h_games"][idx] = len(pair_hist)

            last_end = team_last_end_date.get(team)
            out_cols["team_rest_days"][idx] = (date - last_end).days if last_end is not None else np.nan

            prev_roster = team_last_roster.get(team)
            cur_roster = (
                frozenset(row.team_roster) if isinstance(row.team_roster, (tuple, list, set)) else frozenset()
            )
            if prev_roster and cur_roster:
                union = prev_roster | cur_roster
                out_cols["team_roster_continuity"][idx] = (
                    len(prev_roster & cur_roster) / len(union) if union else np.nan
                )

        # Apply updates once both perspective rows have read the pre-series
        # state — pair_history gets exactly one new entry per series (shared
        # by both perspectives), while per-team dicts get one entry per team.
        winner_team = rows[0].team if rows[0].team_wins_series else rows[0].opponent
        pair_key = frozenset((rows[0].team, rows[0].opponent))
        pair_history.setdefault(pair_key, []).append((rows[0].date, winner_team))

        for row in rows:
            team_series_history.setdefault(row.team, []).append((row.date, row.team_wins_series))
            team_last_end_date[row.team] = row.end_date
            cur_roster = (
                frozenset(row.team_roster) if isinstance(row.team_roster, (tuple, list, set)) else frozenset()
            )
            if cur_roster:
                team_last_roster[row.team] = cur_roster

    for col, values in out_cols.items():
        mart[col] = values
    return mart


def add_sample_weight(mart: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    """Exponential decay weight (half-life ~45 days) relative to the mart's as-of date."""
    days_ago = (as_of - mart["date"]).dt.days.clip(lower=0)
    mart["sample_weight"] = np.exp(-DECAY_LAMBDA * days_ago)
    return mart


def add_current_form_snapshot(team_games_rolled: pd.DataFrame) -> pd.DataFrame:
    """Latest "as of now" rolling form per team (Phase 3 inference use, NOT training).

    Unlike the shift(1)-based prior-form columns used for walk-forward-safe
    training rows, this includes each team's most recent completed game (there
    is no "future" game to leak into) so a live prediction can use each team's
    full up-to-date form.
    """
    df = team_games_rolled.sort_values(["canonical_team", "date", "gameid"]).reset_index(drop=True)
    all_stats = [c for c in (TEAM_ROLL_STATS + ROLE_ROLL_STATS) if c in df.columns]

    new_cols: dict[str, pd.Series] = {}
    for col in all_stats:
        for w in ROLL_WINDOWS:
            new_cols[f"current_{col}_last{w}"] = df.groupby("canonical_team")[col].transform(
                lambda s, w=w: s.rolling(w, min_periods=MIN_PERIODS).mean()
            )
    df = pd.concat([df, pd.DataFrame(new_cols, index=df.index)], axis=1)

    latest = df.sort_values(["canonical_team", "date"]).groupby("canonical_team").tail(1)
    keep_cols = ["canonical_team", "date", "league", "region"] + list(new_cols.keys())
    return latest[keep_cols].reset_index(drop=True)


def add_walk_forward_fold(mart: pd.DataFrame) -> pd.DataFrame:
    """ISO calendar-week fold label for walk-forward validation (never random-split)."""
    iso = mart["date"].dt.isocalendar()
    mart["wf_week"] = iso["year"].astype(str) + "-W" + iso["week"].astype(str).str.zfill(2)
    return mart
