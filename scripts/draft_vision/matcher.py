#!/usr/bin/env python3
"""OpenCV draft screenshot matcher — supports draft overlay + in-game HUD layouts."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DDRAGON_MANIFEST = ROOT / "src" / "data" / "ddragon-champions.json"
ESPORTS_MANIFEST = ROOT / "src" / "data" / "esports-logos.json"

TEMPLATE_SIZE = 48
MIN_CHAMP_SCORE = 0.32
MIN_LOGO_SCORE = 0.32
MAX_TEAM_LOGOS = 80

DRAFT_OVERLAY = {
    "left_champs": [(0.01, 0.68, 0.09, 0.84), (0.085, 0.68, 0.165, 0.84), (0.16, 0.68, 0.24, 0.84),
                    (0.235, 0.68, 0.315, 0.84), (0.31, 0.68, 0.39, 0.84)],
    "right_champs": [(0.61, 0.68, 0.69, 0.84), (0.685, 0.68, 0.765, 0.84), (0.76, 0.68, 0.84, 0.84),
                     (0.835, 0.68, 0.915, 0.84), (0.91, 0.68, 0.99, 0.84)],
    "left_logos": [(0.38, 0.72, 0.46, 0.88), (0.02, 0.02, 0.14, 0.12)],
    "right_logos": [(0.54, 0.72, 0.62, 0.88), (0.86, 0.02, 0.98, 0.12)],
}

INGAME_HUD = {
    "left_champs": [(0.0, 0.1, 0.095, 0.19), (0.0, 0.19, 0.095, 0.28), (0.0, 0.28, 0.095, 0.37),
                    (0.0, 0.37, 0.095, 0.46), (0.0, 0.46, 0.095, 0.55)],
    "right_champs": [(0.905, 0.1, 1.0, 0.19), (0.905, 0.19, 1.0, 0.28), (0.905, 0.28, 1.0, 0.37),
                     (0.905, 0.37, 1.0, 0.46), (0.905, 0.46, 1.0, 0.55)],
    "left_logos": [(0.06, 0.0, 0.16, 0.09), (0.0, 0.0, 0.12, 0.08)],
    "right_logos": [(0.84, 0.0, 0.94, 0.09), (0.88, 0.0, 0.99, 0.08)],
}

LAYOUTS = {"draft_overlay": DRAFT_OVERLAY, "ingame_hud": INGAME_HUD}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=15) as resp:
        return resp.read()


def champion_icon_url(version: str, key: str) -> str:
    return f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{key}.png"


def champion_loading_url(key: str) -> str:
    return f"https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{key}_0.jpg"


def to_gray_template(img: np.ndarray, size: int = TEMPLATE_SIZE) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def best_match(roi: np.ndarray, templates: dict[str, tuple[str, np.ndarray]]) -> tuple[str, str, float]:
    best = ("", "", -1.0)
    for key, (label, tpl) in templates.items():
        roi_r = cv2.resize(roi, (tpl.shape[1], tpl.shape[0])) if roi.shape != tpl.shape else roi
        score = float(cv2.matchTemplate(roi_r, tpl, cv2.TM_CCOEFF_NORMED)[0][0])
        if score > best[2]:
            base = re.sub(r"-loading$", "", key)
            best = (base, label, score)
    return best


def crop_rel(img: np.ndarray, x0: float, y0: float, x1: float, y1: float, size: int) -> np.ndarray:
    h, w = img.shape[:2]
    roi = img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    if roi.size == 0:
        return np.zeros((size, size), dtype=np.uint8)
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def load_champion_templates(manifest: dict) -> dict[str, tuple[str, np.ndarray]]:
    version = manifest["version"]
    templates: dict[str, tuple[str, np.ndarray]] = {}
    for name, key in manifest["byName"].items():
        for suffix, url_fn in [("", champion_icon_url), ("-loading", champion_loading_url)]:
            tid = f"{key}{suffix}"
            if tid in templates:
                continue
            try:
                url = url_fn(version, key) if suffix == "" else url_fn(key)
                data = np.frombuffer(fetch_bytes(url), dtype=np.uint8)
                img = cv2.imdecode(data, cv2.IMREAD_COLOR)
                if img is not None:
                    templates[tid] = (name, to_gray_template(img))
            except Exception:
                pass
    return templates


def load_team_templates(manifest: dict) -> dict[str, tuple[str, np.ndarray]]:
    templates: dict[str, tuple[str, np.ndarray]] = {}
    count = 0
    priority = ["t1", "geng", "hanwha-life-esports", "dplus-kia"]
    slugs = priority + [s for s in manifest.get("teamsByEsportsSlug", {}) if s not in priority]
    for slug in slugs:
        if count >= MAX_TEAM_LOGOS:
            break
        url = manifest.get("teamsByEsportsSlug", {}).get(slug)
        if not url:
            continue
        try:
            data = np.frombuffer(fetch_bytes(url), dtype=np.uint8)
            img = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if img is not None:
                templates[slug] = (slug, to_gray_template(img))
                count += 1
        except Exception:
            continue
    return templates


def slug_to_display(slug: str, manifest: dict) -> str:
    slug = re.sub(r"-alt$", "", slug)
    aliases = {"t1": "T1", "geng": "Gen.G", "gen": "Gen.G"}
    if slug in aliases:
        return aliases[slug]
    for norm, es_slug in manifest.get("nameToEsportsSlug", {}).items():
        if es_slug == slug:
            return norm
    return " ".join(w.capitalize() for w in slug.split("-"))


def match_slots(gray: np.ndarray, slots: list, templates: dict) -> list[dict]:
    picks, used = [], set()
    for i, (x0, y0, x1, y1) in enumerate(slots):
        roi = crop_rel(gray, x0, y0, x1, y1, TEMPLATE_SIZE)
        key, label, score = best_match(roi, templates)
        if score >= MIN_CHAMP_SCORE and key not in used:
            used.add(key)
            picks.append({"name": label, "ddragonKey": key, "confidence": round(score, 3), "slot": i + 1})
    return picks


def match_logo(gray: np.ndarray, rois: list, templates: dict) -> tuple[str, float] | None:
    best = None
    for x0, y0, x1, y1 in rois:
        roi = crop_rel(gray, x0, y0, x1, y1, TEMPLATE_SIZE)
        key, _label, score = best_match(roi, templates)
        if score >= MIN_LOGO_SCORE:
            slug = re.sub(r"-alt$", "", key)
            if best is None or score > best[1]:
                best = (slug, score)
    return best


def extract_layout(gray: np.ndarray, layout: dict, layout_id: str, champ_tpl: dict, team_tpl: dict, esports: dict) -> dict:
    left = match_slots(gray, layout["left_champs"], champ_tpl)
    right = match_slots(gray, layout["right_champs"], champ_tpl)
    left_logo = match_logo(gray, layout["left_logos"], team_tpl)
    right_logo = match_logo(gray, layout["right_logos"], team_tpl)
    all_picks = left + right
    avg = sum(p["confidence"] for p in all_picks) / len(all_picks) if all_picks else 0

    def side(s, champs, logo):
        team = slug_to_display(logo[0], esports) if logo else ("Blue Side" if s == "left" else "Red Side")
        return {"team": team, "side": s, "esportsSlug": logo[0] if logo else None,
                "logoMatchScore": round(logo[1], 3) if logo else None, "champions": champs}

    return {
        "method": "template_match",
        "confidence": round(avg, 3),
        "teams": [side("left", left, left_logo), side("right", right, right_logo)],
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "notes": f"{layout_id} — {len(all_picks)}/10 champions",
    }


def extract_draft(image_path: Path) -> dict:
    img = cv2.imread(str(image_path))
    if img is None:
        raise SystemExit(f"could not read image: {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ddragon = load_json(DDRAGON_MANIFEST)
    esports = load_json(ESPORTS_MANIFEST)
    champ_tpl = load_champion_templates(ddragon)
    team_tpl = load_team_templates(esports)

    best = None
    best_score = -1
    for layout_id, layout in LAYOUTS.items():
        result = extract_layout(gray, layout, layout_id, champ_tpl, team_tpl, esports)
        count = len(result["teams"][0]["champions"]) + len(result["teams"][1]["champions"])
        score = count * 10 + result["confidence"] * 5
        if score > best_score:
            best_score = score
            best = result
    return best or extract_layout(gray, DRAFT_OVERLAY, "draft_overlay", champ_tpl, team_tpl, esports)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = extract_draft(Path(args.image))
    left, right = result["teams"]
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"confidence: {result['confidence']} ({result['notes']})")
        print(f"LEFT  {left['team']}: {', '.join(c['name'] for c in left['champions'])}")
        print(f"RIGHT {right['team']}: {', '.join(c['name'] for c in right['champions'])}")
    n = len(left["champions"]) + len(right["champions"])
    return 0 if n >= 6 else 1


if __name__ == "__main__":
    raise SystemExit(main())
