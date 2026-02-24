#!/usr/bin/env python3
"""
ff_css_next_up_flex_patch.py
FutureFunded — NEXT-UP FLEX patcher (hook-safe, deterministic)

What it does:
- Inserts a "FF NEXT-UP FLEX" block INSIDE @layer ff.pages (before its closing brace).
- Creates a timestamped .bak backup when applying.
- Idempotent: if markers already exist, it no-ops unless --replace is provided.
- Dry-run + unified diff printing supported.

Usage:
  # 1) Commit current ff.css (recommended)
  git add app/static/css/ff.css && git commit -m "ff.css before NEXT-UP FLEX patch"

  # 2) Dry run + diff
  python3 scripts/ff_css_next_up_flex_patch.py --dry-run --print-diff

  # 3) Apply patch (creates backup)
  python3 scripts/ff_css_next_up_flex_patch.py

  # 4) Verify markers + new selectors exist
  rg -n "FF NEXT-UP FLEX: START|FF NEXT-UP FLEX: END" app/static/css/ff.css
  rg -n "\\.is-vip|ff-leaderboard|is-success|ff-burst" app/static/css/ff.css
"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Tuple


START_MARK = "/* FF NEXT-UP FLEX: START */"
END_MARK = "/* FF NEXT-UP FLEX: END */"

PATCH_BLOCK = f"""
{START_MARK}
/* VIP + Leaderboard + Donate Success (opt-in states; hook-safe)
   - VIP: .is-vip / [data-vip="true"] / [data-tier="vip"]
   - Donate success: .is-success / [data-state="success"]
   - Loading/ready/error: .is-loading / .is-ready / .is-error
   - Leaderboard: .ff-leaderboard / [data-ff-leaderboard]
*/

/* ---------- VIP sponsor effects (opt-in) ---------- */
.ff-sponsorTier--vip.is-hot,
.ff-sponsorTier--vip[data-hot="true"] {{
  box-shadow: 0 28px 96px rgba(249,115,22,0.18);
}}

.ff-sponsorTier--vip::after {{
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0.22;
  background:
    radial-gradient(520px 240px at 20% 0%, rgba(249,115,22,0.28), transparent 60%),
    radial-gradient(520px 260px at 90% 10%, rgba(251,113,133,0.18), transparent 62%);
  filter: blur(10px);
}}

.ff-sponsorWall__item.is-vip,
.ff-sponsorWall__item[data-vip="true"],
.ff-sponsorWall__item[data-tier="vip"] {{
  border-color: rgba(249,115,22,0.34);
  background: linear-gradient(180deg, rgba(249,115,22,0.10), rgba(255,255,255,0.06));
  color: var(--ff-text);
  font-weight: 900;
  position: relative;
  overflow: clip;
}}

html[data-theme="dark"] .ff-sponsorWall__item.is-vip,
html[data-theme="dark"] .ff-sponsorWall__item[data-vip="true"],
html[data-theme="dark"] .ff-sponsorWall__item[data-tier="vip"] {{
  background: linear-gradient(180deg, rgba(249,115,22,0.10), rgba(255,255,255,0.07));
}}

.ff-sponsorWall__item.is-vip::before,
.ff-sponsorWall__item[data-vip="true"]::before,
.ff-sponsorWall__item[data-tier="vip"]::before {{
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.28;
  background: radial-gradient(260px 140px at 18% 0%, rgba(249,115,22,0.22), transparent 60%);
}}

/* ---------- Leaderboard polish (hook-safe; works if you have it) ---------- */
.ff-leaderboard,
[data-ff-leaderboard] {{
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}}

.ff-leaderboard__row,
[data-ff-leaderboard-row] {{
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 12px 12px;
  border-radius: 18px;
  border: 1px solid var(--ff-stroke);
  background: var(--ff-surface-2);
  box-shadow: var(--ff-shadow-1);
  overflow: clip;
  transition:
    transform var(--ff-dur-2) var(--ff-ease),
    box-shadow var(--ff-dur-2) var(--ff-ease),
    background var(--ff-dur-2) var(--ff-ease),
    border-color var(--ff-dur-2) var(--ff-ease);
}}

