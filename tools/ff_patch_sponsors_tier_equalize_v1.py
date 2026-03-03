from __future__ import annotations

import re
import argparse
from pathlib import Path
from datetime import datetime

MARK = "FF_SPONSOR_TIER_EQUALIZE_V1"

CSS_SNIP = r'''
/* FF_SPONSOR_TIER_EQUALIZE_V1:BEGIN */
/* Make tier cards behave like a disciplined product grid (equal height + pinned CTAs). */
.ff-body .ff-sponsorGrid > li{
  display: flex;
}

.ff-body .ff-sponsorGrid > li > :where(.ff-tierCard, .ff-card){
  flex: 1 1 auto;
  width: 100%;
}

/* If the tier card itself isn’t already a flex column, enforce it. */
.ff-body :where(.ff-tierCard, .ff-card){
  display: flex;
  flex-direction: column;
}

/* Pin the primary CTA to the bottom when it’s a direct child (common structure). */
.ff-body :where(.ff-tierCard, .ff-card) > :where(a.ff-btn, button.ff-btn){
  margin-top: auto;
}

/* Keyboard UX: make focused cards feel intentional without neon spam. */
.ff-body :where(.ff-tierCard, .ff-card):focus-within{
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.08),
    0 14px 40px rgba(0, 0, 0, 0.18);
}

/* Webdriver stabilization: no surprise elevation in automation. */
:where(.ff-root)[data-ff-webdriver="true"] .ff-body :where(.ff-tierCard, .ff-card):focus-within{
  box-shadow: 0 0 0 1px rgba(0,0,0,0.08) !important;
}
/* FF_SPONSOR_TIER_EQUALIZE_V1:END */
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

    if MARK in css:
        print("✅ Already patched (marker present)")
        print(f"• CSS: already patched -> {css_path}")
        return

    m = re.search(r"/\*\s*EOF:\s*app/static/css/ff\.css\s*\*/", css)
    if not m:
        raise SystemExit("❌ Could not find CSS EOF marker: /* EOF: app/static/css/ff.css */")

    bak = backup(css_path, "sponsors_tier_equalize_v1")
    out = css[:m.start()] + "\n" + CSS_SNIP + "\n" + css[m.start():]
    css_path.write_text(out, encoding="utf-8")

    print("✅ Patch complete")
    print(f"• CSS: changed -> {css_path}")
    print(f"  🗄️  backup: {bak}")


if __name__ == "__main__":
    main()
