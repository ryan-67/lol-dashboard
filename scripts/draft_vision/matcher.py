#!/usr/bin/env python3
"""OpenCV draft screenshot matcher — league-agnostic adaptive scan + layout variants."""

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
MIN_CHAMP_SCORE = 0.34
MIN_LOGO_SCORE = 0.34
MAX_TEAM_LOGOS = 150
GRID_STEP = 0.055
PATCH_SIZE = 0.072
MAX_CELLS = 48

LOGO_SCAN_ZONES = [
    (0, 0, 0.38, 0.14),
    (0.62, 0, 1, 0.14),
    (0.28, 0, 0.72, 0.12),
    (0.22, 0.62, 0.78, 0.96),
    (0, 0.58, 0.38, 0.96),
    (0.62, 0.58, 1, 0.96),
]

CHAMPION_SCAN_REGIONS = {
    "left": (0, 0.06, 0.48, 0.94),
    "right": (0.52, 0.06, 1, 0.94),
}

PRIORITY_TEAM_SLUGS = [
    "t1", "geng", "hanwha-life-esports", "dplus-kia", "kt-rolster", "drx",
    "bilibili-gaming", "jd-gaming", "top-esports", "weibo-gaming", "g2-esports",
    "fnatic", "cloud9", "team-liquid", "flyquest", "100-thieves",
]


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


def horizontal_row(x0: float, x1: float, y0: float, y1: float, count: int = 5) -> list[tuple]:
    inset = 0.02
    width = x1 - x0
    slot_w = (width - inset * 2) / count
    return [
        (x0 + inset + i * slot_w, y0, x0 + inset + (i + 1) * slot_w, y1)
        for i in range(count)
    ]


def vertical_col(x0: float, x1: float, y0: float, y1: float, count: int = 5) -> list[tuple]:
    inset = 0.02
    height = y1 - y0
    slot_h = (height - inset * 2) / count
    return [
        (x0, y0 + inset + i * slot_h, x1, y0 + inset + (i + 1) * slot_h)
        for i in range(count)
    ]


def generate_draft_variants() -> list[tuple[str, list, list]]:
    variants = []
    y_bands = [(0.52, 0.72), (0.58, 0.78), (0.64, 0.84), (0.68, 0.88), (0.72, 0.92)]
    splits = [(0, 0.38, 0.62, 1), (0, 0.4, 0.6, 1), (0, 0.42, 0.58, 1), (0.02, 0.36, 0.64, 0.98)]
    for i, (y0, y1) in enumerate(y_bands):
        for lx0, lx1, rx0, rx1 in splits:
            variants.append((
                f"draft_y{i}",
                horizontal_row(lx0, lx1, y0, y1),
                horizontal_row(rx0, rx1, y0, y1),
            ))
    return variants


def generate_hud_variants() -> list[tuple[str, list, list]]:
    variants = []
    y_ranges = [(0.08, 0.58), (0.1, 0.6), (0.12, 0.62), (0.06, 0.52)]
    for i, (y0, y1) in enumerate(y_ranges):
        variants.append((f"hud_v{i}_narrow", vertical_col(0, 0.09, y0, y1), vertical_col(0.91, 1, y0, y1)))
        variants.append((f"hud_v{i}_wide", vertical_col(0, 0.13, y0, y1), vertical_col(0.87, 1, y0, y1)))
    for i, (y0, y1) in enumerate([(0.82, 0.96), (0.86, 0.98), (0.78, 0.94)]):
        variants.append((
            f"hud_bottom_{i}",
            horizontal_row(0.12, 0.48, y0, y1),
            horizontal_row(0.52, 0.88, y0, y1),
        ))
    return variants


def grid_cells(x0: float, y0: float, x1: float, y1: float):
    count = 0
    y = y0
    while y + PATCH_SIZE <= y1 and count < MAX_CELLS:
        x = x0
        while x + PATCH_SIZE <= x1 and count < MAX_CELLS:
            yield (x, y, x + PATCH_SIZE, y + PATCH_SIZE)
            x += GRID_STEP
            count += 1
        y += GRID_STEP


def cluster_picks(hits: list[dict], max_picks: int = 5) -> list[dict]:
    sorted_hits = sorted(hits, key=lambda h: h["score"], reverse=True)
    chosen: list[dict] = []
    min_dist = 0.06
    for hit in sorted_hits:
        if any(c["id"] == hit["id"] for c in chosen):
            continue
        if any(np.hypot(c["cx"] - hit["cx"], c["cy"] - hit["cy"]) < min_dist for c in chosen):
            continue
        chosen.append(hit)
        if len(chosen) >= max_picks:
            break
    if len(chosen) > 1:
        x_spread = max(h["cx"] for h in chosen) - min(h["cx"] for h in chosen)
        y_spread = max(h["cy"] for h in chosen) - min(h["cy"] for h in chosen)
        horizontal = x_spread >= y_spread
        chosen.sort(key=lambda h: h["cx"] if horizontal else h["cy"])
    return [
        {"name": h["label"], "ddragonKey": h["id"], "confidence": round(h["score"], 3), "slot": i + 1}
        for i, h in enumerate(chosen)
    ]


