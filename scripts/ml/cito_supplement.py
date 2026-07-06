"""
Optional CitoAPI supplement — fills gaps OE doesn't reliably have.

Per project decision: OE is the base truth layer for the feature mart; Cito
only supplements where OE is thin:

1. Gold-timeline "throw" features per historical game, joined via
   cito_game_linkage.oe_game_id -> cito_game_gold.gold_timeline (Supabase).
   These are tied to a specific past gameId, so they're safe to use in
   walk-forward training — no leakage.
2. Current global power rankings (CitoAPI /lol/rankings*) — this is a
   point-in-time snapshot with no historical time series available, so it is
   NEVER attached to historical training rows (that would leak future
   ranking info into the past). It's only exposed via `fetch_current_power_ranks`
   for live/inference-time use in Phase 3 (predictionPacket.ts), not consumed
   by build_feature_mart.py.

Both are best-effort: missing credentials or empty tables degrade gracefully
to an empty result so the pipeline still runs OE-only.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]

CITO_BASE = "https://api.citoapi.com/api/v1"
TIMEOUT_S = 20


def _load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(ROOT / ".env")
    except ImportError:
        pass


def fetch_gold_throw_features() -> pd.DataFrame:
    """Per-OE-gameid throw/lead-volatility features derived from Cito gold timelines.

    Returns columns: oe_game_id, cito_max_lead_blue, cito_lead_flips,
    cito_time_ahead_share_blue. Empty DataFrame (correct schema) if Supabase
    credentials are missing or the linkage/gold tables have no rows.
    """
    empty = pd.DataFrame(
        columns=["oe_game_id", "cito_max_lead_blue", "cito_lead_flips", "cito_time_ahead_share_blue"]
    )
    _load_env()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("  Cito gold-timeline supplement skipped (no SUPABASE_URL/SERVICE_ROLE_KEY)", file=sys.stderr)
        return empty

    try:
        from supabase import create_client
    except ImportError:
        print("  Cito gold-timeline supplement skipped (supabase package not installed)", file=sys.stderr)
        return empty

    try:
        client = create_client(url, key)
        linkage = client.table("cito_game_linkage").select("oe_game_id,cito_game_id").execute().data or []
        if not linkage:
            return empty
        cito_ids = [row["cito_game_id"] for row in linkage if row.get("cito_game_id")]
        oe_by_cito = {row["cito_game_id"]: row["oe_game_id"] for row in linkage if row.get("oe_game_id")}

        rows: list[dict] = []
        batch = 200
        for i in range(0, len(cito_ids), batch):
            chunk = cito_ids[i : i + batch]
            resp = (
                client.table("cito_game_gold")
                .select("cito_game_id,gold_timeline")
                .in_("cito_game_id", chunk)
                .execute()
            )
            rows.extend(resp.data or [])
    except Exception as err:  # pragma: no cover - network/service best-effort
        print(f"  Cito gold-timeline supplement failed: {err}", file=sys.stderr)
        return empty

    out = []
    for row in rows:
        cito_id = row.get("cito_game_id")
        oe_id = oe_by_cito.get(cito_id)
        timeline = row.get("gold_timeline") or []
        if not oe_id or not isinstance(timeline, list) or len(timeline) < 2:
            continue
        diffs = [float(p.get("goldDiffBlue", 0) or 0) for p in timeline if isinstance(p, dict)]
        if not diffs:
            continue
        max_lead = max(abs(d) for d in diffs)
        signs = [1 if d > 0 else (-1 if d < 0 else 0) for d in diffs if d != 0]
        flips = sum(1 for a, b in zip(signs, signs[1:]) if a != b)
        ahead_share = sum(1 for d in diffs if d > 0) / len(diffs)
        out.append(
            {
                "oe_game_id": oe_id,
                "cito_max_lead_blue": max_lead,
                "cito_lead_flips": flips,
                "cito_time_ahead_share_blue": ahead_share,
            }
        )

    if not out:
        return empty
    print(f"  Cito gold-timeline supplement: {len(out)} historical games matched to OE", file=sys.stderr)
    return pd.DataFrame(out)


def fetch_current_power_ranks() -> dict[str, int]:
    """Current global power rankings (CitoAPI). Snapshot-only — inference-time use only."""
    _load_env()
    api_key = os.environ.get("CITO_API_KEY", "").strip()
    if not api_key:
        return {}

    ranks: dict[str, int] = {}
    for path in ("/lol/rankings/teams", "/lol/rankings"):
        try:
            resp = requests.get(
                f"{CITO_BASE}{path}",
                headers={"Accept": "application/json", "x-api-key": api_key},
                timeout=TIMEOUT_S,
            )
            if resp.status_code != 200:
                continue
            payload = resp.json()
            rows = payload.get("data", payload) if isinstance(payload, dict) else payload
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                team = str(row.get("teamName") or row.get("team") or row.get("name") or "").strip()
                rank_raw = row.get("rank") or row.get("position") or row.get("globalRank")
                try:
                    rank = int(rank_raw)
                except (TypeError, ValueError):
                    continue
                if team and rank > 0 and (team.lower() not in ranks or rank < ranks[team.lower()]):
                    ranks[team.lower()] = rank
        except requests.RequestException:
            continue
    return ranks


def merge_gold_throw_features(team_games: pd.DataFrame) -> pd.DataFrame:
    """Left-join per-game throw features onto a team_game_rows DataFrame (side-aware)."""
    supplement = fetch_gold_throw_features()
    if supplement.empty:
        for col in ("cito_max_lead", "cito_lead_flips", "cito_time_ahead_share"):
            team_games[col] = np.nan
        return team_games

    merged = team_games.merge(
        supplement, left_on="gameid", right_on="oe_game_id", how="left"
    ).drop(columns=["oe_game_id"])
    # gold_timeline sign is blue-relative; flip time-ahead-share for the red side.
    is_red = merged["side"].eq("red")
    merged["cito_max_lead"] = merged["cito_max_lead_blue"]
    merged["cito_time_ahead_share"] = np.where(
        is_red, 1 - merged["cito_time_ahead_share_blue"], merged["cito_time_ahead_share_blue"]
    )
    merged["cito_lead_flips"] = merged["cito_lead_flips"]
    return merged.drop(columns=["cito_max_lead_blue", "cito_time_ahead_share_blue"])
