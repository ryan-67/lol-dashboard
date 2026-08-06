#!/usr/bin/env python3
"""Component 3 (v0.6, box-score-prior layer) — role-normalized Player Rating.

Ranks CURRENT active players for live matchup predictions. Key rules (v0.6):

  - Current team = team on the player's most recent game (not career mode).
  - Active = appeared in a MAJORITY of the current team's last TEAM_RECENT_GAMES
    games, counted by game (not day window). A curated roster_overrides.json
    force-excludes players confirmed retired/stepped-down whose departure
    predates available OE data. Rankings only for players whose current team
    is tier-1 (LCK/LPL/LEC/LCS).
  - STAT SET AND ROLE WEIGHTS now mirror the same "which stats actually matter
    for this role" philosophy already encoded in the dashboard's player radar
    (src/lib/playerRadar.ts ROLE_PERFORMANCE_SCORE_WEIGHTS) — raw damage share
    is de-emphasized for top/mid (role has too much carry/tank variance for a
    flat damage-share number to mean much) in favor of efficiency stats
    (dmg_gold_ratio, dmg_per_gold) and laning/kda; jungle/support lean on
    kill-participation/K+A-per-min/vision/wards instead. This directly targets
    the "Bin under-ranked despite elite laning" issue from v0.4 — his laning
    dominance (gd15/csd15) now carries real weight for top instead of being
    diluted by a raw damage-share number tanks and utility tops were never
    going to post regardless of skill. `turretPlates` (used on the frontend
    radar) has no reliable OE column in this dataset (checked: 0/61290 player
    rows populated) so its weight is folded into laning stats instead.
  - Per-game scoring is contextual, not just "stat vs baseline":
    1. Laning-phase stats (gd15/csd15/xpd15) compared against a matchup-pair
       baseline (this champion vs this exact opposing champion, this role)
       when sampled, so beating a lane's normal expectation is what's
       rewarded, not the raw number.
    2. gd_trajectory (golddiffat25 - golddiffat15) quantifies phase
       transition — did the player extend an early lead into mid-game, or
       let it evaporate — using OE's @10/@15/@20/@25 checkpoints (no full
       minute-by-minute timeline available from OE; Cito's gold timeline
       supplement is too spotty to lean on for training rows — see
       cito_supplement.py's own doc comment on this). Also gets the
       matchup-pair baseline treatment. A genuine late-game (post-25) signal
       needs a more complete timeline source than what's available today —
       flagged as a revisit if a reliable one shows up (gol.gg/tabesports
       show team gold timelines on-site, but scraping a competitor as a data
       dependency is fragile and a last resort, not a real fix).
    3. Two-pass opponent-quality adjustment: reward beating a strong direct
       opponent, dampen (not amplify) the penalty for losing to one.
    4. Playmaking/roam context: for jungle/mid/support (roles where trading
       your own lane resources for tempo — roaming, ganking — is a standard,
       deliberate strategy), an early kill+assist@15 well above baseline
       DAMPENS (never erases, never flips to a bonus) the penalty from a
       below-average gd15/csd15/xpd15 in that same game. Landing the kill
       already self-corrects some of the raw gold/XP deficit, so this only
       softens the remaining penalty rather than rewarding the sacrifice
       twice.
    5. Small win/loss result adjustment, PLUS a standout-performance bonus —
       symmetric across wins AND losses now (not loss-only) — triggered by a
       role-specific "carry stat" subset (e.g. adc: dpm/dmg-gold efficiency;
       jungle/support: kill participation, K+A/min) clearing a threshold.
       Losses get a modest extra multiplier on the same bonus (not a separate
       mechanic) since a standout performance in a loss also answers "were
       you the reason your team lost" — but wins are no longer excluded.
  - Region shift stays a small, separate aggregate-level nudge, deliberately
    not baked into the per-game baselines (thin matchup-pair samples would
    starve further if split by region; region/skill differences are picked
    up implicitly through the opponent-quality adjustment instead).
  - One new signal shipped, one tested and deliberately NOT shipped — both
    aimed at "eye-test greats whose stats undersell them" (Inspired, Faker,
    ShowMaker, Keria-style cases). Box-score models have a real ceiling here;
    see docs/nucky_v2.md "Component 3 v0.6" for the full writeup.
    6. SHIPPED — duo-lane partner credit (support only): support's job is
       largely to create the advantage that shows up entirely in their ADC's
       own stat line, so a support's composite now includes a modest weight
       on their bot-lane partner's own gd15 z from the same game.
    7. TESTED, NOT SHIPPED — team-dependency ("impact") regression: per
       (player, current team), fit team_won ~ own composite_z +
       teammates_avg_composite_z, z-score the coefficient on own composite_z
       against role peers, one-sided bonus only. Even with Empirical-Bayes
       shrinkage for small samples, it (a) did NOT show Inspired/Faker/
       ShowMaker/Keria as high-dependency outliers — their teams' results
       don't swing detectably harder with their box score than a role-typical
       player's — and (b) visibly injected noise elsewhere (pushed clearly
       below-average-box-score players up double digits in rank on thin
       samples, and pushed Kingen/DuDu even further down). Rejected rather
       than shipped; see docs/nucky_v2.md for the full before/after numbers
       if revisiting with more seasons of data.

Usage:
    python scripts/ml/build_player_ratings.py [--top 15] [--out docs/nucky_player_ratings_preview.md]
"""

from __future__ import annotations

import argparse
import json
import sys
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
from oe_leagues import (  # noqa: E402
    ALL_ALLOWED_LEAGUE_CODES,
    TIER1_REGIONS,
    is_international_code,
    region_for_league_code,
)
from series_grouping import ChronoGame, group_games_into_series  # noqa: E402
from team_identity import canonical_team  # noqa: E402

LOL_DIR = ROOT / "lol"
ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"
ROSTER_OVERRIDES_PATH = ROOT / "data" / "ml" / "roster_overrides.json"
ALLOWED_COMPLETENESS = {"complete", "partial"}
ROLES = ("top", "jungle", "mid", "adc", "support")
POSITION_MAP = {
    "top": "top", "jng": "jungle", "jungle": "jungle", "mid": "mid",
    "bot": "adc", "adc": "adc", "sup": "support", "support": "support",
}
YEARS = ["2025", "2026"]

