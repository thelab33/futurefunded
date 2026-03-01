from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "FF_PREMIUM_UIUX_PACK_V2"
DEFAULT_FILE = Path("app/static/css/ff.css")

PREMIUM_BLOCK = r"""
/* ============================================================================
[ff-css] FF_PREMIUM_UIUX_PACK_V2
- Drop-in micro polish (no hook changes)
- Inserted INSIDE @layer ff.utilities { ... } (no new @layer blocks)
- Reduced-motion + forced-colors safe
============================================================================ */

/* --- 1) Trust glow: cards feel “interactive” when forms/buttons focus --- */
.ff-body :where(.ff-card, .ff-glass, .ff-surface):focus-within{
  border-color: rgba(255,95,35,0.30);
  box-shadow: var(--ff-glow), var(--ff-shadow3);
}

/* --- 2) Active nav/tabs (works with aria-current or .is-active) --- */
.ff-body .ff-nav__link[aria-current="page"],
.ff-body .ff-nav__link.is-active,
.ff-body .ff-tab[aria-current="page"],
.ff-body .ff-tab.is-active{
  color: var(--ff-text);
  background: var(--ff-control-bg-hover);
  border-color: var(--ff-outline-2);
  box-shadow: var(--ff-shadow3);
}

/* --- 3) Chips feel pressable + selected state reads cleaner --- */
.ff-body .ff-chip{
  transform: translateZ(0);
}
@media (hover:hover) and (pointer:fine){
  .ff-body .ff-chip:hover{
    box-shadow: var(--ff-shadow3);
  }
}
.ff-body .ff-chip:active{
  transform: translateY(1px) scale(0.99);
}
.ff-body .ff-chip.is-selected,
.ff-body .ff-chip[aria-pressed="true"]{
  border-color: rgba(255,95,35,0.62);
  background: rgba(255,95,35,0.10);
  box-shadow: 0 0 0 4px rgba(255,95,35,0.14);
}

/* --- 4) Hero capsule + rail cards: subtle premium edge + lift --- */
.ff-body .ff-hero__capsule{
  border-color: rgba(255,255,255,0.0);
  box-shadow: var(--ff-shadow2);
}
.ff-root[data-theme="dark"] .ff-body .ff-hero__capsule{
  border-color: rgba(255,255,255,0.10);
}

@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion: no-preference){
  .ff-body .ff-railcard{
    transition: transform var(--ff-med) var(--ff-ease-2), box-shadow var(--ff-med) var(--ff-ease-2), border-color var(--ff-med) var(--ff-ease-2);
  }
  .ff-body .ff-railcard:hover{
    transform: translateY(-2px);
    border-color: var(--ff-outline-2);
    box-shadow: var(--ff-shadow2);
  }
}

/* --- 5) LIVE signaling: calm pulse dot (keeps your existing LIVE pill) --- */
.ff-body [data-ff-live]{
  position: relative;
}
.ff-body [data-ff-live]::before{
  content:"";
  display:inline-block;
  width:8px; height:8px;
  border-radius: var(--ff-r-pill);
  background: var(--ff-good);
  box-shadow: 0 0 0 3px rgba(22,101,52,0.14);
  margin-right: 8px;
  vertical-align: middle;
  transform: translateY(-1px);
}
@media (prefers-reduced-motion: no-preference){
  .ff-body [data-ff-live]::before{
    animation: ff-live-pulse 1.8s ease-in-out infinite;
  }
}
@keyframes ff-live-pulse{
  0%,100%{ opacity:1; box-shadow: 0 0 0 3px rgba(22,101,52,0.14); }
  50%{ opacity:0.65; box-shadow: 0 0 0 6px rgba(22,101,52,0.10); }
}
@media (prefers-reduced-motion: reduce){
  .ff-body [data-ff-live]::before{ animation:none !important; }
}

/* --- 6) Scrollbars: subtle modern polish --- */
.ff-body :where(.ff-sheet__content, .ff-drawer__body, .ff-modal__body, .ff-rail__track){
  scrollbar-width: thin;
  scrollbar-color: rgba(255,95,35,0.55) rgba(2,6,23,0.10);
}
.ff-root[data-theme="dark"] .ff-body :where(.ff-sheet__content, .ff-drawer__body, .ff-modal__body, .ff-rail__track){
  scrollbar-color: rgba(255,95,35,0.55) rgba(255,255,255,0.10);
}

/* --- 7) Tier “Recommended” badge (no markup required) --- */
.ff-body .ff-tierCard--recommended{
  position: relative;
  isolation: isolate;
}
.ff-body .ff-tierCard--recommended::after{
  content:"Recommended";
  position:absolute;
  top: 12px;
  right: 12px;
  padding: 6px 10px;
  border-radius: var(--ff-r-pill);
  border: 1px solid rgba(255,95,35,0.34);
  background: rgba(255,95,35,0.14);
  color: var(--ff-text);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: var(--ff-track-wide);
  text-transform: uppercase;
  pointer-events:none;
}

/* --- 8) Checkout sheet: edge highlight for “premium sheet” feel --- */
.ff-body #checkout :where(.ff-sheet__panel, .ff-sheet__panel--flagship){
  box-shadow: var(--ff-shadow), 0 0 0 1px rgba(255,95,35,0.12);
}

/* --- 9) Forced colors: keep usability crisp --- */
@media (forced-colors: active){
  .ff-body :where(.ff-card, .ff-glass, .ff-surface):focus-within{
    outline: 2px solid Highlight;
    outline-offset: 2px;
    box-shadow: none !important;
  }
}

/* [ff-css] FF_PREMIUM_UIUX_PACK_V2 END */
""".lstrip("\n")


