"""
Region / team strength ratings and strength-of-schedule baselines.

Walk-forward Elo:
  - Each team starts at its home region's current region Elo.
  - Domestic games update team Elo; cross-region international games also
    nudge region Elo (MSI/Worlds signal).
  - Exported snapshot powers inference-time cross-region matchup blending
    (LEC stats alone inflate vs LCK — raw rolling features don't account for SOS).
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

REGION_PRIORS: dict[str, float] = {
    "LCK": 1650.0,
    "LPL": 1580.0,
    "LEC": 1420.0,
    "LCS": 1380.0,
}
ELO_SCALE = 400.0
K_INTERNATIONAL = 40.0
K_DOMESTIC = 20.0

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


def _update_pair(
    elo_a: float,
    elo_b: float,
    a_won: bool,
    k: float,
) -> tuple[float, float]:
    exp_a = _expected(elo_a, elo_b)
    score_a = 1.0 if a_won else 0.0
    delta = k * (score_a - exp_a)
    return elo_a + delta, elo_b - delta


def walk_forward_ratings(team_games: pd.DataFrame) -> tuple[dict[str, str], dict[str, float], dict[str, float], pd.DataFrame]:
    """Chronological Elo pass. Returns home map, final region/team elos, per-team timeline."""
    home = infer_home_regions(team_games)
    region_elo = dict(REGION_PRIORS)
    team_elo: dict[str, float] = {}

    games = (
        team_games.sort_values(["date", "gameid"])
        .drop_duplicates(["gameid", "canonical_team"])
        .copy()
    )
    timeline_rows: list[dict] = []

    for gameid, grp in games.groupby("gameid", sort=False):
        if len(grp) != 2:
            continue
        a, b = grp.iloc[0], grp.iloc[1]
        team_a, team_b = a["canonical_team"], b["canonical_team"]
        ha = home.get(team_a) or (a["region"] if not a.get("is_international") else None)
        hb = home.get(team_b) or (b["region"] if not b.get("is_international") else None)
        if not ha or not hb:
            continue

        ea = team_elo.get(team_a, region_elo.get(ha, 1500.0))
        eb = team_elo.get(team_b, region_elo.get(hb, 1500.0))

        intl = bool(a.get("is_international")) or bool(b.get("is_international"))
        k = K_INTERNATIONAL if intl else K_DOMESTIC
        a_won = int(a["result"]) == 1

        ea, eb = _update_pair(ea, eb, a_won, k)
        team_elo[team_a] = ea
        team_elo[team_b] = eb

        if intl and ha != hb and ha in region_elo and hb in region_elo:
            ra, rb = region_elo[ha], region_elo[hb]
            ra, rb = _update_pair(ra, rb, a_won, K_INTERNATIONAL)
            region_elo[ha] = ra
            region_elo[hb] = rb

        day = pd.Timestamp(a["date"])
        for team, elo, region in ((team_a, ea, ha), (team_b, eb, hb)):
            timeline_rows.append({
                "date": day,
                "team": team,
                "team_elo": elo,
                "home_region": region,
                "region_elo": region_elo.get(region, REGION_PRIORS.get(region, 1500.0)),
            })

    timeline = pd.DataFrame(timeline_rows)
    if not timeline.empty:
        timeline = timeline.sort_values(["team", "date"]).drop_duplicates(["team", "date"], keep="last")
    return home, region_elo, team_elo, timeline


def _lookup_elo_before(
    history: dict[str, list[tuple[pd.Timestamp, float, float]]],
    team: str,
    as_of: pd.Timestamp,
) -> tuple[float, float]:
    entries = history.get(team, [])
    team_elo = float("nan")
    region_elo = float("nan")
    for day, te, re in entries:
        if day <= as_of:
            team_elo, region_elo = te, re
        else:
            break
    return team_elo, region_elo


def attach_strength_features(mart: pd.DataFrame, timeline: pd.DataFrame, home: dict[str, str]) -> pd.DataFrame:
    """Point-in-time team/region Elo on series rows (strictly prior games)."""
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
) -> dict:
    """Export JSON for Deno inference blend."""
    if home is None or region_elo is None or team_elo is None:
        home, region_elo, team_elo, _ = walk_forward_ratings(team_games)

    baselines = build_region_stat_baselines(team_games, home)
    teams: dict[str, dict] = {}
    for team, region in home.items():
        rating = team_elo.get(team, region_elo.get(region, 1500.0))
        teams[team] = {
            "homeRegion": region,
            "rating": round(float(rating), 1),
            "regionRating": round(float(region_elo.get(region, 1500.0)), 1),
            "regionPrior": REGION_PRIORS.get(region, 1500.0),
        }

    return {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "eloScale": ELO_SCALE,
        "regions": {r: round(float(v), 1) for r, v in region_elo.items()},
        "regionPriors": REGION_PRIORS,
        "teams": teams,
        "statBaselines": baselines,
    }


def write_strength_snapshot(team_games: pd.DataFrame, out_path: Path) -> dict:
    payload = build_strength_snapshot(team_games)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    return payload


if __name__ == "__main__":
    from oe_loader import build_team_game_rows, LOL_DIR  # noqa: E402

    years = [str(y) for y in range(2024, 2027)]
    tg = build_team_game_rows(years, LOL_DIR)
    snap = build_strength_snapshot(tg)
    print(json.dumps({"regions": snap["regions"], "T1": snap["teams"].get("T1"), "G2": snap["teams"].get("G2 Esports")}, indent=2))
