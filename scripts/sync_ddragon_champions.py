#!/usr/bin/env python3
"""Fetch latest Data Dragon champion manifest for icon URLs."""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

OUT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "ddragon-champions.json"
AGENT_CHAT_PATH = (
    Path(__file__).resolve().parent.parent
    / "supabase"
    / "functions"
    / "agent-chat"
    / "data"
    / "ddragon-champions.json"
)
VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json"


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def main() -> int:
    with urllib.request.urlopen(VERSIONS_URL, timeout=30) as resp:
        versions = json.load(resp)
    version = versions[0]

    champ_url = f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"
    with urllib.request.urlopen(champ_url, timeout=60) as resp:
        payload = json.load(resp)

    by_name: dict[str, str] = {}
    by_normalized: dict[str, str] = {}

    for entry in payload["data"].values():
        ddragon_id = entry["id"]
        display_name = entry["name"]
        by_name[display_name] = ddragon_id
        by_normalized[normalize(display_name)] = ddragon_id
        by_normalized[normalize(ddragon_id)] = ddragon_id

    manifest = {
        "version": version,
        "byName": dict(sorted(by_name.items())),
        "byNormalizedName": dict(sorted(by_normalized.items())),
    }

    text = json.dumps(manifest, indent=2) + "\n"
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text, encoding="utf-8")
    if AGENT_CHAT_PATH.parent.exists():
        AGENT_CHAT_PATH.write_text(text, encoding="utf-8")
        print(f"Wrote {len(by_name)} champions @ {version} -> {OUT_PATH} + agent-chat copy")
    else:
        print(f"Wrote {len(by_name)} champions @ {version} -> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
