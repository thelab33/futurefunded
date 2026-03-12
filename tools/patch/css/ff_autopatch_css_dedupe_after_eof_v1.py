from __future__ import annotations

import argparse
import re
from pathlib import Path

EOF_MARK = "/* EOF: app/static/css/ff.css */"
DEFAULT_FILE = Path("app/static/css/ff.css")

MARK_OVERLAY = "FF_OVERLAY_CONSOLIDATED_HARDEN_V1"
MARK_CONTRAST = "FF_CONTRAST_CONSOLIDATED_RESCUE_V1"

OVERLAY_SNIPPET_IN_CONTROLS = r"""
/* ============================================================================
[ff-css] FF_OVERLAY_CONSOLIDATED_HARDEN_V1
Purpose:
- Dedupes ALL post-EOF overlay hotfixes by consolidating into one deterministic block
- Guarantees: checkout close button is topmost clickable target (Playwright gate)
- Guarantees: backdrop never steals clicks from panel controls
- Keeps [hidden] semantics absolute (even with :target)
Scope: #checkout only • Hook-safe • No selector renames
============================================================================ */

/* Contract: [hidden] ALWAYS wins */
.ff-body :where(#checkout.ff-sheet, #checkout.ff-modal, #checkout)[hidden],
.ff-body :where(#checkout.ff-sheet, #checkout.ff-modal, #checkout):target[hidden]{
  display:none !important;
  visibility:hidden !important;
  pointer-events:none !important;
}

/* Checkout root must be interactive (never pointer-events:none) */
.ff-body :where(#checkout, #checkout.ff-sheet, #checkout[data-ff-checkout-sheet]){
  position: fixed !important;
  inset: 0 !important;
  isolation: isolate !important;
  pointer-events: auto !important;
}

/* Backdrop below panel, still clickable */
.ff-body #checkout :where(
  .ff-sheet__backdrop,
  a.ff-sheet__backdrop,
  .ff-sheet__backdrop--flagship,
  .ff-modal__backdrop,
  .ff-overlay__backdrop,
  [data-ff-backdrop],
  .ff-backdrop
){
  position: fixed !important;
  inset: 0 !important;
  z-index: 0 !important;
  pointer-events: auto !important;
  -webkit-tap-highlight-color: transparent !important;
}

/* Panel above backdrop */
.ff-body #checkout :where(.ff-sheet__panel, .ff-sheet__panel--flagship){
  position: relative !important;
  z-index: 1 !important;
  pointer-events: auto !important;
}

/* Header above panel content */
.ff-body #checkout :where(.ff-sheet__header, .ff-sheet__head){
  position: sticky !important;
  top: 0 !important;
  z-index: 2 !important;
  pointer-events: auto !important;
}

/* Close must ALWAYS win hit-testing */
.ff-body #checkout :where(
  button[data-ff-close-checkout],
  [data-ff-close-checkout],
  .ff-sheet__close,
  .ff-close,
  [data-ff-close],
  button[aria-label="Close"],
  a[aria-label="Close"]
){
  position: relative !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}

/* Kill click-stealing decorative pseudos */
.ff-body #checkout :where(
  .ff-sheet__panel,
  .ff-sheet__header,
  .ff-sheet__viewport,
  .ff-sheet__content,
  .ff-sheet__scroll,
  .ff-checkoutShell,
  .ff-checkoutBody,
  .ff-glass,
  .ff-surface,
  .ff-card
)::before,
.ff-body #checkout :where(
  .ff-sheet__panel,
  .ff-sheet__header,
  .ff-sheet__viewport,
  .ff-sheet__content,
  .ff-sheet__scroll,
  .ff-checkoutShell,
  .ff-checkoutBody,
  .ff-glass,
  .ff-surface,
  .ff-card
)::after{
  pointer-events: none !important;
}

/* Scroll contract sanity */
.ff-body #checkout :where(.ff-sheet__viewport, [data-ff-checkout-viewport]){ min-height: 0 !important; }
.ff-body #checkout :where(.ff-sheet__content, [data-ff-checkout-content]){ min-height: 0 !important; }
.ff-body #checkout :where(.ff-sheet__scroll, [data-ff-checkout-scroll]){
  min-height: 0 !important;
  overflow: auto !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior: contain !important;
}

/* Ensure backdrop is visible while open (even if accidental [hidden] was applied) */
.ff-body #checkout:where(:target, .is-open, [data-open="true"], [aria-hidden="false"]) :where(.ff-sheet__backdrop, a.ff-sheet__backdrop)[hidden]{
  display:block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
""".lstrip("\n")

