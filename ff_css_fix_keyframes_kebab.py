#!/usr/bin/env python3
"""
ff_css_fix_keyframes_kebab.py

Renames camelCase FF keyframes to kebab-case to satisfy stylelint
(keyframes-name-pattern) and updates animation/animation-name references.

Usage:
  python scripts/ff_css_fix_keyframes_kebab.py app/static/css/ff.css
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from datetime import datetime

MAP = {
    "ffPulseGlow": "ff-pulse-glow",
    "ffFadeIn": "ff-fade-in",
    "ffFadeOut": "ff-fade-out",
    "ffPanelIn": "ff-panel-in",
    "ffPanelOut": "ff-panel-out",
    "ffGlowPulse": "ff-glow-pulse",
}

ANIM_PROP_RE = re.compile(r"(?mi)\banimation(?:-name)?\s*:\s*([^;]+);")

def backup_path(p: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return p.with_suffix(p.suffix + f".bak_keyframes_{ts}")

def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/ff_css_fix_keyframes_kebab.py app/static/css/ff.css")
        return 2

    p = Path(sys.argv[1])
    if not p.exists():
        print(f"❌ File not found: {p}")
        return 2

    css = p.read_text(encoding="utf-8", errors="replace")
    bak = backup_path(p)
    bak.write_text(css, encoding="utf-8")

    changed = 0

    # Rename @keyframes declarations
    for old, new in MAP.items():
        css2, n = re.subn(rf"(?mi)@keyframes\s+{re.escape(old)}\b", f"@keyframes {new}", css)
        if n:
            css = css2
            changed += n

    # Rewrite animation / animation-name usages safely
    def rewrite_anim_decl(m: re.Match) -> str:
        val = m.group(1)
        # Replace whole-word occurrences only inside the value
        for old, new in MAP.items():
            val = re.sub(rf"(?<![-\w]){re.escape(old)}(?![-\w])", new, val)
        return m.group(0).split(":")[0] + ": " + val.strip() + ";"

    css2, n2 = ANIM_PROP_RE.subn(rewrite_anim_decl, css)
    if n2:
        css = css2
        changed += n2

    p.write_text(css, encoding="utf-8")

    print("✅ Keyframes kebab-case fix complete")
    print("🗄 Backup:", bak)
    print("🔁 Changes:", changed)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