def find_layer_block(text: str, layer_name: str) -> tuple[int, int]:
    """
    Return (start_index, end_index) spanning the FULL @layer block including braces.
    Uses brace counting from the first '{' after '@layer <name>'.
    """
    needle = f"@layer {layer_name}"
    i = text.find(needle)
    if i < 0:
        raise ValueError(f"Could not find '{needle}'")
    brace_open = text.find("{", i)
    if brace_open < 0:
        raise ValueError(f"Could not find '{{' after '{needle}'")

    depth = 0
    j = brace_open
    n = len(text)
    while j < n:
        ch = text[j]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i, j + 1
        j += 1

    raise ValueError(f"Unbalanced braces in @layer {layer_name} block")


def patch_file(path: Path, write: bool) -> int:
    src = path.read_text(encoding="utf-8")

    if MARKER in src:
        print("[ff-premium-v2] already present (no-op) ✅")
        return 0

    # locate utilities layer
    start, end = find_layer_block(src, "ff.utilities")
    block = src[start:end]

    # insert just BEFORE the closing brace of @layer ff.utilities
    insert_at = block.rfind("}")
    if insert_at < 0:
        raise ValueError("Could not locate closing '}' for ff.utilities block")

    new_block = block[:insert_at] + "\n\n" + PREMIUM_BLOCK + "\n" + block[insert_at:]
    out = src[:start] + new_block + src[end:]

    if not write:
        print("[ff-premium-v2] dry-run: would patch", path)
        return 0

    bak = path.with_suffix(path.suffix + ".bak_premium_v2")
    if not bak.exists():
        bak.write_text(src, encoding="utf-8")
        print(f"[ff-premium-v2] backup -> {bak}")

    path.write_text(out, encoding="utf-8")
    print("[ff-premium-v2] patched ff.css ✅")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=str(DEFAULT_FILE), help="Path to ff.css")
    ap.add_argument("--write", action="store_true", help="Apply patch (default is dry-run)")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"[ff-premium-v2] missing file: {path}")

    return patch_file(path, write=bool(args.write))


if __name__ == "__main__":
    raise SystemExit(main())