@media (hover:hover) {{
  .ff-leaderboard__row:hover,
  [data-ff-leaderboard-row]:hover {{
    transform: translateY(-1px);
    border-color: var(--ff-stroke-2);
    background: var(--ff-surface-3);
    box-shadow: var(--ff-shadow-2);
  }}
}}

.ff-leaderboard__rank,
[data-ff-leaderboard-rank] {{
  width: 34px;
  height: 34px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 950;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--ff-stroke);
  background: rgba(255,255,255,0.06);
}}

html[data-theme="light"] .ff-leaderboard__rank,
html[data-theme="light"] [data-ff-leaderboard-rank] {{
  background: rgba(11,18,32,0.04);
}}

.ff-leaderboard__amt,
[data-ff-leaderboard-amt] {{
  font-weight: 950;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}}

.ff-leaderboard__row[data-rank="1"],
[data-ff-leaderboard-row][data-rank="1"] {{
  border-color: rgba(249,115,22,0.34);
  box-shadow: 0 18px 64px rgba(249,115,22,0.14);
}}

.ff-leaderboard__row[data-rank="1"] .ff-leaderboard__rank,
[data-ff-leaderboard-row][data-rank="1"] [data-ff-leaderboard-rank] {{
  border-color: rgba(249,115,22,0.30);
  background: rgba(249,115,22,0.14);
}}

/* ---------- Donation success / state styles (opt-in) ---------- */
.ff-sheet.is-success .ff-sheet__panel,
.ff-sheet[data-state="success"] .ff-sheet__panel {{
  border-color: rgba(34,197,94,0.34);
  box-shadow: 0 26px 92px rgba(34,197,94,0.14);
}}

.ff-sheet.is-error .ff-sheet__panel,
.ff-sheet[data-state="error"] .ff-sheet__panel {{
  border-color: rgba(239,68,68,0.34);
}}

.ff-checkoutSummary.is-success,
.ff-checkoutSummary[data-state="success"] {{
  border-color: rgba(34,197,94,0.28);
  background: linear-gradient(180deg, rgba(34,197,94,0.10), rgba(255,255,255,0.06));
}}

.ff-paymentMount.is-loading,
.ff-paypalMount.is-loading {{
  opacity: 0.78;
  filter: saturate(0.98);
}}

.ff-paymentMount.is-ready,
.ff-paypalMount.is-ready {{
  border-color: rgba(249,115,22,0.22);
  box-shadow: 0 16px 56px rgba(249,115,22,0.10);
}}

.ff-paymentMount.is-error,
.ff-paypalMount.is-error {{
  border-color: rgba(239,68,68,0.28);
}}

/* ---------- “Burst” micro-animation (only when class applied) ---------- */
.ff-burst {{
  animation: ff-burstPop var(--ff-dur-2) var(--ff-ease) both;
}}

@keyframes ff-burstPop {{
  0%   {{ transform: scale(0.985); filter: blur(2px); opacity: 0.75; }}
  60%  {{ transform: scale(1.01);  filter: blur(0);  opacity: 1; }}
  100% {{ transform: scale(1.0);   filter: none;     opacity: 1; }}
}}

