#!/usr/bin/env python3
"""Component 2: champion matchup matrix + draft-order counter-pick features.

Builds three things, all derived purely from OE history (no external sources):

1. Same-role (direct lane) matchup matrix — champ-vs-champ win rate + GD@15 delta per
   role, from games where both teams actually played that role matchup.
2. Draft-order reconstruction — OE gives each team's pick1-5/ban1-5 in TEAM-relative
   order + a firstPick flag, not global order. This rebuilds the true interleaved
   global sequence (standard competitive draft: ban 1-2-2-1-... / pick 1-2-2-1 phase 1,
   then 2-1-1-2 phase 2 — see DRAFT_SLOT_MAP) so we know, for every pick, exactly what
   the enemy had already revealed at that moment. From that we derive a validated
   "counter-pick edge" feature: when a team's pick matches up favorably (per the matrix
   above) against the most recently revealed enemy champion in the same role, does that
   correlate with a real win-rate lift? (Answers empirically, not by assumption.)
3. Cross-role archetype interaction lift — validates hand-curated archetype tag
   interactions (champion_archetypes.json) against realized win rates when that pairing
   actually appears on opposing teams (e.g. mobility_high vs cc_heavy/engage).

Exports champ_matchups.json for nuckyAI prediction packets / draft mode edge scoring.

Usage:
    python scripts/ml/build_champion_matchups.py
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
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
STATIC_DIR = SCRIPTS_DIR / "static"
ALLOWED_COMPLETENESS = {"complete", "partial"}
ROLES = ("top", "jungle", "mid", "adc", "support")
POSITION_MAP = {
    "top": "top", "jng": "jungle", "jungle": "jungle", "mid": "mid",
    "bot": "adc", "adc": "adc", "sup": "support", "support": "support",
}
YEARS = ["2025", "2026"]

MIN_MATCHUP_GAMES = 6
MIN_CROSSROLE_GAMES = 25
MIN_COUNTERPICK_GAMES = 40

# Standard competitive draft order (unaffected by 2026's First Selection side/order
# decoupling — that only changed WHO gets to be "first pick", not the sequence shape;
# see docs research). F = firstPick team, S = second-pick team. Team-relative pick/ban
# index (1-5) -> global chronological slot. Interleave picks+bans by slot to get the
# true reveal order.
BAN_SLOT_MAP = {"F": {1: 1, 2: 3, 3: 5, 4: 8, 5: 10}, "S": {1: 2, 2: 4, 3: 6, 4: 7, 5: 9}}
PICK_SLOT_MAP = {"F": {1: 1, 2: 4, 3: 5, 4: 8, 5: 9}, "S": {1: 2, 2: 3, 3: 6, 4: 7, 5: 10}}

ARCHETYPE_RULES = [
    # (attacker_tag, defender_tag, label) — hypothesis: attacker's presence on a team lifts
    # that team's win rate specifically when the opponent has defender_tag present.
    ("mobility_high", "cc_heavy", "Mobility escapes hard-CC/engage"),
    ("mobility_high", "engage", "Mobility escapes engage comps"),
    ("tank", "burst", "Tanks blunt burst-heavy comps"),
    ("poke", "dive", "Poke checks dive comps before they close"),
    ("split_push", "engage", "Split push punishes comps lacking wave clear/pull-back (proxy: engage-heavy)"),
    ("anti_dive", "dive", "Peel/anti-dive protects into dive comps"),
]


def _sanitize_nan(obj):
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


def _norm_pos(raw: str) -> str:
    return POSITION_MAP.get(str(raw or "").strip().lower(), "")


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_team_draft_rows() -> pd.DataFrame:
    """One row per (game, team): side, firstPick, ordered picks/bans, result."""
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in YEARS):
            continue
        print(f"  Draft scan: {path.name}", file=sys.stderr)
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "date", "league", "patch", "position", "teamname", "result",
            "side", "firstPick", "datacompleteness",
            "ban1", "ban2", "ban3", "ban4", "ban5",
            "pick1", "pick2", "pick3", "pick4", "pick5",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        df = df[df["position"].astype(str).str.lower().eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            fp = row.get("firstPick")
            if fp in (None, "", "nan"):
                continue
            picks = [str(row.get(f"pick{i}", "") or "").strip() for i in range(1, 6)]
            bans = [str(row.get(f"ban{i}", "") or "").strip() for i in range(1, 6)]
            if not all(picks):
                continue
            rows.append({
                "gameid": str(row.get("gameid", "")).strip(),
                "date": str(row.get("date", ""))[:10],
                "league": str(row.get("league", "")).strip(),
                "team": canonical_team(str(row.get("teamname", "")).strip()),
                "firstPick": "F" if float(fp) == 1.0 else "S",
                "picks": picks,
                "bans": bans,
                "won": int(float(row.get("result", 0) or 0) == 1),
            })
    return pd.DataFrame(rows)


def load_role_map() -> pd.DataFrame:
    """(gameid, team, champion) -> role, from player rows."""
    rows: list[dict] = []
    for path in discover_local_csv_files(LOL_DIR):
        if not any(path.name.startswith(y) for y in YEARS):
            continue
        df = pd.read_csv(path, usecols=lambda c: c in {
            "gameid", "league", "position", "teamname", "champion", "datacompleteness",
            "golddiffat15",
        }, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        df = df[df["league"].astype(str).str.strip().isin(ALL_ALLOWED_LEAGUE_CODES)]
        df = df[df.get("datacompleteness", "").astype(str).str.strip().isin(ALLOWED_COMPLETENESS)]
        pos = df["position"].astype(str).str.lower()
        df = df[~pos.eq("team")]
        for _, row in df.iterrows():
            row = normalize_oe_row(row.to_dict())
            role = _norm_pos(row.get("position", ""))
            champ = str(row.get("champion", "") or "").strip()
            team = canonical_team(str(row.get("teamname", "")).strip())
            if role not in ROLES or not champ or not team:
                continue
            gd15 = row.get("golddiffat15")
            rows.append({
                "gameid": str(row.get("gameid", "")).strip(),
                "team": team,
                "champion": champ,
                "role": role,
                "gd15": float(gd15) if gd15 not in (None, "") else np.nan,
            })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 1. Same-role matchup matrix
# ---------------------------------------------------------------------------

def build_same_role_matrix(role_map: pd.DataFrame, results: pd.DataFrame) -> dict:
    """results: (gameid, team) -> won."""
    won_lookup = {(r["gameid"], r["team"]): r["won"] for _, r in results.iterrows()}
    out: dict[str, dict] = {role: {} for role in ROLES}
    for role in ROLES:
        role_df = role_map[role_map["role"] == role]
        agg: dict[tuple[str, str], dict] = defaultdict(lambda: {"games": 0, "wins": 0, "gdSum": 0.0, "gdCount": 0})
        for gid, grp in role_df.groupby("gameid"):
            if len(grp) != 2:
                continue
            a, b = grp.iloc[0], grp.iloc[1]
            if a["champion"] == b["champion"]:
                continue
            a_won = won_lookup.get((gid, a["team"]))
            b_won = won_lookup.get((gid, b["team"]))
            if a_won is None or b_won is None or a_won == b_won:
                continue
            gd_delta = (a["gd15"] - b["gd15"]) if pd.notna(a["gd15"]) and pd.notna(b["gd15"]) else np.nan
            for me, opp, me_won, delta in (
                (a["champion"], b["champion"], a_won, gd_delta),
                (b["champion"], a["champion"], b_won, (-gd_delta if pd.notna(gd_delta) else np.nan)),
            ):
                e = agg[(me, opp)]
                e["games"] += 1
                e["wins"] += me_won
                if pd.notna(delta):
                    e["gdSum"] += delta
                    e["gdCount"] += 1
        role_out: dict[str, dict] = {}
        for (champ, opp), e in agg.items():
            if e["games"] < MIN_MATCHUP_GAMES:
                continue
            role_out.setdefault(champ, {})[opp] = {
                "games": e["games"],
                "winrate": round(100.0 * e["wins"] / e["games"], 1),
                "avgGd15Delta": round(e["gdSum"] / e["gdCount"], 1) if e["gdCount"] else None,
            }
        out[role] = role_out
    return out


# ---------------------------------------------------------------------------
# 2. Draft-order reconstruction + counter-pick edge validation
# ---------------------------------------------------------------------------

def reconstruct_reveal_order(draft_row: pd.Series) -> list[dict]:
    """Flat list of (slot, eventType, champion) for ONE team's picks+bans, global-ordered."""
    fp = draft_row["firstPick"]
    events = []
    for i, champ in enumerate(draft_row["picks"], start=1):
        if champ:
            events.append({"slot": PICK_SLOT_MAP[fp][i], "type": "pick", "champion": champ})
    for i, champ in enumerate(draft_row["bans"], start=1):
        if champ:
            events.append({"slot": BAN_SLOT_MAP[fp][i], "type": "ban", "champion": champ})
    return events


