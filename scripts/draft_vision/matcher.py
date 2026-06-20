#!/usr/bin/env python3
"""
OpenCV draft screenshot matcher — local dev / batch testing.

Matches broadcast champ-select screenshots against Data Dragon champion icons
and LoL Esports team logos. Returns structured JSON with 2 teams x 5 champions.

Usage:
  pip install -r requirements.txt
  python matcher.py --image path/to/screenshot.png
  python matcher.py --image screenshot.png --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DDRAGON_MANIFEST = ROOT / "src" / "data" / "ddragon-champions.json"
ESPORTS_MANIFEST = ROOT / "src" / "data" / "esports-logos.json"

CHAMPION_SLOT_X = [0.06, 0.18, 0.30, 0.42, 0.54]
CHAMPION_ROW_Y = [0.52, 0.62, 0.72]
LOGO_ROIS = {
    "left": (0.02, 0.02, 0.22, 0.18),
    "right": (0.78, 0.02, 0.98, 0.18),
}
TEMPLATE_SIZE = 48
MIN_CHAMP_SCORE = 0.42
MIN_LOGO_SCORE = 0.38
MIN_AVG_CONFIDENCE = 0.48
MAX_TEAM_LOGOS = 80


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=15) as resp:
        return resp.read()


def champion_icon_url(version: str, key: str) -> str:
    return f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{key}.png"


def to_gray_template(img: np.ndarray, size: int = TEMPLATE_SIZE) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def best_match(roi: np.ndarray, templates: dict[str, tuple[str, np.ndarray]]) -> tuple[str, str, float]:
    best = ("", "", -1.0)
    for key, (label, tpl) in templates.items():
        if roi.shape != tpl.shape:
            roi_r = cv2.resize(roi, (tpl.shape[1], tpl.shape[0]))
        else:
            roi_r = roi
        score = float(cv2.matchTemplate(roi_r, tpl, cv2.TM_CCOEFF_NORMED)[0][0])
        if score > best[2]:
            best = (key, label, score)
    return best


def crop_rel(img: np.ndarray, x0: float, y0: float, x1: float, y1: float, size: int) -> np.ndarray:
    h, w = img.shape[:2]
    left, top = int(x0 * w), int(y0 * h)
    right, bottom = int(x1 * w), int(y1 * h)
    roi = img[top:bottom, left:right]
    if roi.size == 0:
        return np.zeros((size, size), dtype=np.uint8)
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def load_champion_templates(manifest: dict) -> dict[str, tuple[str, np.ndarray]]:
    version = manifest["version"]
    templates: dict[str, tuple[str, np.ndarray]] = {}
    for name, key in manifest["byName"].items():
        if key in templates:
            continue
        try:
            data = np.frombuffer(fetch_bytes(champion_icon_url(version, key)), dtype=np.uint8)
            img = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if img is None:
                continue
            templates[key] = (name, to_gray_template(img))
        except Exception:
            continue
    return templates


def load_team_templates(manifest: dict) -> dict[str, tuple[str, np.ndarray]]:
    templates: dict[str, tuple[str, np.ndarray]] = {}
    count = 0
    for slug, url in manifest.get("teamsByEsportsSlug", {}).items():
        if count >= MAX_TEAM_LOGOS:
            break
        try:
            data = np.frombuffer(fetch_bytes(url), dtype=np.uint8)
            img = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if img is None:
                continue
            templates[slug] = (slug, to_gray_template(img))
            count += 1
            alt = manifest.get("teamsAltByEsportsSlug", {}).get(slug)
            if alt and count < MAX_TEAM_LOGOS:
                data2 = np.frombuffer(fetch_bytes(alt), dtype=np.uint8)
                img2 = cv2.imdecode(data2, cv2.IMREAD_COLOR)
                if img2 is not None:
                    templates[f"{slug}-alt"] = (slug, to_gray_template(img2))
                    count += 1
        except Exception:
            continue
    return templates


def slug_to_display(slug: str, manifest: dict) -> str:
    slug = re.sub(r"-alt$", "", slug)
    for norm, es_slug in manifest.get("nameToEsportsSlug", {}).items():
        if es_slug == slug:
            return norm
    return " ".join(w.capitalize() for w in slug.split("-"))


def match_champions_half(gray: np.ndarray, side: str, templates: dict) -> list[dict]:
    h, w = gray.shape[:2]
    x_base = 0.0 if side == "left" else 0.5
    x_scale = 0.48
    picks: list[dict] = []
    used: set[str] = set()

    for slot, rel_x in enumerate(CHAMPION_SLOT_X):
        best_pick = None
        for row_y in CHAMPION_ROW_Y:
            x0 = x_base + rel_x * x_scale
            roi = crop_rel(gray, x0, row_y, x0 + 0.11, row_y + 0.14, TEMPLATE_SIZE)
            key, label, score = best_match(roi, templates)
            if score >= MIN_CHAMP_SCORE and (best_pick is None or score > best_pick["confidence"]):
                best_pick = {
                    "name": label,
                    "ddragonKey": key,
                    "confidence": round(score, 3),
                    "slot": slot + 1,
                }
        if best_pick and best_pick["ddragonKey"] not in used:
            used.add(best_pick["ddragonKey"])
            picks.append(best_pick)
    return picks


def match_logo(gray: np.ndarray, side: str, templates: dict) -> tuple[str, float] | None:
    x0, y0, x1, y1 = LOGO_ROIS[side]
    roi = crop_rel(gray, x0, y0, x1, y1, TEMPLATE_SIZE)
    key, _label, score = best_match(roi, templates)
    if score < MIN_LOGO_SCORE:
        return None
    slug = re.sub(r"-alt$", "", key)
    return slug, score


def extract_draft(image_path: Path) -> dict:
    img = cv2.imread(str(image_path))
    if img is None:
        raise SystemExit(f"could not read image: {image_path}")

    ddragon = load_json(DDRAGON_MANIFEST)
    esports = load_json(ESPORTS_MANIFEST)
    champ_tpl = load_champion_templates(ddragon)
    team_tpl = load_team_templates(esports)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    left_champs = match_champions_half(gray, "left", champ_tpl)
    right_champs = match_champions_half(gray, "right", champ_tpl)
    left_logo = match_logo(gray, "left", team_tpl)
    right_logo = match_logo(gray, "right", team_tpl)

    all_picks = left_champs + right_champs
    avg_conf = sum(p["confidence"] for p in all_picks) / len(all_picks) if all_picks else 0.0

    def team_side(side: str, champs: list, logo) -> dict:
        if logo:
            slug, score = logo
            team = slug_to_display(slug, esports)
        else:
            slug, score, team = None, None, "Blue Side" if side == "left" else "Red Side"
        return {
            "team": team,
            "side": side,
            "esportsSlug": slug,
            "logoMatchScore": round(score, 3) if score is not None else None,
            "champions": champs,
        }

    return {
        "method": "template_match",
        "confidence": round(avg_conf, 3),
        "teams": [
            team_side("left", left_champs, left_logo),
            team_side("right", right_champs, right_logo),
        ],
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "notes": f"opencv matched {len(all_picks)}/10 champions",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Match LoL draft screenshot to champions/teams")
    parser.add_argument("--image", required=True, help="Path to broadcast draft screenshot")
    parser.add_argument("--json", action="store_true", help="Print JSON only")
    args = parser.parse_args()

    result = extract_draft(Path(args.image))
    left, right = result["teams"]
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        left, right = result["teams"]
        print(f"confidence: {result['confidence']}")
        print(f"LEFT  {left['team']}: {', '.join(c['name'] for c in left['champions'])}")
        print(f"RIGHT {right['team']}: {', '.join(c['name'] for c in right['champions'])}")
    return 0 if result["confidence"] >= MIN_AVG_CONFIDENCE and len(left["champions"]) + len(right["champions"]) >= 6 else 1


if __name__ == "__main__":
    raise SystemExit(main())
