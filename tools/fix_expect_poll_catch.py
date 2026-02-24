#!/usr/bin/env python3
"""
Fix illegal `.catch()` usage on Playwright `expect.poll()`.

Rewrites:
  await expect.poll(...).catch(() => X)

Into:
  let _tmp = X;
  try {
    await expect.poll(...).toBe(true);
    _tmp = true;
  } catch {}

Creates a timestamped backup before modifying files.
"""

import sys
import re
from pathlib import Path
from datetime import datetime

POLL_CATCH_RE = re.compile(
    r"""
    (?P<lhs>const|let)\s+
    (?P<var>[a-zA-Z_$][\w$]*)\s*=\s*
    await\s+expect\.poll\(
        (?P<body>[\s\S]*?)
    \)\s*
    \.catch\(\s*\(\s*\)\s*=>\s*(?P<fallback>[^)]+)\s*\)
    \s*;
    """,
    re.VERBOSE,
)

def patch_file(path: Path) -> bool:
    src = path.read_text(encoding="utf-8")
    changed = False

    def repl(m):
        nonlocal changed
        changed = True

        var = m.group("var")
        body = m.group("body").strip()
        fallback = m.group("fallback").strip()

        return f"""let {var} = {fallback};
try {{
  await expect.poll(
{body}
  ).toBe(true);
  {var} = true;
}} catch {{}}
"""

    out = POLL_CATCH_RE.sub(repl, src)

    if changed:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = path.with_suffix(path.suffix + f".bak.{ts}")
        backup.write_text(src, encoding="utf-8")
        path.write_text(out, encoding="utf-8")
        print(f"✅ Fixed expect.poll().catch() in {path}")
        print(f"🧷 Backup saved to {backup}")

    return changed

def main():
    if len(sys.argv) < 2:
        print("Usage: fix_expect_poll_catch.py <file-or-directory> [...]")
        sys.exit(1)

    targets = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_dir():
            targets.extend(p.rglob("*.spec.ts"))
        elif p.is_file():
            targets.append(p)

    if not targets:
        print("ℹ️ No matching files found")
        return

    total = 0
    for t in targets:
        if patch_file(t):
            total += 1

    if total == 0:
        print("ℹ️ No expect.poll().catch() patterns found")
    else:
        print(f"🎯 Patched {total} file(s)")

if __name__ == "__main__":
    main()
