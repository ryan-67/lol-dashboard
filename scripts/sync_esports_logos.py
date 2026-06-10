#!/usr/bin/env python3
"""Fetch official tier-1 league/team logos from LoL Esports API and write a static manifest."""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

API_BASE = "https://esports-api.lolesports.com/persisted/gw"
API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
OUT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "esports-logos.json"

TIER1_LEAGUES = {"LCK", "LPL", "LEC", "LCS"}

# Oracle's Elixir / dashboard display names → LoL Esports API slug
OE_NAME_TO_ESPORTS_SLUG: dict[str, str] = {
    "brion": "fredit-brion",
    "hanjinbrion": "fredit-brion",
    "oksavingsbankbrion": "fredit-brion",
    "freditbrion": "fredit-brion",
    "dnsoopers": "kwangdong-freecs",
    "dnfreecs": "kwangdong-freecs",
    "kwangdongfreecs": "kwangdong-freecs",
    "kiwoomdrx": "drx",
    "drx": "drx",
    "movistarkoi": "mad-lions",
    "madlions": "mad-lions",
    "mkoi": "mad-lions",
    "geng": "geng",
    "gengesports": "geng",
    "dpluskia": "dwg-kia",
    "dwgkia": "dwg-kia",
    "dk": "dwg-kia",
    "bnkfearx": "fearx",
    "fearx": "fearx",
    "nongshimredforce": "nongshim-redforce",
    "nsredforce": "nongshim-redforce",
    "giantx": "giantx-lec",
    "giantxlec": "giantx-lec",
    "teamliquid": "team-liquid",
    "teamliquidalienware": "team-liquid",
    "cloud9kia": "cloud9",
    "shifters": "team-bds",
    "teamheretics": "team-heretics-lec",
    "anyoneslegend": "anyones-legend",
    "weibogaming": "weibo-gaming",
    "bilibiligaming": "bilibili-gaming",
    "beijingjdgesports": "jd-gaming",
    "suzhoulngesports": "lng-esports",
    "topesports": "top-esports",
    "thundertalkgaming": "thunder-talk-gaming",
    "losratones": "los-ratones",
}

# Dashboard slug -> LoL Esports API slug
TEAM_SLUG_ALIASES: dict[str, str] = {
    "gen-g": "geng",
    "dplus-kia": "dwg-kia",
    "ok-brion": "fredit-brion",
    "ok-savingsbank-brion": "fredit-brion",
    "hanjin-brion": "fredit-brion",
    "brion": "fredit-brion",
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
    "weibo-gaming": "weibo-gaming",
    "lng-esports": "lng-esports",
    "invictus-gaming": "invictus-gaming",
    "edward-gaming": "edward-gaming",
    "bilibili-gaming": "bilibili-gaming",
    "jd-gaming": "jd-gaming",
    "top-esports": "top-esports",
    "kt-rolster": "kt-rolster",
    "drx": "drx",
    "kiwoom-drx": "drx",
    "fearx": "fearx",
    "bnk-fearx": "fearx",
    "team-vitality": "team-vitality",
    "sk-gaming": "sk-gaming",
    "misfits-gaming": "misfits-gaming",
    "rare-atom": "rare-atom",
    "ultra-prime": "ultra-prime",
    "thunder-talk-gaming": "thunder-talk-gaming",
    "lgd-gaming": "lgd-gaming",
    "dn-soopers": "kwangdong-freecs",
    "movistar-koi": "mad-lions",
    "mad-lions": "mad-lions",
    "team-bds": "team-bds",
    "shifters": "team-bds",
    "team-heretics": "team-heretics-lec",
    "los-ratones": "los-ratones",
    "immortals": "immortals-progressive",
}


def slugify(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower().strip()))


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


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def extract_dominant_color(url: str) -> str | None:
    try:
        from PIL import Image  # type: ignore
    except ImportError:
        return None

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "nucky-logo-sync/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            img = Image.open(BytesIO(resp.read())).convert("RGBA")
        img = img.resize((48, 48))
        pixels = [
            p
            for p in img.getdata()
            if p[3] > 160
            and not (p[0] > 235 and p[1] > 235 and p[2] > 235)
            and not (p[0] < 25 and p[1] < 25 and p[2] < 25)
        ]
        if not pixels:
            return None
        r = sum(p[0] for p in pixels) // len(pixels)
        g = sum(p[1] for p in pixels) // len(pixels)
        b = sum(p[2] for p in pixels) // len(pixels)
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return None


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
    teams_alt_by_slug: dict[str, str] = {}
    teams_by_code: dict[str, str] = {}
    teams_by_name: dict[str, str] = {}
    name_to_esports_slug: dict[str, str] = {}
    team_colors: dict[str, str] = {}
    aliases: dict[str, str] = dict(TEAM_SLUG_ALIASES)

    for team in teams_raw:
        home = (team.get("homeLeague") or {}).get("name", "").upper()
        if home not in TIER1_LEAGUES:
            continue
        if team.get("status") != "active":
            continue

        slug = team.get("slug")
        image = normalize_url(team.get("image"))
        alt = normalize_url(team.get("alternativeImage"))
        if not slug or not image:
            continue

        teams_by_slug[slug] = image
        if alt and alt != image:
            teams_alt_by_slug[slug] = alt

        code = (team.get("code") or "").upper()
        if code:
            teams_by_code[code] = image

        display_name = team.get("name") or ""
        for key in {normalize_name(display_name), normalize_name(slug), slugify(display_name)}:
            if key:
                teams_by_name[key] = image
                name_to_esports_slug[key] = slug

        aliases[slugify(display_name)] = slug
        aliases[slug] = slug

        color = extract_dominant_color(image)
        if color:
            team_colors[slug] = color

    for oe_key, esports_slug in OE_NAME_TO_ESPORTS_SLUG.items():
        name_to_esports_slug[oe_key] = esports_slug
        if esports_slug in teams_by_slug:
            teams_by_name[oe_key] = teams_by_slug[esports_slug]
        aliases[slugify(oe_key)] = esports_slug

    for our_slug, esports_slug in TEAM_SLUG_ALIASES.items():
        if esports_slug in teams_by_slug:
            aliases[our_slug] = esports_slug

    manifest = {
        "source": "https://esports-api.lolesports.com/persisted/gw",
        "syncedAt": __import__("datetime").datetime.now(__import__("datetime").UTC).isoformat().replace("+00:00", "Z"),
        "leagues": leagues,
        "teamsByEsportsSlug": teams_by_slug,
        "teamsAltByEsportsSlug": teams_alt_by_slug,
        "teamsByCode": teams_by_code,
        "teamsByName": teams_by_name,
        "nameToEsportsSlug": name_to_esports_slug,
        "teamSlugAliases": aliases,
        "teamColors": team_colors,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  leagues: {len(leagues)}")
    print(f"  tier-1 teams: {len(teams_by_slug)}")
    print(f"  aliases: {len(aliases)}")
    print(f"  name mappings: {len(name_to_esports_slug)}")
    print(f"  team colors: {len(team_colors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