MIN_PLAYER_GAMES = 8
MIN_EFFECTIVE_GAMES = 4.0
# Shorter half-life so recent form (EWC / early Summer Bo3s) surfaces on role boards.
HALF_LIFE_DAYS = 28.0
MIN_CHAMP_ROLE_GAMES = 8
MIN_MATCHUP_PAIR_GAMES = 6  # (role, champion, opp_champion) triples — same gate as champ_matchups.py
MIN_OPPONENT_REF_GAMES = 6  # games needed before trusting a player's pass-1 skill reference
# Small nudge only — at 1.0, mediocre LCK tops outranked Bin. 0.30 ≈ LCK +0.09 / LPL +0.02.
REGION_SHIFT_SCALE = 0.30
CHAMP_CONTEXT_WEIGHT = 0.45  # style-adjusted (non-laning stats, or laning stats w/o matchup data)
ROLE_GLOBAL_WEIGHT = 0.55  # absolute level vs role
MATCHUP_WEIGHT = 0.40  # laning-phase stats WITH a usable matchup-pair baseline
CHAMP_CONTEXT_WEIGHT_LANING = 0.25
ROLE_GLOBAL_WEIGHT_LANING = 0.35
CURRENT_TEAM_WEIGHT = 1.5  # amplify games on the player's current roster

# Opponent-quality adjustment: reward beating a strong direct opponent,
# dampen (don't amplify) the penalty for losing to one.
OPPONENT_QUALITY_SCALE = 1.2
OPPONENT_QUALITY_MIN_MULT = 0.75
OPPONENT_QUALITY_MAX_MULT = 1.35

# Small, deliberately modest team-result context — box-score performance
# still dominates the score.
WIN_BONUS = 0.05
LOSS_PENALTY = 0.05

# Series-result credit (Component 3 v0.7) — winning a Bo3/Bo5 matters more than
# the sum of game results. Applied on top of per-game WIN_BONUS/LOSS_PENALTY so
# a 3-2 winner who got stomped in two games still nets positive series credit:
# game losses (−0.05) + series win (+0.08) ≈ +0.03 per loss game, while wins
# stack. Series losses get a smaller penalty so we don't double-punish vs the
# game-level loss term.
SERIES_WIN_BONUS = 0.08
SERIES_LOSS_PENALTY = 0.04
# International series (MSI/Worlds/EWC/First Stand) amplify series credit —
# beating Gen.G at EWC should move player form more than a domestic Bo1 week.
SERIES_INTL_MULT = 1.35

# Standout-performance bonus — symmetric across win/loss, small extra credit
# for a standout performance specifically in a loss (see EXCEPTIONAL_STATS_BY_ROLE).
STANDOUT_Z_THRESHOLD = 1.25
STANDOUT_BONUS_SCALE = 0.30
STANDOUT_LOSS_MULTIPLIER = 1.3

# Playmaking/roam context (jungle/mid/support only) — dampens, never flips to
# a bonus, the penalty on a below-average laning stat when paired with a
# well-above-baseline kill+assist@15 (roaming/ganking instead of farming).
ROAM_ROLES = ("jungle", "mid", "support")
PLAYMAKING_Z_THRESHOLD = 0.5
PLAYMAKING_DAMPEN_SCALE = 0.25
PLAYMAKING_MIN_DAMPEN_FACTOR = 0.6  # penalty can be dampened by at most 40%

# Active-roster gate: majority-of-last-N-games, by count — NOT a day window,
# so a team on a long post-elimination break still resolves to a sane roster.
TEAM_RECENT_GAMES = 8
ACTIVE_MAJORITY_THRESHOLD = 0.5

# Duo-lane partner credit (support only) — see module docstring point 6.
PARTNER_GD15_WEIGHT = 0.10

# playmaking15 is deliberately excluded from every ROLE_STAT_WEIGHTS entry —
# it exists purely as the roam/playmaking-context signal above, not as a
# scored dimension (that would double-count with ka_per_min/kp_full).
STAT_COLS = (
    "gd15", "csd15", "xpd15", "gd_trajectory",
    "kda", "dmg_gold_ratio", "dmg_per_gold", "dpm",
    "ka_per_min", "kp_full", "wards_destroyed", "vision_score", "first_blood",
    "playmaking15",
)
MATCHUP_STATS = ("gd15", "csd15", "xpd15", "gd_trajectory")  # direct-opponent-relative

# Role-specific weights, aligned with src/lib/playerRadar.ts's
# ROLE_PERFORMANCE_SCORE_WEIGHTS philosophy (raw damage de-emphasized for
# top/mid, efficiency stats instead; kill-participation/K+A for
# jungle/support). turretPlates has no usable OE data here, folded into
# laning stats. gd_trajectory (phase transition) added to every role at a
# flat 0.10.
ROLE_STAT_WEIGHTS: dict[str, dict[str, float]] = {
    "top": {"gd15": 0.27, "csd15": 0.21, "xpd15": 0.10, "kda": 0.20, "dmg_gold_ratio": 0.12, "gd_trajectory": 0.10},
    "jungle": {
        "kda": 0.18, "ka_per_min": 0.22, "kp_full": 0.18, "dmg_gold_ratio": 0.12,
        "gd15": 0.10, "first_blood": 0.10, "gd_trajectory": 0.10,
    },
    "mid": {
        "kda": 0.18, "gd15": 0.18, "csd15": 0.12, "dmg_gold_ratio": 0.18,
        "dmg_per_gold": 0.14, "xpd15": 0.10, "gd_trajectory": 0.10,
    },
    "adc": {
        "kda": 0.18, "gd15": 0.18, "dmg_gold_ratio": 0.18, "dmg_per_gold": 0.14,
        "dpm": 0.12, "csd15": 0.10, "gd_trajectory": 0.10,
    },
    # partner_gd15 = support's bot-lane ADC partner's own gd15 z (same game) —
    # support's job is largely to create the lead that shows up in the ADC's
    # stat line, not their own. Other weights rescaled down to make room.
    "support": {
        "kda": 0.20, "ka_per_min": 0.20, "wards_destroyed": 0.16, "kp_full": 0.12,
        "vision_score": 0.09, "gd15": 0.04, "gd_trajectory": 0.09,
        "partner_gd15": PARTNER_GD15_WEIGHT,
    },
}

