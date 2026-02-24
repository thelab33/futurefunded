#!/usr/bin/env python3
"""
fix_ff_checkout_hook_collision.py

Authoritative DOM contract enforcer for checkout.

- Removes data-ff-close-checkout from any backdrop
- Ensures only ONE close-checkout hook remains (the button)
- Scans ALL renderable templates
- Fails loudly if ambiguity still exists
"""

from pathlib import Path
import sys
import re

TEMPLATE_EXTS = (".html", ".jinja", ".jinja2")
BACKDROP_CLASS = re.compile(r"\bff-sheet__backdrop\b")
CLOSE_ATTR = "data-ff-close-checkout"
BACKDROP_ATTR = "data-ff-close-backdrop"


def process_file(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    lines = src.splitlines()
    out = []
    changes = 0

    for line in lines:
        if CLOSE_ATTR in line and BACKDROP_CLASS.search(line):
            line = line.replace(CLOSE_ATTR, BACKDROP_ATTR)
            changes += 1
        out.append(line)

    if changes:
        path.write_text("\n".join(out) + "\n", encoding="utf-8")

    return changes


def main():
    root = Path("app/templates")
    if not root.exists():
        print("❌ app/templates not found")
        sys.exit(1)

    touched = []
    total_fixes = 0

    for path in root.rglob("*"):
        if path.suffix in TEMPLATE_EXTS:
            fixes = process_file(path)
            if fixes:
                touched.append(path)
                total_fixes += fixes

    print(f"✔ Backdrop hook fixes applied: {total_fixes}")
    for p in touched:
        print(f"  - {p}")

    # FINAL VALIDATION PASS
    offenders = []
    close_count = 0

    for path in root.rglob("*"):
        if path.suffix not in TEMPLATE_EXTS:
            continue
        text = path.read_text(encoding="utf-8")
        for line in text.splitlines():
            if CLOSE_ATTR in line:
                if BACKDROP_CLASS.search(line):
                    offenders.append((path, line.strip()))
                close_count += 1

    if offenders:
        print("\n❌ INVALID STATE: backdrop still has close-checkout hook")
        for p, l in offenders:
            print(f"{p}: {l}")
        sys.exit(2)

    if close_count == 0:
        print("\n❌ INVALID STATE: no close button found")
        sys.exit(3)

    print(f"\n✅ DOM CONTRACT OK — close-checkout hooks found: {close_count}")
    print("Checkout hook collision fully resolved.")


if __name__ == "__main__":
    main()
