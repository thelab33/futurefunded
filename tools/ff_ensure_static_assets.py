#!/usr/bin/env python3
"""
FutureFunded — Ensure Critical Static Assets (no more 404 console errors)
File: tools/ff_ensure_static_assets.py

Purpose
- Create tiny placeholder files for commonly requested assets so your
  Playwright gate doesn't fail on "Failed to load resource: 404".

This does NOT overwrite existing files.

Creates (if missing):
- app/static/images/favicon.ico
- app/static/images/icon-32.png
- app/static/images/icon-192.png
- app/static/images/apple-touch-icon.png
- app/static/images/safari-pinned-tab.svg
- app/static/manifest.webmanifest

Usage
  python3 tools/ff_ensure_static_assets.py
  python3 tools/ff_ensure_static_assets.py --root app/static
"""
from __future__ import annotations

import argparse
import base64
from pathlib import Path

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
)

PINNED_SVG = """<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\">
<path fill=\"black\" d=\"M8 1.5c-2.8 0-5 2.2-5 5 0 3.6 5 8 5 8s5-4.4 5-8c0-2.8-2.2-5-5-5zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z\"/>
</svg>
"""

MANIFEST = """{
  \"name\": \"FutureFunded\",
  \"short_name\": \"FutureFunded\",
  \"start_url\": \"/\",
  \"display\": \"standalone\",
  \"background_color\": \"#0b0f17\",
  \"theme_color\": \"#f97316\",
  \"icons\": [
    { \"src\": \"/static/images/icon-192.png\", \"sizes\": \"192x192\", \"type\": \"image/png\" },
    { \"src\": \"/static/images/icon-32.png\", \"sizes\": \"32x32\", \"type\": \"image/png\" }
  ]
}
"""

def _write_if_missing(path: Path, data: bytes) -> bool:
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True

def _write_text_if_missing(path: Path, text: str) -> bool:
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True

def _make_ico_with_embedded_png(png: bytes) -> bytes:
    # ICO header: reserved=0, type=1, count=1
    header = (0).to_bytes(2, "little") + (1).to_bytes(2, "little") + (1).to_bytes(2, "little")
    # Directory entry: width=1,height=1,colors=0,res=0,planes=1,bpp=32,size,offset
    entry = bytes([1, 1, 0, 0]) + (1).to_bytes(2, "little") + (32).to_bytes(2, "little") + len(png).to_bytes(4, "little") + (6+16).to_bytes(4, "little")
    return header + entry + png

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="app/static", help="Static root (default app/static)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    wrote = 0

    wrote += 1 if _write_if_missing(root / "images" / "icon-32.png", PNG_1X1) else 0
    wrote += 1 if _write_if_missing(root / "images" / "icon-192.png", PNG_1X1) else 0
    wrote += 1 if _write_if_missing(root / "images" / "apple-touch-icon.png", PNG_1X1) else 0
    wrote += 1 if _write_text_if_missing(root / "images" / "safari-pinned-tab.svg", PINNED_SVG) else 0
    wrote += 1 if _write_text_if_missing(root / "manifest.webmanifest", MANIFEST) else 0

    ico = _make_ico_with_embedded_png(PNG_1X1)
    wrote += 1 if _write_if_missing(root / "images" / "favicon.ico", ico) else 0

    if wrote:
        print(f"[ff-assets] ✅ wrote {wrote} missing placeholder asset(s) under {root}")
    else:
        print(f"[ff-assets] ✅ nothing to do (all placeholders already exist) under {root}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
