"""
Load Oracle's Elixir raw CSVs into a tidy one-row-per-team-per-game DataFrame.

This is the raw feature surface for the ML pipeline: unlike public/data/oe_slices
(pre-aggregated season/split summaries used by the dashboard), this reads the
original per-game, per-player CSV rows in lol/*.csv directly so the feature mart
can compute point-in-time rolling stats without re-deriving them from aggregates.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS_DIR.parents[0]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from oe_csv_io import discover_local_csv_files  # noqa: E402

from oe_leagues import ALL_ALLOWED_LEAGUE_CODES, is_international_code, region_for_league_code  # noqa: E402
from team_identity import canonical_team  # noqa: E402

ALLOWED_COMPLETENESS = {"complete", "partial"}
LOL_DIR = ROOT / "lol"

POSITION_MAP = {
    "top": "top",
    "jng": "jungle",
    "jungle": "jungle",
    "mid": "mid",
    "bot": "adc",
    "adc": "adc",
    "sup": "support",
    "support": "support",
}
ROLES = ("top", "jungle", "mid", "adc", "support")

# Team-row columns pulled straight from OE (all numeric; NaN when a league
# omits a column, e.g. LPL partial-completeness rows lacking @X diffs).
TEAM_NUMERIC_COLS = [
    "kills", "deaths", "assists", "teamkills", "teamdeaths",
    "dragons", "opp_dragons", "elementaldrakes", "opp_elementaldrakes",
    "infernals", "mountains", "clouds", "oceans", "chemtechs", "hextechs",
    "elders", "opp_elders", "heralds", "opp_heralds", "void_grubs", "opp_void_grubs",
    "barons", "opp_barons", "atakhans", "opp_atakhans",
    "towers", "opp_towers", "turretplates", "opp_turretplates",
    "inhibitors", "opp_inhibitors",
    "firstblood", "firstdragon", "firstherald", "firstbaron",
    "firsttower", "firstmidtower", "firsttothreetowers",
    "damagetochampions", "dpm", "damagetakenperminute", "damagemitigatedperminute", "damagetotowers",
    "wardsplaced", "wpm", "wardskilled", "wcpm", "controlwardsbought", "visionscore", "vspm",
    "totalgold", "earnedgold", "earned gpm", "earnedgoldshare", "goldspent", "gspd", "gpr",
    "total cs", "minionkills", "monsterkills", "cspm",
    "golddiffat10", "xpdiffat10", "csdiffat10",
    "golddiffat15", "xpdiffat15", "csdiffat15",
    "golddiffat20", "xpdiffat20", "csdiffat20",
    "golddiffat25", "xpdiffat25", "csdiffat25",
    "killsat15", "assistsat15", "deathsat15",
    "killsat20", "assistsat20", "deathsat20",
    "gamelength",
]

ROLE_NUMERIC_COLS = [
    "kills", "deaths", "assists", "teamkills",
    "dpm", "damageshare", "damagetakenperminute",
    "earnedgold", "earnedgoldshare",
    "visionscore", "vspm", "wardskilled", "controlwardsbought",
    "golddiffat10", "csdiffat10", "xpdiffat10",
    "golddiffat15", "csdiffat15", "xpdiffat15",
    "golddiffat20", "csdiffat20", "xpdiffat20",
]


def _normalize_position(raw: str) -> str:
    return POSITION_MAP.get(str(raw or "").strip().lower(), "")


def _to_num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _read_year_csv(path: Path) -> pd.DataFrame:
    print(f"  Reading {path.name}...", file=sys.stderr)
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip() for c in df.columns]
    df["league"] = df["league"].astype(str).str.strip()
    df = df[df["league"].isin(ALL_ALLOWED_LEAGUE_CODES)]
    if df.empty:
        return df
    df["datacompleteness"] = df.get("datacompleteness", "").astype(str).str.strip()
    df = df[df["datacompleteness"].isin(ALLOWED_COMPLETENESS)]
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    df = df.dropna(subset=["date"])
    df["gameid"] = df["gameid"].astype(str).str.strip()
    df["teamname"] = df["teamname"].astype(str).str.strip()
    df["position"] = df["position"].astype(str).str.strip()
    return df


def _load_supplement_csv(path: Path, label: str) -> pd.DataFrame:
    """Load one OE-shaped supplement CSV (Riot warehouse or legacy Cito)."""
    if not path.exists():
        return pd.DataFrame()
    try:
        df = pd.read_csv(path, low_memory=False)
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: could not read {label} OE supplement: {exc}", file=sys.stderr)
        return pd.DataFrame()
    if df.empty:
        return df
    df.columns = [c.strip() for c in df.columns]
    if "league" in df.columns:
        df["league"] = df["league"].astype(str).str.strip()
        df = df[df["league"].isin(ALL_ALLOWED_LEAGUE_CODES)]
    if "datacompleteness" not in df.columns:
        df["datacompleteness"] = "partial"
    df["datacompleteness"] = df["datacompleteness"].astype(str).str.strip()
    df = df[df["datacompleteness"].isin(ALLOWED_COMPLETENESS)]
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
        df = df.dropna(subset=["date"])
    if "gameid" in df.columns:
        df["gameid"] = df["gameid"].astype(str).str.strip()
    if "teamname" in df.columns:
        df["teamname"] = df["teamname"].astype(str).str.strip()
    if "position" in df.columns:
        df["position"] = df["position"].astype(str).str.strip()
    # Both supplements share the cito_source=1 marker so the OE-wins dedupe
    # in load_raw_rows applies uniformly.
    df["cito_source"] = 1
    print(f"  Loaded {len(df)} {label} supplement rows from {path.name}", file=sys.stderr)
    return df


def _load_supplements() -> pd.DataFrame:
    """Riot warehouse supplement (Current SoR) + legacy Cito supplement.

    Riot rows win over Cito rows on the same (calendar day, teamname); OE rows
    win over both later in load_raw_rows.
    """
    riot = _load_supplement_csv(ROOT / "data" / "ml" / "riot_oe_supplement.csv", "Riot")
    cito = _load_supplement_csv(ROOT / "data" / "ml" / "cito_oe_supplement.csv", "Cito")
    if riot.empty:
        return cito
    if cito.empty:
        return riot

    def day_team_keys(df: pd.DataFrame) -> set[tuple[str, str]]:
        days = pd.to_datetime(df["date"], utc=True, errors="coerce").dt.strftime("%Y-%m-%d")
        return set(zip(days.astype(str), df["teamname"].astype(str)))

    riot_keys = day_team_keys(riot)
    cito_days = pd.to_datetime(cito["date"], utc=True, errors="coerce").dt.strftime("%Y-%m-%d")
    keep = [
        (str(day), str(team)) not in riot_keys
        for day, team in zip(cito_days, cito["teamname"].astype(str))
    ]
    dropped = len(cito) - sum(keep)
    if dropped:
        print(f"  Dropped {dropped} Cito supplement rows shadowed by Riot warehouse", file=sys.stderr)
    return pd.concat([riot, cito.loc[keep]], ignore_index=True)


def load_raw_rows(years: list[str], lol_dir: Path = LOL_DIR) -> pd.DataFrame:
    """Concatenate filtered raw rows (player + team) across the requested CSV years.

    When present, appends Riot warehouse box scores (Current SoR — Live Stats)
    plus any legacy Cito supplement so current-model refresh never waits on
    OE Drive — OE rows win on (date, teamname) collisions, Riot wins over Cito.
    """
    all_files = discover_local_csv_files(lol_dir)
    by_year = {}
    for path in all_files:
        for y in years:
            if path.name.startswith(y):
                by_year[y] = path
    missing = [y for y in years if y not in by_year]
    if missing:
        print(f"WARNING: no OE CSV found for years {missing} in {lol_dir}", file=sys.stderr)

    frames = [_read_year_csv(by_year[y]) for y in sorted(by_year)]
    frames = [f for f in frames if not f.empty]
    cito = _load_supplements()
    if not cito.empty:
        # Keep supplement rows only for years we care about
        if "year" in cito.columns:
            cito = cito[cito["year"].astype(str).isin([str(y) for y in years])]
        frames.append(cito)
    if not frames:
        raise RuntimeError(f"No tier-1/international rows found for years {years} in {lol_dir}")
    raw = pd.concat(frames, ignore_index=True)

    # Drop supplement rows that duplicate an OE (date, team) already present.
    # OE rows carry NaN in cito_source after concat — normalize before comparing.
    if "cito_source" in raw.columns and "date" in raw.columns and "teamname" in raw.columns:
        raw["_day"] = pd.to_datetime(raw["date"], utc=True, errors="coerce").dt.strftime("%Y-%m-%d")
        is_supplement = pd.to_numeric(raw["cito_source"], errors="coerce").fillna(0).astype(int) == 1
        oe_keys = set(
            zip(
                raw.loc[~is_supplement, "_day"].astype(str),
                raw.loc[~is_supplement, "teamname"].astype(str),
            )
        )
        keys = zip(raw["_day"].astype(str), raw["teamname"].astype(str))
        keep = [
            (not supp) or (key not in oe_keys)
            for supp, key in zip(is_supplement.tolist(), keys)
        ]
        raw = raw.loc[keep].drop(columns=["_day"], errors="ignore")
        n_supp = int(
            (pd.to_numeric(raw["cito_source"], errors="coerce").fillna(0).astype(int) == 1).sum()
        )
        if n_supp:
            print(f"  Using {n_supp} supplement-only rows after OE dedupe", file=sys.stderr)
    return raw.reset_index(drop=True)


def _build_team_rows(raw: pd.DataFrame) -> pd.DataFrame:
    team_rows = raw[raw["position"].str.lower() == "team"].copy()
    team_rows = team_rows.drop_duplicates(subset=["gameid", "teamname"])
    for col in TEAM_NUMERIC_COLS:
        if col in team_rows.columns:
            team_rows[col] = _to_num(team_rows[col])
        else:
            team_rows[col] = np.nan
    team_rows["result"] = _to_num(team_rows["result"]).fillna(0).astype(int)
    team_rows["patch"] = team_rows.get("patch", "").astype(str).str.strip()
    team_rows["split"] = team_rows.get("split", "").astype(str).str.strip()
    team_rows["year"] = team_rows.get("year", "").astype(str).str.strip()
    team_rows["playoffs"] = _to_num(team_rows.get("playoffs", 0)).fillna(0).astype(int)
    team_rows["side"] = team_rows.get("side", "").astype(str).str.strip().str.lower()
    team_rows["canonical_team"] = team_rows["teamname"].map(canonical_team)
    team_rows["region"] = team_rows["league"].map(region_for_league_code)
    team_rows["is_international"] = team_rows["league"].map(is_international_code)

    # Damage concentration (max single-player damage share) needs the player
    # rows, joined in afterward — placeholder filled by caller.
    return team_rows


def _build_role_pivot(raw: pd.DataFrame) -> pd.DataFrame:
    player_rows = raw[raw["position"].str.lower() != "team"].copy()
    player_rows["role"] = player_rows["position"].map(_normalize_position)
    player_rows = player_rows[player_rows["role"].isin(ROLES)]
    player_rows = player_rows.drop_duplicates(subset=["gameid", "teamname", "role"])

    for col in ROLE_NUMERIC_COLS:
        if col in player_rows.columns:
            player_rows[col] = _to_num(player_rows[col])
        else:
            player_rows[col] = np.nan

    team_kills = _to_num(player_rows.get("teamkills", np.nan))
    kills = player_rows["kills"]
    assists = player_rows["assists"]
    player_rows["kp"] = np.where(
        team_kills > 0, (kills + assists) / team_kills.replace(0, np.nan) * 100.0, np.nan
    )
    player_rows["player_name"] = player_rows.get("playername", player_rows.get("name", "")).astype(str).str.strip()

    # Damage concentration: share of team damage coming from a single player.
    dmg_share = player_rows.groupby(["gameid", "teamname"])["damageshare"].transform("max")
    player_rows["max_dmg_share"] = dmg_share

    pivot_cols = [c for c in ROLE_NUMERIC_COLS if c != "teamkills"] + ["kp"]
    pivoted = player_rows.pivot_table(
        index=["gameid", "teamname"],
        columns="role",
        values=pivot_cols,
        aggfunc="first",
    )
    pivoted.columns = [f"{role}_{stat}" for stat, role in pivoted.columns]
    pivoted = pivoted.reset_index()

    roster = (
        player_rows.groupby(["gameid", "teamname"])["player_name"]
        .apply(lambda s: tuple(sorted(x for x in s if x)))
        .reset_index(name="roster")
    )
    dmg_concentration = player_rows.groupby(["gameid", "teamname"])["max_dmg_share"].first().reset_index()

    out = pivoted.merge(roster, on=["gameid", "teamname"], how="left")
    out = out.merge(dmg_concentration, on=["gameid", "teamname"], how="left")
    return out


def build_team_game_rows(years: list[str], lol_dir: Path = LOL_DIR) -> pd.DataFrame:
    """One row per (gameid, team) with team-level + role-pivoted stats, opponent resolved."""
    raw = load_raw_rows(years, lol_dir)
    team_rows = _build_team_rows(raw)

    # Drop malformed games (missing a side, walkovers, >2 teams from bad CSV rows)
    # BEFORE the opponent self-join so it can never produce a many-to-many blowup.
    distinct_teams = team_rows.groupby("gameid")["teamname"].transform("nunique")
    team_rows = team_rows[distinct_teams == 2].copy()

    role_pivot = _build_role_pivot(raw)
    merged = team_rows.merge(role_pivot, on=["gameid", "teamname"], how="left")

    # Resolve opponent name/canonical + result via self-join on gameid (now safe:
    # exactly 2 teams per gameid, so each row matches exactly one opponent row
    # after the self-pair is filtered out).
    slim = merged[["gameid", "teamname", "canonical_team", "result"]].rename(
        columns={
            "teamname": "opponent",
            "canonical_team": "opponent_canonical",
            "result": "opponent_result",
        }
    )
    merged = merged.merge(slim, on="gameid", how="left")
    merged = merged[merged["teamname"] != merged["opponent"]].copy()

    merged["winner_canonical"] = np.where(
        merged["result"] == 1, merged["canonical_team"], merged["opponent_canonical"]
    )
    merged["loser_canonical"] = np.where(
        merged["result"] == 1, merged["opponent_canonical"], merged["canonical_team"]
    )
    merged = merged.sort_values(["date", "gameid", "teamname"]).reset_index(drop=True)
    return merged
