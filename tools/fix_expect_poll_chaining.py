#!/usr/bin/env python3
"""
Fix illegal `.catch()` chaining on Playwright `expect.poll()`.

Handles BOTH:
  await expect.poll(...).catch(...)
  const x = await expect.poll(...).catch(...)

Rewrites to try/catch blocks.

Safe, idempotent, creates backups.
"""

from pathlib import Path
import re
from datetime import datetime
import sys

# Case 1: await expect.poll(...).catch(...)
AWAIT_CHAIN_RE = re.compile(
    r"""
    await\s+expect\.poll\(
        (?P<body>[\s\S]*?)
    \)
    \s*\.catch\(\s*\(\s*\)\s*=>\s*(?P<fallback>[^)]+)\s*\)
    \s*;
    """,
    re.VERBOSE,
)

# Case 2: const x = await expect.poll(...).catch(...)
ASSIGN_CHAIN_RE = re.compile(
    r"""
    (?P<decl>const|let)\s+
    (?P<var>[a-zA-Z_$][\w$]*)\s*=\s*
    await\s+expect\.poll\(
        (?P<body>[\s\S]*?)
    \)
    \s*\.catch\(\s*\(\s*\)\s*=>\s*(?P<fallback>[^)]+)\s*\)
    \s*;
    """,
    re.VERBOSE,
)

def patch_file(path: Path) -> bool:
    src = path.read_text(encoding="utf-8")
    changed = False

    def repl_assign(m):
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

    def repl_await(m):
        nonlocal changed
        changed = True
        body = m.group("body").strip()
        fallback = m.group("fallback").strip()

        return f"""try {{
  await expect.poll(
{body}
  ).toBe(true);
}} catch {{
  {fallback};
}}
"""

    out = ASSIGN_CHAIN_RE.sub(repl_assign, src)
    out = AWAIT_CHAIN_RE.sub(repl_await, out)

    if changed:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = path.with_suffix(path.suffix + f".bak.{ts}")
        backup.write_text(src, encoding="utf-8")
        path.write_text(out, encoding="utf-8")
        print(f"✅ Fixed expect.poll().catch() in {path}")
        print(f"🧷 Backup: {backup}")

    return changed

def main():
    if len(sys.argv) < 2:
        print("Usage: fix_expect_poll_chaining.py <file-or-dir> [...]")
        sys.exit(1)

    files = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_dir():
            files.extend(p.rglob("*.spec.ts"))
        elif p.is_file():
            files.append(p)

    touched = 0
    for f in files:
        if patch_file(f):
            touched += 1

    if touched == 0:
        print("ℹ️ No illegal expect.poll().catch() patterns found")
    else:
        print(f"🎯 Patched {touched} file(s)")

if __name__ == "__main__":
    main()
