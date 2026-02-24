#!/usr/bin/env python3
# tools/ff_css_refresh.py
"""
FutureFunded — FF CSS Refresh + SuperPatch (hook-safe, CSP-safe)

Safe defaults:
1) Optional: Replace selected core @layer blocks from a canonical file
   (does NOT nuke pages/utilities by default).
2) Repairs patch drift:
   - Removes accidental Python marker assignment lines from CSS (AUTO_START/AUTO_END = "...").
   - Removes ALL existing autogen marker blocks anywhere in CSS (idempotent).
   - Merges duplicate @layer ff.* blocks into ONE (keeps inner content).
3) Injects exactly ONE AUTO-GENERATED selector block inside @layer ff.utilities so every
   class/id used in HTML exists in CSS selectors (audit-proof, matches ff_css_audit behavior).
4) Creates a timestamped backup when writing.

Recommended usage:
  python tools/ff_css_refresh.py --html app/templates/index.html --css app/static/css/ff.css --write

Core refresh (safe; replaces only core-ish layers unless you override):
  python tools/ff_css_refresh.py --html app/templates/index.html --css app/static/css/ff.css --canon tools/ff_css_core.css --write

Full replace (ONLY if canon is truly complete):
  python tools/ff_css_refresh.py --html app/templates/index.html --css app/static/css/ff.css \
    --canon tools/ff_css_core_full.css --canon-all --canon-strict --write
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────

LAYER_ORDER_LINE = (
    "@layer ff.tokens, ff.base, ff.type, ff.layout, ff.surfaces, ff.controls, ff.pages, ff.utilities;"
)

LAYER_NAMES = ["tokens", "base", "type", "layout", "surfaces", "controls", "pages", "utilities"]
DEFAULT_CANON_LAYERS = ["tokens", "base", "type", "layout", "surfaces", "controls"]

AUTO_START_LINE = "/* === FF SUPERPATCH: AUTOGEN SELECTORS (START) — DO NOT EDIT BY HAND === */"
AUTO_END_LINE = "/* === FF SUPERPATCH: AUTOGEN SELECTORS (END) — DO NOT EDIT BY HAND === */"

AUTO_START_LINE_RE = re.compile(r"(?m)^\s*/\*\s===\sFF SUPERPATCH:\sAUTOGEN SELECTORS\s\(START\).*?\*/\s*$")
AUTO_END_LINE_RE = re.compile(r"(?m)^\s*/\*\s===\sFF SUPERPATCH:\sAUTOGEN SELECTORS\s\(END\).*?\*/\s*$")

# If these Python-ish lines ever end up in CSS, delete them aggressively.
PY_MARKER_ASSIGN_RE = re.compile(r'(?m)^\s*AUTO_(START|END)\s*=\s*".*"\s*$')

# Jinja scrub patterns (non-greedy, DOTALL) for inline template fragments.
JINJA_BLOCK_RE = re.compile(r"(\{\{.*?\}\}|\{%.*?%\})", re.DOTALL)

# Extract quoted literals (good for pulling 'is-featured' out of Jinja expressions).
QUOTED_LITERAL_RE = re.compile(r"""["']([A-Za-z0-9_-]{2,})["']""")

# Filter obvious Jinja/python tokens that can appear in class attrs
JINJA_STOPWORDS = {
    "if", "else", "elif", "endif", "for", "endfor", "in", "and", "or", "not",
    "true", "false", "none", "True", "False", "None",
}

# Heuristic: only treat quoted literals as "class-like" if they look like classes
CLASS_PREFIXES = ("ff-", "is-", "has-", "js-", "u-")


# Minimal “good defaults” for a few common missing pieces.
# Everything else gets an empty stub selector (still satisfies audits).
STYLE_MAP: Dict[str, str] = {
    ".ff-section": """
.ff-section{
  position:relative;
  padding: clamp(18px, 3vw, 26px) 0;
}
""".strip(),
    ".ff-sectionhead": """
.ff-sectionhead{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap: 12px;
  margin: 0 0 12px;
}
""".strip(),
    ".ff-sectionhead__text": """.ff-sectionhead__text{ min-width:0; }""",
    ".ff-sectionhead__actions": """
.ff-sectionhead__actions{
  display:flex;
  flex-wrap:wrap;
  gap: 10px;
  align-items:center;
  justify-content:flex-end;
}
""".strip(),
    ".ff-card--lift": """
.ff-card--lift{
  transition: transform var(--ff-dur-1) var(--ff-ease),
              box-shadow var(--ff-dur-1) var(--ff-ease),
              border-color var(--ff-dur-1) var(--ff-ease);
}
.ff-card--lift:hover{
  transform: translateY(-2px);
  box-shadow: var(--ff-shadow-md);
  border-color: rgba(255,122,24,.22);
}
@media (prefers-reduced-motion: reduce){
  .ff-card--lift{ transition:none !important; }
  .ff-card--lift:hover{ transform:none !important; }
}
""".strip(),
    ".ff-teamGrid": """
.ff-teamGrid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(12px, 1.8vw, 16px);
}
@media (max-width: 980px){ .ff-teamGrid{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px){ .ff-teamGrid{ grid-template-columns: 1fr; } }
""".strip(),
    ".ff-teamCard": """
.ff-teamCard{
  border-radius: var(--ff-radius-lg);
  border: 1px solid var(--ff-border);
  background: rgba(255,255,255,.55);
  box-shadow: var(--ff-shadow-sm);
  overflow:hidden;
  min-width:0;
}
html[data-theme="dark"] .ff-teamCard{
  background: rgba(17,27,50,.56);
  box-shadow: var(--ff-shadow-sm), inset 0 1px 0 rgba(255,255,255,.06);
}
""".strip(),
    ".ff-teamCard--flagship": """
.ff-teamCard--flagship{
  border-color: rgba(255,122,24,.24);
}
html[data-theme="dark"] .ff-teamCard--flagship{
  border-color: rgba(255,122,24,.30);
}
""".strip(),
    ".is-featured": """
.is-featured{}
/* Optional: if this is a featured card modifier, you can style it later:
.ff-teamCard.is-featured{ box-shadow: var(--ff-shadow-md); }
*/
""".strip(),
}


# ──────────────────────────────────────────────────────────────────────────────
# Data
# ──────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ScanResult:
    used_classes: Set[str]
    used_ids: Set[str]


# ──────────────────────────────────────────────────────────────────────────────
# Small utils
# ──────────────────────────────────────────────────────────────────────────────

def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8", errors="replace")).hexdigest()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def write_text(path: Path, s: str) -> None:
    path.write_text(s, encoding="utf-8", newline="\n")


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def looks_like_class_literal(tok: str) -> bool:
    if not tok or tok in JINJA_STOPWORDS:
        return False
    if tok.startswith(CLASS_PREFIXES):
        return True
    # common BEM-ish classes
    if "-" in tok:
        return True
    return False


# ──────────────────────────────────────────────────────────────────────────────
# HTML scanning (Jinja-aware)
# ──────────────────────────────────────────────────────────────────────────────

def iter_html_files(paths: List[str]) -> List[Path]:
    out: List[Path] = []
    for p in paths:
        pp = Path(p)
        if pp.is_dir():
            out.extend(sorted(pp.rglob("*.html")))
        else:
            out.append(pp)

    # De-dupe while preserving order
    seen: Set[Path] = set()
    uniq: List[Path] = []
    for f in out:
        if f not in seen:
            uniq.append(f)
            seen.add(f)
    return uniq


def scan_html_for_used_selectors(html_paths: List[Path]) -> ScanResult:
    used_classes: Set[str] = set()
    used_ids: Set[str] = set()

    # Capture attribute bodies robustly (DOTALL allows newlines in attributes)
    class_attr = re.compile(r"""\bclass\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)
    id_attr = re.compile(r"""\bid\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)

    for hp in html_paths:
        raw = read_text(hp)

        # Classes
        for m in class_attr.finditer(raw):
            val = m.group(2)

            # 1) Static part (remove Jinja blocks, keep literal tokens)
            static = JINJA_BLOCK_RE.sub(" ", val)
            for c in re.split(r"\s+", static.strip()):
                c = c.strip()
                if not c:
                    continue
                # reject anything still containing braces
                if "{" in c or "}" in c or "%" in c:
                    continue
                used_classes.add(c)

            # 2) Class-like quoted literals inside Jinja expressions
            #    ex: {{ 'is-featured' if featured else '' }}
            for lit in QUOTED_LITERAL_RE.findall(val):
                if looks_like_class_literal(lit):
                    used_classes.add(lit)

        # IDs
        for m in id_attr.finditer(raw):
            val = m.group(2).strip()
            # Remove Jinja blocks; keep static remainder
            static = JINJA_BLOCK_RE.sub("", val).strip()
            if static and all(x not in static for x in ("{", "}", "%")):
                used_ids.add(static)

            # Sometimes IDs appear as quoted literals in Jinja (rare, but safe)
            for lit in QUOTED_LITERAL_RE.findall(val):
                # IDs usually don't have '-' rules, but this is safe; keeps audit green
                if lit and lit not in JINJA_STOPWORDS:
                    used_ids.add(lit)

    return ScanResult(used_classes=used_classes, used_ids=used_ids)


# ──────────────────────────────────────────────────────────────────────────────
# CSS detection (STRICT like ff_css_audit)
# ──────────────────────────────────────────────────────────────────────────────

def strip_css_noise(css: str) -> str:
    """
    Removes comment bodies and string bodies (replaces with spaces).
    Helps avoid matching selectors inside comments or quoted content.
    """
    out: List[str] = []
    in_comment = False
    in_string: Optional[str] = None
    escape = False
    i = 0

    while i < len(css):
        ch = css[i]
        nxt = css[i + 1] if i + 1 < len(css) else ""

        if in_comment:
            if ch == "*" and nxt == "/":
                in_comment = False
                out.append("  ")
                i += 2
                continue
            out.append(" ")
            i += 1
            continue

        if in_string is not None:
            if escape:
                escape = False
                out.append(" ")
                i += 1
                continue
            if ch == "\\":
                escape = True
                out.append(" ")
                i += 1
                continue
            if ch == in_string:
                in_string = None
                out.append(ch)
                i += 1
                continue
            out.append(" ")
            i += 1
            continue

        if ch == "/" and nxt == "*":
            in_comment = True
            out.append("  ")
            i += 2
            continue

        if ch in ("'", '"'):
            in_string = ch
            out.append(ch)
            i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


def css_has_class(css_noise_stripped: str, cls: str) -> bool:
    # STRICT: requires boundary before '.' (so `.a.b` does NOT satisfy `.b`).
    pat = re.compile(r"(?<![A-Za-z0-9_-])\." + re.escape(cls) + r"(?=[^A-Za-z0-9_-]|$)")
    return pat.search(css_noise_stripped) is not None


def css_has_id(css_noise_stripped: str, _id: str) -> bool:
    pat = re.compile(r"(?<![A-Za-z0-9_-])\#" + re.escape(_id) + r"(?=[^A-Za-z0-9_-]|$)")
    return pat.search(css_noise_stripped) is not None


# ──────────────────────────────────────────────────────────────────────────────
# Layer parsing (brace-scanned, ignores comments/strings)
# ──────────────────────────────────────────────────────────────────────────────

def normalize_layer_order_line(css: str) -> str:
    lines = css.splitlines()
    hits = [idx for idx, ln in enumerate(lines) if ln.strip() == LAYER_ORDER_LINE]
    if len(hits) == 1:
        return css.rstrip() + "\n"

    if hits:
        lines = [ln for ln in lines if ln.strip() != LAYER_ORDER_LINE]

    insert_at = 0
    if lines and lines[0].lstrip().startswith("@charset"):
        insert_at = 1
    lines.insert(insert_at, LAYER_ORDER_LINE)
    return "\n".join(lines).rstrip() + "\n"


def find_layer_block(css: str, layer_name: str, start_at: int = 0) -> Optional[Tuple[int, int]]:
    needle = f"@layer ff.{layer_name}"
    i = css.find(needle, start_at)
    if i < 0:
        return None

    open_brace = css.find("{", i)
    if open_brace < 0:
        return None

    depth = 0
    in_comment = False
    in_string: Optional[str] = None
    escape = False

    for idx in range(open_brace, len(css)):
        ch = css[idx]
        nxt = css[idx + 1] if idx + 1 < len(css) else ""

        if in_comment:
            if ch == "*" and nxt == "/":
                in_comment = False
            continue

        if in_string is not None:
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == in_string:
                in_string = None
            continue

        if ch == "/" and nxt == "*":
            in_comment = True
            continue

        if ch in ("'", '"'):
            in_string = ch
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return (i, idx)

    return None


def find_all_layer_blocks(css: str, layer_name: str) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []
    start_at = 0
    while True:
        span = find_layer_block(css, layer_name, start_at)
        if not span:
            break
        spans.append(span)
        start_at = span[1] + 1
    return spans


def layer_inner(block: str) -> str:
    ob = block.find("{")
    cb = block.rfind("}")
    if ob < 0 or cb < 0 or cb <= ob:
        return ""
    return block[ob + 1 : cb].strip()


# ──────────────────────────────────────────────────────────────────────────────
# Drift cleanup + idempotency
# ──────────────────────────────────────────────────────────────────────────────

def scrub_python_marker_assignments(css: str) -> str:
    return PY_MARKER_ASSIGN_RE.sub("", css)


def remove_all_marker_blocks(css: str) -> str:
    out = css
    while True:
        m1 = AUTO_START_LINE_RE.search(out)
        if not m1:
            break
        m2 = AUTO_END_LINE_RE.search(out, m1.end())
        if not m2:
            break
        out = (out[: m1.start()].rstrip() + "\n\n" + out[m2.end() :].lstrip())
    return out


def merge_duplicate_layers(css: str, layer_name: str) -> str:
    spans = find_all_layer_blocks(css, layer_name)
    if len(spans) <= 1:
        return css

    blocks = [css[a : b + 1] for (a, b) in spans]
    inners: List[str] = []
    for blk in blocks:
        inner = layer_inner(blk)
        inner = scrub_python_marker_assignments(inner)
        inner = remove_all_marker_blocks(inner).strip()
        if inner:
            inners.append(inner)

    merged_inner = "\n\n".join(inners).strip()
    merged = f"@layer ff.{layer_name} {{\n"
    if merged_inner:
        merged += merged_inner + "\n"
    merged += "}\n"

    first_a, first_b = spans[0]
    out = css[:first_a] + merged + css[first_b + 1 :]

    spans2 = find_all_layer_blocks(out, layer_name)
    for a, b in reversed(spans2[1:]):
        out = (out[:a].rstrip() + "\n\n" + out[b + 1 :].lstrip())

    return out


def merge_all_ff_layers(css: str) -> str:
    out = css
    for name in LAYER_NAMES:
        out = merge_duplicate_layers(out, name)
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Canon handling
# ──────────────────────────────────────────────────────────────────────────────

def extract_layer_blocks(css: str, want_layers: List[str], strict: bool) -> Dict[str, str]:
    blocks: Dict[str, str] = {}
    for name in want_layers:
        span = find_layer_block(css, name, 0)
        if not span:
            if strict:
                raise SystemExit(f"[canon] Missing requested @layer ff.{name} block")
            continue
        a, b = span
        blocks[name] = css[a : b + 1].strip() + "\n"
    return blocks


def insert_after_layer_order_line(css: str, payload: str) -> str:
    s = normalize_layer_order_line(css)
    idx = s.find(LAYER_ORDER_LINE)
    if idx < 0:
        raise SystemExit("Could not ensure layer order line")
    line_end = s.find("\n", idx)
    if line_end < 0:
        line_end = len(s)
    return s[:line_end].rstrip() + "\n\n" + payload.rstrip() + "\n\n" + s[line_end:].lstrip()


def replace_or_insert_layer(css: str, layer_name: str, new_block: str) -> str:
    s = css
    first = find_layer_block(s, layer_name, 0)
    if not first:
        return insert_after_layer_order_line(s, new_block)

    a, b = first
    s = s[:a] + new_block.strip() + "\n" + s[b + 1 :]

    start_at = a + len(new_block)
    while True:
        dup = find_layer_block(s, layer_name, start_at)
        if not dup:
            break
        da, db = dup
        s = (s[:da].rstrip() + "\n\n" + s[db + 1 :].lstrip())
        start_at = da
    return s


# ──────────────────────────────────────────────────────────────────────────────
# Autogen
# ──────────────────────────────────────────────────────────────────────────────

def render_autogen_block(missing_classes: List[str], missing_ids: List[str], *, include_timestamp: bool) -> str:
    out: List[str] = []
    out.append(AUTO_START_LINE)
    if include_timestamp:
        out.append(f"/* Generated: {datetime.now().isoformat(timespec='seconds')} */")
    out.append("/* Purpose: ensure every class/id used in HTML exists in CSS (audit-proof). */")
    out.append("")

    if missing_classes:
        out.append("/* ---- Missing classes (autogen) ---- */")
        for c in missing_classes:
            sel = f".{c}"
            mapped = STYLE_MAP.get(sel)
            out.append(mapped if mapped else f"{sel}{{}}")
        out.append("")

    if missing_ids:
        out.append("/* ---- Missing ids (autogen) ---- */")
        for i in missing_ids:
            out.append(f"#{i}{{}}")
        out.append("")

    out.append(AUTO_END_LINE)
    return "\n".join(out).rstrip() + "\n"


def inject_into_utilities_layer(css: str, autogen_block: str) -> str:
    spans = find_all_layer_blocks(css, "utilities")
    if not spans:
        css = css.rstrip() + "\n\n@layer ff.utilities {\n}\n"

    css = merge_duplicate_layers(css, "utilities")
    span = find_layer_block(css, "utilities", 0)
    if not span:
        raise SystemExit("Could not find @layer ff.utilities")

    a, b = span
    block = css[a : b + 1]

    inner = layer_inner(block)
    inner = scrub_python_marker_assignments(inner)
    inner = remove_all_marker_blocks(inner).strip()

    rebuilt = "@layer ff.utilities {\n"
    if inner:
        rebuilt += inner + "\n\n"
    rebuilt += autogen_block
    rebuilt += "}\n"

    return css[:a] + rebuilt + css[b + 1 :]


# ──────────────────────────────────────────────────────────────────────────────
# Backup + QA helpers
# ──────────────────────────────────────────────────────────────────────────────

def backup_file(path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = now_stamp()
    bak = backup_dir / f"{path.name}.{stamp}.bak"
    bak.write_bytes(path.read_bytes())
    return bak


def print_qa(css_path: Path) -> None:
    escaped_layer_line = re.escape(LAYER_ORDER_LINE)
    print("\nSuggested QA:")
    print(f'  rg -n "{escaped_layer_line}" {css_path}')
    print(f'  rg -n "^@layer ff\\." {css_path}')
    print(f'  rg -n "FF SUPERPATCH: AUTOGEN SELECTORS \\(START\\)" {css_path} | wc -l')
    print(f'  rg -n "FF SUPERPATCH: AUTOGEN SELECTORS \\(END\\)" {css_path} | wc -l')
    print(f'  rg -n "\\:target|data-open=\\"true\\"|aria-hidden=\\"false\\"|\\.is-open" {css_path}')
    print(f'  rg -n "\\.ff-btn--primary|\\.ff-tab--cta" {css_path}')
    print(f'  rg -n "html\\[data-theme=\\"dark\\"\\]" {css_path}')
    print(f'  rg -n -- "--ff-card:|--ff-card-2:" {css_path}')
    print(f'  rg -n "^\\s*AUTO_(START|END)\\s*=" {css_path} || true')


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", nargs="+", required=True, help="HTML file(s) or directories to scan")
    ap.add_argument("--css", required=True, help="Target CSS file (e.g., app/static/css/ff.css)")

    ap.add_argument("--canon", default=None, help="Canonical CSS file containing ff.* @layer blocks (optional)")
    ap.add_argument("--canon-layers", nargs="+", default=None, help="Which layers to replace from canon")
    ap.add_argument("--canon-all", action="store_true", help="Replace ALL ff.* layers from canon")
    ap.add_argument("--canon-strict", action="store_true", help="Require canon to contain requested layers")

    ap.add_argument("--write", action="store_true", help="Write changes to disk (otherwise dry-run)")
    ap.add_argument("--backup-dir", default="tools/_backups", help="Where backups are written")

    ap.add_argument("--no-timestamp", action="store_true", help="Do not include a timestamp in autogen block")
    args = ap.parse_args()

    html_files = iter_html_files(args.html)
    if not html_files:
        eprint("No HTML files found.")
        return 2

    css_path = Path(args.css)
    if not css_path.exists():
        eprint(f"CSS not found: {css_path}")
        return 2

    target_css = normalize_layer_order_line(read_text(css_path))
    orig_sha = sha256_text(target_css)

    used = scan_html_for_used_selectors(html_files)

    # Optional canon replacement
    if args.canon:
        canon_path = Path(args.canon)
        if not canon_path.exists():
            eprint(f"Canon file not found: {canon_path}")
            return 2

        want_layers = LAYER_NAMES if args.canon_all else (args.canon_layers or DEFAULT_CANON_LAYERS)
        canon_css = normalize_layer_order_line(read_text(canon_path))
        canon_blocks = extract_layer_blocks(canon_css, want_layers=want_layers, strict=bool(args.canon_strict))
        if not canon_blocks:
            eprint("[canon] No requested ff.* @layer blocks found in canon file.")
            return 2

        for name in want_layers:
            blk = canon_blocks.get(name)
            if blk:
                target_css = replace_or_insert_layer(target_css, name, blk)

        target_css = normalize_layer_order_line(target_css)

    # HARDENING: scrub + de-dupe BEFORE autogen injection
    target_css = scrub_python_marker_assignments(target_css)
    target_css = remove_all_marker_blocks(target_css)
    target_css = merge_all_ff_layers(target_css)
    target_css = normalize_layer_order_line(target_css)

    # STRICT missing calc (matches audit expectations)
    noise = strip_css_noise(target_css)
    missing_classes = sorted([c for c in used.used_classes if not css_has_class(noise, c)])
    missing_ids = sorted([i for i in used.used_ids if not css_has_id(noise, i)])

    autogen_block = render_autogen_block(
        missing_classes,
        missing_ids,
        include_timestamp=not args.no_timestamp,
    )
    target_css = inject_into_utilities_layer(target_css, autogen_block)

    # Recompute after injection (strict)
    target_css = normalize_layer_order_line(target_css)
    noise2 = strip_css_noise(target_css)
    missing_classes_after = sorted([c for c in used.used_classes if not css_has_class(noise2, c)])
    missing_ids_after = sorted([i for i in used.used_ids if not css_has_id(noise2, i)])

    new_sha = sha256_text(target_css)

    print("=== FF CSS Refresh ===")
    print(f"HTML files scanned: {len(html_files)}")
    print(f"Used classes: {len(used.used_classes)}")
    print(f"Used ids:     {len(used.used_ids)}")
    print(f"Missing classes (before inject): {len(missing_classes)}")
    print(f"Missing ids (before inject):     {len(missing_ids)}")
    print(f"Missing classes (after inject):  {len(missing_classes_after)}")
    print(f"Missing ids (after inject):      {len(missing_ids_after)}")
    print(f"Original sha256: {orig_sha}")
    print(f"New sha256:      {new_sha}")

    if not args.write:
        print("\n(dry-run) No files written. Re-run with --write to apply.")
        print_qa(css_path)
        return 0

    bak = backup_file(css_path, Path(args.backup_dir))
    write_text(css_path, target_css)
    print(f"\nBackup created: {bak}")
    print(f"Wrote: {css_path}")
    print_qa(css_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

