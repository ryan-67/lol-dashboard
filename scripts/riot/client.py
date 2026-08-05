"""HTTP client for Riot Persisted Gateway + Live Stats (public lolesports key).

Both endpoints are the same public surfaces lolesports.com itself uses:
  - Persisted GW: schedule / event details / leagues (x-api-key header)
  - Live Stats:   window / details frames keyed by gameId + startingTime

Stdlib-only (urllib) so CI can run it with requirements-ingest.txt alone.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

API_BASE = "https://esports-api.lolesports.com/persisted/gw"
LIVE_BASE = "https://feed.lolesports.com/livestats/v1"
# Public key embedded in lolesports.com (not a secret).
API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
HL = "en-US"

REQUEST_PACING_S = 0.15
MAX_RETRIES = 3

# Tier-1 league IDs (fallbacks if getLeagues resolution fails).
# Slug → (display name, GW league id). EWC is not GW-broadcast; resolved
# dynamically when present, otherwise Leaguepedia external sync covers it.
KNOWN_LEAGUES: dict[str, tuple[str, str]] = {
    "lck": ("LCK", "98767991310872058"),
    "lpl": ("LPL", "98767991314006698"),
    "lec": ("LEC", "98767991302996019"),
    "lcs": ("LCS", "98767991299243165"),
    "msi": ("MSI", "98767991325878492"),
    "worlds": ("Worlds", "98767975604431411"),
    "first_stand": ("First Stand", ""),
}

# OE league codes used by ML loader + dashboard ingest.
OE_LEAGUE_CODE = {
    "LCK": "LCK",
    "LPL": "LPL",
    "LEC": "LEC",
    "LCS": "LCS",
    "MSI": "MSI",
    "Worlds": "WLDs",
    "First Stand": "FST",
    "EWC": "EWC",
}

# cito_schedules.cito_league_id values kept consistent with the Cito sync so
# existing rows merge instead of duplicating context.
CITO_LEAGUE_ID = {
    "LCK": "lol-lck",
    "LPL": "lol-lpl",
    "LEC": "lol-lec",
    "LCS": "lol-lcs",
    "MSI": "lol-msi",
    "Worlds": "lol-worlds",
    "First Stand": "lol-first-stand",
    "EWC": "lol-ewc",
}


class RiotApiError(RuntimeError):
    pass


def _get_json(url: str, headers: dict[str, str]) -> Any:
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read()
                if not raw:
                    raise RiotApiError("empty body")
                return json.loads(raw.decode())
        except urllib.error.HTTPError as err:
            # 4xx (except 429) are deterministic — no point retrying.
            if err.code != 429 and 400 <= err.code < 500:
                raise
            last_err = err
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_err = err
        time.sleep(0.8 * (attempt + 1))
    raise RiotApiError(f"GET {url} failed after {MAX_RETRIES} attempts: {last_err}")


def gw(path: str, **params: Any) -> Any:
    """Persisted Gateway GET (adds hl + api key)."""
    q = {"hl": HL, **{k: v for k, v in params.items() if v is not None}}
    url = f"{API_BASE}/{path}?{urllib.parse.urlencode(q, doseq=True)}"
    time.sleep(REQUEST_PACING_S)
    return _get_json(url, {"x-api-key": API_KEY, "Accept": "application/json"})


def livestats(kind: str, game_id: str, starting_time: str | None = None) -> Any:
    """Live Stats window/details GET. Raises urllib.error.HTTPError on 4xx."""
    q = {"startingTime": starting_time} if starting_time else {}
    qs = f"?{urllib.parse.urlencode(q)}" if q else ""
    url = f"{LIVE_BASE}/{kind}/{game_id}{qs}"
    time.sleep(REQUEST_PACING_S)
    return _get_json(url, {"Accept": "application/json"})


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def resolve_tier1_leagues() -> dict[str, str]:
    """Return {display_name: leagueId} for tier-1 + internationals.

    Resolves dynamically via getLeagues (slugs shift season to season, e.g.
    LCS→LTA); falls back to KNOWN_LEAGUES ids when the call fails.
    """
    wanted_slugs = {
        "lck": "LCK",
        "lpl": "LPL",
        "lec": "LEC",
        "lcs": "LCS",
        "lta": "LCS",
        "lta_north": "LCS",
        "msi": "MSI",
        "worlds": "Worlds",
        "first_stand": "First Stand",
        "ewc": "EWC",
        "esports_world_cup": "EWC",
    }
    resolved: dict[str, str] = {}
    try:
        payload = gw("getLeagues")
        leagues = ((payload.get("data") or {}).get("leagues")) or []
        for entry in leagues:
            slug = str(entry.get("slug") or "").lower()
            name = wanted_slugs.get(slug)
            if name and name not in resolved and entry.get("id"):
                resolved[name] = str(entry["id"])
    except Exception as err:  # noqa: BLE001 — fall back to static ids
        print(f"  getLeagues failed ({err}); using static league ids")

    for _slug, (name, lid) in KNOWN_LEAGUES.items():
        if name not in resolved and lid:
            resolved[name] = lid
    return resolved
