#!/usr/bin/env python3
"""
Build a lean hub bootstrap JSON from OE year shards.

Hub / Board first paint should not wait on ~40 MB year parts. This export keeps
player/team aggregates + recent form (last N days) + a deduped window gameCatalog.

Usage:
    python scripts/build_hub_bootstrap.py
    python scripts/build_hub_bootstrap.py --year 2026 --form-days 45

Writes: public/data/hub_bootstrap.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"
MANIFEST_PATH = PUBLIC_DATA / "oe_slices.json"
OUT_PATH = PUBLIC_DATA / "hub_bootstrap.json"

TIER1 = ("LCK", "LPL", "LEC", "LCS")
INTL = ("MSI", "WLDs", "Worlds", "FST", "First Stand", "EWC", "INT")


def _parse_day(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _filenames_for_year(ref) -> list[str]:
    if isinstance(ref, list):
        return [str(x) for x in ref]
    if isinstance(ref, str):
        return [ref]
    return []


def load_year_slices(year: str, manifest: dict) -> dict:
    refs = (manifest.get("year_files") or {}).get(year)
    filenames = _filenames_for_year(refs)
    if not filenames:
        raise SystemExit(f"No year_files for {year} in {MANIFEST_PATH}")

    slices: dict = {}
    for name in filenames:
        path = PUBLIC_DATA / name
        if not path.exists():
            raise SystemExit(f"Missing shard part: {path}")
        print(f"  reading {name} ({path.stat().st_size / 1e6:.1f} MB)…", file=sys.stderr)
        body = json.loads(path.read_text(encoding="utf-8"))
        part = body.get("slices") or {}
        slices.update(part)
    print(f"  loaded {len(slices)} slices", file=sys.stderr)
    return slices


def player_key(p: dict) -> str:
    return f"{p.get('name', '')}|{p.get('team', '')}|{p.get('position', '')}|{p.get('league', '')}"


def slim_game(g: dict) -> dict:
    """Keep fields Overview / Form need; drop unused bulk."""
    keep = (
        "date",
        "result",
        "champion",
        "opponent",
        "gameId",
        "kda",
        "kp",
        "dmgShare",
        "gd15",
        "csd15",
        "xpd15",
        "dpm",
        "visionScore",
        "goldShare",
        "firstBloodRate",
        "firstBloodVictim",
        "objControl",
        "turretPlates",
        "campsStolen",
        "wardsDestroyed",
        "kaPerMin",
        "dmgGoldRatio",
        "dmgPerGold",
        "gpm",
        "side",
        "split",
        "league",
        "rawSplit",
        "oeYear",
        "gameLength",
        "playoffs",
        "kills",
        "deaths",
        "assists",
        "totalCs",
    )
    return {k: g[k] for k in keep if k in g}


def build_bootstrap(year: str, form_days: int, max_form_games: int) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    meta = dict(manifest.get("meta") or {})
    slices = load_year_slices(year, manifest)

    # Find as-of from all gameLog dates
    as_of: datetime | None = None
    for slice_data in slices.values():
        for p in slice_data.get("players") or []:
            for g in p.get("gameLog") or []:
                d = _parse_day(g.get("date"))
                if d and (as_of is None or d > as_of):
                    as_of = d
    if as_of is None:
        as_of = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = as_of - timedelta(days=form_days)
    cutoff_s = cutoff.strftime("%Y-%m-%d")
    as_of_s = as_of.strftime("%Y-%m-%d")

    players_acc: dict[str, dict] = {}
    teams_acc: dict[str, dict] = {}
    champs_acc: dict[str, dict] = {}
    catalog: dict[str, dict] = {}
    window_game_ids: set[str] = set()

    for key, slice_data in slices.items():
        if "|" not in key:
            continue
        split_label, league = key.split("|", 1)
        if not split_label.startswith(f"{year} "):
            continue
        if league not in TIER1 and league not in INTL:
            continue

        for p in slice_data.get("players") or []:
            pk = player_key(p)
            logs = p.get("gameLog") or []
            recent = [
                slim_game(g)
                for g in logs
                if isinstance(g, dict) and str(g.get("date", ""))[:10] >= cutoff_s
            ]
            # Prefer chronological order; keep last N if still large
            recent.sort(key=lambda g: str(g.get("date", "")))
            if len(recent) > max_form_games:
                recent = recent[-max_form_games:]

            for g in recent:
                gid = g.get("gameId")
                if gid:
                    window_game_ids.add(str(gid))

            existing = players_acc.get(pk)
            if existing is None:
                row = {k: v for k, v in p.items() if k not in ("gameLog", "championPool")}
                # Small champion pool for Players tab context
                pool = p.get("championPool") or []
                row["championPool"] = pool[:8] if isinstance(pool, list) else []
                row["gameLog"] = recent
                row["lastGameDate"] = recent[-1]["date"][:10] if recent else None
                players_acc[pk] = row
            else:
                # Merge recent forms (dedupe by gameId|date|champ)
                seen = {
                    f"{g.get('gameId')}|{g.get('date')}|{g.get('champion')}"
                    for g in existing.get("gameLog") or []
                }
                merged = list(existing.get("gameLog") or [])
                for g in recent:
                    sig = f"{g.get('gameId')}|{g.get('date')}|{g.get('champion')}"
                    if sig in seen:
                        continue
                    seen.add(sig)
                    merged.append(g)
                merged.sort(key=lambda g: str(g.get("date", "")))
                if len(merged) > max_form_games:
                    merged = merged[-max_form_games:]
                existing["gameLog"] = merged
                existing["lastGameDate"] = merged[-1]["date"][:10] if merged else existing.get("lastGameDate")
                # Prefer higher games count aggregates
                if (p.get("games") or 0) > (existing.get("games") or 0):
                    for k, v in p.items():
                        if k in ("gameLog", "championPool"):
                            continue
                        existing[k] = v

        for t in slice_data.get("teams") or []:
            name = t.get("name")
            if not name:
                continue
            tk = f"{name}|{t.get('league', '')}"
            prev = teams_acc.get(tk)
            if prev is None or (t.get("games") or 0) > (prev.get("games") or 0):
                teams_acc[tk] = dict(t)

        for c in slice_data.get("champions") or []:
            name = c.get("name")
            if not name:
                continue
            weeks = c.get("weeklyStats") or []
            # Keep last 8 week buckets only
            if isinstance(weeks, list) and len(weeks) > 8:
                weeks = sorted(weeks, key=lambda w: str(w.get("weekStart", "")))[-8:]
            slim = {k: v for k, v in c.items() if k not in ("gameDates", "sparkline", "weeklyStats")}
            slim["weeklyStats"] = weeks
            # Drop long gameDates — rising/falling can use weeklyStats
            prev = champs_acc.get(name)
            if prev is None or (c.get("picks") or 0) > (prev.get("picks") or 0):
                champs_acc[name] = slim

        # Collect catalog entries for window games only (dedupe by gameId)
        gc = slice_data.get("gameCatalog") or {}
        for gid, entry in gc.items():
            if gid in window_game_ids and gid not in catalog:
                catalog[gid] = entry

    # Second pass: catalog may list games we filtered after first league — fill any missed
    if window_game_ids:
        for slice_data in slices.values():
            gc = slice_data.get("gameCatalog") or {}
            for gid in window_game_ids:
                if gid in gc and gid not in catalog:
                    catalog[gid] = gc[gid]

    players = sorted(players_acc.values(), key=lambda p: (-(p.get("games") or 0), p.get("name") or ""))
    # Drop players with zero recent form — they don't help Hub; full store will restore them
    players_with_form = [p for p in players if p.get("gameLog")]
    teams = sorted(teams_acc.values(), key=lambda t: (-(t.get("games") or 0), t.get("name") or ""))
    champions = sorted(champs_acc.values(), key=lambda c: (-(c.get("picks") or 0), c.get("name") or ""))

    payload = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "year": year,
        "formDays": form_days,
        "asOf": as_of_s,
        "cutoff": cutoff_s,
        "meta": {
            **meta,
            "source": f"{meta.get('source', 'OE')} (hub bootstrap)",
            "generated_at": meta.get("generated_at")
            or datetime.now(timezone.utc).isoformat(),
        },
        "players": players_with_form,
        "teams": teams,
        "champions": champions,
        "gameCatalog": catalog,
        "stats": {
            "playerCount": len(players_with_form),
            "teamCount": len(teams),
            "championCount": len(champions),
            "catalogGames": len(catalog),
            "sourceSliceCount": len(slices),
        },
    }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", default="2026")
    parser.add_argument("--form-days", type=int, default=45)
    parser.add_argument("--max-form-games", type=int, default=24)
    parser.add_argument("--out", type=Path, default=OUT_PATH)
    args = parser.parse_args()

    print(f"Building hub bootstrap for {args.year} (formDays={args.form_days})…", file=sys.stderr)
    payload = build_bootstrap(args.year, args.form_days, args.max_form_games)
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    mb = args.out.stat().st_size / 1e6
    stats = payload["stats"]
    print(
        f"Wrote {args.out} ({mb:.2f} MB) — "
        f"{stats['playerCount']} players, {stats['teamCount']} teams, "
        f"{stats['catalogGames']} catalog games, asOf={payload['asOf']}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
