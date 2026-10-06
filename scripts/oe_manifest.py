"""Manifest split hygiene for OE CDN shards.

``meta.splits`` must be exactly the splits named by slice keys
(``"<split>|<league>"``) inside the shard files listed in ``year_files``.
A split with one league (``2026 Worlds|LPL``, ``2026 Split 1|INT``) stays.
A name with zero slice keys is a manifest ghost and is dropped.
"""

from __future__ import annotations

import json
from pathlib import Path

# Chronological order within a competitive year. Unknown labels sort last.
SEASON_ORDER = {
    "Winter": 0,
    "First Stand": 1,
    "Spring": 2,
    "MSI": 3,
    "EWC": 4,
    "Summer": 5,
    "Worlds": 6,
}


def split_sort_key(split_label: str) -> tuple:
    parts = split_label.split(" ", 1)
    year = int(parts[0]) if parts and parts[0].isdigit() else 0
    season = parts[1] if len(parts) > 1 else parts[0]
    return (year, SEASON_ORDER.get(season, 99), season.lower())


def flatten_year_filenames(year_files: dict) -> list[str]:
    out: list[str] = []
    for value in (year_files or {}).values():
        if isinstance(value, list):
            out.extend(str(name) for name in value if name)
        elif isinstance(value, str) and value:
            out.append(value)
    return out


def split_from_slice_key(key: str) -> str | None:
    if "|" not in key:
        return None
    split, league = key.rsplit("|", 1)
    split = split.strip()
    league = league.strip()
    if not split or not league:
        return None
    return split


def splits_in_slices(slices: dict) -> set[str]:
    found: set[str] = set()
    for key in slices:
        split = split_from_slice_key(str(key))
        if split:
            found.add(split)
    return found


def splits_referenced_by_year_files(data_dir: Path, year_files: dict) -> set[str]:
    """Splits that at least one written slice key in ``year_files`` references."""
    found: set[str] = set()
    for filename in flatten_year_filenames(year_files):
        path = data_dir / filename
        if not path.is_file():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        slices = payload.get("slices") if isinstance(payload, dict) else None
        if isinstance(slices, dict):
            found |= splits_in_slices(slices)
    return found


def audit_manifest_splits(
    payload: dict,
    data_dir: Path,
) -> tuple[list[str], list[str], list[str]]:
    """Return ``(referenced, ghosts, omitted)`` in display order.

    ghosts: listed in ``meta.splits`` but no shard slice key
    omitted: a shard slice key's split is missing from ``meta.splits``
    """
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    manifest = [str(split) for split in (meta.get("splits") or []) if str(split).strip()]
    referenced = sorted(
        splits_referenced_by_year_files(data_dir, payload.get("year_files") or {}),
        key=split_sort_key,
    )
    referenced_set = set(referenced)
    manifest_set = set(manifest)
    ghosts = [split for split in manifest if split not in referenced_set]
    omitted = [split for split in referenced if split not in manifest_set]
    return referenced, ghosts, omitted


def apply_manifest_split_hygiene(payload: dict, data_dir: Path) -> list[str]:
    """Set ``meta.splits`` from shard slice keys. Return removed ghost names."""
    referenced, ghosts, _omitted = audit_manifest_splits(payload, data_dir)
    meta = payload.setdefault("meta", {})
    if not isinstance(meta, dict):
        meta = {}
        payload["meta"] = meta
    meta["splits"] = referenced
    return ghosts
