"""
Hot-patch player_ratings.json to drop non-tier-1 orgs mislabeled as LCS/LCK/etc.

Run after OE/LTA tagging quirks land CBLOL players on the board before a full retrain:
  python scripts/ml/hotpatch_player_ratings_regions.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from home_region_overrides import NON_TIER1_HOME_ORGS  # noqa: E402

TARGETS = [
    ROOT / "public" / "data" / "player_ratings.json",
    ROOT / "supabase" / "functions" / "agent-chat" / "ml" / "player_ratings.json",
]


def scrub(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    roles = data.get("roles") or {}
    removed = 0
    for role, rows in list(roles.items()):
        kept = []
        for row in rows:
            team = str(row.get("team") or "")
            region = str(row.get("region") or "")
            if team in NON_TIER1_HOME_ORGS:
                removed += 1
                continue
            # Defense in depth: never keep CBLOL/LLA labels on the board.
            if region.upper() in {"CBLOL", "LLA", "LTA S", "LCP"}:
                removed += 1
                continue
            kept.append(row)
        for i, row in enumerate(kept, start=1):
            row["rank"] = i
        roles[role] = kept
    data["roles"] = roles
    note = data.get("methodology") or ""
    if "non-tier-1 home org exclusion" not in note:
        data["methodology"] = (
            note
            + " Hot-patched: excluded NON_TIER1_HOME_ORGS (CBLOL/LLA etc.) mislabeled via LTA."
        ).strip()
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return removed


def main() -> None:
    total = 0
    for path in TARGETS:
        if not path.exists():
            print(f"skip missing {path}", file=sys.stderr)
            continue
        n = scrub(path)
        total += n
        print(f"{path.relative_to(ROOT)}: removed {n} rows", file=sys.stderr)
    print(f"done — removed {total} non-tier-1 rows", file=sys.stderr)


if __name__ == "__main__":
    main()
