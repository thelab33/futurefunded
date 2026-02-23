#!/usr/bin/env python3
"""
Patch tests/ff_checkout_ux.spec.ts:
- Remove the broken expect.poll(...).catch() preflightServer
- Replace with a deterministic retry loop (Promise-based)

Usage:
  python3 tools/patch_ff_checkout_preflight.py tests/ff_checkout_ux.spec.ts
"""

from __future__ import annotations
import argparse
from pathlib import Path

REPLACEMENT = r"""
async function preflightServer(request: APIRequestContext) {
  // No expect.poll().catch() — matchers aren't Promises.
  const total = (TIMEOUT as any).preflight ?? 5000;
  const step = Math.min(1500, total);
  const sleep = 250;

  const start = Date.now();
  let lastErr: unknown = null;

  while (Date.now() - start < total) {
    try {
      const res = await request.get(URL_HOME, { timeout: step });
      if (res.ok()) return;
      lastErr = new Error(`HTTP ${res.status()} from ${URL_HOME}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, sleep));
  }

  throw new Error(
    [
      "Preflight failed: server not reachable.",
      `Tried: ${URL_HOME}`,
      `Last error: ${String(lastErr)}`,
      "Fix: ensure your app is running and listening on BASE_URL.",
    ].join("\n")
  );
}
""".lstrip("\n")


def find_function_block(src: str, fn_name: str) -> tuple[int, int] | None:
    needle = f"async function {fn_name}("
    i = src.find(needle)
    if i == -1:
        return None

    # Find opening brace '{' after the signature
    brace_open = src.find("{", i)
    if brace_open == -1:
        return None

    depth = 0
    in_block_comment = False
    in_str = None
    esc = False

    for j in range(brace_open, len(src)):
        ch = src[j]

        if in_block_comment:
            if ch == "*" and j + 1 < len(src) and src[j + 1] == "/":
                in_block_comment = False
            continue
        else:
            if ch == "/" and j + 1 < len(src) and src[j + 1] == "*":
                in_block_comment = True
                continue

        if in_str:
            if esc:
                esc = False
                continue
            if ch == "\\":
                esc = True
                continue
            if ch == in_str:
                in_str = None
            continue
        else:
            if ch in ("'", '"'):
                in_str = ch
                continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                # include closing brace
                return (i, j + 1)

    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Path to tests/ff_checkout_ux.spec.ts")
    args = ap.parse_args()

    p = Path(args.path)
    src = p.read_text(encoding="utf-8")

    block = find_function_block(src, "preflightServer")
    if not block:
        print("❌ Could not find async function preflightServer(...) block.")
        return 2

    a, b = block
    patched = src[:a] + REPLACEMENT + src[b:]

    backup = p.with_suffix(p.suffix + ".bak")
    backup.write_text(src, encoding="utf-8")
    p.write_text(patched, encoding="utf-8")

    print(f"✅ Patched {p}")
    print(f"🧷 Backup  {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