def adaptive_scan_champions(gray: np.ndarray, templates: dict) -> tuple[list, list]:
    hits: list[dict] = []
    for side, (x0, y0, x1, y1) in CHAMPION_SCAN_REGIONS.items():
        for cell in grid_cells(x0, y0, x1, y1):
            roi = crop_rel(gray, *cell, TEMPLATE_SIZE)
            key, label, score = best_match(roi, templates)
            if score >= MIN_CHAMP_SCORE:
                cx = (cell[0] + cell[2]) / 2
                cy = (cell[1] + cell[3]) / 2
                hits.append({"id": key, "label": label, "score": score, "cx": cx, "cy": cy, "side": side})
    left = cluster_picks([h for h in hits if h["side"] == "left"])
    right = cluster_picks([h for h in hits if h["side"] == "right"])
    return left, right


def adaptive_scan_logos(gray: np.ndarray, templates: dict) -> tuple[tuple[str, float] | None, tuple[str, float] | None]:
    hits: list[tuple[str, float, float]] = []
    for zone in LOGO_SCAN_ZONES:
        for cell in grid_cells(*zone):
            roi = crop_rel(gray, *cell, TEMPLATE_SIZE)
            key, _label, score = best_match(roi, templates)
            if score >= MIN_LOGO_SCORE:
                slug = re.sub(r"-alt$", "", key)
                cx = (cell[0] + cell[2]) / 2
                hits.append((slug, score, cx))
    if not hits:
        return None, None
    hits.sort(key=lambda h: h[1], reverse=True)
    left = [h for h in hits if h[2] < 0.5]
    right = [h for h in hits if h[2] >= 0.5]
    pick = lambda arr: (arr[0][0], arr[0][1]) if arr else None
    return pick(left), pick(right)


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
    slugs = PRIORITY_TEAM_SLUGS + [s for s in manifest.get("teamsByEsportsSlug", {}) if s not in PRIORITY_TEAM_SLUGS]
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
    abbrev = {
        "t1": "T1", "geng": "Gen.G", "gen": "Gen.G", "g2": "G2 Esports",
        "c9": "Cloud9", "tl": "Team Liquid", "blg": "Bilibili Gaming",
    }
    if slug in abbrev:
        return abbrev[slug]
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


def build_result(
    left_champs: list,
    right_champs: list,
    left_logo,
    right_logo,
    esports: dict,
    notes: str,
) -> dict:
    all_picks = left_champs + right_champs
    avg = sum(p["confidence"] for p in all_picks) / len(all_picks) if all_picks else 0

    def side(s, champs, logo):
        team = slug_to_display(logo[0], esports) if logo else ("Blue Side" if s == "left" else "Red Side")
        return {
            "team": team, "side": s, "esportsSlug": logo[0] if logo else None,
            "logoMatchScore": round(logo[1], 3) if logo else None, "champions": champs,
        }

    return {
        "method": "template_match",
        "confidence": round(avg, 3),
        "teams": [side("left", left_champs, left_logo), side("right", right_champs, right_logo)],
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "notes": notes,
    }


def score_result(result: dict) -> float:
    left, right = result["teams"]
    count = len(left["champions"]) + len(right["champions"])
    named = all(not re.search(r"blue side|red side", t["team"], re.I) for t in result["teams"])
    return count * 10 + result["confidence"] * 5 + (8 if named else 0)


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
    best_score = -1.0

    left_c, right_c = adaptive_scan_champions(gray, champ_tpl)
    left_l, right_l = adaptive_scan_logos(gray, team_tpl)
    adaptive = build_result(left_c, right_c, left_l, right_l, esports, "adaptive_scan")
    adaptive_score = score_result(adaptive)
    if adaptive_score > best_score:
        best_score = adaptive_score
        best = adaptive

    for variant_id, left_slots, right_slots in generate_draft_variants() + generate_hud_variants():
        result = build_result(
            match_slots(gray, left_slots, champ_tpl),
            match_slots(gray, right_slots, champ_tpl),
            left_l,
            right_l,
            esports,
            variant_id,
        )
        s = score_result(result)
        if s > best_score:
            best_score = s
            best = result

    return best or adaptive


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
