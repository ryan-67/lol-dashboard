"""Live Stats paging: game-start discovery, final meaningful frames, @minute snapshots.

Live Stats quirks (from the .tmp probes, docs/nucky_v4.md §8):
  - ``startingTime`` must be rounded (we floor to the minute) and in the past
  - a stamp before the feed exists → HTTP error; after game end → final frames
  - series events share one ``startTime`` — game 2+ starts much later, so
    @10/15/20/25 sampling MUST anchor to the discovered per-game start
  - empty/placeholder frames exist: a "meaningful" final frame needs ≥8
    participants and >10k total gold
"""

from __future__ import annotations

import urllib.error
from datetime import datetime, timedelta, timezone
from typing import Any

from riot.client import livestats, parse_ts, iso_z

SNAPSHOT_MINUTES = (10, 15, 20, 25)
MAX_SKEW_SECONDS = 90


def _floor_minute(dt: datetime) -> datetime:
    return dt.replace(second=0, microsecond=0)


def _try_window(game_id: str, stamp: datetime) -> list[dict[str, Any]] | None:
    try:
        data = livestats("window", game_id, iso_z(_floor_minute(stamp)))
    except (urllib.error.HTTPError, Exception):  # noqa: BLE001
        return None
    frames = data.get("frames") or []
    return frames or None


def discover_game_start(game_id: str, event_start: datetime) -> datetime | None:
    """Find the earliest available frame timestamp for this game's feed.

    Walk forward from the event (series) start until the feed responds, then
    step back toward the true feed start. Bounded at ~20 requests.
    """
    first_frames: list[dict[str, Any]] | None = None
    probe = event_start - timedelta(minutes=5)
    for _ in range(30):  # up to ~5h after series start (long Bo5s)
        frames = _try_window(game_id, probe)
        if frames:
            first_frames = frames
            break
        probe += timedelta(minutes=10)
    if not first_frames:
        return None

    earliest = parse_ts(first_frames[0].get("rfc460Timestamp"))
    if earliest is None:
        return None

    # Step back while the feed still answers with earlier frames.
    for _ in range(8):
        frames = _try_window(game_id, earliest - timedelta(minutes=8))
        if not frames:
            break
        candidate = parse_ts(frames[0].get("rfc460Timestamp"))
        if candidate is None or candidate >= earliest:
            break
        earliest = candidate
    return earliest


def fetch_finished_frames(game_id: str, game_start: datetime) -> tuple[dict[str, Any], dict[str, Any], str] | None:
    """Locate the post-game feed page and return (window, details, stamp).

    A stamp past the game's end always returns the final page, whose last frame
    carries ``gameState == "finished"`` — the only trustworthy final box score
    (mid-game and lobby frames can otherwise pass naive "meaningful" checks).
    """
    now = datetime.now(timezone.utc)
    stamp_dt = min(now - timedelta(minutes=2), game_start + timedelta(hours=5))
    for _ in range(6):  # pause-heavy marathons: walk forward up to 'now'
        stamp = iso_z(_floor_minute(stamp_dt))
        try:
            window = livestats("window", game_id, stamp)
        except Exception:  # noqa: BLE001
            window = None
        frames = (window or {}).get("frames") or []
        finished = next(
            (f for f in reversed(frames) if str(f.get("gameState") or "").lower() == "finished"),
            None,
        )
        if finished is not None:
            blue_gold = ((finished.get("blueTeam") or {}).get("totalGold")) or 0
            red_gold = ((finished.get("redTeam") or {}).get("totalGold")) or 0
            if blue_gold + red_gold < 20_000:
                return None  # remake/void — not a real final
            try:
                details = livestats("details", game_id, stamp)
            except Exception:  # noqa: BLE001
                return None
            d_frames = details.get("frames") or []
            parts = (d_frames[-1].get("participants") if d_frames else []) or []
            if len(parts) < 8:
                return None
            return window, details, stamp
        if stamp_dt >= now - timedelta(minutes=3):
            return None  # feed still live / never finished
        stamp_dt = min(now - timedelta(minutes=2), stamp_dt + timedelta(minutes=45))
    return None


def _nearest_frame(frames: list[dict[str, Any]], target: datetime) -> tuple[dict[str, Any] | None, float]:
    best: dict[str, Any] | None = None
    best_skew = float("inf")
    for frame in frames:
        ts = parse_ts(frame.get("rfc460Timestamp"))
        if ts is None:
            continue
        skew = abs((ts - target).total_seconds())
        if skew < best_skew:
            best, best_skew = frame, skew
    return best, best_skew


def collect_minute_snapshots(
    game_id: str, game_start: datetime, game_end: datetime | None
) -> dict[int, dict[str, Any]]:
    """Window frames nearest to game_start + {10,15,20,25} minutes.

    Returns {minute: {"frame": window_frame, "skew_s": float}} for minutes that
    fall inside the game and answered with frames within MAX_SKEW_SECONDS.
    """
    out: dict[int, dict[str, Any]] = {}
    for minute in SNAPSHOT_MINUTES:
        target = game_start + timedelta(minutes=minute)
        if game_end is not None and target > game_end:
            continue
        frames = _try_window(game_id, target) or []
        frame, skew = _nearest_frame(frames, target)
        if frame is None or skew > MAX_SKEW_SECONDS:
            # One retry a minute later — window pages are ~10 frames wide.
            frames = _try_window(game_id, target + timedelta(minutes=1)) or []
            frame, skew = _nearest_frame(frames, target)
        if frame is not None and skew <= MAX_SKEW_SECONDS:
            out[minute] = {"frame": frame, "skew_s": round(skew, 1)}
    return out


def fetch_game_feed(game_id: str, event_start: datetime) -> dict[str, Any] | None:
    """Full feed bundle for one completed game (details + window + snapshots).

    Order matters: discover the per-game start first (series events share one
    startTime), then anchor both the final page and the @minute snapshots to it.
    """
    game_start = discover_game_start(game_id, event_start)
    if game_start is None:
        return None

    finished = fetch_finished_frames(game_id, game_start)
    if finished is None:
        return None
    window, details, stamp = finished

    w_frames = window.get("frames") or []
    game_end = parse_ts(w_frames[-1].get("rfc460Timestamp")) if w_frames else None
    if game_end is not None and game_end <= game_start:
        return None
    snapshots = collect_minute_snapshots(game_id, game_start, game_end)
    return {
        "details": details,
        "window": window,
        "final_stamp": stamp,
        "game_start": iso_z(game_start),
        "game_end": iso_z(game_end) if game_end else None,
        "snapshots": snapshots,
    }