def build_counterpick_signal(draft_rows: pd.DataFrame, role_map: pd.DataFrame, same_role_matrix: dict) -> dict:
    """For each team's pick, find the most-recently-revealed enemy champion (pick or ban)
    before it. If that pick's role is known and the same-role matrix rates this champion
    favorably (>=55% winrate, min sample) against that specific enemy reveal, count it as
    a 'matrix-informed counter'. Then check empirically: do teams who land more
    matrix-informed counters actually win more?
    """
    role_lookup = {(r["gameid"], r["team"], r["champion"]): r["role"] for _, r in role_map.iterrows()}

    per_game_team: dict[tuple[str, str], dict] = {}
    for gid, grp in draft_rows.groupby("gameid"):
        if len(grp) != 2:
            continue
        rows = {r["firstPick"]: r for _, r in grp.iterrows()}
        if "F" not in rows or "S" not in rows:
            continue
        all_events: list[dict] = []
        for side, row in rows.items():
            for ev in reconstruct_reveal_order(row):
                ev["team"] = row["team"]
                ev["enemyTeam"] = rows["S" if side == "F" else "F"]["team"]
                all_events.append(ev)
        all_events.sort(key=lambda e: e["slot"])

        for team, row in rows.items():
            enemy_team = rows["S" if team == "F" else "F"]["team"]
            counters = 0
            matched_picks = 0
            for i, champ in enumerate(row["picks"], start=1):
                if not champ:
                    continue
                my_slot = PICK_SLOT_MAP[row["firstPick"]][i]
                role = role_lookup.get((gid, row["team"], champ))
                if role is None:
                    continue
                revealed_enemy = [
                    e["champion"] for e in all_events
                    if e["slot"] < my_slot and e["team"] == enemy_team
                ]
                if not revealed_enemy:
                    continue
                most_recent_enemy = revealed_enemy[-1]
                matched_picks += 1
                mu = same_role_matrix.get(role, {}).get(champ, {}).get(most_recent_enemy)
                if mu and mu["games"] >= MIN_MATCHUP_GAMES and mu["winrate"] >= 55.0:
                    counters += 1
            per_game_team[(gid, row["team"])] = {
                "counters": counters,
                "matchedPicks": matched_picks,
                "won": row["won"],
            }

    df = pd.DataFrame([{"gameid": k[0], "team": k[1], **v} for k, v in per_game_team.items()])
    df = df[df["matchedPicks"] > 0]
    df["counterRate"] = df["counters"] / df["matchedPicks"]

    # Zero-inflated (most teams land 0 matrix-defined counters in a given game), so split
    # on "landed at least one" rather than a median (which collapses to 0 either way).
    any_counter = df[df["counters"] > 0]
    zero_counter = df[df["counters"] == 0]
    result = {
        "sampleGames": int(len(df)),
        "gamesWithAnyCounterPick": int(len(any_counter)),
        "gamesWithZeroCounterPicks": int(len(zero_counter)),
        "winrateWithAnyCounterPick": round(float(any_counter["won"].mean() * 100), 1) if len(any_counter) else None,
        "winrateWithZeroCounterPicks": round(float(zero_counter["won"].mean() * 100), 1) if len(zero_counter) else None,
        "note": (
            "counterRate = share of a team's picks that matched the same-role matrix's "
            "definition of a favorable (>=55% WR, min sample) response to the enemy's most "
            "recently revealed champion at pick time (true reconstructed draft order, not "
            "column order). Zero-inflated distribution (landing >=1 matrix-defined counter "
            f"is uncommon), so split is 'any counter-pick' vs 'none', gated at "
            f"{MIN_COUNTERPICK_GAMES} games minimum before trusting the split. This is a "
            "retrospective correlation, NOT yet wired into the trained model as a feature — "
            "doing so safely requires a walk-forward (prior-games-only) version of the "
            "matchup matrix to avoid leakage, same discipline as region_elo.py's Elo lookups."
        ),
    }
    if len(df) >= MIN_COUNTERPICK_GAMES:
        corr = float(df["counterRate"].corr(df["won"])) if df["counterRate"].std() else None
        result["pointBiserialCorr"] = round(corr, 3) if corr is not None else None
    return result


