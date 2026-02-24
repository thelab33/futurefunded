#!/usr/bin/env python3
"""
patch_ff_checkout_backdrop_hook.py

Fixes DOM hook collision where checkout backdrop incorrectly uses
data-ff-close-checkout, causing Playwright hit-test failures.

- Rewrites backdrop hook to data-ff-close-backdrop
- Leaves real close buttons untouched
- Safe, idempotent, production-ready
"""

from pathlib import Path
import sys
import re

# Heuristic: backdrop elements usually have this class
BACKDROP_CLASS_RE = re.compile(r'\bff-sheet__backdrop\b')

OLD_ATTR = 'data-ff-close-checkout'
NEW_ATTR = 'data-ff-close-backdrop'


def patch_file(path: Path) -> bool:
    src = path.read_text(encoding="utf-8")
    original = src

    lines = src.splitlines()
    out = []

    changed = False

    for line in lines:
        if OLD_ATTR in line and BACKDROP_CLASS_RE.search(line):
            line = line.replace(OLD_ATTR, NEW_ATTR)
            changed = True
        out.append(line)

    if changed:
        path.write_text("\n".join(out) + "\n", encoding="utf-8")

    return changed


def main():
    if len(sys.argv) < 2:
        print("Usage: python patch_ff_checkout_backdrop_hook.py <template_dir_or_file> [...]")
        sys.exit(1)

    targets = [Path(p) for p in sys.argv[1:]]
    files: list[Path] = []

    for t in targets:
        if t.is_file():
            files.append(t)
        elif t.is_dir():
            files.extend(t.rglob("*.html"))
            files.extend(t.rglob("*.jinja"))
            files.extend(t.rglob("*.jinja2"))

    if not files:
        print("⚠️ No template files found.")
        return

    touched = []

    for f in files:
        try:
            if patch_file(f):
                touched.append(f)
        except Exception as e:
            print(f"❌ Failed to patch {f}: {e}")

    if touched:
        print("✅ Fixed backdrop hook collision in:")
        for f in touched:
            print(f"  - {f}")
    else:
        print("✔ No backdrop hook collisions found (already clean).")


if __name__ == "__main__":
    main()
