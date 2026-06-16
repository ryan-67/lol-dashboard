"""
LPL per-game solo-kill enrichment via Tencent tjstats (open.tjstats.com).

Oracle's Elixir and gol.gg do not ship LPL solo-kill columns. tjstats exposes them only
on /event/heroKill (kills with empty assistants). The public lpl.qq.com Authorization key
works for matchDetail but not event endpoints — set TJSTATS_AUTHORIZATION or
TJSTATS_APP_ID + TJSTATS_SECRET for heroKill access.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT / "public" / "data" / "lpl_tjstats_cache.json"
BASE_URL = "https://open.tjstats.com/match-auth-app/open/v1"
PUBLIC_AUTH = "7935be4c41d8760a28c05581a7b1f570"
USER_AGENT = "nucky-dashboard-ingest/1.0"

GAME_ID_RE = re.compile(r"^(\d+)-\d+_game_(\d+)$", re.I)
BMID_RE = re.compile(r"[?&]bmid=(\d+)", re.I)

PARTICIPANT_TO_LOC = {1: "TOP", 2: "JUN", 3: "MID", 4: "BOT", 5: "SUP"}

# OE full name -> gol.gg / tjstats abbreviations (subset of enrich_gol_advanced_stats)
TEAM_ALIASES: dict[str, set[str]] = {
    "Bilibili Gaming": {"BLG"},
    "Weibo Gaming": {"WBG"},
    "Top Esports": {"TES"},
    "JD Gaming": {"JDG"},
    "Anyone's Legend": {"AL"},
    "LNG Esports": {"LNG"},
    "Invictus Gaming": {"IG"},
    "EDward Gaming": {"EDG"},
    "FunPlus Phoenix": {"FPX"},
    "LGD Gaming": {"LGD"},
    "Ninjas in Pyjamas": {"NIP"},
    "Team WE": {"WE"},
    "Ultra Prime": {"UP"},
    "ThunderTalk Gaming": {"TT"},
    "Oh My God": {"OMG"},
    "Rare Atom": {"RA"},
}


def _normalize_champion(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _normalize_name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _team_prefixes(team: str) -> set[str]:
    keys = {_normalize_name_key(team)}
    for canonical, aliases in TEAM_ALIASES.items():
        pool = {canonical, *aliases}
        if team in pool or _normalize_name_key(team) in {_normalize_name_key(a) for a in pool}:
            for label in pool:
                keys.add(_normalize_name_key(label))
    return {k for k in keys if k}


def strip_team_prefix(player_name: str, prefixes: set[str]) -> str:
    raw = (player_name or "").strip()
    key = _normalize_name_key(raw)
    for prefix in sorted(prefixes, key=len, reverse=True):
        if prefix and key.startswith(prefix) and len(key) > len(prefix):
            suffix = key[len(prefix) :]
            for i in range(len(raw)):
                if _normalize_name_key(raw[i:]) == suffix:
                    return raw[i:]
            return suffix
    return raw


def parse_lpl_game_ref(game_id: str = "", url: str = "") -> tuple[int, int] | None:
    """Parse (matchId, bo) from OE gameid or lpl.qq bmid URL."""
    gid = (game_id or "").strip()
    match = GAME_ID_RE.match(gid)
    if match:
        return int(match.group(1)), int(match.group(2))
    url_match = BMID_RE.search(url or "")
    if url_match and gid:
        bo_match = re.search(r"_game_(\d+)$", gid, re.I)
        if bo_match:
            return int(url_match.group(1)), int(bo_match.group(1))
    return None


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")


def _api_request(path: str, auth: str, method: str = "GET", body: dict | None = None) -> dict:
    headers = {
        "Authorization": auth,
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(BASE_URL + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))


def login_by_app_id(app_id: str, secret: str) -> str:
    payload = _api_request(
        "/account/loginByAppId",
        auth=PUBLIC_AUTH,
        method="POST",
        body={"appId": app_id, "secret": secret},
    )
    if not payload.get("success"):
        raise RuntimeError(payload.get("errMsg") or "tjstats loginByAppId failed")
    data = payload.get("data") or {}
    token = data.get("authorization") or ""
    if not token:
        raise RuntimeError("tjstats loginByAppId returned no authorization JWT")
    return token


def resolve_authorization() -> tuple[str, bool]:
    """
    Return (token, can_access_events).
    Public lpl.qq key can read matchDetail only; event/* needs a JWT from loginByAppId.
    """
    explicit = (os.environ.get("TJSTATS_AUTHORIZATION") or "").strip()
    if explicit:
        return explicit, True

    app_id = (os.environ.get("TJSTATS_APP_ID") or "").strip()
    secret = (os.environ.get("TJSTATS_SECRET") or "").strip()
    if app_id and secret:
        return login_by_app_id(app_id, secret), True

    return PUBLIC_AUTH, False


def fetch_match_detail(match_id: int, auth: str, cache: dict, delay_s: float = 0.12) -> dict:
    key = f"match:{match_id}"
    if key in cache:
        return cache[key]
    payload = _api_request(f"/compound/matchDetail?matchId={match_id}", auth=auth)
    if not payload.get("success"):
        raise RuntimeError(payload.get("errMsg") or f"matchDetail {match_id} failed")
    detail = payload.get("data") or {}
    cache[key] = detail
    if delay_s:
        time.sleep(delay_s)
    return detail


def fetch_hero_kill(match_id: int, bo: int, auth: str, cache: dict, delay_s: float = 0.12) -> dict | None:
    key = f"heroKill:{match_id}:{bo}"
    if key in cache:
        return cache[key]
    try:
        payload = _api_request(f"/event/heroKill?matchId={match_id}&bo={bo}", auth=auth)
    except urllib.error.HTTPError as err:
        cache[key] = {"error": str(err), "heroKillDetail": []}
        return cache[key]
    if not payload.get("success"):
        cache[key] = {"error": payload.get("errMsg"), "heroKillDetail": []}
        return cache[key]
    data = payload.get("data") or {}
    cache[key] = data
    if delay_s:
        time.sleep(delay_s)
    return data


def _is_solo_kill(detail: dict) -> bool:
    assistants = detail.get("assistants") or []
    assistant_ids = detail.get("assistantIds") or []
    return len(assistants) == 0 and len(assistant_ids) == 0


def _killer_location(detail: dict) -> str:
    loc = (detail.get("killerParticipantLocation") or "").strip().upper()
    if loc:
        return loc
    pid = detail.get("killerParticipantId")
    if isinstance(pid, int):
        return PARTICIPANT_TO_LOC.get(pid, "")
    return ""


def _game_info(match_detail: dict, bo: int) -> dict | None:
    for info in match_detail.get("matchInfos") or []:
        if info.get("bo") == bo:
            return info
    return None


def _roster_for_game(match_detail: dict, bo: int) -> dict[tuple[int, str], dict]:
    """Map (side 1=blue/2=red, location) -> playerInfo."""
    game = _game_info(match_detail, bo)
    if not game:
        return {}
    blue_team_id = game.get("blueTeam")
    roster: dict[tuple[int, str], dict] = {}
    for team_info in game.get("teamInfos") or []:
        team_id = team_info.get("teamId")
        side = 1 if team_id == blue_team_id else 2
        for player in team_info.get("playerInfos") or []:
            loc = (player.get("playerLocation") or "").upper()
            if loc:
                roster[(side, loc)] = player
    return roster


def solo_kills_from_hero_kill(match_detail: dict, bo: int, hero_kill: dict) -> dict[str, int]:
    """Return {normalized_player_name: solo_kills} for one game."""
    roster = _roster_for_game(match_detail, bo)
    if not roster:
        return {}

    team_names = {
        ti.get("teamName", "")
        for gi in [(_game_info(match_detail, bo) or {})]
        for ti in gi.get("teamInfos") or []
    }
    prefixes = set()
    for name in team_names:
        prefixes |= _team_prefixes(name)

    counts: dict[str, int] = defaultdict(int)
    details = hero_kill.get("heroKillDetail") or []
    for detail in details:
        if not _is_solo_kill(detail):
            continue
        side = int(detail.get("killerPlaceId") or 0)
        loc = _killer_location(detail)
        if side not in (1, 2) or not loc:
            continue
        player = roster.get((side, loc))
        if not player:
            continue
        display = strip_team_prefix(player.get("playerName", ""), prefixes)
        key = _normalize_name_key(display)
        if key:
            counts[key] += 1
    return dict(counts)


def _oe_name_matches(oe_name: str, team: str, solo_key: str) -> bool:
    oe_key = _normalize_name_key(oe_name)
    if oe_key == solo_key:
        return True
    for prefix in _team_prefixes(team):
        if oe_key == prefix + solo_key or solo_key == prefix + oe_key:
            return True
    return False


def _lookup_solo_kills(
    oe_name: str,
    oe_team: str,
    oe_champion: str,
    solo_by_name: dict[str, int],
    match_detail: dict,
    bo: int,
) -> int | None:
    champ_key = _normalize_champion(oe_champion)
    for solo_key, count in solo_by_name.items():
        if not _oe_name_matches(oe_name, oe_team, solo_key):
            continue
        if champ_key and match_detail:
            game = _game_info(match_detail, bo)
            champ_ok = False
            if game:
                for ti in game.get("teamInfos") or []:
                    prefixes = _team_prefixes(ti.get("teamName", ""))
                    for pi in ti.get("playerInfos") or []:
                        pname = strip_team_prefix(pi.get("playerName", ""), prefixes)
                        if _normalize_name_key(pname) != solo_key:
                            continue
                        hero = _normalize_champion(pi.get("heroNameEn") or pi.get("heroName") or "")
                        if hero == champ_key:
                            champ_ok = True
                            break
                    if champ_ok:
                        break
            if not champ_ok:
                continue
        return count
    return None


def collect_lpl_game_refs(players: list[dict]) -> set[tuple[int, int]]:
    refs: set[tuple[int, int]] = set()
    for player in players:
        for game in player.get("gameLog") or []:
            if (game.get("league") or "").upper() != "LPL":
                continue
            ref = parse_lpl_game_ref(game.get("gameId", ""), game.get("url", ""))
            if ref:
                refs.add(ref)
    return refs


def build_solo_kill_index(
    game_refs: set[tuple[int, int]],
    auth: str,
    can_events: bool,
    cache: dict,
    verbose: bool = True,
) -> dict[tuple[int, int], dict[str, int]]:
    index: dict[tuple[int, int], dict[str, int]] = {}
    if not game_refs:
        return index

    match_ids = sorted({mid for mid, _ in game_refs})
    if verbose:
        print(f"  LPL tjstats: {len(game_refs)} games across {len(match_ids)} matches")

    if not can_events:
        if verbose:
            print(
                "  LPL tjstats: heroKill requires TJSTATS_AUTHORIZATION or "
                "TJSTATS_APP_ID + TJSTATS_SECRET (public lpl.qq key cannot access events)"
            )
        return index

    denied = 0
    for match_id in match_ids:
        try:
            detail = fetch_match_detail(match_id, auth, cache)
        except (urllib.error.URLError, RuntimeError) as err:
            if verbose:
                print(f"  LPL tjstats: matchDetail {match_id} failed: {err}")
            continue

        for mid, bo in sorted(game_refs):
            if mid != match_id:
                continue
            cache_key = f"solo:{mid}:{bo}"
            if cache_key in cache:
                index[(mid, bo)] = cache[cache_key]
                continue

            hero_kill = fetch_hero_kill(mid, bo, auth, cache)
            err = (hero_kill or {}).get("error")
            if err == "AuthorizationDenied":
                denied += 1
                if denied == 1 and verbose:
                    print("  LPL tjstats: heroKill AuthorizationDenied — check TJSTATS credentials")
                continue
            solo = solo_kills_from_hero_kill(detail, bo, hero_kill or {})
            cache[cache_key] = solo
            index[(mid, bo)] = solo

    return index


def enrich_lpl_players(
    players: list[dict],
    solo_index: dict[tuple[int, int], dict[str, int]],
    match_cache: dict,
) -> int:
    patched = 0
    for player in players:
        game_log = player.get("gameLog") or []
        if not game_log:
            continue
        for game in game_log:
            if (game.get("league") or "").upper() != "LPL":
                continue
            ref = parse_lpl_game_ref(game.get("gameId", ""), game.get("url", ""))
            if not ref:
                continue
            solo_map = solo_index.get(ref)
            if not solo_map:
                continue
            match_id, bo = ref
            detail = match_cache.get(f"match:{match_id}") or {}
            count = _lookup_solo_kills(
                player.get("name", ""),
                player.get("team", ""),
                game.get("champion", ""),
                solo_map,
                detail,
                bo,
            )
            if count is not None:
                game["soloKills"] = count
                patched += 1

        games = player.get("games") or len(game_log) or 0
        if games > 0 and any((g.get("league") or "").upper() == "LPL" for g in game_log):
            player["soloKills"] = round(sum(g.get("soloKills", 0) for g in game_log) / games, 2)
    return patched


def enrich_lpl_solo_kills(shard_path: Path, verbose: bool = True) -> int:
    if not shard_path.exists():
        raise FileNotFoundError(shard_path)

    payload = json.loads(shard_path.read_text(encoding="utf-8"))
    slices = payload.get("slices") or {}

    all_players: list[dict] = []
    for slice_data in slices.values():
        all_players.extend(slice_data.get("players") or [])

    game_refs = collect_lpl_game_refs(all_players)
    if not game_refs:
        if verbose:
            print("  LPL tjstats: no LPL game refs found in shard")
        return 0

    auth, can_events = resolve_authorization()
    cache = load_cache()
    solo_index = build_solo_kill_index(game_refs, auth, can_events, cache, verbose=verbose)
    save_cache(cache)

    total = 0
    for slice_data in slices.values():
        total += enrich_lpl_players(slice_data.get("players") or [], solo_index, cache)

    shard_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    if verbose:
        print(f"  LPL tjstats: patched {total} game-log rows in {shard_path.name}")
    return total