# ---------------------------------------------------------------------------
# 3. Cross-role archetype interaction lift
# ---------------------------------------------------------------------------

def load_archetypes() -> dict:
    """Prefer the exported artifact, fall back to the hand-curated static copy
    so the cross-role lift works regardless of pipeline step ordering (this
    builder can run before export_artifacts.py copies archetypes into OUT_DIR)."""
    for path in (OUT_DIR / "champion_archetypes.json", STATIC_DIR / "champion_archetypes.json"):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return {}


def build_crossrole_lift(role_map: pd.DataFrame, results: pd.DataFrame, archetypes: dict) -> list[dict]:
    won_lookup = {(r["gameid"], r["team"]): r["won"] for _, r in results.iterrows()}
    team_champs: dict[tuple[str, str], set[str]] = defaultdict(set)
    for _, r in role_map.iterrows():
        team_champs[(r["gameid"], r["team"])].add(r["champion"])

    by_game: dict[str, list[str]] = defaultdict(list)
    for (gid, team) in team_champs:
        by_game[gid].append(team)

    def has_tag(champs: set[str], tag: str) -> bool:
        return any(tag in (archetypes.get(c, {}) or {}).get("tags", []) for c in champs)

    out = []
    for attacker_tag, defender_tag, label in ARCHETYPE_RULES:
        with_cond: list[int] = []
        without_cond: list[int] = []
        for gid, teams in by_game.items():
            if len(teams) != 2:
                continue
            t1, t2 = teams
            for me, opp in ((t1, t2), (t2, t1)):
                me_champs = team_champs.get((gid, me), set())
                opp_champs = team_champs.get((gid, opp), set())
                won = won_lookup.get((gid, me))
                if won is None or not has_tag(me_champs, attacker_tag):
                    continue
                if has_tag(opp_champs, defender_tag):
                    with_cond.append(won)
                else:
                    without_cond.append(won)
        n_with, n_without = len(with_cond), len(without_cond)
        if n_with < MIN_CROSSROLE_GAMES or n_without < MIN_CROSSROLE_GAMES:
            out.append({
                "attackerTag": attacker_tag, "defenderTag": defender_tag, "label": label,
                "status": "insufficient_sample", "gamesWithCondition": n_with, "gamesWithout": n_without,
            })
            continue
        wr_with = 100.0 * sum(with_cond) / n_with
        wr_without = 100.0 * sum(without_cond) / n_without
        out.append({
            "attackerTag": attacker_tag, "defenderTag": defender_tag, "label": label,
            "status": "validated",
            "gamesWithCondition": n_with, "winrateWithCondition": round(wr_with, 1),
            "gamesWithout": n_without, "winrateWithout": round(wr_without, 1),
            "liftPp": round(wr_with - wr_without, 1),
        })
    return out


