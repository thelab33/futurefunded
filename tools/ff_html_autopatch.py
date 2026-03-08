#!/usr/bin/env python3
"""
FutureFunded — HTML Autopatcher for Jinja templates (deterministic + hook-safe)

Goals:
- Fix Jinja-in-attribute quote traps (e.g., static_url("...") inside href="...") ✅
- Fix common html-validate parser breaks + attr-spacing ✅
- Normalize void/self-closing tags (safe) ✅
- Optional aggressive cleanup: redundant roles, aria-hidden+hidden ✅
- Create timestamped backup every time it writes ✅

This is intentionally regex + lightweight tag scanning (NOT a full HTML parser),
because Jinja templates are not valid HTML until rendered.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

VOID_TAGS = {"meta", "link", "img", "hr", "input", "br", "source", "track", "area", "base", "col", "embed", "param", "wbr"}

def ts() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")

def backup_path(p: Path) -> Path:
    return p.with_suffix(p.suffix + f".bak_ff_html_autopatch_{ts()}")

def subn(pat: str, repl: str, s: str, flags: int = 0) -> tuple[str, int]:
    return re.subn(pat, repl, s, flags=flags)

def fix_jinja_call_quotes(text: str) -> tuple[str, dict]:
    """
    Fix nested quote hazards:
      static_url("...")  -> static_url('...')
      url_for("static", filename="...") -> url_for('static', filename='...')
    Only targets the common safe patterns (does NOT touch JSON/script bodies).
    """
    stats = {}

    # static_url("path") -> static_url('path')
    text, n = subn(r'static_url\(\s*"([^"]+)"\s*\)', r"static_url('\1')", text)
    stats["static_url_dq_to_sq"] = n

    # url_for("static", filename="x") or url_for('static', filename="x")
    def _url_for_fix(m: re.Match) -> str:
        inside = m.group(1)

        # normalize first arg "static" -> 'static'
        inside2, _ = subn(r'^\s*"static"\s*,', "'static',", inside)
        inside2, _ = subn(r"^\s*'static'\s*,", "'static',", inside2)

        # filename="x" -> filename='x'
        inside2, _ = subn(r'filename\s*=\s*"([^"]+)"', r"filename='\1'", inside2)

        return f"url_for({inside2})"

    text, n2 = subn(r"url_for\(\s*([^)]*?)\s*\)", lambda m: _url_for_fix(m), text)
    stats["url_for_normalized"] = n2  # counts all url_for() occurrences processed (not necessarily changed)

    # Also handle plain Jinja set dicts that include url_for("static", filename="...")
    # (covered by url_for_normalized)

    return text, stats

def tagwise_transform(text: str, aggressive: bool) -> tuple[str, dict]:
    """
    Scan tags in a Jinja-friendly way.
    - Avoid touching <script> / <style> bodies.
    - Apply safe fixes to tag openings.
    """
    stats = {
        "tags_seen": 0,
        "attr_spacing_fixes": 0,
        "void_selfclose_fixes": 0,
        "remove_void_closers": 0,
        "preload_script_href_fix": 0,
        "aria_hidden_hidden_fix": 0,
        "redundant_role_fix": 0,
        "trim_space_before_gt": 0,
    }

    i = 0
    n = len(text)
    out = []

    mode = "normal"  # normal|script|style

    # case-insensitive search helpers
    def find_ci(hay: str, needle: str, start: int) -> int:
        return hay.lower().find(needle.lower(), start)

    while i < n:
        if mode in ("script", "style"):
            closer = "</script" if mode == "script" else "</style"
            j = find_ci(text, closer, i)
            if j == -1:
                out.append(text[i:])
                break
            out.append(text[i:j])
            i = j
            mode = "normal"
            continue

        if text[i] != "<":
            out.append(text[i])
            i += 1
            continue

        # Grab a tag token from '<' to the next '>' not inside quotes.
        j = i + 1
        in_q = None
        while j < n:
            c = text[j]
            if in_q:
                if c == in_q:
                    in_q = None
            else:
                if c == '"' or c == "'":
                    in_q = c
                elif c == ">":
                    break
            j += 1

        if j >= n:
            out.append(text[i:])
            break

        tag = text[i : j + 1]
        original = tag
        stats["tags_seen"] += 1

        low = tag.lower()

        # Detect script/style openers (only after we emit the start tag)
        # NOTE: We do NOT treat <script type="application/json"> specially; still skip body (safe).
        is_script_open = low.startswith("<script") and not low.startswith("</script")
        is_style_open = low.startswith("<style") and not low.startswith("</style")

        # 1) Fix preload mistake: href="/" aria-label="{{ _app|e }}" -> href="{{ _app|e }}"
        # (Keeps your intended preload target and removes weird aria-label usage on <link>.)
        if 'rel="preload"' in low and 'as="script"' in low:
            # common broken pattern from earlier: href="/" aria-label="{{ _app|e }}"
            tag2, nn = subn(
                r'href\s*=\s*"/"\s+aria-label\s*=\s*"\{\{\s*_app\|e\s*\}\}"',
                r'href="{{ _app|e }}"',
                tag,
                flags=re.IGNORECASE,
            )
            if nn:
                tag = tag2
                stats["preload_script_href_fix"] += nn

        # 2) Normalize void tag self-closing: <meta .../> -> <meta ...>
        # (You already ran a converter, but this makes it deterministic.)
        m = re.match(r"<\s*([a-zA-Z0-9:_-]+)\b", tag)
        tag_name = (m.group(1).lower() if m else "")
        if tag_name in VOID_TAGS:
            tag2, nn = subn(r"\s*/\s*>$", ">", tag)
            if nn:
                tag = tag2
                stats["void_selfclose_fixes"] += nn

        # 3) Remove illegal closing tags for void elements: </meta>, </link>, etc
        if tag_name.startswith("/") and tag_name[1:] in VOID_TAGS:
            # drop it entirely
            tag = ""
            stats["remove_void_closers"] += 1

        # 4) Fix attribute spacing errors: foo="x"bar="y" -> foo="x" bar="y"
        # Do this only within tags (not script bodies).
        if tag:
            before = tag
            # insert a space between attribute pairs if missing after a quote
            tag = re.sub(r'(")([A-Za-z_:][-\w:.]*=)', r'\1 \2', tag)
            tag = re.sub(r"(')([A-Za-z_:][-\w:.]*=)", r"\1 \2", tag)
            if tag != before:
                stats["attr_spacing_fixes"] += 1

        # 5) Trim pointless whitespace before >
        if tag:
            before = tag
            tag2, nn = subn(r"\s+>$", ">", tag)
            if nn:
                tag = tag2
                stats["trim_space_before_gt"] += nn

        # 6) Aggressive a11y cleanup (optional, but often reduces html-validate noise)
        if aggressive and tag:
            # aria-hidden="true" redundant when hidden is present
            if re.search(r"\bhidden\b", tag) and re.search(r'\baria-hidden\s*=\s*"true"', tag, re.I):
                tag2, nn = subn(r'\s*aria-hidden\s*=\s*"true"', "", tag, flags=re.IGNORECASE)
                if nn:
                    tag = tag2
                    stats["aria_hidden_hidden_fix"] += nn

            # Redundant landmark roles on semantic elements (safe-ish):
            # header role="banner" -> remove
            # footer role="contentinfo" -> remove
            if tag.lower().startswith("<header") and re.search(r'\srole\s*=\s*"banner"', tag, re.I):
                tag2, nn = subn(r'\srole\s*=\s*"banner"', "", tag, flags=re.IGNORECASE)
                if nn:
                    tag = tag2
                    stats["redundant_role_fix"] += nn

            if tag.lower().startswith("<footer") and re.search(r'\srole\s*=\s*"contentinfo"', tag, re.I):
                tag2, nn = subn(r'\srole\s*=\s*"contentinfo"', "", tag, flags=re.IGNORECASE)
                if nn:
                    tag = tag2
                    stats["redundant_role_fix"] += nn

        out.append(tag)
        i = j + 1

        # Update mode after emitting the open tag
        if is_script_open:
            mode = "script"
        elif is_style_open:
            mode = "style"

    new_text = "".join(out)
    changed = (new_text != text)
    if changed:
        stats["tags_changed"] = 1
    else:
        stats["tags_changed"] = 0
    return new_text, stats

def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded Jinja-safe HTML autopatcher (deterministic)")
    ap.add_argument("path", nargs="?", default="app/templates/index.html", help="Template path (default: app/templates/index.html)")
    ap.add_argument("--write", action="store_true", help="Write changes (default is dry-run)")
    ap.add_argument("--aggressive", action="store_true", help="Also apply redundant-role + aria-hidden/hidden cleanup")
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        print(f"❌ File not found: {p}", file=sys.stderr)
        return 2

    src = p.read_text(encoding="utf-8", errors="replace")
    cur = src

    # Pass 1: fix Jinja call quoting traps globally
    cur, s1 = fix_jinja_call_quotes(cur)

    # Pass 2: tag-wise fixes (skip script/style bodies)
    cur, s2 = tagwise_transform(cur, aggressive=args.aggressive)

    changed = (cur != src)

    # Summary
    print("FutureFunded — ff_html_autopatch")
    print(f"• File: {p}")
    print(f"• Mode: {'WRITE' if args.write else 'DRY-RUN'} | Aggressive: {args.aggressive}")
    print("• Changes:")
    print(f"  - static_url dq→sq: {s1.get('static_url_dq_to_sq', 0)}")
    print(f"  - url_for normalized (scanned): {s1.get('url_for_normalized', 0)}")
    print(f"  - preload script href fixes: {s2.get('preload_script_href_fix', 0)}")
    print(f"  - attr spacing fixes: {s2.get('attr_spacing_fixes', 0)}")
    print(f"  - void selfclose fixes: {s2.get('void_selfclose_fixes', 0)}")
    print(f"  - void closing tags removed: {s2.get('remove_void_closers', 0)}")
    if args.aggressive:
        print(f"  - aria-hidden+hidden cleaned: {s2.get('aria_hidden_hidden_fix', 0)}")
        print(f"  - redundant landmark roles removed: {s2.get('redundant_role_fix', 0)}")
    print(f"• Result: {'CHANGED' if changed else 'NO-OP'}")

    if not changed:
        return 0

    if args.write:
        bak = backup_path(p)
        bak.write_text(src, encoding="utf-8")
        p.write_text(cur, encoding="utf-8")
        print(f"✅ Wrote changes. Backup: {bak}")
        return 0
    else:
        print("ℹ️ Dry-run only. Re-run with --write to apply.")
        return 0

if __name__ == "__main__":
    raise SystemExit(main())