# Subset of stats most tied to "carrying/deciding the game" per role — used
# only for the standout-performance bonus, not the main composite (that would
# double-count what's already in ROLE_STAT_WEIGHTS).
EXCEPTIONAL_STATS_BY_ROLE: dict[str, tuple[str, ...]] = {
    "top": ("dmg_gold_ratio", "dmg_per_gold", "gd15"),
    "jungle": ("kp_full", "ka_per_min", "first_blood"),
    "mid": ("dmg_gold_ratio", "dmg_per_gold", "gd15"),
    "adc": ("dpm", "dmg_gold_ratio", "dmg_per_gold"),
    "support": ("kp_full", "ka_per_min", "wards_destroyed"),
}


def _norm_pos(raw: str) -> str:
    return POSITION_MAP.get(str(raw or "").strip().lower(), "")


def load_json(name: str) -> dict:
    path = ARTIFACTS_DIR / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def load_roster_overrides() -> dict[str, list[str]]:
    """Curated force-excludes for confirmed retired/stepped-down players whose
    departure predates available OE data (games-count heuristic can't see a
    departure with no newer game yet). See ROSTER_OVERRIDES_PATH comment."""
    if not ROSTER_OVERRIDES_PATH.exists():
        return {"inactive": []}
    try:
        data = json.loads(ROSTER_OVERRIDES_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"inactive": []}
    return {"inactive": [str(p) for p in data.get("inactive", [])]}


def _flag(v) -> bool:
    try:
        return float(v) == 1.0
    except (TypeError, ValueError):
        return False


PLAYER_SCAN_COLS = {
    "gameid", "date", "league", "position", "teamname", "result", "champion",
    "playername", "name", "datacompleteness", "gamelength",
    "golddiffat15", "csdiffat15", "xpdiffat15", "golddiffat25",
    "killsat15", "assistsat15",
    "kills", "deaths", "assists", "teamkills",
    "damageshare", "dpm", "earnedgoldshare", "earned gpm",
    "wardskilled", "visionscore", "firstbloodkill", "firstbloodassist",
}

RIOT_SUPPLEMENT_PATH = ROOT / "data" / "ml" / "riot_oe_supplement.csv"


def _read_player_scan_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, usecols=lambda c: c in PLAYER_SCAN_COLS, low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
    df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
    pos = df["position"].astype(str).str.lower()
    return df[~pos.eq("team")]


def load_rows(years: tuple[str, ...] | list[str] | None = None) -> pd.DataFrame:
    """Load player-game rows. `years` defaults to YEARS (2025-2026, the current
    ranking window); the feature mart passes a wider range so its walk-forward
    roster-strength rolling feature isn't sparse on older training rows.

    Appends the Riot warehouse supplement (Current SoR) so ratings include
    games OE has not published yet — OE rows win on the same (day, team).
    """
    years = tuple(years) if years else YEARS
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in years):
            continue
        print(f"  Player scan: {path.name}", file=sys.stderr)
        _rows_from_df(_read_player_scan_csv(path), rows)

    if RIOT_SUPPLEMENT_PATH.exists():
        supp = _read_player_scan_csv(RIOT_SUPPLEMENT_PATH)
        supp = supp[supp["date"].astype(str).str[:4].isin([str(y) for y in years])]
        oe_keys = {(r["date"], r["team"]) for r in rows}
        supp_rows: list[dict] = []
        _rows_from_df(supp, supp_rows)
        added = [r for r in supp_rows if (r["date"], r["team"]) not in oe_keys]
        if added:
            print(
                f"  Player scan: riot_oe_supplement.csv (+{len(added)} warehouse rows, "
                f"{len(supp_rows) - len(added)} shadowed by OE)",
                file=sys.stderr,
            )
            rows.extend(added)

    return pd.DataFrame(rows)


def _rows_from_df(df: pd.DataFrame, rows: list[dict]) -> None:
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            role = _norm_pos(row.get("position", ""))
            champ = str(row.get("champion", "") or "").strip()
            player = str(row.get("playername") or row.get("name") or "").strip()
            team_raw = str(row.get("teamname", "")).strip()
            if role not in ROLES or not champ or not player or not team_raw:
                continue
            league = str(row.get("league", "")).strip()

            gd15_raw = row.get("golddiffat15")
            gd15 = float(gd15_raw) if gd15_raw not in (None, "") else None
            gd25_raw = row.get("golddiffat25")
            gd_trajectory = (
                float(gd25_raw) - gd15 if gd25_raw not in (None, "") and gd15 is not None else np.nan
            )

            k15, a15 = row.get("killsat15"), row.get("assistsat15")
            ka15 = float(k15) + float(a15) if k15 not in (None, "") and a15 not in (None, "") else np.nan

            kills = float(row.get("kills", 0) or 0)
            deaths = float(row.get("deaths", 0) or 0)
            assists = float(row.get("assists", 0) or 0)
            kda = (kills + assists) / (deaths if deaths > 0 else 1.0)

            teamkills = row.get("teamkills")
            kp_full = (
                (kills + assists) / float(teamkills)
                if teamkills not in (None, "") and float(teamkills) > 0 else np.nan
            )

            dmgshare = float(row.get("damageshare", 0) or 0)
            goldshare = row.get("earnedgoldshare")
            dmg_gold_ratio = (
                dmgshare / float(goldshare) if goldshare not in (None, "") and float(goldshare) > 0 else np.nan
            )

            dpm_raw = row.get("dpm")
            dpm = float(dpm_raw) if dpm_raw not in (None, "") else np.nan
            gpm = row.get("earned gpm")
            dmg_per_gold = (
                dpm / float(gpm)
                if gpm not in (None, "") and float(gpm) > 0 and not pd.isna(dpm) else np.nan
            )

            gamelength_s = row.get("gamelength")
            minutes = float(gamelength_s) / 60.0 if gamelength_s not in (None, "") and float(gamelength_s) > 0 else np.nan
            ka_per_min = (kills + assists) / minutes if minutes and minutes > 0 else np.nan

            wards_destroyed = (
                float(row.get("wardskilled")) if row.get("wardskilled") not in (None, "") else np.nan
            )
            vision_score = (
                float(row.get("visionscore")) if row.get("visionscore") not in (None, "") else np.nan
            )
            first_blood = 1.0 if (_flag(row.get("firstbloodkill")) or _flag(row.get("firstbloodassist"))) else 0.0

            rows.append({
                "gameid": str(row.get("gameid", "")).strip(),
                "date": str(row.get("date", ""))[:10],
                "league": league,
                "region": region_for_league_code(league),
                "team": canonical_team(team_raw),
                "player": player,
                "champion": champ,
                "role": role,
                "won": int(float(row.get("result", 0) or 0) == 1),
                "gd15": gd15 if gd15 is not None else np.nan,
                "csd15": float(row.get("csdiffat15")) if row.get("csdiffat15") not in (None, "") else np.nan,
                "xpd15": float(row.get("xpdiffat15")) if row.get("xpdiffat15") not in (None, "") else np.nan,
                "gd_trajectory": gd_trajectory,
                "kda": kda,
                "dmg_gold_ratio": dmg_gold_ratio,
                "dmg_per_gold": dmg_per_gold,
                "dpm": dpm,
                "ka_per_min": ka_per_min,
                "kp_full": kp_full,
                "wards_destroyed": wards_destroyed,
                "vision_score": vision_score,
                "first_blood": first_blood,
                "playmaking15": ka15,
            })


