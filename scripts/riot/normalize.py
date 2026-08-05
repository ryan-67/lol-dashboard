"""Normalize Riot GW + Live Stats payloads into warehouse game records.

One record per completed game, slim enough to commit (data/riot/games/*.json):
teams (final box + objectives), 10 players (KDA/gold/CS/shares/wards + @minute
gold/CS diffs), and QA metadata. Downstream exporters turn these records into
OE-shaped supplement rows and player-stats cache rows.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from riot.client import OE_LEAGUE_CODE, parse_ts

# Live Stats championId keys → OE display names (camelCase split covers the rest).
CHAMPION_DISPLAY = {
    "AurelionSol": "Aurelion Sol",
    "Belveth": "Bel'Veth",
    "Chogath": "Cho'Gath",
    "DrMundo": "Dr. Mundo",
    "Fiddlesticks": "Fiddlesticks",
    "FiddleSticks": "Fiddlesticks",
    "JarvanIV": "Jarvan IV",
    "Kaisa": "Kai'Sa",
    "Khazix": "Kha'Zix",
    "KhaZix": "Kha'Zix",
    "KogMaw": "Kog'Maw",
    "KSante": "K'Sante",
    "Leblanc": "LeBlanc",
    "LeeSin": "Lee Sin",
    "MasterYi": "Master Yi",
    "MissFortune": "Miss Fortune",
    "MonkeyKing": "Wukong",
    "Nunu": "Nunu & Willump",
    "RekSai": "Rek'Sai",
    "Reksai": "Rek'Sai",
    "RenataGlasc": "Renata Glasc",
    "TahmKench": "Tahm Kench",
    "TwistedFate": "Twisted Fate",
    "Velkoz": "Vel'Koz",
    "VelKoz": "Vel'Koz",
    "XinZhao": "Xin Zhao",
}

ROLE_TO_OE = {
    "top": "top",
    "jungle": "jng",
    "mid": "mid",
    "bottom": "bot",
    "support": "sup",
}
ROLE_ORDER = ("top", "jungle", "mid", "bottom", "support")


def champion_display(key: str | None) -> str:
    raw = str(key or "").strip()
    if not raw:
        return ""
    if raw in CHAMPION_DISPLAY:
        return CHAMPION_DISPLAY[raw]
    # Generic camelCase split: "MissFortune" → "Miss Fortune".
    out: list[str] = []
    for i, ch in enumerate(raw):
        if i > 0 and ch.isupper() and not raw[i - 1].isupper():
            out.append(" ")
        out.append(ch)
    return "".join(out)


def strip_team_prefix(summoner_name: str, team_codes: list[str]) -> str:
    name = str(summoner_name or "").strip()
    codes = [str(c) for c in team_codes if c and len(str(c)) >= 2]
    parts = name.split(" ", 1)
    if len(parts) == 2 and any(parts[0].lower() == c.lower() for c in codes):
        return parts[1].strip()
    # LPL-style concatenated prefix: "BLGKnight" → "Knight", "TTKeshi" → "Keshi".
    for code in sorted(codes, key=len, reverse=True):
        if (
            len(name) > len(code) + 1
            and name[: len(code)].lower() == code.lower()
            and name[len(code)].isupper()
        ):
            return name[len(code):]
    return name


def _participant_meta(window: dict[str, Any]) -> tuple[dict[int, dict], dict[int, str]]:
    """{participantId: metadata}, {participantId: side}."""
    meta = window.get("gameMetadata") or {}
    by_id: dict[int, dict] = {}
    side_of: dict[int, str] = {}
    for side_key, side in (("blueTeamMetadata", "blue"), ("redTeamMetadata", "red")):
        for pm in (meta.get(side_key) or {}).get("participantMetadata") or []:
            pid = pm.get("participantId")
            if isinstance(pid, int):
                by_id[pid] = pm
                side_of[pid] = side
    return by_id, side_of


def _frame_participants(frame: dict[str, Any]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for side_key in ("blueTeam", "redTeam"):
        for p in (frame.get(side_key) or {}).get("participants") or []:
            pid = p.get("participantId")
            if isinstance(pid, int):
                out[pid] = p
    return out


def _role_pairs(meta_by_id: dict[int, dict], side_of: dict[int, str]) -> dict[int, int]:
    """participantId → opposing participantId (matched by role)."""
    by_side_role: dict[tuple[str, str], int] = {}
    for pid, pm in meta_by_id.items():
        role = str(pm.get("role") or "").lower()
        by_side_role[(side_of.get(pid, ""), role)] = pid
    pairs: dict[int, int] = {}
    for (side, role), pid in by_side_role.items():
        opp_side = "red" if side == "blue" else "blue"
        opp = by_side_role.get((opp_side, role))
        if opp is not None:
            pairs[pid] = opp
    return pairs


def _team_final(window_frame: dict[str, Any], side: str) -> dict[str, Any]:
    team = window_frame.get(f"{side}Team") or {}
    dragons = [str(d) for d in team.get("dragons") or []]
    return {
        "totalGold": team.get("totalGold"),
        "kills": team.get("totalKills"),
        "towers": team.get("towers"),
        "barons": team.get("barons"),
        "inhibitors": team.get("inhibitors"),
        "dragons": dragons,
    }


def infer_winner_side(blue: dict[str, Any], red: dict[str, Any]) -> str | None:
    """Final-frame heuristic: inhibitors, then towers, then gold, then kills."""
    for key in ("inhibitors", "towers", "totalGold", "kills"):
        b, r = blue.get(key), red.get(key)
        if isinstance(b, (int, float)) and isinstance(r, (int, float)) and b != r:
            return "blue" if b > r else "red"
    return None


def build_game_record(
    *,
    game_id: str,
    game_number: int | None,
    series: dict[str, Any],
    feed: dict[str, Any],
) -> dict[str, Any] | None:
    """series: schedule snapshot row (+ _team_codes); feed: fetch_game_feed output."""
    window = feed["window"]
    details = feed["details"]
    meta_by_id, side_of = _participant_meta(window)
    if len(meta_by_id) < 8:
        return None

    w_frames = window.get("frames") or []
    d_frames = details.get("frames") or []
    if not w_frames or not d_frames:
        return None
    final_w = w_frames[-1]
    final_d_parts = {p.get("participantId"): p for p in d_frames[-1].get("participants") or []}

    blue_final = _team_final(final_w, "blue")
    red_final = _team_final(final_w, "red")
    winner_side = infer_winner_side(blue_final, red_final)
    if winner_side is None:
        return None

    game_start = parse_ts(feed.get("game_start"))
    game_end = parse_ts(feed.get("game_end"))
    length_s = int((game_end - game_start).total_seconds()) if game_start and game_end else None
    if length_s is not None and length_s <= 0:
        length_s = None

    game_meta = window.get("gameMetadata") or {}
    team_codes = series.get("_team_codes") or []

    # Map esportsTeamId → schedule team label so warehouse names match cito rows.
    side_team_name: dict[str, str] = {}
    blue_meta_id = str((game_meta.get("blueTeamMetadata") or {}).get("esportsTeamId") or "")
    red_meta_id = str((game_meta.get("redTeamMetadata") or {}).get("esportsTeamId") or "")
    ids_by_side = {"blue": blue_meta_id, "red": red_meta_id}
    team_ids = series.get("_team_ids") or {}
    for side in ("blue", "red"):
        matched = None
        for label, tid in team_ids.items():
            if tid and tid == ids_by_side[side]:
                matched = label
                break
        side_team_name[side] = matched or ""
    if not side_team_name["blue"] or not side_team_name["red"]:
        # Fallback: prefix of summonerName is the team code.
        code_by_side: dict[str, str] = {}
        for pid, pm in meta_by_id.items():
            token = str(pm.get("summonerName") or "").split(" ", 1)[0]
            code_by_side.setdefault(side_of[pid], token)
        labels = {str(c).lower(): n for c, n in zip(team_codes, (series.get("team_a"), series.get("team_b"))) if c}
        for side in ("blue", "red"):
            if not side_team_name[side]:
                side_team_name[side] = labels.get(code_by_side.get(side, "").lower()) or code_by_side.get(side, "")

    pairs = _role_pairs(meta_by_id, side_of)
    snapshots = feed.get("snapshots") or {}

    players: list[dict[str, Any]] = []
    for pid in sorted(meta_by_id):
        pm = meta_by_id[pid]
        side = side_of[pid]
        stats = final_d_parts.get(pid) or {}
        role = str(pm.get("role") or "").lower()
        minutes = (length_s / 60.0) if length_s else None

        at_minutes: dict[str, Any] = {}
        for minute, snap in snapshots.items():
            frame_parts = _frame_participants(snap["frame"])
            me = frame_parts.get(pid) or {}
            opp = frame_parts.get(pairs.get(pid, -1)) or {}
            entry: dict[str, Any] = {"skew_s": snap["skew_s"]}
            for src_key, out_key in (("totalGold", "gold"), ("creepScore", "cs"), ("kills", "kills"), ("assists", "assists"), ("deaths", "deaths")):
                mine, theirs = me.get(src_key), opp.get(src_key)
                entry[out_key] = mine
                entry[f"opp_{out_key}"] = theirs
                if isinstance(mine, (int, float)) and isinstance(theirs, (int, float)):
                    entry[f"{out_key}_diff"] = mine - theirs
            at_minutes[str(minute)] = entry

        players.append(
            {
                "participantId": pid,
                "side": side,
                "role": role,
                "name": strip_team_prefix(pm.get("summonerName") or "", team_codes),
                "esportsPlayerId": pm.get("esportsPlayerId"),
                "champion": champion_display(pm.get("championId")),
                "teamName": side_team_name[side],
                "result": 1 if side == winner_side else 0,
                "kills": stats.get("kills"),
                "deaths": stats.get("deaths"),
                "assists": stats.get("assists"),
                "gold": stats.get("totalGoldEarned"),
                "cs": stats.get("creepScore"),
                "killParticipation": stats.get("killParticipation"),
                "damageShare": stats.get("championDamageShare"),
                "wardsPlaced": stats.get("wardsPlaced"),
                "wardsDestroyed": stats.get("wardsDestroyed"),
                "level": stats.get("level"),
                "atMinutes": at_minutes,
            }
        )

    league = str(series.get("league") or "")
    record = {
        "schemaVersion": 1,
        "gameId": str(game_id),
        "seriesMatchId": series.get("match_id"),
        "gameNumber": game_number,
        "league": league,
        "oeLeagueCode": OE_LEAGUE_CODE.get(league, league.upper()),
        "blockName": series.get("block_name"),
        "bestOf": series.get("best_of"),
        "seriesScheduledAt": series.get("scheduled_at"),
        "gameStart": feed.get("game_start"),
        "gameEnd": feed.get("game_end"),
        "gameLengthSeconds": length_s,
        "patch": game_meta.get("patchVersion"),
        "winnerSide": winner_side,
        "teams": {
            "blue": {"name": side_team_name["blue"], **blue_final},
            "red": {"name": side_team_name["red"], **red_final},
        },
        "players": players,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "qa": {
            "finalStamp": feed.get("final_stamp"),
            "snapshotMinutes": sorted(int(m) for m in snapshots),
            "snapshotSkews": {str(m): s["skew_s"] for m, s in snapshots.items()},
        },
    }
    return record
