#!/usr/bin/env python3
"""
FutureFunded — Flagship index.html patcher (deterministic, hook-safe)

- Patches the user's existing Jinja template in-place (with .bak backup).
- Does NOT rename/remove any selectors, ids, classes, or data-ff-* hooks.
- Fixes newline-broken string literals, adds cache-busting, and makes QR optional.

Usage:
  python3 tools/patch_index_flagship.py app/templates/index.html
  # or (default path)
  python3 tools/patch_index_flagship.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


DEFAULT_PATH = "app/templates/index.html"


def _subn(pattern: str, repl: str, text: str, flags: int = 0) -> tuple[str, int]:
    new_text, n = re.subn(pattern, repl, text, flags=flags)
    return new_text, n


def patch_index(text: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    total_changes = 0

    # -----------------------------
    # 1) Fix newline-polluted string literals (most common “paste artifact”)
    # -----------------------------
    # Examples seen:
    #   'https://getfuturefunded.com\n'
    #   'https://getfuturefunded.com/\n'
    #   'support@getfuturefunded.com\n'
    #   "https://js.stripe.com/v3/\n"
    patterns = [
        # getfuturefunded.com with optional trailing slash, any whitespace/newlines before closing quote
        (r"('https://getfuturefunded\.com/?)(?:\s*\n\s*)(')", r"\1\2", "Normalize getfuturefunded.com string literals"),
        # support email
        (r"('support@getfuturefunded\.com)(?:\s*\n\s*)(')", r"\1\2", "Normalize support@getfuturefunded.com literal"),
        # Stripe JS URL string literal
        (r'("https://js\.stripe\.com/v3/)(?:\s*\n\s*)(")', r"\1\2", "Normalize Stripe JS URL literal"),
    ]

    for pat, repl, label in patterns:
        text, n = _subn(pat, repl, text, flags=re.IGNORECASE)
        if n:
            notes.append(f"- {label}: {n} change(s)")
            total_changes += n

    # -----------------------------
    # 2) Add cache-busting query to CSS links if missing
    # -----------------------------
    # Patch:
    #   href="{{ url_for('static', filename='css/ff.css') }}"
    # => href="{{ url_for('static', filename='css/ff.css') }}?v={{ _v }}"
    #
    # Same for _auto_stubs.css
    css_targets = [
        "css/_auto_stubs.css",
        "css/ff.css",
    ]

    for target in css_targets:
        # Only add ?v={{ _v }} if there isn't already a ?v= or any query string.
        # We match the exact url_for(...) pattern to keep it deterministic.
        pat = (
            r'(href="\{\{\s*url_for\(\s*[\'"]static[\'"]\s*,\s*filename\s*=\s*[\'"]'
            + re.escape(target)
            + r'[\'"]\s*\)\s*\}\}")'
        )
        repl = r'\1?v={{ _v }}'
        # But avoid double-adding if query already exists.
        # So only match if the href isn't followed by ? right away.
        pat2 = pat[:-2] + r'(?!\?)(\}")'  # inject a negative lookahead for "?"
        # Safer approach: do a targeted replace with a callback:
        def _add_v(m: re.Match) -> str:
            return m.group(1) + "?v={{ _v }}" + m.group(2)

        # Use a direct regex that captures the ending "}"
        pat3 = (
            r'(href="\{\{\s*url_for\(\s*[\'"]static[\'"]\s*,\s*filename\s*=\s*[\'"]'
            + re.escape(target)
            + r'[\'"]\s*\)\s*\}\})(?!\?)(\")'
        )
        text, n = _subn(pat3, r"\1?v={{ _v }}\2", text, flags=0)
        if n:
            notes.append(f"- Add cache-busting to {target}: {n} change(s)")
            total_changes += n

    # -----------------------------
    # 3) Make QR card optional (avoid broken <img> when _qr_code is empty)
    # -----------------------------
    # We look for your marker comment and wrap the block right after it.
    # If the file already has an if-guard, we skip.
    if "data-ff-qr" in text and "QR Code card:" in text and "{% if _qr_src %}" not in text:
        # Find the QR card container div that has data-ff-qr=""
        # and replace src binding with _qr_src, plus add guard above/below.
        # This is deliberately conservative: it only fires if it finds the exact signature.
        qr_block_pat = re.compile(
            r"""
            (<!--\s*QR\s*Code\s*card:.*?-->\s*)
            (?P<card>
              <div\s+class="ff-card[^"]*"\s+data-ff-qr=""[\s\S]*?</div>\s*
            )
            """,
            re.IGNORECASE | re.VERBOSE,
        )
        m = qr_block_pat.search(text)
        if m:
            card = m.group("card")

            # Replace src="{{ _qr_code|default('', true)|e }}" => src="{{ _qr_src|e }}"
            card2, n1 = _subn(
                r'src="\{\{\s*_qr_code\|default\(\s*[\'"]\s*[\'"]\s*,\s*true\s*\)\|e\s*\}\}"',
                'src="{{ _qr_src|e }}"',
                card,
                flags=re.IGNORECASE,
            )

            guard = (
                "{% set _qr_src = (_qr_code|default('', true))|string|trim %}\n"
                "{% if _qr_src %}\n"
            )
            end_guard = "{% endif %}\n"

            replacement = m.group(1) + guard + card2 + end_guard
            text = text[: m.start()] + replacement + text[m.end() :]

            notes.append("- Make QR card conditional (only render when _qr_code is set): 1 change")
            total_changes += 1 + n1

    if total_changes == 0:
        notes.append("- No changes needed (template already clean / patched).")

    return text, notes


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(DEFAULT_PATH)
    if not path.exists():
        print(f"[ff-index-patch] ERROR: file not found: {path}")
        return 2

    original = path.read_text(encoding="utf-8", errors="replace")
    patched, notes = patch_index(original)

    if patched == original:
        print("[ff-index-patch] ✅ No changes applied.")
        for n in notes:
            print(n)
        return 0

    backup = path.with_suffix(path.suffix + ".bak")
    backup.write_text(original, encoding="utf-8")
    path.write_text(patched, encoding="utf-8")

    print("[ff-index-patch] ✅ Patched successfully.")
    print(f"[ff-index-patch] Backup: {backup}")
    for n in notes:
        print(n)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
