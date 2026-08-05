"""Cito gap-fill for warehouse series that Riot Live Stats missed.

Riot GW + Live Stats remain Current SoR. When a completed tier-1 series has
zero (or incomplete) warehouse game files after the Live Stats pass, this
module pulls Cito ``/lol/matches/{id}/player-stats`` and writes
warehouse-shaped records tagged ``source=cito_gapfill``.

Those records:
  - count toward QA series coverage
  - feed the OE-shaped supplement + player-stats cache
  - never overwrite a complete Riot Live Stats record
  - are excluded from the GD@15 snapshot gate (Cito often lacks mid-game frames)

Usage (normally via ingest_riot.py):
  python -c "from riot.gap_fill import gap_fill_uncovered; ..."
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from riot.normalize import strip_team_prefix
from riot.client import OE_LEAGUE_CODE, parse_ts

ROOT = Path(__file__).resolve().parents[2]
GAMES_DIR = ROOT / "data" / "riot" / "games"
CITO_BASE = "https://api.citoapi.com/api/v1"

ROLE_MAP = {
    "top": "top",
    "jungle": "jungle",
    "jng": "jungle",
    "mid": "mid",
    "middle": "mid",
    "bottom": "bottom",
    "bot": "bottom",
    "adc": "bottom",
    "support": "support",
    "sup": "support",
}


def _num(v: Any) -> float | int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v
    if isinstance(v, str) and v.strip():
        try:
            f = float(v)
            return int(f) if f.is_integer() else f
        except ValueError:
            return None
    return None


def _pick(obj: dict, keys: list[str]) -> Any:
    for k in keys:
        if k in obj and obj[k] is not None and obj[k] != "":
            return obj[k]
    return None


def _normalize_match_id(match_id: str) -> str:
    mid = str(match_id or "").strip()
    if not mid:
        return ""
    return mid if mid.startswith("lol-match-") else f"lol-match-{mid}"


def _game_id_stem(raw: str) -> str:
    gid = str(raw or "").strip()
    if gid.startswith("lol-game-"):
        return gid[len("lol-game-") :]
    return gid


def _is_complete_record(path: Path) -> bool:
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    if len(record.get("players") or []) < 8:
        return False
    if record.get("source") == "cito_gapfill":
        return True
    length_s = record.get("gameLengthSeconds")
    if not length_s:
        return False
    return bool((record.get("qa") or {}).get("snapshotMinutes")) or length_s < 12 * 60


def _warehouse_index() -> tuple[set[str], dict[str, set[int]], dict[str, list[dict]]]:
    """Return (complete_game_ids, {series_id: game_numbers}, {series_id: records})."""
    complete_ids: set[str] = set()
    by_series_nums: dict[str, set[int]] = {}
    by_series: dict[str, list[dict]] = {}
    if not GAMES_DIR.exists():
        return complete_ids, by_series_nums, by_series
    for path in GAMES_DIR.glob("*.json"):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        sid = str(record.get("seriesMatchId") or "")
        by_series.setdefault(sid, []).append(record)
        if not _is_complete_record(path):
            continue
        complete_ids.add(path.stem)
        num = record.get("gameNumber")
        if isinstance(num, int):
            by_series_nums.setdefault(sid, set()).add(num)
    return complete_ids, by_series_nums, by_series


def _completed_series(rows: list[dict], days: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    from datetime import timedelta

    cutoff = now - timedelta(days=days)
    out = []
    for row in rows:
        if row.get("status") != "completed":
            continue
        ts = parse_ts(row.get("scheduled_at"))
        if ts is None or ts < cutoff or ts > now:
            continue
        out.append(row)
    out.sort(key=lambda r: r.get("scheduled_at") or "", reverse=True)
    return out


def find_gap_targets(rows: list[dict], days: int) -> list[dict]:
    """Completed series missing ≥1 expected game (or empty 0-0 stubs)."""
    complete_ids, _by_nums, by_series = _warehouse_index()
    targets = []
    for series in _completed_series(rows, days):
        sid = str(series.get("match_id") or "")
        expected = (series.get("team_a_score") or 0) + (series.get("team_b_score") or 0)
        games = by_series.get(sid, [])
        complete_count = sum(
            1 for g in games if str(g.get("gameId") or "") in complete_ids
        )
        if expected > 0:
            if complete_count < expected:
                targets.append(series)
            continue
        if complete_count == 0:
            targets.append(series)
    return targets


def _cito_get(path: str, api_key: str, timeout: int = 120) -> Any:
    req = urllib.request.Request(
        f"{CITO_BASE}{path}",
        headers={"Accept": "application/json", "x-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_cito_match_games(match_id: str, api_key: str) -> list[dict]:
    mid = _normalize_match_id(match_id)
    payload = _cito_get(f"/lol/matches/{urllib.parse.quote(mid, safe='')}/player-stats", api_key)
    data = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(data, list):
        return []
    return [g for g in data if isinstance(g, dict)]


def _role(raw: Any) -> str | None:
    s = str(raw or "").strip().lower()
    return ROLE_MAP.get(s)


def _at_minutes_from_cito(player: dict) -> dict:
    """Build sparse atMinutes from Cito advancedMetrics when present."""
    adv = player.get("advancedMetrics") if isinstance(player.get("advancedMetrics"), dict) else {}
    gd15 = _num(_pick(player, ["gd15", "goldDiffAt15"]) or adv.get("gd15"))
    csd15 = _num(_pick(player, ["csd15", "csDiffAt15"]) or adv.get("csd15"))
    if gd15 is None and csd15 is None:
        return {}
    entry: dict[str, Any] = {"skew_s": None}
    if gd15 is not None:
        entry["gold_diff"] = gd15
    if csd15 is not None:
        entry["cs_diff"] = csd15
    return {"15": entry}


def cito_game_to_record(series: dict, game: dict) -> dict | None:
    players_raw = game.get("players") or []
    if not isinstance(players_raw, list) or len(players_raw) < 8:
        return None

    game_id = _game_id_stem(str(_pick(game, ["gameId", "game_id", "id", "esportsApiId"]) or ""))
    if not game_id:
        return None

    teams_payload = game.get("teams") if isinstance(game.get("teams"), dict) else {}
    codes: list[str] = []
    for side in ("blue", "red"):
        t = teams_payload.get(side) or {}
        for key in ("shortName", "slug", "name"):
            v = t.get(key)
            if isinstance(v, str) and v.strip():
                codes.append(v.strip())

    winner_side = str(game.get("winningSide") or "").strip().lower()
    if winner_side not in ("blue", "red"):
        winner_side = None

    players: list[dict] = []
    for idx, raw in enumerate(players_raw):
        if not isinstance(raw, dict):
            continue
        side = str(_pick(raw, ["side", "teamSide", "color"]) or "").lower()
        if side not in ("blue", "red"):
            continue
        role = _role(_pick(raw, ["role", "position", "lane"]))
        if not role:
            continue
        team_obj = raw.get("team") if isinstance(raw.get("team"), dict) else {}
        team_name = str(
            _pick(raw, ["teamName", "teamname"])
            or team_obj.get("name")
            or ""
        )
        short = str(team_obj.get("shortName") or team_obj.get("slug") or "")
        local_codes = codes + ([short] if short else [])
        name = strip_team_prefix(
            str(_pick(raw, ["playerName", "summonerName", "name", "ign"]) or ""),
            local_codes,
        )
        if not name:
            continue
        result = 0
        if isinstance(raw.get("win"), bool):
            result = 1 if raw["win"] else 0
        elif winner_side:
            result = 1 if side == winner_side else 0
        kills = int(_num(raw.get("kills")) or 0)
        deaths = int(_num(raw.get("deaths")) or 0)
        assists = int(_num(raw.get("assists")) or 0)
        team_kills = _num((teams_payload.get(side) or {}).get("kills"))
        kp = None
        if isinstance(team_kills, (int, float)) and team_kills > 0:
            kp = (kills + assists) / team_kills
        dmg_share = _num(raw.get("damageShare"))
        if isinstance(dmg_share, (int, float)) and dmg_share > 1.5:
            dmg_share = dmg_share / 100.0
        players.append(
            {
                "participantId": idx + 1,
                "side": side,
                "role": role,
                "name": name,
                "esportsPlayerId": "",
                "champion": str(_pick(raw, ["champion", "championName"]) or ""),
                "teamName": team_name,
                "result": result,
                "kills": kills,
                "deaths": deaths,
                "assists": assists,
                "gold": int(_num(_pick(raw, ["gold", "totalGold"])) or 0),
                "cs": int(_num(raw.get("cs")) or 0),
                "killParticipation": kp,
                "damageShare": dmg_share,
                "wardsPlaced": int(_num(raw.get("wardsPlaced")) or 0),
                "wardsDestroyed": int(_num(raw.get("wardsDestroyed")) or 0),
                "level": _num(raw.get("level")),
                "atMinutes": _at_minutes_from_cito(raw),
            }
        )

    if len(players) < 8:
        return None

    teams_out: dict[str, dict] = {}
    for side in ("blue", "red"):
        t = teams_payload.get(side) or {}
        dragons_raw = t.get("dragons")
        if isinstance(dragons_raw, int):
            dragons = ["unknown"] * dragons_raw
        elif isinstance(dragons_raw, list):
            dragons = dragons_raw
        else:
            dragons = []
        teams_out[side] = {
            "name": t.get("name") or next((p["teamName"] for p in players if p["side"] == side), ""),
            "totalGold": _num(t.get("gold")),
            "kills": _num(t.get("kills")),
            "towers": _num(t.get("towers")),
            "barons": _num(t.get("barons")),
            "inhibitors": _num(t.get("inhibitors")),
            "dragons": dragons,
        }

    duration = _num(_pick(game, ["durationMinutes", "duration", "gameLength", "gameLengthMinutes"]))
    length_s = None
    if isinstance(duration, (int, float)) and duration > 0:
        # Heuristic: values > 90 are already seconds.
        length_s = int(duration if duration > 90 else duration * 60)

    scheduled = series.get("scheduled_at")
    snap_mins = sorted(
        {
            int(m)
            for p in players
            for m in (p.get("atMinutes") or {})
            if str(m).isdigit()
        }
    )

    return {
        "schemaVersion": 1,
        "source": "cito_gapfill",
        "gameId": game_id,
        "seriesMatchId": _normalize_match_id(str(series.get("match_id") or "")),
        "gameNumber": int(_num(game.get("gameNumber")) or 0) or None,
        "league": series.get("league") or "",
        "oeLeagueCode": OE_LEAGUE_CODE.get(str(series.get("league") or ""), series.get("league") or ""),
        "blockName": series.get("block_name") or series.get("blockName") or "",
        "bestOf": series.get("best_of") or series.get("bestOf"),
        "seriesScheduledAt": scheduled,
        "gameStart": scheduled,
        "gameEnd": None,
        "gameLengthSeconds": length_s,
        "patch": "",
        "winnerSide": winner_side,
        "teams": teams_out,
        "players": players,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "qa": {
            "gapFill": True,
            "gapFillSource": "cito",
            "snapshotMinutes": snap_mins,
            "snapshotSkews": {},
        },
    }


def gap_fill_uncovered(rows: list[dict], days: int) -> tuple[int, int, int]:
    """Fill missing warehouse games via Cito.

    Returns (new_games_written, series_attempted, series_still_uncovered).
    """
    api_key = os.environ.get("CITO_API_KEY", "").strip()
    if not api_key:
        print("  Cito gap-fill skipped (CITO_API_KEY not set)")
        return 0, 0, 0

    targets = find_gap_targets(rows, days)
    if not targets:
        print("  No uncovered series needing Cito gap-fill")
        return 0, 0, 0

    print(f"  Cito gap-fill for {len(targets)} uncovered/partial series...")
    GAMES_DIR.mkdir(parents=True, exist_ok=True)
    complete_ids, by_nums, _ = _warehouse_index()
    new_games = 0
    still_open = 0

    for series in targets:
        sid = str(series.get("match_id") or "")
        label = f"{series.get('league')} {series.get('team_a')} vs {series.get('team_b')}"
        expected = (series.get("team_a_score") or 0) + (series.get("team_b_score") or 0)
        try:
            cito_games = fetch_cito_match_games(sid, api_key)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            print(f"  ! gap-fill {label}: {err}")
            still_open += 1
            time.sleep(0.3)
            continue

        got = 0
        for game in cito_games:
            record = cito_game_to_record(series, game)
            if record is None:
                continue
            gid = str(record["gameId"])
            gnum = record.get("gameNumber")
            # Never overwrite a complete Riot (or prior complete) record.
            if gid in complete_ids:
                continue
            if isinstance(gnum, int) and gnum in by_nums.get(sid, set()):
                continue
            path = GAMES_DIR / f"{gid}.json"
            path.write_text(json.dumps(record, separators=(",", ":")), encoding="utf-8")
            complete_ids.add(gid)
            if isinstance(gnum, int):
                by_nums.setdefault(sid, set()).add(gnum)
            new_games += 1
            got += 1

        have = len(by_nums.get(sid, set()))
        if expected > 0 and have < expected and got == 0:
            still_open += 1
        elif expected == 0 and have == 0:
            still_open += 1
        print(
            f"  + gap-fill {label}: wrote {got} game(s) "
            f"(have={have}, expected={expected or '?'})"
        )
        time.sleep(0.25)

    return new_games, len(targets), still_open