# ---------------------------------------------------------------------------

def main() -> None:
    print("Loading team draft rows (picks/bans/firstPick)...", file=sys.stderr)
    draft_rows = load_team_draft_rows()
    print(f"  {len(draft_rows)} team-draft rows", file=sys.stderr)

    print("Loading per-player role map (champion -> role)...", file=sys.stderr)
    role_map = load_role_map()
    print(f"  {len(role_map)} player-game rows", file=sys.stderr)

    results = draft_rows[["gameid", "team", "won"]].drop_duplicates()

    print("Building same-role matchup matrix...", file=sys.stderr)
    same_role = build_same_role_matrix(role_map, results)
    for role in ROLES:
        n_champs = len(same_role.get(role, {}))
        n_pairs = sum(len(v) for v in same_role.get(role, {}).values())
        print(f"  {role}: {n_champs} champs with >=1 gated matchup, {n_pairs} directed pairs", file=sys.stderr)

    print("Reconstructing draft order + validating counter-pick signal...", file=sys.stderr)
    counterpick = build_counterpick_signal(draft_rows, role_map, same_role)
    print(f"  {json.dumps(counterpick, indent=2)}", file=sys.stderr)

    print("Validating cross-role archetype interaction rules...", file=sys.stderr)
    archetypes = load_archetypes()
    crossrole = build_crossrole_lift(role_map, results, archetypes)
    for rule in crossrole:
        print(f"  {rule}", file=sys.stderr)

    out = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "methodology": (
            "Same-role matrix: direct-lane champ-vs-champ win rate + avg GD@15 delta, "
            f"min {MIN_MATCHUP_GAMES} meetings. Draft-order reconstruction uses OE's "
            "firstPick flag + the standard competitive ban/pick slot pattern to recover "
            "true reveal order (not column order) for the counter-pick validation. "
            "Cross-role lift validates hand-curated archetype tag interactions against "
            "realized win rates, not assumed."
        ),
        "sameRoleMatchups": _sanitize_nan(same_role),
        "counterPickSignal": _sanitize_nan(counterpick),
        "crossRoleArchetypeLift": _sanitize_nan(crossrole),
    }
    out_path = OUT_DIR / "champ_matchups.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