def add_opponents(df: pd.DataFrame) -> pd.DataFrame:
    """Attach the direct opposing laner's champion + player name (same game,
    same role, other team). Vectorized self-join, not a python-level loop."""
    df = df.reset_index(drop=True)
    key = df[["gameid", "role", "team", "champion", "player"]].copy()
    merged = df.merge(key, on=["gameid", "role"], suffixes=("", "_opp"))
    merged = merged[merged["team"] != merged["team_opp"]]
    # Well-formed rows have exactly one opponent per (gameid, role, player);
    # keep first if malformed data (e.g. >2 teams in a gameid) slips through.
    merged = merged.drop_duplicates(subset=["gameid", "role", "player"], keep="first")
    merged = merged.rename(columns={"champion_opp": "opp_champion", "player_opp": "opp_player"})
    out = df.merge(
        merged[["gameid", "role", "player", "opp_champion", "opp_player"]],
        on=["gameid", "role", "player"], how="left",
    )
    return out


def build_baselines(df: pd.DataFrame) -> dict:
    champ_role: dict[tuple[str, str], dict[str, tuple[float, float]]] = {}
    role_global: dict[str, dict[str, tuple[float, float]]] = {}
    for role, grp in df.groupby("role"):
        role_global[role] = {
            stat: (float(grp[stat].mean()), float(grp[stat].std(ddof=0)) or 1.0) for stat in STAT_COLS
        }
        for champ, cgrp in grp.groupby("champion"):
            if len(cgrp) < MIN_CHAMP_ROLE_GAMES:
                continue
            champ_role[(champ, role)] = {
                stat: (float(cgrp[stat].mean()), float(cgrp[stat].std(ddof=0)) or 1.0) for stat in STAT_COLS
            }
    return {"champRole": champ_role, "roleGlobal": role_global}


def build_matchup_baselines(df: pd.DataFrame) -> dict[tuple[str, str, str], dict[str, tuple[float, float]]]:
    """(role, champion, opp_champion) -> {stat: (mean, std)} for MATCHUP_STATS.

    gd15/csd15/xpd15 are already direct-opponent-relative in OE; gd_trajectory
    (golddiffat25 - golddiffat15) extends that to the mid-game transition.
    """
    out: dict[tuple[str, str, str], dict[str, tuple[float, float]]] = {}
    valid = df.dropna(subset=["opp_champion"])
    for (role, champ, opp_champ), grp in valid.groupby(["role", "champion", "opp_champion"]):
        stats: dict[str, tuple[float, float]] = {}
        for stat in MATCHUP_STATS:
            s = grp[stat].dropna()
            if len(s) < MIN_MATCHUP_PAIR_GAMES:
                continue
            stats[stat] = (float(s.mean()), float(s.std(ddof=0)) or 1.0)
        if stats:
            out[(role, champ, opp_champ)] = stats
    return out


def _z(val: float, mean: float, std: float) -> float:
    return float(np.clip((val - mean) / (std or 1.0), -3, 3))


def compute_z_columns(df: pd.DataFrame, baselines: dict) -> pd.DataFrame:
    """Blend matchup-pair (laning-phase stats, when sampled) + champion+role
    context + role-global so matchup expectations, style, AND absolute level
    all count."""
    df = df.copy()
    champ_role = baselines["champRole"]
    role_global = baselines["roleGlobal"]
    matchup = baselines["matchup"]
    for stat in STAT_COLS:
        is_matchup_stat = stat in MATCHUP_STATS
        z_vals = np.full(len(df), np.nan)
        for i, (role, champ, opp_champ, val) in enumerate(
            zip(df["role"], df["champion"], df["opp_champion"], df[stat])
        ):
            if pd.isna(val):
                continue
            rg = role_global.get(role)
            if rg is None:
                continue
            z_role = _z(val, *rg[stat])
            cr = champ_role.get((champ, role))
            z_champ = _z(val, *cr[stat]) if cr else z_role
            mu_bounds = None
            if is_matchup_stat and opp_champ:
                mu = matchup.get((role, champ, opp_champ))
                if mu and stat in mu:
                    mu_bounds = mu[stat]
            if mu_bounds:
                z_matchup = _z(val, *mu_bounds)
                z_vals[i] = (
                    MATCHUP_WEIGHT * z_matchup
                    + CHAMP_CONTEXT_WEIGHT_LANING * z_champ
                    + ROLE_GLOBAL_WEIGHT_LANING * z_role
                )
            else:
                z_vals[i] = CHAMP_CONTEXT_WEIGHT * z_champ + ROLE_GLOBAL_WEIGHT * z_role
        df[f"z_{stat}"] = z_vals
    return df