/* ---------- Motion safety + perf guardrails ---------- */
@media (prefers-reduced-motion: reduce), (update: slow) {{
  .ff-sponsorTier--vip::after,
  .ff-burst {{
    animation: none !important;
    filter: none !important;
  }}
}}
{END_MARK}
""".strip("\n") + "\n"


@dataclass
class LayerSpan:
    start_idx: int
    end_idx: int  # index of matching '}' that closes the layer (inclusive)


def _read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_text(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def _timestamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _make_backup(path: str) -> str:
    bak = f"{path}.bak.{_timestamp()}"
    with open(path, "rb") as src, open(bak, "wb") as dst:
        dst.write(src.read())
    return bak


def _find_marker_block(text: str) -> Optional[Tuple[int, int]]:
    s = text.find(START_MARK)
    e = text.find(END_MARK)
    if s == -1 or e == -1:
        return None
    e2 = e + len(END_MARK)
    return (s, e2)


def _scan_layer_span(text: str, layer_name: str) -> LayerSpan:
    """
    Find @layer <layer_name> { ... } and return its span.
    Uses a tiny state machine to avoid counting braces inside comments/strings.
    """
    # Find the layer opener
    pat = re.compile(rf"@layer\s+{re.escape(layer_name)}\s*\{{", re.MULTILINE)
    m = pat.search(text)
    if not m:
        raise RuntimeError(f"Could not find @layer {layer_name} {{ ... }}")

    i = m.end()  # position right after '{'
    depth = 1

    in_comment = False
    in_str: Optional[str] = None  # "'" or '"'
    n = len(text)

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        # Comment handling
        if in_comment:
            if ch == "*" and nxt == "/":
                in_comment = False
                i += 2
                continue
            i += 1
            continue

        # String handling
        if in_str is not None:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
                i += 1
                continue
            i += 1
            continue

        # Enter comment
        if ch == "/" and nxt == "*":
            in_comment = True
            i += 2
            continue

        # Enter string
        if ch == "'" or ch == '"':
            in_str = ch
            i += 1
            continue

        # Brace counting
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return LayerSpan(start_idx=m.start(), end_idx=i)

        i += 1

    raise RuntimeError(f"Unbalanced braces while scanning @layer {layer_name}")


def _insert_before(text: str, idx: int, insertion: str) -> str:
    # Ensure clean spacing: one blank line before and after insertion
    before = text[:idx]
    after = text[idx:]

    if not before.endswith("\n"):
        before += "\n"

    # Avoid creating a triple-blank-gap
    if not before.endswith("\n\n"):
        before += "\n"

    return before + insertion + "\n" + after.lstrip("\n")


def _unified_diff(old: str, new: str, path: str) -> str:
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=path,
        tofile=f"{path} (patched)",
        n=3,
    )
    return "".join(diff)


def apply_patch(text: str, replace: bool = False) -> Tuple[str, str]:
    """
    Returns (new_text, mode) where mode describes what happened.
    """
    existing = _find_marker_block(text)
    if existing:
        s, e = existing
        current_block = text[s:e]
        desired_block = PATCH_BLOCK
        if current_block.strip() == desired_block.strip():
            return (text, "already-patched")
        if not replace:
            return (text, "marker-exists-different")
        new_text = text[:s] + desired_block + text[e:]
        return (new_text, "replaced-existing-block")

    # Insert inside @layer ff.pages, before its closing brace
    span = _scan_layer_span(text, "ff.pages")
    insert_at = span.end_idx  # position of closing '}'
    new_text = _insert_before(text, insert_at, PATCH_BLOCK)
    return (new_text, "inserted-inside:@layer ff.pages")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", default="app/static/css/ff.css", help="Path to ff.css")
    ap.add_argument("--dry-run", action="store_true", help="Do not write changes")
    ap.add_argument("--print-diff", action="store_true", help="Print unified diff")
    ap.add_argument("--replace", action="store_true", help="Replace block if markers already exist")
    args = ap.parse_args()

    path = args.path

    if not os.path.exists(path):
        print(f"❌ File not found: {path}", file=sys.stderr)
        return 2

    old = _read_text(path)
    new, mode = apply_patch(old, replace=args.replace)

    if args.print_diff:
        d = _unified_diff(old, new, path)
        if d.strip():
            print(d)
        else:
            print("🟦 No diff (already matches).")

    if mode == "already-patched":
        print("✅ Already patched (markers present + content matches).")
        return 0

    if mode == "marker-exists-different" and not args.replace:
        print("⚠️  Markers already exist, but content differs.")
        print("    Re-run with --replace if you want to overwrite the existing block.")
        return 0

    if args.dry_run:
        print(f"🧪 Dry run only. Patch mode: {mode}")
        return 0

    bak = _make_backup(path)
    _write_text(path, new)
    print(f"🧷 Backup: {bak}")
    print(f"✅ Patched: {path}")
    print(f"📌 Patch mode: {mode}")
    print("")
    print("QA:")
    print(f'  rg -n "FF NEXT-UP FLEX: START|FF NEXT-UP FLEX: END" {path}')
    print(r'  rg -n "\.is-vip|data-vip=\"true\"|data-tier=\"vip\"|ff-leaderboard|data-ff-leaderboard|is-success|data-state=\"success\"|ff-burst" ' + path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
