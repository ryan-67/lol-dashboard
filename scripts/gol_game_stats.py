"""Fetch per-game objectives stolen from gol.gg fullstats pages."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT / "public" / "data" / "gol_game_cache.json"
GOL_BASE = "https://gol.gg"
USER_AGENT = "nucky-dashboard-ingest/1.0"

ROW_LABELS = {
    "objectivesStolen": ("objectives stolen",),
}


def _fetch(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def _cell_values(row_html: str) -> list[str]:
    return [v.strip() for v in re.findall(r"<td[^>]*>([^<]*)</td>", row_html, flags=re.I)]


def _parse_table_row(html: str, label: str) -> list[str] | None:
    pattern = re.compile(
        rf"<tr><td>{re.escape(label)}</td>(.+?)</tr>",
        flags=re.I | re.S,
    )
    match = pattern.search(html)
    if not match:
        return None
    return _cell_values(match.group(1))


def _normalize_champion(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def parse_fullstats_html(html: str) -> dict:
    """Return metadata + per-player advanced stats from a gol.gg page-fullstats HTML document."""
    title_match = re.search(r"<title>([^<]+)</title>", html, re.I)
    title = title_match.group(1) if title_match else ""

    teams_match = re.search(r"^([^<]+?)\s+game\s+\d+", title, re.I)
    teams_raw = teams_match.group(1).strip() if teams_match else ""
    team_parts = [t.strip() for t in re.split(r"\s+vs\s+", teams_raw, flags=re.I) if t.strip()]

    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", html)
    date = date_match.group(1) if date_match else ""

    player_row = re.search(
        r"<tr><td>Player</td>(.+?)</tr>",
        html,
        flags=re.I | re.S,
    )
    if not player_row:
        return {"date": date, "teams": team_parts, "players": []}

    names = [
        re.sub(r"<[^>]+>", "", cell).strip()
        for cell in re.findall(r"<td[^>]*>(.+?)</td>", player_row.group(1), flags=re.S)
    ]
    names = [n for n in names if n]

    champ_row = re.search(
        r"<thead><tr><th[^>]*></th>(.+?)</tr></thead>",
        html,
        flags=re.I | re.S,
    )
    champions: list[str] = []
    if champ_row:
        for alt in re.findall(r"alt='([^']+)'", champ_row.group(1)):
            champions.append(alt)

    stats_by_row: dict[str, list[str]] = {}
    for key, labels in ROW_LABELS.items():
        for label in labels:
            vals = _parse_table_row(html, label)
            if vals is not None:
                stats_by_row[key] = vals
                break

    players = []
    for idx, name in enumerate(names):
        obj_raw = stats_by_row.get("objectivesStolen", [""] * len(names))[idx] if idx < len(
            stats_by_row.get("objectivesStolen", [])
        ) else ""
        champ = champions[idx] if idx < len(champions) else ""
        players.append(
            {
                "name": name,
                "champion": champ,
                "championKey": _normalize_champion(champ),
                "objectivesStolen": int(obj_raw) if str(obj_raw).isdigit() else 0,
            }
        )

    return {"date": date, "teams": team_parts, "players": players, "title": title}


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")


def fetch_game_stats(game_id: str, cache: dict | None = None, delay_s: float = 0.15) -> dict:
    cache = cache if cache is not None else load_cache()
    key = str(game_id)
    if key in cache:
        return cache[key]

    url = f"{GOL_BASE}/game/stats/{game_id}/page-fullstats/"
    try:
        html = _fetch(url)
        parsed = parse_fullstats_html(html)
        parsed["golGameId"] = key
        cache[key] = parsed
        if delay_s:
            time.sleep(delay_s)
        return parsed
    except (urllib.error.URLError, TimeoutError) as err:
        return {"golGameId": key, "error": str(err), "players": []}


# Curated gol.gg tournament slugs (tournament list page is JS-rendered).
TOURNAMENT_CANDIDATES: dict[str, list[str]] = {
    "2026": [
        "LCK 2026 Rounds 1-2",
        "LCK Cup 2026",
        "LCK 2026 Road to MSI",
        "LPL 2026 Split 1",
        "LPL 2026 Split 1 Playoffs",
        "LPL 2026 Split 2",
        "LPL 2026 Split 2 Playoffs",
        "LEC 2026 Spring Season",
        "LEC 2026 Spring Playoffs",
        "LCS 2026 Spring",
        "LCS 2026 Spring Playoffs",
        "LCS 2026 Lock-In",
        "MSI 2026",
        "First Stand 2026",
    ],
}


def discover_tournament_slugs(year: str = "2026", _season: str = "Spring") -> list[str]:
    del _season  # season kept for CLI compatibility; year-level slug list is curated.
    candidates = TOURNAMENT_CANDIDATES.get(year, [])
    found: list[str] = []
    for name in candidates:
        slug = urllib.parse.quote(name)
        url = f"{GOL_BASE}/tournament/tournament-matchlist/{slug}/"
        try:
            html = _fetch(url)
            if re.search(r"/game/stats/\d+/", html):
                found.append(name)
        except urllib.error.HTTPError:
            continue
    return found


def discover_game_ids_for_tournament(tournament_slug: str) -> list[str]:
    slug = urllib.parse.quote(urllib.parse.unquote(tournament_slug), safe="")
    url = f"{GOL_BASE}/tournament/tournament-matchlist/{slug}/"
    html = _fetch(url)
    return sorted(set(re.findall(r"/game/stats/(\d+)/", html)))


def collect_game_ids(season: str = "Spring", year: str = "2026") -> list[str]:
    ids: list[str] = []
    for slug in discover_tournament_slugs(year=year):
        ids.extend(discover_game_ids_for_tournament(slug))
    return sorted(set(ids))