def apply_playmaking_context(df: pd.DataFrame) -> pd.DataFrame:
    """Dampen (never erase, never flip to a bonus) the laning-stat penalty for
    jungle/mid/support rows where early kill participation (playmaking15) is
    well above baseline — a deliberate resource-for-tempo trade (roaming,
    ganking) rather than a bad lane. Only softens a NEGATIVE laning z; a
    positive one is untouched. Bounded dampening because landing the kill
    already self-corrects some of the raw gold/XP deficit — this isn't meant
    to fully cancel it out."""
    df = df.copy()
    is_roam_role = df["role"].isin(ROAM_ROLES)
    z_play = df["z_playmaking15"].fillna(0)
    dampen = np.clip(
        1.0 - PLAYMAKING_DAMPEN_SCALE * (z_play - PLAYMAKING_Z_THRESHOLD),
        PLAYMAKING_MIN_DAMPEN_FACTOR, 1.0,
    )
    apply_mask = (is_roam_role & (z_play > PLAYMAKING_Z_THRESHOLD)).to_numpy()
    for stat in ("gd15", "csd15", "xpd15"):
        col = f"z_{stat}"
        neg = (df[col] < 0).to_numpy()
        mask = apply_mask & neg
        if mask.any():
            df.loc[mask, col] = df.loc[mask, col].to_numpy() * dampen.to_numpy()[mask]
    return df


def add_duo_partner_context(df: pd.DataFrame) -> pd.DataFrame:
    """Support's z_partner_gd15 = their bot-lane ADC partner's own z_gd15,
    same game/team. Support's job is largely to create the lead that shows
    up entirely in the ADC's stat line — this gives support partial credit
    for it directly, rather than relying only on support's own (much noisier)
    laning numbers."""
    df = df.copy()
    adc_z = df.loc[df["role"] == "adc", ["gameid", "team", "z_gd15"]].rename(
        columns={"z_gd15": "z_partner_gd15"}
    )
    df = df.merge(adc_z, on=["gameid", "team"], how="left")
    df.loc[df["role"] != "support", "z_partner_gd15"] = np.nan
    return df


def add_composite_z(df: pd.DataFrame) -> pd.DataFrame:
    """Role-weighted blend of the per-stat z-columns, computed once for the
    whole dataset (used both as the pass-1 opponent-skill reference input and
    as the base value pass-2 adjusts).

    Availability-aware (V4-3): Riot warehouse rows have no xpd15 / visionscore /
    absolute dpm, so weights are renormalized over the stats present per row —
    otherwise every Current-SoR game would read as artificially neutral. Rows
    with under half the weight mass available keep the old neutral-fill
    behavior (shrinkage rather than trusting two stats to carry a rating).
    """
    df = df.copy()
    df["composite_z"] = np.nan
    for role, weights_map in ROLE_STAT_WEIGHTS.items():
        mask = df["role"] == role
        if not mask.any():
            continue
        total_w = sum(weights_map.values())
        weighted = sum(
            df.loc[mask, f"z_{stat}"].fillna(0) * w for stat, w in weights_map.items()
        )
        avail_w = sum(
            df.loc[mask, f"z_{stat}"].notna().astype(float) * w
            for stat, w in weights_map.items()
        )
        renorm = weighted * (total_w / avail_w.clip(lower=1e-9))
        use_renorm = avail_w >= (total_w * 0.5)
        df.loc[mask, "composite_z"] = np.where(use_renorm, renorm, weighted)
    return df


def compute_carry_z(df: pd.DataFrame) -> pd.DataFrame:
    """Role-specific 'carry' signal (EXCEPTIONAL_STATS_BY_ROLE subset average),
    used only to detect a standout performance for the win/loss-agnostic
    bonus below — deliberately not part of the main composite, which would
    double-count the same stats."""
    df = df.copy()
    df["carry_z"] = np.nan
    for role, stats in EXCEPTIONAL_STATS_BY_ROLE.items():
        mask = df["role"] == role
        cols = [f"z_{s}" for s in stats]
        df.loc[mask, "carry_z"] = df.loc[mask, cols].mean(axis=1, skipna=True)
    return df


def build_current_teams(df: pd.DataFrame) -> dict[str, str]:
    """Player -> current team (most recent game), computed once for the
    whole dataset rather than repeatedly per role slice."""
    return {player: infer_current_team(grp) for player, grp in df.groupby("player")}


def build_opponent_quality_reference(df: pd.DataFrame) -> dict[tuple[str, str], float]:
    """Pass-1 (role, player) -> recency+SOS-weighted average composite_z.

    Uses ALL historical rows, not the activity/tier-1 filters that gate the
    final rankings, so even a since-retired or since-benched direct opponent
    from an older game has a defensible skill reference. This is purely an
    internal signal for pass 2's opponent-quality adjustment — it is never
    exposed as a ranking.
    """
    ref: dict[tuple[str, str], float] = {}
    valid = df.dropna(subset=["composite_z"]).copy()
    valid["w"] = valid["recency_weight"] * valid["sos_multiplier"]
    for (role, player), grp in valid.groupby(["role", "player"]):
        if len(grp) < MIN_OPPONENT_REF_GAMES:
            continue
        w_sum = grp["w"].sum()
        if w_sum <= 0:
            continue
        ref[(role, player)] = float((grp["composite_z"] * grp["w"]).sum() / w_sum)
    return ref


