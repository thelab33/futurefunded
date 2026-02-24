#!/usr/bin/env python3
"""
FutureFunded patcher — overlays + Playwright smoke stability

What it patches:
1) Playwright hidden CTA failures:
   - page.locator('[data-ff-open-checkout]').first()  -> '[data-ff-open-checkout]:visible'
   - page.locator('[data-ff-open-sponsor]').first()   -> '[data-ff-open-sponsor]:visible'

2) Close button click stability:
   - adds `await closeBtn.scrollIntoViewIfNeeded();` before `await closeBtn.click();`
     (in tests/smoke_checkout.spec.js)

3) Overlay stacking hardening in CSS:
   - injects a small, deterministic z-index/stacking snippet into @layer ff.utilities { ... }

4) ff_checkout_ux hit-test clamp:
   - replaces assertCloseButtonOnTopOfBackdrop() with a clamped version (prevents y < 0 hit tests)

Usage:
  python3 tools/ff_patch_overlay_and_tests.py --dry-run
  python3 tools/ff_patch_overlay_and_tests.py --apply

Optional:
  python3 tools/ff_patch_overlay_and_tests.py --apply --root /path/to/futurefunded
"""

from __future__ import annotations

import argparse
import datetime as _dt
import re
import sys
from pathlib import Path
from typing import Tuple, Optional


VISIBLE_LOCATOR_PATCHES = [
    # open checkout
    (
        re.compile(
            r"""page\.locator\(\s*(['"])\[data-ff-open-checkout\]\1\s*\)\.first\(\)""",
            re.MULTILINE,
        ),
        r"""page.locator(\1[data-ff-open-checkout]:visible\1).first()""",
        "Make open-checkout locator prefer visible elements",
    ),
    # open sponsor
    (
        re.compile(
            r"""page\.locator\(\s*(['"])\[data-ff-open-sponsor\]\1\s*\)\.first\(\)""",
            re.MULTILINE,
        ),
        r"""page.locator(\1[data-ff-open-sponsor]:visible\1).first()""",
        "Make open-sponsor locator prefer visible elements",
    ),
    # close checkout
    (
        re.compile(
            r"""page\.locator\(\s*(['"])#checkout\s+button\[data-ff-close-checkout\]\1\s*\)\.first\(\)""",
            re.MULTILINE,
        ),
        r"""page.locator(\1#checkout button[data-ff-close-checkout]:visible\1).first()""",
        "Make close-checkout locator prefer visible elements",
    ),
]


OVERLAY_STACKING_CSS_SNIPPET = r"""
/* Overlay stacking hardening — ensures panel is always above backdrop */
.ff-body .ff-sheet,
.ff-body .ff-modal,
.ff-body .ff-drawer {
  position: fixed;
  inset: 0;
  z-index: 1000; /* base overlay plane */
}

/* Backdrops below panels */
.ff-body .ff-sheet__backdrop,
.ff-body .ff-modal__backdrop,
.ff-body .ff-drawer__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000; /* backdrop plane */
  pointer-events: auto;
}

/* Panels above backdrops */
.ff-body .ff-sheet__panel,
.ff-body .ff-modal__panel,
.ff-body .ff-drawer__panel {
  position: relative;
  z-index: 1001; /* panel plane */
  pointer-events: auto;
  isolation: isolate; /* prevents weird stacking-context surprises */
}

/* Close buttons must win */
.ff-body .ff-sheet__panel [data-ff-close-checkout],
.ff-body .ff-modal__panel [data-ff-close-sponsor],
.ff-body .ff-modal__panel [data-ff-close-video],
.ff-body .ff-drawer__panel [data-ff-close-drawer] {
  position: relative;
  z-index: 1002;
}
""".strip("\n")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="strict")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def backup_file(path: Path) -> Path:
    ts = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak.{ts}")
    bak.write_bytes(path.read_bytes())
    return bak


def apply_regex_patches(src: str, patches) -> Tuple[str, int, list]:
    changed = 0
    notes = []
    out = src
    for rx, repl, label in patches:
        new_out, n = rx.subn(repl, out)
        if n:
            out = new_out
            changed += n
            notes.append(f"{label}: {n} change(s)")
    return out, changed, notes


