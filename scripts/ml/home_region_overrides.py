"""
Curated home-region overrides for OE tagging quirks.

2025 Americas used LTA / LTA N (north = historic LCS) and LTA S (CBLOL/LLA merge).
Some southern orgs also appear under a bare "LTA" code or only at internationals
(EWC/MSI). Without overrides they inherit homeRegion=LCS and pollute tier-1
power rankings (e.g. Keine / paiN, frosty / RED Canids).

LCS in 2026 is again a major league separate from CBLOL / LLA.
"""

from __future__ import annotations

# Orgs whose domestic home is NOT LCK/LPL/LEC/LCS. Players currently on these
# teams must be excluded from tier-1 power boards regardless of OE "LTA" rows.
NON_TIER1_HOME_ORGS: set[str] = {
    # Brazil / CBLOL
    "paiN Gaming",
    "LOUD",
    "RED Canids",
    "FURIA",
    "Vivo Keyd Stars",
    "Fluxo",
    "Liberty",
    "KaBuM! Esports",
    "INTZ",
    "Los Grandes",
    # LatAm / LLA-adjacent (seen under LTA S)
    "Leviatan",
    "Isurus",
    "Six Karma",
    "Estral Esports",
    "Infinity Esports",
    "Movistar R7",
    "All Knights",
}

# Explicit home region when OE history is ambiguous but the org is still tier-1.
# (Empty for now — reserved for future corrections.)
TIER1_HOME_OVERRIDES: dict[str, str] = {}


def resolve_home_region(team: str, inferred: str | None) -> str | None:
    """Return canonical home region, or None if the org is not tier-1 domestic."""
    name = (team or "").strip()
    if name in NON_TIER1_HOME_ORGS:
        return None
    if name in TIER1_HOME_OVERRIDES:
        return TIER1_HOME_OVERRIDES[name]
    return inferred
