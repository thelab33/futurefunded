#!/usr/bin/env python3
"""
patch_ff_contrast_audit.py

Autopatches tools/ff_contrast_audit.py (FutureFunded quality gate) to fix:
- NameError: env not defined in run_lighthouse()
- Wayland compositor protocol issues ("Unable to connect to Chrome")
- Duplicate/overwritten chrome_flags bug (ensures final chrome_flags are used in LH command)
- Ensures Lighthouse runs in a controlled env (X11 forced) and uses correct chrome flags.

It:
- creates a timestamped .bak copy next to the file
- performs targeted, conservative edits (string-based, but robust)
- refuses to patch if it can't confidently find required anchors

Usage:
  python3 tools/patch_ff_contrast_audit.py tools/ff_contrast_audit.py
"""

from __future__ import annotations

import os
import re
import sys
import time
from typing import Tuple


def die(msg: str, code: int = 2) -> None:
    print(f"❌ {msg}", file=sys.stderr)
    raise SystemExit(code)


def backup_path(path: str) -> str:
    ts = time.strftime("%Y%m%d-%H%M%S")
    return f"{path}.bak.{ts}"


def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def find_run_lighthouse_span(src: str) -> Tuple[int, int]:
    """
    Returns (start_idx, end_idx) for def run_lighthouse(...) block.
    Uses a simple indentation-aware scan.
    """
    m = re.search(r"^def\s+run_lighthouse\s*\(", src, flags=re.M)
    if not m:
        die("Could not find `def run_lighthouse(` in file.")
    start = m.start()

    # Find next top-level def after run_lighthouse
    m2 = re.search(r"^def\s+\w+\s*\(", src[m.end() :], flags=re.M)
    if not m2:
        end = len(src)
    else:
        end = m.end() + m2.start()
    return start, end


def ensure_env_block(fn: str) -> str:
    """
    Ensure an env block exists and is defined BEFORE first use in run_lighthouse().
    We insert env block after `chrome = ...` line if env isn't already present.
    """
    if re.search(r"^\s*env\s*=\s*dict\(os\.environ\)", fn, flags=re.M):
        # env exists; still ensure it forces X11 settings
        if "WAYLAND_DISPLAY" not in fn or "XDG_SESSION_TYPE" not in fn:
            # Add the force-X11 lines right after env creation block
            fn = re.sub(
                r"(^\s*env\s*=\s*dict\(os\.environ\)\s*\n^\s*env\.setdefault\(\"CI\",\s*\"1\"\)\s*\n)",
                r"\1"
                r"    # Force X11 for Chrome launched by Lighthouse (prevents Wayland compositor protocol issues)\n"
                r"    env[\"XDG_SESSION_TYPE\"] = \"x11\"\n"
                r"    env.pop(\"WAYLAND_DISPLAY\", None)\n"
                r"    env.pop(\"WAYLAND_SOCKET\", None)\n\n",
                fn,
                flags=re.M,
            )
        return fn

    anchor = re.search(r"^\s*chrome\s*=\s*chrome_bin\s*or\s*find_chrome_bin\(\)\s*$", fn, flags=re.M)
    if not anchor:
        die("Could not find expected anchor `chrome = chrome_bin or find_chrome_bin()` inside run_lighthouse().")

    insert_at = anchor.end()
    env_block = (
        "\n\n"
        "    # Helpful in CI-ish environments (some LH/chrome combos behave better).\n"
        "    env = dict(os.environ)\n"
        "    env.setdefault(\"CI\", \"1\")\n\n"
        "    # Force X11 for Chrome launched by Lighthouse (prevents Wayland compositor protocol issues)\n"
        "    env[\"XDG_SESSION_TYPE\"] = \"x11\"\n"
        "    env.pop(\"WAYLAND_DISPLAY\", None)\n"
        "    env.pop(\"WAYLAND_SOCKET\", None)\n"
    )
    return fn[:insert_at] + env_block + fn[insert_at:]


def ensure_chrome_flags(fn: str) -> str:
    """
    Ensure chrome_flags includes:
      --disable-features=UseOzonePlatform
      --ozone-platform=x11
    Avoid duplicates.
    """
    # Find first chrome_flags = " ".join([...]) block inside run_lighthouse
    m = re.search(r"^\s*chrome_flags\s*=\s*\" \"\.join\(\s*\[\s*$", fn, flags=re.M)
    if not m:
        die("Could not find `chrome_flags = \" \".join([` inside run_lighthouse().")

    # Find end of that list join block
    # We'll insert flags just before the closing ] ) ) lines, but simplest: before the first line that matches r"^\s*\]\s*\)\s*$"
    endm = re.search(r"^\s*\]\s*\)\s*$", fn[m.end() :], flags=re.M)
    if not endm:
        die("Could not locate end of chrome_flags join list in run_lighthouse().")

    list_start = m.end()
    list_end = m.end() + endm.start()  # points at start of closing "] )"
    list_body = fn[list_start:list_end]

    need_a = "--disable-features=UseOzonePlatform"
    need_b = "--ozone-platform=x11"

    if need_a in list_body and need_b in list_body:
        return fn  # already good

    # Insert near end of list body
    insertion = ""
    if need_a not in list_body:
        insertion += f"        \"{need_a}\",\n"
    if need_b not in list_body:
        insertion += f"        \"{need_b}\",\n"

    # Add with comment
    insertion = (
        "        # Force X11 (avoid Wayland compositor protocol issues)\n" + insertion
        if insertion
        else ""
    )

    new_list_body = list_body.rstrip() + ("\n" if not list_body.endswith("\n") else "") + insertion
    return fn[:list_start] + new_list_body + fn[list_end:]