def attach_series_outcomes(df: pd.DataFrame) -> pd.DataFrame:
    """Map each player-game to its Bo3/Bo5 series result for that player's team.

    Uses the same series_grouping algorithm as region_elo / the dashboard so
    series grain stays consistent. Incomplete / ungrouped games get series_won=NaN
    and receive no series bonus (game-level result still applies).
    """
    df = df.copy()
    if df.empty:
        df["series_won"] = np.nan
        df["series_intl"] = 0
        return df

    # One ChronoGame per gameid from the winning team's row.
    winners = (
        df.loc[df["won"] == 1, ["gameid", "date", "team", "league"]]
        .drop_duplicates(subset=["gameid"], keep="first")
    )
    losers = (
        df.loc[df["won"] == 0, ["gameid", "team"]]
        .drop_duplicates(subset=["gameid"], keep="first")
        .rename(columns={"team": "loser"})
    )
    games = winners.merge(losers, on="gameid", how="inner")
    games = games[games["team"] != games["loser"]]

    chrono: list[ChronoGame] = []
    for row in games.itertuples(index=False):
        try:
            gdate = pd.Timestamp(str(row.date)[:10]).date()
        except Exception:  # noqa: BLE001
            continue
        chrono.append(
            ChronoGame(
                id=str(row.gameid),
                game_date=gdate,
                winner=str(row.team),
                loser=str(row.loser),
                payload={"league": str(row.league)},
            )
        )

    series_won_by_game_team: dict[tuple[str, str], int] = {}
    series_intl_by_game: dict[str, int] = {}
    for bkt in group_games_into_series(chrono):
        wins_a = sum(1 for g in bkt.games if g.winner == bkt.team_a)
        wins_b = len(bkt.games) - wins_a
        if wins_a == wins_b:
            continue
        a_won = wins_a > wins_b
        intl = 0
        for g in bkt.games:
            league = str((g.payload or {}).get("league") or "")
            if is_international_code(league):
                intl = 1
                break
        for g in bkt.games:
            series_won_by_game_team[(g.id, bkt.team_a)] = 1 if a_won else 0
            series_won_by_game_team[(g.id, bkt.team_b)] = 0 if a_won else 1
            series_intl_by_game[g.id] = intl

    df["series_won"] = [
        series_won_by_game_team.get((gid, team), np.nan)
        for gid, team in zip(df["gameid"], df["team"])
    ]
    df["series_intl"] = [series_intl_by_game.get(gid, 0) for gid in df["gameid"]]
    covered = int(pd.notna(df["series_won"]).sum())
    print(
        f"  Series outcomes attached: {covered}/{len(df)} player-games "
        f"({df['series_won'].notna().mean()*100:.1f}% coverage)",
        file=sys.stderr,
    )
    return df


def apply_opponent_and_result_adjustment(df: pd.DataFrame, opp_ref: dict[tuple[str, str], float]) -> pd.DataFrame:
    """Pass 2: asymmetric opponent-quality scaling + game result + series result + standout.

    Beating a strong direct opponent scales the (positive) performance z UP;
    losing to one scales the (negative) z DOWN in magnitude (dampened, not
    amplified) — losing to a better player is expected. Then a small,
    deliberately modest result adjustment: +WIN_BONUS / -LOSS_PENALTY, plus a
    standout-performance bonus (role-specific carry_z clearing
    STANDOUT_Z_THRESHOLD) that now applies in BOTH wins and losses — losses
    get an extra multiplier on the same bonus (not a separate mechanic) since
    standing out in a loss also answers "were you the reason your team lost."

    v0.7 adds series-result credit (SERIES_WIN_BONUS / SERIES_LOSS_PENALTY) so
    a 3-2 series win still nets positive form even when individual game
    stomps would otherwise dominate the box-score blend.
    """
    df = df.copy()
    opp_z = np.array([
        opp_ref.get((role, opp_player), 0.0) if pd.notna(opp_player) else 0.0
        for role, opp_player in zip(df["role"], df["opp_player"])
    ])
    opp_mult = np.clip(
        np.exp(opp_z / OPPONENT_QUALITY_SCALE), OPPONENT_QUALITY_MIN_MULT, OPPONENT_QUALITY_MAX_MULT
    )
    comp = df["composite_z"].fillna(0).to_numpy()
    adj = np.where(comp >= 0, comp * opp_mult, comp / opp_mult)
    won = df["won"].to_numpy()
    result_adj = np.where(won == 1, WIN_BONUS, -LOSS_PENALTY)

    series_won = df["series_won"].to_numpy() if "series_won" in df.columns else np.full(len(df), np.nan)
    series_intl = df["series_intl"].to_numpy() if "series_intl" in df.columns else np.zeros(len(df))
    intl_mult = np.where(series_intl == 1, SERIES_INTL_MULT, 1.0)
    series_adj = np.zeros(len(df), dtype=float)
    known = ~np.isnan(series_won.astype(float))
    series_adj[known & (series_won == 1)] = SERIES_WIN_BONUS
    series_adj[known & (series_won == 0)] = -SERIES_LOSS_PENALTY
    series_adj = series_adj * intl_mult

    carry = df["carry_z"].fillna(0).to_numpy()
    loss_mult = np.where(won == 1, 1.0, STANDOUT_LOSS_MULTIPLIER)
    standout_bonus = STANDOUT_BONUS_SCALE * loss_mult * np.clip(carry - STANDOUT_Z_THRESHOLD, 0, None)

    df["opp_quality_z"] = opp_z
    df["series_adj"] = series_adj
    df["adjusted_composite_z"] = np.where(
        df["composite_z"].isna(), np.nan, adj + result_adj + series_adj + standout_bonus
    )
    return df


def infer_current_team(grp: pd.DataFrame) -> str:
    """Team on the player's most recent game."""
    latest = grp.sort_values("date").iloc[-1]
    return str(latest["team"])


def infer_home_region(grp: pd.DataFrame, current_team: str) -> str | None:
    """Home region from tier-1 domestic games on the current team, else any domestic."""
    on_team = grp[grp["team"] == current_team]
    domestic = on_team[on_team["region"].isin(TIER1_REGIONS)]
    if domestic.empty:
        domestic = grp[grp["region"].isin(TIER1_REGIONS)]
    if domestic.empty:
        return None
    return str(domestic["region"].mode().iloc[0])


