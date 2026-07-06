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
_STRING_ITEM_RE = re.compile(r"'((?:[^'\\]|\\.)*)'")


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
        oe_names = [_unescape(m.group(1)) for m in _STRING_ITEM_RE.finditer(oe_names_blob)]
        for name in {canonical, *oe_names}:
            if name:
                mapping[name.strip().lower()] = canonical

    if not mapping:
        print(f"WARNING: parsed 0 team entities from {ENTITY_MAP_TS}", file=sys.stderr)
    return mapping


def canonical_team(raw_name: str) -> str:
    """Best-effort canonical (rebrand-consolidated) team name for an OE team string."""
    raw_name = (raw_name or "").strip()
    if not raw_name:
        return raw_name
    return load_team_rebrand_map().get(raw_name.lower(), raw_name)
