from __future__ import annotations

import re
from pathlib import Path
from datetime import datetime
import argparse

MARK = "FF_SPONSOR_TIERS_SELECTOR_FIX_V1"

CSS_SNIP = r'''
/* FF_SPONSOR_TIERS_SELECTOR_FIX_V1:BEGIN */
/* Gate fix: ensure ff-sponsorTiers has a real selector (kept visually neutral). */
.ff-body .ff-sponsorTiers{
  position: relative;
}
/* FF_SPONSOR_TIERS_SELECTOR_FIX_V1:END */
'''.lstrip("\n")


def backup(path: Path, suffix: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_{suffix}_{ts}")
    bak.write_text(path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    return bak


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--css", default="app/static/css/ff.css")
    args = ap.parse_args()

    css_path = Path(args.css)
    if not css_path.exists():
        raise SystemExit(f"❌ Missing CSS file: {css_path}")

    css = css_path.read_text(encoding="utf-8", errors="replace")

    # Idempotent
    if MARK in css:
        print("✅ Already patched (marker present)")
        print(f"• CSS: already patched -> {css_path}")
        return

    m = re.search(r"/\*\s*EOF:\s*app/static/css/ff\.css\s*\*/", css)
    if not m:
        raise SystemExit("❌ Could not find CSS EOF marker: /* EOF: app/static/css/ff.css */")

    bak = backup(css_path, "sponsorTiers_selector_fix_v1")
    out = css[:m.start()] + "\n" + CSS_SNIP + "\n" + css[m.start():]
    css_path.write_text(out, encoding="utf-8")

    print("✅ Patch complete")
    print(f"• CSS: changed -> {css_path}")
    print(f"  🗄️  backup: {bak}")


if __name__ == "__main__":
    main()