def build_active_roster(df: pd.DataFrame) -> set[tuple[str, str]]:
    """(player, team) pairs where the player appeared in a MAJORITY of the
    team's last TEAM_RECENT_GAMES games — by game count, not a day window.
    """
    active: set[tuple[str, str]] = set()
    for team, tgrp in df.groupby("team"):
        game_dates = (
            tgrp.groupby("gameid")["date"].max()
            .sort_values(ascending=False)
            .head(TEAM_RECENT_GAMES)
        )
        n_games = len(game_dates)
        if n_games == 0:
            continue
        recent_games = tgrp[tgrp["gameid"].isin(game_dates.index)]
        appearances = recent_games.groupby("player")["gameid"].nunique()
        for player, count in appearances.items():
            if count / n_games >= ACTIVE_MAJORITY_THRESHOLD:
                active.add((str(player), str(team)))
    return active


def compute_player_game_box_z(
    df: pd.DataFrame | None = None, years: tuple[str, ...] | list[str] | None = None
) -> pd.DataFrame:
    """Per player-game role-normalized composite box-score z — **LABEL-FREE**.

    Reusable by the feature mart (scripts/ml/build_feature_mart.py) for a
    walk-forward team roster-strength feature. Deliberately returns
    `composite_z` (pre opponent-quality / win-loss adjustment), NOT
    `adjusted_composite_z`, because the latter bakes in WIN_BONUS/LOSS_PENALTY
    and the standout bonus keyed off the game result — using it as a training
    feature would leak the label. `composite_z` is a pure role-weighted blend
    of box-score z-columns (gd15/kda/dmg efficiency/...), none of which touch
    the game outcome, so it is safe. The z-baselines are population
    mean/std normalization constants, not label information.
    """
    if df is None:
        df = load_rows(years)
        df = add_opponents(df)
    baselines = build_baselines(df)
    baselines["matchup"] = build_matchup_baselines(df)
    df = compute_z_columns(df, baselines)
    df = apply_playmaking_context(df)
    df = add_duo_partner_context(df)
    df = add_composite_z(df)
    return df[["gameid", "team", "player", "role", "composite_z"]].copy()


def build_roster_box_z(
    df: pd.DataFrame | None = None, years: tuple[str, ...] | list[str] | None = None
) -> pd.DataFrame:
    """Per (gameid, team) mean of that team's players' composite_z — a single
    'roster individual box-score quality' scalar, for the feature mart's
    walk-forward roster-strength rolling feature. `team` is already
    canonicalized via team_identity.canonical_team (same map oe_loader uses),
    so it joins cleanly onto team-game rows on (gameid, canonical_team).
    """
    pg = compute_player_game_box_z(df, years=years)
    return (
        pg.dropna(subset=["composite_z"])
        .groupby(["gameid", "team"])["composite_z"]
        .mean()
        .reset_index()
        .rename(columns={"composite_z": "roster_box_z"})
    )


def build_ratings(top_n: int) -> dict[str, pd.DataFrame]:
    print("Loading player-game rows (tier-1 + international only)...", file=sys.stderr)
    df = load_rows()
    df = add_opponents(df)
    print(f"  {len(df)} player-game rows", file=sys.stderr)

    from home_region_overrides import NON_TIER1_HOME_ORGS, resolve_home_region

    strength = load_json("region_strength.json")
    team_rating = {t: v.get("rating") for t, v in strength.get("teams", {}).items()}
    region_rating = strength.get("regions", {})
    mean_region_rating = float(np.mean(list(region_rating.values()))) if region_rating else 1500.0
    global_avg_team_rating = float(np.mean(list(team_rating.values()))) if team_rating else 1500.0

    # A team's home region from the strength snapshot — used to decide if the
    # player's *current* team is tier-1 (exclude TSW/FURIA / CBLOL guests).
    team_home = {t: v.get("homeRegion") for t, v in strength.get("teams", {}).items()}
    for org in NON_TIER1_HOME_ORGS:
        team_home[org] = None

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    as_of = df["date"].max()
    days_ago = (as_of - df["date"]).dt.days.clip(lower=0)
    df["recency_weight"] = np.exp(-np.log(2) * days_ago / HALF_LIFE_DAYS)

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
    df["opp_rating"] = [
        opp_rating_by_game_team.get((gid, team), global_avg_team_rating)
        for gid, team in zip(df["gameid"], df["team"])
    ]
    df["sos_multiplier"] = np.clip(np.exp((df["opp_rating"] - global_avg_team_rating) / 400.0), 0.6, 1.6)

    baselines = build_baselines(df)
    baselines["matchup"] = build_matchup_baselines(df)
    df = compute_z_columns(df, baselines)
    df = apply_playmaking_context(df)
    df = add_duo_partner_context(df)
    df = add_composite_z(df)
    df = compute_carry_z(df)

    print("Building pass-1 opponent-quality reference...", file=sys.stderr)
    opp_ref = build_opponent_quality_reference(df)
    print("Attaching Bo3/Bo5 series outcomes...", file=sys.stderr)
    df = attach_series_outcomes(df)
    df = apply_opponent_and_result_adjustment(df, opp_ref)

    current_team_by_player = build_current_teams(df)

    active_pairs = build_active_roster(df)
    overrides = load_roster_overrides()
    overridden_inactive = set(overrides.get("inactive", []))
    print(f"  Active (player, team) pairs (majority-of-last-{TEAM_RECENT_GAMES}): {len(active_pairs)}", file=sys.stderr)
    if overridden_inactive:
        print(f"  Roster overrides forcing inactive: {sorted(overridden_inactive)}", file=sys.stderr)

    out: dict[str, pd.DataFrame] = {}
    for role in ROLES:
        role_df = df[df["role"] == role].copy()
        if role_df.empty:
            continue

        agg_rows = []
        for player, grp in role_df.groupby("player"):
            if player in overridden_inactive:
                continue
            current_team = current_team_by_player.get(player) or infer_current_team(grp)
            # Must be on a tier-1 org right now (CBLOL/LLA guests never qualify).
            if current_team in NON_TIER1_HOME_ORGS:
                continue
            inferred = team_home.get(current_team) or infer_home_region(grp, current_team)
            home = resolve_home_region(current_team, inferred)
            if home not in TIER1_REGIONS:
                continue
            # Must be a majority-of-recent-games starter on that team
            if (player, current_team) not in active_pairs:
                continue

            valid = grp.dropna(subset=["adjusted_composite_z"]).copy()
            if len(valid) < MIN_PLAYER_GAMES:
                continue

            on_current = (valid["team"] == current_team).astype(float)
            # Require meaningful domestic tier-1 sample — intl-only guests with a
            # handful of EWC games must not climb global boards on soft SoS.
            domestic_t1 = valid[
                (valid["team"] == current_team) & (valid["region"].isin(TIER1_REGIONS))
            ]
            if len(domestic_t1) < 6 and float(valid["recency_weight"].sum()) < 12.0:
                continue

            valid["weight"] = (
                valid["recency_weight"]
                * valid["sos_multiplier"]
                * (1.0 + (CURRENT_TEAM_WEIGHT - 1.0) * on_current)
            )
            eff_games = float((valid["recency_weight"] * (1.0 + (CURRENT_TEAM_WEIGHT - 1.0) * on_current)).sum())
            if eff_games < MIN_EFFECTIVE_GAMES:
                continue
            w_sum = valid["weight"].sum()
            box_score_z = (
                float((valid["adjusted_composite_z"] * valid["weight"]).sum() / w_sum) if w_sum else np.nan
            )

            region_shift = (
                REGION_SHIFT_SCALE * (region_rating.get(home, mean_region_rating) - mean_region_rating) / 100.0
            )
            score = box_score_z + region_shift

            agg_rows.append({
                "player": player,
                "team": current_team,
                "region": home,
                "games": len(valid),
                "effGames": round(eff_games, 1),
                "boxScoreZ": round(box_score_z, 3),
                "regionShift": round(region_shift, 3),
                "powerScore": round(score, 3),
            })
        role_out = pd.DataFrame(agg_rows).sort_values("powerScore", ascending=False)
        out[role] = role_out.head(top_n).reset_index(drop=True)
    return out


