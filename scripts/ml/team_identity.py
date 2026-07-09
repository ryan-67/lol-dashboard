"""
Canonical team identity for the ML pipeline.

Reuses the same rebrand/alias table the dashboard uses for entity linking
(src/lib/entities/entityMap.ts TEAM_ENTITIES) so a team's rating and H2H
history stays continuous across renames (e.g. "DWG KIA" -> "Dplus Kia",
"Mad Lions" -> "Movistar KOI") instead of resetting per-season.

Parses the TS source directly (regex, not a JS runtime) so there is a single
source of truth instead of a duplicated JSON file that can drift.
"""

from __future__ import annotations

import re
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENTITY_MAP_TS = ROOT / "src" / "lib" / "entities" / "entityMap.ts"

_ENTITY_BLOCK_RE = re.compile(
    r"canonicalName:\s*'((?:[^'\\]|\\.)*)'\s*,\s*oeNames:\s*\[(.*?)\]",
    re.DOTALL,
)
# TS source uses double quotes for any literal containing an apostrophe (e.g. "Xi'an Team
# WE") — match both quote styles or those entries silently vanish from the parsed map.
_STRING_ITEM_RE = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"")


def _unescape(s: str) -> str:
    return s.replace("\\'", "'").replace('\\"', '"')


@lru_cache(maxsize=1)
def load_team_rebrand_map() -> dict[str, str]:
    """lowercase(oeName) -> canonicalName, sourced from entityMap.ts."""
    mapping: dict[str, str] = {}
    if not ENTITY_MAP_TS.exists():
        print(f"WARNING: {ENTITY_MAP_TS} not found; team identity consolidation disabled", file=sys.stderr)
        return mapping

    text = ENTITY_MAP_TS.read_text(encoding="utf-8")
    for match in _ENTITY_BLOCK_RE.finditer(text):
        canonical = _unescape(match.group(1)).strip()
        oe_names_blob = match.group(2)
        oe_names = [
            _unescape(m.group(1) if m.group(1) is not None else m.group(2))
            for m in _STRING_ITEM_RE.finditer(oe_names_blob)
        ]
        for name in {canonical, *oe_names}:
            if name:
                mapping[name.strip().lower()] = canonical

    if not mapping:
        print(f"WARNING: parsed 0 team entities from {ENTITY_MAP_TS}", file=sys.stderr)
    return mapping


def _fold(value: str) -> str:
    """Aggressively normalize for fuzzy matching: strip punctuation/whitespace, fold
    curly quotes to straight ones, lowercase. Used only as a fallback when the exact
    lookup misses — external APIs (CitoAPI) often format a team name slightly
    differently than Oracle's Elixir does ("WeiboGaming" vs "Weibo Gaming",
    "Gen.G Esports" vs "Gen.G")."""
    value = value.replace("\u2019", "'").replace("\u2018", "'")
    return re.sub(r"[^a-z0-9]", "", value.lower())


@lru_cache(maxsize=1)
def _folded_rebrand_map() -> dict[str, str]:
    return {_fold(k): v for k, v in load_team_rebrand_map().items() if _fold(k)}


def canonical_team(raw_name: str) -> str:
    """Best-effort canonical (rebrand-consolidated) team name for an OE (or external API)
    team string. Falls back to a punctuation/whitespace-insensitive match — and, failing
    that, a common-suffix-stripped match (" esports", " gaming") — before giving up,
    since external sources like CitoAPI format names slightly differently than OE."""
    raw_name = (raw_name or "").strip()
    if not raw_name:
        return raw_name
    exact_map = load_team_rebrand_map()
    hit = exact_map.get(raw_name.lower())
    if hit:
        return hit

    folded = _fold(raw_name)
    folded_map = _folded_rebrand_map()
    hit = folded_map.get(folded)
    if hit:
        return hit

    for suffix in ("esports", "gaming", "eracing", "gg"):
        if folded.endswith(suffix) and len(folded) > len(suffix):
            hit = folded_map.get(folded[: -len(suffix)])
            if hit:
                return hit

    return raw_name
