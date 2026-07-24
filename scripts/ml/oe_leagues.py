"""
Tier-1 league grouping for the ML pipeline.

Oracle's Elixir league codes are not stable across years — e.g. North America's
top flight was tagged "LCS" through 2024, rebranded to "LTA" / "LTA N" for the
2025 season, then reverted to "LCS" for 2026. The existing dashboard ingest
(scripts/ingest_csv.py TARGET_LEAGUES) only matches the literal string "LCS",
which silently drops the entire 2025 NA regional season. The ML feature mart
needs continuous team history across that rebrand, so it groups by canonical
region instead of raw league code.

NOTE: this also means scripts/ingest_csv.py + the live dashboard are missing
2025 "LTA"/"LTA N" NA regional-season games — worth a follow-up fix outside
the ML pipeline scope.
"""

from __future__ import annotations

# Canonical region -> raw OE league codes seen across 2023-2026 CSVs.
REGION_LEAGUE_CODES: dict[str, set[str]] = {
    "LCK": {"LCK"},
    # NOTE: "LPLOL" looks like an OE alt-tag for China's LPL but is NOT — it's
    # "Liga Portuguesa" (LPLOL), a Portuguese minor regional league entirely
    # unrelated to LPL. Confirmed against oracleselixir.com/matches (team names
    # are Portuguese orgs, e.g. "Otter Side", "Odivelas Sports Club", "Leões
    # Porto Salvo Esports"). Merging it into LPL silently contaminated the LPL
    # region's team/strength pool with amateur-tier teams — do not re-add
    # without verifying the league is genuinely Chinese LPL.
    "LPL": {"LPL"},
    "LEC": {"LEC"},
    # LTA N succeeded LCS for the 2025 season only; LTA S is the LLA/CBLOL
    # merger and is NOT continuous with historic LCS, so it's excluded.
    "LCS": {"LCS", "LTA", "LTA N"},
}

# International (cross-region) events. Kept separate from REGION_LEAGUE_CODES
# because a game's "home region" for a guest/minor team is resolved from the
# team's regional-season history, not the event code itself.
INTERNATIONAL_LEAGUE_CODES: dict[str, str] = {
    "MSI": "MSI",
    "WLDs": "Worlds",
    "FST": "First Stand",
    # Esports World Cup — OE tags the 2026 event as "EWC" (also seen as overview
    # split "2026 EWC" on the dashboard). Required so DK/GEN/T1 EWC series enter
    # the feature mart + Elo timeline; without it, retrain silently ends before
    # the tournament despite OE CSV containing those rows.
    "EWC": "EWC",
}

TIER1_REGIONS = tuple(REGION_LEAGUE_CODES.keys())

LEAGUE_CODE_TO_REGION: dict[str, str] = {
    code: region for region, codes in REGION_LEAGUE_CODES.items() for code in codes
}

ALL_ALLOWED_LEAGUE_CODES: set[str] = set(LEAGUE_CODE_TO_REGION.keys()) | set(
    INTERNATIONAL_LEAGUE_CODES.keys()
)


def region_for_league_code(code: str) -> str | None:
    """Canonical tier-1 region for a raw OE league code, or None if not tier-1/intl."""
    code = (code or "").strip()
    if code in LEAGUE_CODE_TO_REGION:
        return LEAGUE_CODE_TO_REGION[code]
    if code in INTERNATIONAL_LEAGUE_CODES:
        return INTERNATIONAL_LEAGUE_CODES[code]
    return None


def is_international_code(code: str) -> bool:
    return (code or "").strip() in INTERNATIONAL_LEAGUE_CODES