def render_markdown(players: dict[str, pd.DataFrame]) -> str:
    lines = [
        "# Player power ratings preview (v0.6)",
        "",
        "> `scripts/ml/build_player_ratings.py` — **current** active tier-1 players only.",
        "> Current team = most recent game. Active = majority of current team's last",
        f"> {TEAM_RECENT_GAMES} games (by count, not a day window) + not in roster_overrides.json.",
        "> Role-specific stat weights mirror src/lib/playerRadar.ts's role-based radar",
        "> philosophy (laning/efficiency-heavy for top/mid, kill-participation-heavy for",
        "> jungle/support). Includes matchup-pair laning baselines, a gd_trajectory",
        "> (golddiffat25-golddiffat15) phase-transition stat, playmaking/roam-context",
        "> dampening for jungle/mid/support, an asymmetric opponent-quality adjustment,",
        "> a standout-performance bonus in both wins and losses, and a support-only",
        "> bot-lane duo-partner credit. A team-dependency ('impact') signal was tested",
        "> for 'eye-test greats whose stats undersell them' but rejected — see",
        "> `docs/nucky_v2.md` Component 3 v0.6 for why. See that doc for full methodology.",
        "",
    ]
    for role in ROLES:
        role_df = players.get(role)
        if role_df is None or role_df.empty:
            continue
        lines += [
            f"## {role.capitalize()}", "",
            "| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for i, row in role_df.iterrows():
            lines.append(
                f"| {i+1} | {row['player']} | {row['team']} | {row['region']} | "
                f"{row['games']} ({row['effGames']}) | {row['boxScoreZ']:+.3f} | "
                f"{row['regionShift']:+.3f} | {row['powerScore']:+.3f} |"
            )
        lines.append("")
    return "\n".join(lines)


def write_json_artifact(players: dict[str, pd.DataFrame], path: Path) -> None:
    """Machine-readable player_ratings.json for the Deno edge function /
    nuckyAI (predictionPacket + player-power context) and the dashboard.
    Deployed to supabase/functions/agent-chat/ml/ by export_artifacts.py."""
    payload = {
        "version": "0.7",
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "methodology": (
            "Role-normalized box-score-prior rating over current active tier-1 players "
            "(most-recent-game team + majority-of-last-8-games activity gate). "
            "Role weights mirror src/lib/playerRadar.ts; includes matchup-pair laning "
            "baselines, gd_trajectory phase transition, playmaking/roam-context dampening, "
            "asymmetric opponent-quality adjustment, symmetric standout bonus, "
            "support duo-partner credit, and v0.7 series-result credit "
            "(Bo3/Bo5 win/loss bonus on top of per-game result; amplified for "
            "international series). See docs/nucky_v2.md Component 3."
        ),
        "roles": {},
    }
    for role in ROLES:
        role_df = players.get(role)
        if role_df is None or role_df.empty:
            continue
        payload["roles"][role] = [
            {
                "rank": i + 1,
                "player": row["player"],
                "team": row["team"],
                "region": row["region"],
                "games": int(row["games"]),
                "effGames": float(row["effGames"]),
                "boxScoreZ": float(row["boxScoreZ"]),
                "regionShift": float(row["regionShift"]),
                "powerScore": float(row["powerScore"]),
            }
            for i, row in role_df.iterrows()
        ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=15)
    parser.add_argument("--out", type=Path, default=ROOT / "docs" / "nucky_player_ratings_preview.md")
    parser.add_argument(
        "--json-out", type=Path, default=ARTIFACTS_DIR / "player_ratings.json",
        help="Machine-readable artifact for the edge function / dashboard.",
    )
    parser.add_argument(
        "--json-top", type=int, default=25,
        help="How many players per role to include in the JSON artifact (default 25).",
    )
    args = parser.parse_args()

    ratings = build_ratings(args.top)
    md = render_markdown(ratings)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(md, encoding="utf-8")
    print(f"\nWrote {args.out}")

    # Deeper cut for the deployable artifact so the dashboard/nuckyAI can show
    # a longer board than the eye-test markdown preview.
    json_ratings = build_ratings(args.json_top) if args.json_top != args.top else ratings
    write_json_artifact(json_ratings, args.json_out)


if __name__ == "__main__":
    main()