def ensure_common_uses_final_flags(fn: str) -> str:
    """
    In some broken edits, `common = ... ["--chrome-flags", chrome_flags] ...` is built,
    then chrome_flags is overwritten later. We ensure:
      - chrome_flags is defined BEFORE common
      - common is defined only once
    We'll rebuild by:
      1) Removing any duplicate later redefinition of chrome_flags after common
      2) Ensuring env is passed to _run_cmd_pg calls
      3) Ensuring cmd_html uses env too
    """
    # Detect multiple chrome_flags assignments
    assigns = list(re.finditer(r"^\s*chrome_flags\s*=", fn, flags=re.M))
    if len(assigns) <= 1:
        return fn

    # Keep the FIRST assignment, remove later ones (common cause of your current mess)
    keep_start = assigns[0].start()
    keep_end = assigns[0].end()

    # Remove later chrome_flags assignment blocks (from that line until a blank line after the join block)
    # We’ll remove each later assignment line + following indented join block if present.
    def _remove_one(text: str, idx: int) -> str:
        # idx is start of "chrome_flags ="
        # remove until next blank line at same indentation (4 spaces) OR until line starting with 4 spaces and a word not continuing the join.
        lines = text.splitlines(True)
        # map char idx to line index
        pos = 0
        li = 0
        while li < len(lines) and pos + len(lines[li]) <= idx:
            pos += len(lines[li])
            li += 1

        if li >= len(lines):
            return text

        # remove from li forward while line begins with 4 spaces and is part of this block
        # conservative: remove until we hit a line that starts with 4 spaces and does NOT look like list/join continuation AND isn't blank
        start_li = li
        li += 1
        while li < len(lines):
            l = lines[li]
            if l.strip() == "":
                # include one trailing blank line then stop
                li += 1
                break
            if not l.startswith("    "):
                break
            # stop if it looks like a new statement not related to chrome_flags join block
            if re.match(r"^\s{4}[a-zA-Z_]\w*\s*=", l) and "chrome_flags" not in l:
                break
            li += 1

        del lines[start_li:li]
        return "".join(lines)

    # remove from last to first (so indices don't shift)
    for m in reversed(assigns[1:]):
        fn = _remove_one(fn, m.start())

    return fn


def ensure_run_cmd_pg_env(fn: str) -> str:
    """
    Ensure `_run_cmd_pg(..., env=env)` in run_lighthouse for both json and html.
    """
    # cmd_json call
    fn = re.sub(
        r"(res_json\s*=\s*_run_cmd_pg\(\s*cmd_json\s*,\s*timeout_s\s*=\s*timeout_s\s*,\s*debug\s*=\s*debug)(\s*\))",
        r"\1, env=env\2",
        fn,
        flags=re.M,
    )

    # cmd_html call
    fn = re.sub(
        r"(_run_cmd_pg\(\s*cmd_html\s*,\s*timeout_s\s*=\s*max\(60,\s*int\(timeout_s\s*\*\s*0\.75\)\)\s*,\s*debug\s*=\s*debug)(\s*\))",
        r"\1, env=env\2",
        fn,
        flags=re.M,
    )
    return fn


def patch_file(path: str) -> None:
    src = read_file(path)
    start, end = find_run_lighthouse_span(src)
    fn = src[start:end]

    # Apply patch transforms
    fn2 = fn
    fn2 = ensure_env_block(fn2)
    fn2 = ensure_chrome_flags(fn2)
    fn2 = ensure_common_uses_final_flags(fn2)
    fn2 = ensure_run_cmd_pg_env(fn2)

    # Sanity: env must exist if we pass env=env
    if "env=env" in fn2 and not re.search(r"^\s*env\s*=\s*dict\(os\.environ\)", fn2, flags=re.M):
        die("Patch produced env=env but could not confirm env definition. Aborting.")

    # Replace in full file
    out = src[:start] + fn2 + src[end:]

    # Backup + write
    bak = backup_path(path)
    write_file(bak, src)
    write_file(path, out)

    print("✅ Patched successfully.")
    print(f"   - backup: {bak}")
    print(f"   - file:   {path}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 tools/patch_ff_contrast_audit.py tools/ff_contrast_audit.py", file=sys.stderr)
        return 2
    path = sys.argv[1]
    if not os.path.exists(path):
        die(f"File not found: {path}")
    patch_file(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
