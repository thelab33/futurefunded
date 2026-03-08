from __future__ import annotations
from pathlib import Path
from datetime import datetime

MARK = "FF_CONTRAST_RESCUE_TOKENS_V1"

BLOCK = r"""
/* === FF_CONTRAST_RESCUE_TOKENS_V1 ==========================================
Goal: collapse systemic contrast failures (strict gate expects 0).
Strategy:
- Raise muted/help/kicker text token contrast in BOTH themes.
- Ensure placeholder text meets AA-like visibility.
NOTE: If your design system uses different token names, update these few lines.
=========================================================================== */

/* Prefer token edits on .ff-root (your contract) */
.ff-root {
  /* Generic "muted" knobs (safe even if unused) */
  --ff-muted: rgba(0, 0, 0, 0.72);
  --ff-text-muted: rgba(0, 0, 0, 0.72);
  --ff-help: rgba(0, 0, 0, 0.72);
}

/* Dark theme: bump muted up (was likely too dim) */
.ff-root[data-theme="dark"],
.ff-root[data-theme='dark'] {
  --ff-muted: rgba(255, 255, 255, 0.78);
  --ff-text-muted: rgba(255, 255, 255, 0.78);
  --ff-help: rgba(255, 255, 255, 0.78);
}

/* Light theme: keep muted readable */
.ff-root:not([data-theme="dark"]) {
  --ff-muted: rgba(0, 0, 0, 0.72);
  --ff-text-muted: rgba(0, 0, 0, 0.72);
  --ff-help: rgba(0, 0, 0, 0.72);
}

/* Placeholder: standard pseudo + adequate contrast */
.ff-root input::placeholder,
.ff-root textarea::placeholder {
  opacity: 1;
  color: currentColor;
  /* If you already set placeholder via tokens, this becomes a gentle floor. */
  filter: saturate(1.05);
}

/* If your CSS uses token-based muted classes, make sure they point to the raised tokens */
.ff-muted { color: var(--ff-text-muted, var(--ff-muted, currentColor)); }
.ff-help  { color: var(--ff-help, var(--ff-text-muted, var(--ff-muted, currentColor))); }

/* ======================================================================== */
"""

def backup(p: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    b = p.with_suffix(p.suffix + f".bak_{MARK}_{ts}")
    b.write_text(p.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    return b

def main() -> None:
    p = Path("app/static/css/ff.css")
    if not p.exists():
        raise SystemExit("❌ ff.css not found")

    css = p.read_text(encoding="utf-8", errors="replace")
    if MARK in css:
        print("✅ Already patched")
        return

    bak = backup(p)
    css2 = css + "\n\n" + BLOCK
    p.write_text(css2, encoding="utf-8")

    print("✅ Appended contrast rescue token overrides")
    print(f"🗄️  backup: {bak}")

if __name__ == "__main__":
    main()