def find_block_by_brace_matching(src: str, open_index: int) -> Optional[Tuple[int, int]]:
    """
    Given index at the '{' character, return (start, end) indices
    where end is inclusive index of the matching '}'.
    """
    if open_index < 0 or open_index >= len(src) or src[open_index] != "{":
        return None
    depth = 0
    for i in range(open_index, len(src)):
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return (open_index, i)
    return None


def inject_css_into_ff_utilities(ff_css: str) -> Tuple[str, bool, str]:
    """
    Inject snippet near end of @layer ff.utilities { ... } if not present.
    """
    marker = "Overlay stacking hardening"
    if marker in ff_css:
        return ff_css, False, "ff.css: overlay stacking snippet already present"

    # Find "@layer ff.utilities {" (must exist in your deterministic contract)
    m = re.search(r"@layer\s+ff\.utilities\s*\{", ff_css)
    if not m:
        return ff_css, False, "ff.css: could not find '@layer ff.utilities {' block"

    # Locate the opening brace '{'
    brace_open = ff_css.find("{", m.start())
    block = find_block_by_brace_matching(ff_css, brace_open)
    if not block:
        return ff_css, False, "ff.css: could not brace-match ff.utilities block"

    _, brace_close = block

    # Inject just before the closing brace
    before = ff_css[:brace_close].rstrip() + "\n\n" + OVERLAY_STACKING_CSS_SNIPPET + "\n\n"
    after = ff_css[brace_close:].lstrip()
    patched = before + after

    return patched, True, "ff.css: injected overlay stacking snippet into @layer ff.utilities"


def patch_smoke_checkout_scroll(js_src: str) -> Tuple[str, bool, str]:
    """
    Insert scrollIntoViewIfNeeded before closeBtn.click in smoke_checkout.spec.js
    (idempotent; won't double insert).
    """
    if "scrollIntoViewIfNeeded()" in js_src:
        return js_src, False, "smoke_checkout.spec.js: scrollIntoViewIfNeeded already present"

    # Look for:
    # const closeBtn = page.locator(...);
    # await expect(closeBtn).toBeVisible();
    # await closeBtn.click();
    pattern = re.compile(
        r"(const\s+closeBtn\s*=\s*page\.locator\([^\)]*\)\.first\(\)\s*;\s*"
        r"await\s+expect\(\s*closeBtn\s*\)\.toBeVisible\(\s*\)\s*;\s*)"
        r"(await\s+closeBtn\.click\(\s*\)\s*;)",
        re.MULTILINE,
    )

    def repl(m: re.Match) -> str:
        head = m.group(1)
        click = m.group(2)
        return head + "await closeBtn.scrollIntoViewIfNeeded();\n  " + click

    new_src, n = pattern.subn(repl, js_src, count=1)
    if n:
        return new_src, True, "smoke_checkout.spec.js: inserted scrollIntoViewIfNeeded before clicking close"

    # Fallback: insert right before first "await closeBtn.click();"
    fallback = re.compile(r"^\s*await\s+closeBtn\.click\(\s*\)\s*;\s*$", re.MULTILINE)
    if fallback.search(js_src):
        new_src = fallback.sub("  await closeBtn.scrollIntoViewIfNeeded();\n  await closeBtn.click();", js_src, count=1)
        return new_src, True, "smoke_checkout.spec.js: inserted scrollIntoViewIfNeeded (fallback match)"

    return js_src, False, "smoke_checkout.spec.js: could not find closeBtn.click() site to patch"


def replace_ts_function(src: str, func_name: str, new_func: str) -> Tuple[str, bool, str]:
    """
    Replace an existing `async function {func_name}(...) { ... }` using brace matching.
    """
    # Find start
    m = re.search(rf"\basync\s+function\s+{re.escape(func_name)}\s*\(", src)
    if not m:
        return src, False, f"{func_name}: function not found"

    # Find the opening brace of the function body
    brace_open = src.find("{", m.start())
    if brace_open == -1:
        return src, False, f"{func_name}: could not find opening brace"

    block = find_block_by_brace_matching(src, brace_open)
    if not block:
        return src, False, f"{func_name}: could not brace-match function body"

    start = m.start()
    _, end_brace = block

    patched = src[:start].rstrip() + "\n\n" + new_func.strip() + "\n\n" + src[end_brace + 1 :].lstrip()
    return patched, True, f"{func_name}: replaced function body"


