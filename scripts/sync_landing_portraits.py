#!/usr/bin/env python3
"""
Sync CURRENT Leaguepedia player portraits for the landing \"nucky knows\" trail.

Uses the same Cargo join as Module:PlayerProfileGallery (Images gallery on
lol.fandom.com player pages) and keeps the last row (latest SortDate / tournament date).
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "landing" / "portraits"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "nucky.gg portrait sync (contact goonbu@nucky.gg)"}

# Display name → Leaguepedia _pageName (PlayerRedirects)
PLAYERS: list[tuple[str, str]] = [
    ("Faker", "Faker"),
    ("Chovy", "Chovy"),
    ("Canyon", "Canyon"),
    ("ShowMaker", "ShowMaker"),
    ("Caps", "Caps"),
    ("Knight", "Knight (Zhuo Ding)"),
    ("Zeus", "Zeus"),
    ("Gumayusi", "Gumayusi"),
    ("Keria", "Keria"),
    ("Bin", "Bin (Chen Ze-Bin)"),
    ("Viper", "Viper (Park Do-hyeon)"),
    ("Dhokla", "Dhokla"),
    ("Bdd", "Bdd"),
    ("Zeka", "Zeka (Kim Geon-woo)"),
    ("Busio", "Busio"),
    ("Kiin", "Kiin"),
]


def api(params: dict, retries: int = 6) -> dict:
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"https://lol.fandom.com/api.php?{q}", headers=UA)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict) and data.get("error", {}).get("code") == "ratelimited":
                wait = 8 + attempt * 6
                print(f"  rate limited — wait {wait}s")
                time.sleep(wait)
                continue
            return data
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(4 + attempt * 3)
    if last_err:
        raise last_err
    raise RuntimeError("API failed")


def latest_portrait_filename(page_name: str) -> tuple[str, str] | None:
    """Return (FileName, Caption) for the last Images-gallery row."""
    data = api(
        {
            "action": "cargoquery",
            "tables": "PlayerRedirects=PR,PlayerImages=PI,Tournaments=T",
            "join_on": "PR.AllName=PI.Link,PI.Tournament=T.OverviewPage",
            "fields": "PI.FileName,PI.Caption,PI.SortDate,T.Date,T.DateStartFuzzy",
            "where": f'PR._pageName="{page_name}" AND PI._pageName IS NOT NULL',
            "order_by": "COALESCE(PI.SortDate,T.DateStartFuzzy,T.Date)",
            "limit": "500",
            "format": "json",
        }
    )
    if "error" in data:
        raise RuntimeError(data["error"].get("info", str(data["error"])))
    rows = data.get("cargoquery") or []
    if not rows:
        return None
    title = rows[-1]["title"]
    file_name = (title.get("FileName") or "").strip()
    caption = (title.get("Caption") or "").strip()
    if not file_name:
        return None
    return file_name, caption


def file_url(file_name: str) -> str | None:
    data = api(
        {
            "action": "query",
            "titles": f"File:{file_name}",
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }
    )
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if infos and infos[0].get("url"):
            return infos[0]["url"]
    return None


def download(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            dest.write_bytes(resp.read())
        return dest.stat().st_size > 1000
    except urllib.error.HTTPError as exc:
        print(f"  download fail {exc.code}: {url}")
        return False


def sniff_ext(path: Path, url: str, file_name: str) -> str:
    """Prefer magic bytes — Fandom often serves WebP from .png titles."""
    head = path.read_bytes()[:12]
    if head[:4] == b"\x89PNG":
        return ".png"
    if head[:3] == b"GIF":
        return ".gif"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    if head[:2] == b"\xff\xd8":
        return ".jpg"
    lower = f"{url} {file_name}".lower()
    if ".webp" in lower:
        return ".webp"
    if ".png" in lower:
        return ".png"
    return ".jpg"


def main() -> None:
    existing: dict = {}
    manifest_path = OUT / "manifest.json"
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = {}
    # Support both legacy flat map and {portraits, captions}
    if "portraits" in existing:
        manifest: dict[str, str] = dict(existing.get("portraits") or {})
        captions: dict[str, str] = dict(existing.get("captions") or {})
    else:
        manifest = {k: v for k, v in existing.items() if isinstance(v, str)}
        captions = {}

    for slug, page_name in PLAYERS:
        print(f"{slug} ({page_name})…")
        try:
            hit = latest_portrait_filename(page_name)
        except Exception as exc:  # noqa: BLE001
            print(f"  cargo error: {exc}")
            time.sleep(2.0)
            continue
        time.sleep(1.4)
        if not hit:
            print("  no PlayerImages rows")
            continue
        file_name, caption = hit
        print(f"  latest: {file_name} — {caption}")
        url = file_url(file_name)
        time.sleep(1.0)
        if not url:
            print("  no imageinfo url")
            continue
        url = re.sub(r"/scale-to-width-down/\d+", "", url)
        tmp = OUT / f"{slug.lower()}.download"
        if not download(url, tmp):
            tmp.unlink(missing_ok=True)
            time.sleep(1.2)
            continue
        ext = sniff_ext(tmp, url, file_name)
        dest = OUT / f"{slug.lower()}{ext}"
        for old in OUT.glob(f"{slug.lower()}.*"):
            if old in {tmp, dest}:
                continue
            if old.suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".download"}:
                old.unlink(missing_ok=True)
        tmp.replace(dest)
        rel = f"/landing/portraits/{dest.name}"
        manifest[slug] = rel
        captions[slug] = caption
        print(f"  saved {dest.name} ({dest.stat().st_size} bytes)")
        # Persist incrementally so partial runs keep progress
        manifest_path.write_text(
            json.dumps({"portraits": manifest, "captions": captions}, indent=2),
            encoding="utf-8",
        )
        time.sleep(1.2)

    print("done —", len(manifest), "portraits")
    for slug, cap in captions.items():
        print(f"  {slug}: {cap}")


if __name__ == "__main__":
    main()
