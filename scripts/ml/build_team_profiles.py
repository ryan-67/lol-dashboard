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


def build_recent_form(chrono_games: list[ChronoGame], team: str, limit: int = 3) -> dict:
    """Last N completed series — competitive score weights narrow losses vs sweeps."""
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
        series_rows.append({
            "date": end_date,
            "opponent": opponent,
            "score": f"{w_team}-{w_opp}",
            "won": won_series,
            "competitiveScore": round(competitive, 3),
            "label": (
                f"{'W' if won_series else 'L'} {w_team}-{w_opp} vs {opponent} ({end_date})"
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
        score += w * s["competitiveScore"]
        w_sum += w
    form_score = score / w_sum if w_sum else 0.5

    last = recent[0]
    if last["competitiveScore"] >= 0.6:
        momentum = "hot"
    elif last["competitiveScore"] <= 0.25:
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
    """Early focus = which LANE (top/mid/adc) gets jungle/support attention via K+A@15 / KP@15.

    Jungle/support naturally have high K+A — they are not default "focus" unless
    jungle-centric (e.g. LYON/Inspired): jungle K+A dwarfs all lanes.
    """
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

    # Jungle-centric: jg K+A dwarfs every lane (Inspired/LYON). Normal jg+sup pairs still
    # leave a lane within ~80% of jungle K+A — those teams use lane focus instead.
    jungle_centric = (
        team in JG_CENTRIC_TEAMS
        or (
            jg_ka > 0
            and max_lane_ka > 0
            and max_lane_ka < jg_ka * 0.78
            and jg_ka >= avg_lane * 1.25
        )
    )

    if jungle_centric:
        focus = ["jungle"]
        secondary: list[str] = []
        jg_name = roster.get("jungle", "jungle")
        summary = (
            f"{team} plays around their jungler ({jg_name}) — jungle has the highest early "
            f"K+A@15 on the team ({jg_ka:.1f}), not a specific lane."
        )
        skirmish_note = f"{team} pathing and early fights flow through {jg_name} — rare jungler-centric setup."
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


def derive_strengths_weaknesses(
    playstyle: dict, win_patterns: list[dict], loss_patterns: list[dict],
    player_conditions: list[dict], recent_form: dict | None = None,
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    weaknesses: list[str] = []

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

    for pc in player_conditions[:3]:
        if pc["favorableWhenAhead"] and pc.get("liftPp", 0) >= MIN_LIFT_PP:
            strengths.append(pc["label"])

    for pc in player_conditions[:5]:
        if not pc["favorableWhenAhead"] and pc.get("liftPp", 0) <= -MIN_LIFT_PP:
            weaknesses.append(pc["label"])

    for p in win_patterns[:2]:
        if not p.get("generic"):
            strengths.append(p["label"])
    for p in loss_patterns[:1]:
        if not p.get("generic"):
            weaknesses.append(p["label"])

    return strengths[:5], weaknesses[:4]


def build_profiles(player_df: pd.DataFrame, team_games: pd.DataFrame, chrono_games: list[ChronoGame]) -> dict:
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
        recent_form = build_recent_form(chrono_games, team)
        strengths, weaknesses = derive_strengths_weaknesses(
            playstyle, win_patterns, loss_patterns, player_conditions, recent_form,
        )
        league_rows = team_player.sort_values("date")
        out[team] = {
            "league": league_rows["league"].iloc[-1] if not league_rows.empty else "",
            "gamesAnalyzed": len(team_player["gameid"].unique()),
            "asOf": as_of,
            "roster": roster,
            "playstyle": playstyle,
            "recentForm": recent_form,
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
    player_df = add_kp15(load_player_rows(years))
    team_games = load_team_rows(years)
    chrono_games = load_chrono_games(years)
    print(f"  {len(player_df)} player-game rows, {player_df['team'].nunique()} teams")

    profiles = build_profiles(player_df, team_games, chrono_games)
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