NEW_ASSERT_CLOSE_TS = r"""
async function assertCloseButtonOnTopOfBackdrop(page: Page) {
  const close = page.locator('#checkout button[data-ff-close-checkout]:visible').first();
  await expect(close).toBeVisible();
  await close.scrollIntoViewIfNeeded();

  const box = await close.boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) {
    throw new Error("Close button has no box or viewport size is missing.");
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const x = clamp(box.x + box.width / 2, 1, vp.width - 2);
  const y = clamp(box.y + box.height / 2, 1, vp.height - 2);

  const top = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('button[data-ff-close-checkout]') ? "close" : ((el as HTMLElement).className || el.tagName);
  }, { x, y });

  if (top !== "close") {
    throw new Error([
      "Close button is NOT the topmost clickable target — backdrop (or another layer) is intercepting clicks.",
      `Hit: (${Math.round(x)}, ${Math.round(y)}) top=${top}`,
      "Fix: close must render above backdrop (z-index) and be within the same stacking context, or backdrop must not cover it.",
    ].join("\\n"));
  }
}
""".strip()


def patch_file(path: Path, apply: bool) -> Tuple[bool, list]:
    """
    Apply all appropriate patches based on file name/path.
    Returns (changed?, notes)
    """
    if not path.exists():
        return False, [f"SKIP: {path} (not found)"]

    original = read_text(path)
    src = original
    notes = []
    changed_any = False

    # 1) Locator :visible patches across test files
    if path.as_posix().startswith("tests/") and path.suffix in (".ts", ".js", ".mjs"):
        src2, n, nnotes = apply_regex_patches(src, VISIBLE_LOCATOR_PATCHES)
        if n:
            src = src2
            notes.extend(nnotes)
            changed_any = True

    # 2) smoke_checkout scrollIntoView patch
    if path.as_posix() == "tests/smoke_checkout.spec.js":
        src2, did, note = patch_smoke_checkout_scroll(src)
        notes.append(note)
        if did:
            src = src2
            changed_any = True

    # 3) ff_checkout_ux clamp patch
    if path.as_posix() == "tests/ff_checkout_ux.spec.ts":
        if "Close button is NOT the topmost clickable target" in src and "clamp(" in src and "scrollIntoViewIfNeeded" in src:
            notes.append("ff_checkout_ux.spec.ts: assertCloseButtonOnTopOfBackdrop already appears patched")
        else:
            src2, did, note = replace_ts_function(src, "assertCloseButtonOnTopOfBackdrop", NEW_ASSERT_CLOSE_TS)
            notes.append(f"ff_checkout_ux.spec.ts: {note}")
            if did:
                src = src2
                changed_any = True

    # 4) ff.css overlay stacking injection
    if path.as_posix() == "app/static/css/ff.css":
        src2, did, note = inject_css_into_ff_utilities(src)
        notes.append(note)
        if did:
            src = src2
            changed_any = True

    if changed_any and src != original:
        if apply:
            bak = backup_file(path)
            write_text(path, src)
            notes.append(f"WROTE: {path} (backup: {bak.name})")
        else:
            notes.append(f"DRY-RUN: would write {path}")

    return changed_any, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Project root (default: .)")
    ap.add_argument("--apply", action="store_true", help="Apply changes (writes files).")
    ap.add_argument("--dry-run", action="store_true", help="Dry run (default if --apply not set).")
    args = ap.parse_args()

    apply = bool(args.apply) and not bool(args.dry_run)
    root = Path(args.root).resolve()

    targets = [
        root / "tests/ff_checkout_ux.spec.ts",
        root / "tests/ff_smoke.spec.mjs",
        root / "tests/smoke_ff_v1.spec.ts",
        root / "tests/smoke_checkout.spec.js",
        root / "app/static/css/ff.css",
    ]

    any_changes = False
    print(f"[ff-patch] root={root}")
    print(f"[ff-patch] mode={'APPLY' if apply else 'DRY-RUN'}")

    for p in targets:
        rel = p.relative_to(root) if p.is_absolute() else p
        changed, notes = patch_file(rel if not p.is_absolute() else p, apply=apply)
        any_changes = any_changes or changed
        print(f"\n--- {rel} ---")
        for n in notes:
            print(" - " + n)

    print("\n[ff-patch] done.")
    if not any_changes:
        print("[ff-patch] no changes needed (already patched or patterns not found).")
    else:
        print("[ff-patch] changes detected." + (" Applied." if apply else " (dry-run only)"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
