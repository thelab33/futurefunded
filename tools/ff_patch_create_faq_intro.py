#!/usr/bin/env python3
"""
ff_patch_create_faq_intro.py
Idempotently inserts the shared Create+FAQ micro-header into index.html.

Patch behavior:
- If .ff-createFaqIntro already exists -> no-op (exit 0).
- Otherwise insert the header immediately before the first .ff-createFaqGrid opening tag.
- Preserves indentation based on the .ff-createFaqGrid line.
- Fails with a clear error if it can't find .ff-createFaqGrid.

Usage:
  python3 tools/ff_patch_create_faq_intro.py --file app/templates/index.html --write
  python3 tools/ff_patch_create_faq_intro.py --check
  python3 tools/ff_patch_create_faq_intro.py --diff
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

INTRO_HTML = """\
<header class="ff-createFaqIntro" aria-label="Coach onboarding and FAQ">
  <div class="ff-createFaqIntro__text ff-minw-0">
    <p class="ff-kicker ff-m-0">For coaches • FAQ</p>
    <h2 class="ff-h3 ff-m-0">Want a page like this for your team?</h2>
    <p class="ff-help ff-muted ff-m-0">Brand → checkout → share. Built for phones, sponsors, and receipts.</p>
  </div>

  <div class="ff-createFaqIntro__actions" role="group" aria-label="Quick actions">
    <a class="ff-btn ff-btn--sm ff-btn--primary ff-btn--pill" data-ff-open-checkout="" href="#checkout">Donate</a>
    <a class="ff-btn ff-btn--sm ff-btn--secondary ff-btn--pill" data-ff-open-sponsor="" href="#sponsor-interest" aria-controls="sponsor-interest">Sponsor</a>
    <button class="ff-btn ff-btn--sm ff-btn--pill" data-ff-share="" type="button">Share</button>
  </div>
</header>
"""

# Match a div whose class attribute contains ff-createFaqGrid (supports single/double quotes, extra classes)
GRID_OPEN_RE = re.compile(
    r'^(?P<indent>[ \t]*)<div\b[^>]*\bclass=(?P<q>["\'])(?P<class>[^"\']*\bff-createFaqGrid\b[^"\']*)(?P=q)[^>]*>',
    re.IGNORECASE | re.MULTILINE,
)

INTRO_EXISTS_RE = re.compile(r'\bff-createFaqIntro\b')


def _indent_block(block: str, indent: str) -> str:
    lines = block.splitlines()
    return "\n".join((indent + ln if ln.strip() else ln) for ln in lines) + "\n"


def patch_text(text: str) -> tuple[str, bool]:
    # No-op if already present
    if INTRO_EXISTS_RE.search(text):
        return text, False

    m = GRID_OPEN_RE.search(text)
    if not m:
        raise RuntimeError("Could not find an opening <div> with class containing 'ff-createFaqGrid'.")

    indent = m.group("indent")

    insert_at = m.start()  # insert right before the grid div
    intro = _indent_block(INTRO_HTML.rstrip("\n"), indent)

    # Ensure exactly one blank line between intro and grid for neatness
    new_text = text[:insert_at] + intro + text[insert_at:]

    return new_text, True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="app/templates/index.html", help="Path to index.html (Jinja template)")
    ap.add_argument("--write", action="store_true", help="Write changes in-place")
    ap.add_argument("--diff", action="store_true", help="Print unified diff to stdout")
    ap.add_argument("--check", action="store_true", help="Exit 0 if already patched OR patchable; 1 if missing target")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 2

    original = path.read_text(encoding="utf-8")

    try:
        updated, changed = patch_text(original)
    except Exception as e:
        if args.check:
            print(f"CHECK FAILED: {e}", file=sys.stderr)
            return 1
        print(f"ERROR: {e}", file=sys.stderr)
        return 3

    if args.diff:
        diff = difflib.unified_diff(
            original.splitlines(True),
            updated.splitlines(True),
            fromfile=str(path),
            tofile=str(path) + " (patched)",
        )
        sys.stdout.writelines(diff)

    if args.write and changed:
        path.write_text(updated, encoding="utf-8")
        print(f"✅ Patched: inserted ff-createFaqIntro before ff-createFaqGrid in {path}")
    elif args.write and not changed:
        print(f"✅ No-op: ff-createFaqIntro already present in {path}")
    else:
        # default behavior: print a short status (no file write)
        print("PATCHABLE" if changed else "ALREADY_PATCHED")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
