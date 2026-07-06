"""
Group individual OE games into Bo3/Bo5 series — Python port of
src/lib/seriesGrouping.ts, kept behaviorally identical so the ML feature mart's
series grain matches what nucky.gg's recap/series pages consider one series.

Algorithm: pair games by (winner, loser) canonical team pair, cluster by date,
search game-id-ordinal permutations for a valid Bo3/Bo5 win progression, then
split into series buckets whenever the day gap exceeds SERIES_GAP_DAYS or the
series already reached a valid terminal score.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from itertools import permutations

SERIES_GAP_DAYS = 5
_MAX_PERM_GAMES = 7  # matches the TS guard against permutation blowup

_TAIL_NUM_RE = re.compile(r"[_-](\d+)$")
_EMBEDDED_GAME_RE = re.compile(r"game[_-]?(\d+)", re.IGNORECASE)


@dataclass
class ChronoGame:
    id: str
    game_date: date
    winner: str
    loser: str
    payload: dict = field(default_factory=dict)


@dataclass
class SeriesBucket:
    team_a: str
    team_b: str
    games: list[ChronoGame]
    session_index: int


def series_key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


def canonical_series_teams(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted([a, b]))  # type: ignore[return-value]


def days_between(a: date, b: date) -> float:
    return abs((a - b).days)


def game_ordinal_from_id(gid: str) -> int:
    tail = _TAIL_NUM_RE.search(gid)
    if tail:
        return int(tail.group(1))
    embedded = _EMBEDDED_GAME_RE.search(gid)
    if embedded:
        return int(embedded.group(1))
    return 0


def compare_series_games(a: ChronoGame, b: ChronoGame) -> int:
    if a.game_date != b.game_date:
        return -1 if a.game_date < b.game_date else 1
    oa, ob = game_ordinal_from_id(a.id), game_ordinal_from_id(b.id)
    if oa != ob:
        return -1 if oa < ob else 1
    return -1 if a.id < b.id else (1 if a.id > b.id else 0)


def _sort_key(g: ChronoGame):
    return (g.game_date, game_ordinal_from_id(g.id), g.id)


def count_series_wins(games: list[ChronoGame], team: str) -> int:
    return sum(1 for g in games if g.winner == team)


def is_valid_series_score(w_a: int, w_b: int) -> bool:
    hi, lo = max(w_a, w_b), min(w_a, w_b)
    if hi >= 3:
        return hi == 3 and lo <= 2
    if hi == 2:
        return lo <= 1
    return False


def is_valid_game_order(games: list[ChronoGame], team_a: str, team_b: str) -> bool:
    w_a = w_b = 0
    for i, g in enumerate(games):
        if g.winner == team_a:
            w_a += 1
        elif g.winner == team_b:
            w_b += 1
        else:
            return False
        if w_a == 3 or w_b == 3:
            return i == len(games) - 1
    return is_valid_series_score(w_a, w_b)


def _order_distance(a: list[ChronoGame], b: list[ChronoGame]) -> int:
    index_b = {g.id: i for i, g in enumerate(b)}
    return sum(abs(i - index_b.get(g.id, i)) for i, g in enumerate(a))


def order_series_games(games: list[ChronoGame], team_a: str, team_b: str) -> list[ChronoGame]:
    if len(games) <= 1:
        return games
    by_id = sorted(games, key=_sort_key)
    if is_valid_game_order(by_id, team_a, team_b):
        return by_id
    if len(by_id) > _MAX_PERM_GAMES:
        return by_id
    valid = [list(p) for p in permutations(by_id) if is_valid_game_order(list(p), team_a, team_b)]
    if not valid:
        return by_id
    valid.sort(key=lambda order: _order_distance(order, by_id))
    return valid[0]


def _cluster_by_date(games: list[ChronoGame]) -> list[list[ChronoGame]]:
    sorted_games = sorted(games, key=_sort_key)
    clusters: list[list[ChronoGame]] = []
    current: list[ChronoGame] = []
    for g in sorted_games:
        if not current or current[-1].game_date == g.game_date:
            current.append(g)
        else:
            clusters.append(current)
            current = [g]
    if current:
        clusters.append(current)
    return clusters


def is_series_complete(
    games: list[ChronoGame],
    team_a: str,
    team_b: str,
    next_game: ChronoGame | None = None,
) -> bool:
    w_a = count_series_wins(games, team_a)
    w_b = count_series_wins(games, team_b)
    hi, lo, total = max(w_a, w_b), min(w_a, w_b), w_a + w_b

    if hi == 3:
        return True
    if hi != 2 or not is_valid_series_score(w_a, w_b):
        return False

    bo5_in_progress = (total == 2 and lo == 0) or (total == 3 and lo == 1)
    if not bo5_in_progress:
        return True
    if next_game is None:
        return True
    if days_between(games[-1].game_date, next_game.game_date) > SERIES_GAP_DAYS:
        return True

    day_gap = days_between(games[-1].game_date, next_game.game_date)
    if day_gap >= 1 and total == 3 and lo == 1:
        return True
    return False


def _should_break_series(
    bucket_games: list[ChronoGame], new_game: ChronoGame, team_a: str, team_b: str
) -> bool:
    if not bucket_games:
        return False
    last = bucket_games[-1]
    if days_between(last.game_date, new_game.game_date) > SERIES_GAP_DAYS:
        return True
    return is_series_complete(bucket_games, team_a, team_b, new_game)


def _split_pair_games_into_series(games: list[ChronoGame]) -> list[SeriesBucket]:
    if not games:
        return []
    sorted_games = sorted(games, key=_sort_key)
    team_a, team_b = canonical_series_teams(sorted_games[0].winner, sorted_games[0].loser)

    ordered_games: list[ChronoGame] = []
    for cluster in _cluster_by_date(sorted_games):
        ordered_games.extend(order_series_games(cluster, team_a, team_b))

    buckets: list[SeriesBucket] = []
    current: list[ChronoGame] = []
    session_index = 0
    for g in ordered_games:
        if not current:
            current = [g]
            continue
        if _should_break_series(current, g, team_a, team_b):
            buckets.append(SeriesBucket(team_a, team_b, current, session_index))
            session_index += 1
            current = [g]
        else:
            current.append(g)
    if current:
        buckets.append(SeriesBucket(team_a, team_b, current, session_index))
    return buckets


def group_games_into_series(games: list[ChronoGame]) -> list[SeriesBucket]:
    """Split chronologically sorted individual games into separate Bo3/Bo5 series."""
    if not games:
        return []
    by_pair: dict[str, list[ChronoGame]] = {}
    for g in sorted(games, key=_sort_key):
        a, b = canonical_series_teams(g.winner, g.loser)
        by_pair.setdefault(series_key(a, b), []).append(g)

    buckets: list[SeriesBucket] = []
    for pair_games in by_pair.values():
        buckets.extend(_split_pair_games_into_series(pair_games))

    buckets.sort(key=lambda bkt: _sort_key(bkt.games[0]))
    return buckets
