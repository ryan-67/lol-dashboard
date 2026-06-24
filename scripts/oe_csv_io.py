"""
Shared Oracle's Elixir CSV naming and discovery helpers.

Official OE Drive files:
    YYYY_LoL_esports_match_data_from_OraclesElixir.csv

Legacy community mirror naming (still supported):
    YYYY_oracle_elixir.csv
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

TIER1_LEAGUES = ("LCK", "LPL", "LEC", "LCS")
REGIONAL_SPLIT_MARKERS = ("Winter", "Spring", "Summer")

# Official Oracle's Elixir public Drive bundle (OE Public Match Data).
DEFAULT_OE_DRIVE_FOLDER_ID = "1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH"

OE_OFFICIAL_CSV_RE = re.compile(
    r"^(\d{4})_LoL_esports_match_data_from_OraclesElixir\.csv$",
    re.I,
)
OE_LEGACY_CSV_RE = re.compile(r"^(\d{4})_oracle_elixir\.csv$", re.I)

OE_CSV_GLOBS = (
    "*_LoL_esports_match_data_from_OraclesElixir.csv",
    "*_oracle_elixir.csv",
)


def extract_csv_year(filename: str) -> str | None:
    for pattern in (OE_OFFICIAL_CSV_RE, OE_LEGACY_CSV_RE):
        match = pattern.match(filename)
        if match:
            return match.group(1)
    return None


def is_oe_csv_filename(filename: str) -> bool:
    return extract_csv_year(filename) is not None


def resolve_drive_folder_id(env_value: str | None) -> str:
    folder_id = (env_value or "").strip()
    if folder_id:
        return folder_id
    return DEFAULT_OE_DRIVE_FOLDER_ID


def parse_download_years(scope: str | None) -> set[str] | None:
    """
    Return None for all years, or a set of year strings to download.
    scope: 'all' | 'current' | '2025,2026'
    """
    raw = (scope or "current").strip().lower()
    if raw in {"", "all", "*"}:
        return None
    if raw == "current":
        return {str(datetime.now(timezone.utc).year)}
    years = {part.strip() for part in raw.split(",") if part.strip().isdigit()}
    return years or {str(datetime.now(timezone.utc).year)}


def filter_remote_files_by_years(files: list[dict], years: set[str] | None) -> list[dict]:
    matched = [f for f in files if is_oe_csv_filename(f.get("name", ""))]
    if years is None:
        return matched
    return [f for f in matched if extract_csv_year(f.get("name", "")) in years]


def parse_playoffs_flag(value) -> bool:
    """OE playoffs column is 0/1; tolerate floats and string variants."""
    if value in (None, ""):
        return False
    if isinstance(value, bool):
        return value
    try:
        return float(value) == 1.0
    except (ValueError, TypeError):
        return str(value).strip().lower() in ("1", "true", "yes")


def resolve_playoffs_from_row(row: dict) -> bool:
    if parse_playoffs_flag(row.get("playoffs")):
        return True
    split = str(row.get("split", ""))
    return bool(re.search(r"playoffs?", split, re.I))


def normalize_oe_row(row: dict) -> dict:
    """
    Normalize Oracle's Elixir row fields before ingest.

    LPL rows are often datacompleteness=partial with a populated url column and the same
    schema as other leagues; this helper strips whitespace and fills sparse identifiers.
    """
    out = dict(row)
    for key in (
        "league",
        "teamname",
        "playername",
        "name",
        "position",
        "split",
        "datacompleteness",
        "gameid",
    ):
        value = out.get(key)
        if isinstance(value, str):
            out[key] = value.strip()

    if not out.get("playername") and not out.get("name"):
        player_id = (out.get("playerid") or "").strip()
        if player_id:
            suffix = player_id.split(":")[-1] if ":" in player_id else player_id
            out["playername"] = f"player:{suffix[:16]}"

    return out


def discover_local_csv_files(lol_dir: Path) -> list[Path]:
    """One file per year; prefer official OE filename when both exist."""
    by_year: dict[str, Path] = {}
    for pattern in OE_CSV_GLOBS:
        for path in sorted(lol_dir.glob(pattern)):
            year = extract_csv_year(path.name)
            if not year:
                continue
            existing = by_year.get(year)
            if existing is None or OE_OFFICIAL_CSV_RE.match(path.name):
                by_year[year] = path
    return [by_year[y] for y in sorted(by_year.keys())]
