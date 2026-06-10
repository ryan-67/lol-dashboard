#!/usr/bin/env python3
"""Fetch official league/team logos from LoL Esports API and write a static manifest."""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

API_BASE = "https://esports-api.lolesports.com/persisted/gw"
API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
OUT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "esports-logos.json"

TIER1_LEAGUES = {"LCK", "LPL", "LEC", "LCS"}

# Our dashboard slug -> LoL Esports API team slug
TEAM_SLUG_ALIASES: dict[str, str] = {
    "gen-g": "geng",
    "dplus-kia": "dwg-kia",
    "ok-brion": "fredit-brion",
    "ok-savingsbank-brion": "fredit-brion",
    "hanwha-life-esports": "hanwha-life-esports",
    "giant-x": "giantx-lec",
    "giantx": "giantx-lec",
    "karmine-corp": "karmine-corp",
    "nongshim-redforce": "nongshim-redforce",
    "team-liquid": "team-liquid",
    "cloud9": "cloud9",
    "100-thieves": "100-thieves",
    "flyquest": "flyquest",
    "disguised": "disguised",
    "dignitas": "dignitas",
    "shopify-rebellion": "shopify-rebellion",
    "anyone-s-legend": "anyones-legend",
    "funplus-phoenix": "funplus-phoenix",
}


def fetch(path: str) -> dict:
    req = urllib.request.Request(
        f"{API_BASE}/{path}",
        headers={"x-api-key": API_KEY, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_url(url: str | None) -> str | None:
    if not url:
        return None
    return url.replace("http://", "https://", 1)


def main() -> int:
    leagues_raw = fetch("getLeagues?hl=en-US").get("data", {}).get("leagues", [])
    teams_raw = fetch("getTeams?hl=en-US").get("data", {}).get("teams", [])

    leagues: dict[str, str] = {}
    for league in leagues_raw:
        name = (league.get("name") or "").upper()
        if name not in TIER1_LEAGUES:
            continue
        image = normalize_url(league.get("image"))
        if image:
            leagues[name] = image

    teams_by_slug: dict[str, str] = {}
    for team in teams_raw:
        slug = team.get("slug")
        image = normalize_url(team.get("image"))
        if slug and image:
            teams_by_slug[slug] = image

    aliases: dict[str, str] = {}
    for our_slug, esports_slug in TEAM_SLUG_ALIASES.items():
        if esports_slug in teams_by_slug:
            aliases[our_slug] = esports_slug

    manifest = {
        "source": "https://esports-api.lolesports.com/persisted/gw",
        "leagues": leagues,
        "teamsByEsportsSlug": teams_by_slug,
        "teamSlugAliases": aliases,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  leagues: {len(leagues)}")
    print(f"  teams: {len(teams_by_slug)}")
    print(f"  aliases: {len(aliases)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