CONTRAST_SNIPPET_IN_CONTROLS = r"""
/* ============================================================================
[ff-css] FF_CONTRAST_CONSOLIDATED_RESCUE_V1
Purpose:
- Keep AA+ contrast for primary CTAs + key chips in light/dark
- Hook-safe: no renames, only overrides where needed
============================================================================ */

.ff-body :where(a.ff-btn.ff-btn--primary, button.ff-btn.ff-btn--primary){
  background: var(--ff-accent-cta, #c2410c) !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
  color: var(--ff-on-accent, #fff) !important;
}

.ff-body :where(a.ff-btn.ff-btn--primary, button.ff-btn.ff-btn--primary) :where(.ff-btn__label, .ff-btn__meta, .ff-btn__sub, span){
  color: inherit !important;
}

/* Hero rail chip readability */
.ff-body .ff-railcard__chip{
  background: rgba(10, 13, 20, 0.08) !important;
  color: rgba(10, 13, 20, 0.92) !important;
  border: 1px solid rgba(10, 13, 20, 0.12) !important;
}
.ff-root[data-theme="dark"] .ff-body .ff-railcard__chip,
.ff-root[data-theme="system_dark"] .ff-body .ff-railcard__chip{
  background: rgba(255, 255, 255, 0.10) !important;
  color: rgba(255, 255, 255, 0.92) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}
""".lstrip("\n")


def find_layer_block(text: str, layer_name: str) -> tuple[int, int]:
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


def insert_into_layer(text: str, layer_name: str, snippet: str, marker: str) -> tuple[str, bool]:
    if marker in text:
        return text, False

    start, end = find_layer_block(text, layer_name)
    block = text[start:end]
    insert_at = block.rfind("}")
    if insert_at < 0:
        raise ValueError(f"Could not locate closing '}}' for @layer {layer_name}")

    new_block = block[:insert_at] + "\n\n" + snippet + "\n" + block[insert_at:]
    return text[:start] + new_block + text[end:], True


def _fix_stylelint_contain_intrinsic_size_empty(text: str) -> tuple[str, int]:
    # stylelint will flag: contain-intrinsic-size: "" ;
    # Safest deterministic fix: remove only the invalid empty-string declarations.
    pat = re.compile(r'contain-intrinsic-size\s*:\s*(?:""|\'\')\s*;', re.I)
    new_text, n = pat.subn("", text)
    return new_text, n


def patch(path: Path, write: bool) -> int:
    src = path.read_text(encoding="utf-8")

    eof_pos = src.find(EOF_MARK)
    if eof_pos < 0:
        raise SystemExit(f"[ff-dedupe] Missing EOF marker: {EOF_MARK}")

    pre = src[:eof_pos].rstrip()
    tail = src[eof_pos + len(EOF_MARK):]

    tail_bytes = len(tail.encode("utf-8"))
    had_tail = bool(tail.strip())

    # Build cleaned base: everything BEFORE first EOF (we will re-append EOF at end)
    out = pre

    # Fix known stylelint footgun if present in the kept portion
    out, fixed_contain = _fix_stylelint_contain_intrinsic_size_empty(out)

    # Always ensure consolidated overlay hardening exists (end of ff.controls)
    out, overlay_added = insert_into_layer(out, "ff.controls", OVERLAY_SNIPPET_IN_CONTROLS, MARK_OVERLAY)

    # Keep contrast rescue only if it existed anywhere in original (pre OR tail)
    had_any_contrast_rescue = ("FF CONTRAST RESCUE" in src) or ("FF_CONTRAST" in src) or (MARK_CONTRAST in src)
    if had_any_contrast_rescue and (MARK_CONTRAST not in out) and ("FF CONTRAST RESCUE" not in out):
        out, contrast_added = insert_into_layer(out, "ff.controls", CONTRAST_SNIPPET_IN_CONTROLS, MARK_CONTRAST)
    else:
        contrast_added = False

    # Re-append ONE EOF at the end (single source of truth)
    out = out.rstrip() + "\n\n" + EOF_MARK + "\n"

    if out == src:
        print("[ff-dedupe] no changes needed ✅")
        return 0

    if not write:
        print("[ff-dedupe] dry-run: would patch", path)
        print(f"[ff-dedupe] tail after EOF: {'present' if had_tail else 'none'} ({tail_bytes} bytes)")
        print(f"[ff-dedupe] fixed contain-intrinsic-size empty: {fixed_contain}")
        return 0

    bak = path.with_suffix(path.suffix + ".bak_dedupe_after_eof_v1")
    if not bak.exists():
        bak.write_text(src, encoding="utf-8")
        print(f"[ff-dedupe] backup -> {bak}")

    path.write_text(out, encoding="utf-8")
    print("[ff-dedupe] patched ff.css ✅")
    print(f"[ff-dedupe] removed tail after EOF: {'yes' if had_tail else 'no'} ({tail_bytes} bytes)")
    print(f"[ff-dedupe] inserted overlay pack: {'yes' if overlay_added else 'no'}")
    print(f"[ff-dedupe] inserted contrast rescue: {'yes' if contrast_added else 'no'}")
    print(f"[ff-dedupe] fixed contain-intrinsic-size empty: {fixed_contain}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=str(DEFAULT_FILE), help="Path to ff.css")
    ap.add_argument("--write", action="store_true", help="Apply patch (default is dry-run)")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"[ff-dedupe] missing file: {path}")
    return patch(path, write=bool(args.write))


if __name__ == "__main__":
    raise SystemExit(main())
