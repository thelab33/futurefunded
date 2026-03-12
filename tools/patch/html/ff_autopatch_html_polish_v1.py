from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

DEFAULT_FILES = [
    Path("app/templates/base.html"),
    Path("app/templates/index.html"),
]

REPORT_PATH = Path("tools/.artifacts/ff_html_polish_report_v1.json")

# ---------- helpers ----------

SCRIPT_BLOCK_RE = re.compile(r"(?is)<script\b.*?>.*?</script>")
STYLE_BLOCK_RE = re.compile(r"(?is)<style\b.*?>.*?</style>")

TAG_BUTTON_RE = re.compile(r"(?is)<button\b[^>]*>")
TAG_A_RE = re.compile(r"(?is)<a\b[^>]*>")
TAG_IMG_RE = re.compile(r"(?is)<img\b[^>]*>")
TAG_WITH_CHECKOUT_ID_RE = re.compile(r"(?is)<([a-z][\w:-]*)\b[^>]*\bid\s*=\s*(['\"])checkout\2[^>]*>")

ID_ATTR_RE = re.compile(r'(?is)\bid\s*=\s*("([^"]+)"|\'([^\']+)\')')
REL_ATTR_RE = re.compile(r'(?is)\brel\s*=\s*("([^"]*)"|\'([^\']*)\')')
TYPE_ATTR_RE = re.compile(r'(?is)\btype\s*=\s*("([^"]*)"|\'([^\']*)\')')
TARGET_BLANK_RE = re.compile(r'(?is)\btarget\s*=\s*("?_blank"?|\'?_blank\'?)')
ARIA_LABEL_RE = re.compile(r'(?is)\baria-label\s*=')
ARIA_LABELLEDBY_RE = re.compile(r'(?is)\baria-labelledby\s*=')

DATA_FF_CONTROL_HINT_RE = re.compile(
    r'(?is)\bdata-ff-(open|close|toggle|dismiss|modal|drawer|sheet|dialog|checkout)\b'
)
FF_CLOSE_HINT_RE = re.compile(r'(?is)\b(ff-close|ff-sheet__close)\b')

ALT_ATTR_RE = re.compile(r'(?is)\balt\s*=')

def _ranges_to_skip(text: str) -> List[Tuple[int, int]]:
    ranges: List[Tuple[int, int]] = []
    for m in SCRIPT_BLOCK_RE.finditer(text):
        ranges.append((m.start(), m.end()))
    for m in STYLE_BLOCK_RE.finditer(text):
        ranges.append((m.start(), m.end()))
    ranges.sort()
    return ranges

def _in_ranges(i: int, ranges: List[Tuple[int, int]]) -> bool:
    for a, b in ranges:
        if a <= i < b:
            return True
    return False

def _insert_attr_before_close(tag: str, attr: str) -> str:
    # inserts before final '>' (or '/>')
    if tag.endswith("/>"):
        return tag[:-2] + " " + attr + " />"
    if tag.endswith(">"):
        return tag[:-1] + " " + attr + ">"
    return tag + " " + attr

def _get_attr_value(tag: str, attr_re: re.Pattern) -> str | None:
    m = attr_re.search(tag)
    if not m:
        return None
    # group 2 is double-quoted value; group 3 is single-quoted value
    return m.group(2) if m.group(2) is not None else m.group(3)

def _set_or_merge_rel(tag: str) -> tuple[str, bool]:
    # Only patch when target=_blank exists (handled outside), and rel is missing or static.
    rel_val = _get_attr_value(tag, REL_ATTR_RE)
    if rel_val is None:
        return _insert_attr_before_close(tag, 'rel="noopener noreferrer"'), True

    # If rel contains Jinja, skip (too risky to merge)
    if "{{" in rel_val or "{%" in rel_val:
        return tag, False

    toks = {t for t in re.split(r"\s+", rel_val.strip()) if t}
    changed = False
    if "noopener" not in toks:
        toks.add("noopener"); changed = True
    if "noreferrer" not in toks:
        toks.add("noreferrer"); changed = True
    if not changed:
        return tag, False

    new_rel = " ".join(sorted(toks))
    # Replace the rel attribute value (preserve quote style if possible)
    def repl(m: re.Match) -> str:
        quote = '"' if m.group(2) is not None else "'"
        return f'rel={quote}{new_rel}{quote}'
    tag2 = REL_ATTR_RE.sub(repl, tag, count=1)
    return tag2, True

def _ensure_button_type(tag: str) -> tuple[str, bool]:
    if TYPE_ATTR_RE.search(tag):
        return tag, False

    # only for control-ish buttons
    if DATA_FF_CONTROL_HINT_RE.search(tag) or FF_CLOSE_HINT_RE.search(tag) or 'aria-label="Close"' in tag or "aria-label='Close'" in tag:
        return _insert_attr_before_close(tag, 'type="button"'), True

    return tag, False

def _ensure_checkout_aria(tag: str) -> tuple[str, bool]:
    changed = False
    if 'role="' not in tag and "role='" not in tag:
        tag = _insert_attr_before_close(tag, 'role="dialog"'); changed = True
    if 'aria-modal="' not in tag and "aria-modal='" not in tag:
        tag = _insert_attr_before_close(tag, 'aria-modal="true"'); changed = True
    # add aria-label only if neither label nor labelledby exists
    if not ARIA_LABEL_RE.search(tag) and not ARIA_LABELLEDBY_RE.search(tag):
        tag = _insert_attr_before_close(tag, 'aria-label="Checkout"'); changed = True
    return tag, changed

def _ensure_img_alt(tag: str) -> tuple[str, bool]:
    if ALT_ATTR_RE.search(tag):
        return tag, False
    # safest default: decorative alt
    return _insert_attr_before_close(tag, 'alt=""'), True

def _find_duplicate_static_ids(text: str) -> Dict[str, List[int]]:
    # best-effort: count only ids with literal values (no Jinja braces)
    ids: Dict[str, List[int]] = {}
    for m in ID_ATTR_RE.finditer(text):
        val = m.group(2) if m.group(2) is not None else m.group(3)
        if not val:
            continue
        if "{{" in val or "{%" in val:
            continue
        line = text.count("\n", 0, m.start()) + 1
        ids.setdefault(val, []).append(line)
    return {k: v for k, v in ids.items() if len(v) > 1}

@dataclass
class PatchCounts:
    rel_noopener: int = 0
    button_type: int = 0
    checkout_aria: int = 0
    img_alt: int = 0

def polish_one(text: str) -> tuple[str, PatchCounts]:
    skip = _ranges_to_skip(text)
    out = text
    counts = PatchCounts()

    # Patch <a target=_blank ...>
    pieces = []
    last = 0
    for m in TAG_A_RE.finditer(out):
        if _in_ranges(m.start(), skip):
            continue
        tag = m.group(0)
        if not TARGET_BLANK_RE.search(tag):
            continue
        tag2, changed = _set_or_merge_rel(tag)
        if changed:
            pieces.append(out[last:m.start()])
            pieces.append(tag2)
            last = m.end()
            counts.rel_noopener += 1
    if pieces:
        pieces.append(out[last:])
        out = "".join(pieces)

    # Patch <button ...> (type=button for controls)
    skip = _ranges_to_skip(out)
    pieces = []
    last = 0
    for m in TAG_BUTTON_RE.finditer(out):
        if _in_ranges(m.start(), skip):
            continue
        tag = m.group(0)
        tag2, changed = _ensure_button_type(tag)
        if changed:
            pieces.append(out[last:m.start()])
            pieces.append(tag2)
            last = m.end()
            counts.button_type += 1
    if pieces:
        pieces.append(out[last:])
        out = "".join(pieces)

    # Patch #checkout root tag aria/role
    skip = _ranges_to_skip(out)
    pieces = []
    last = 0
    for m in TAG_WITH_CHECKOUT_ID_RE.finditer(out):
        if _in_ranges(m.start(), skip):
            continue
        tag = m.group(0)
        tag2, changed = _ensure_checkout_aria(tag)
        if changed:
            pieces.append(out[last:m.start()])
            pieces.append(tag2)
            last = m.end()
            counts.checkout_aria += 1
            # only patch first checkout element
            break
    if pieces:
        pieces.append(out[last:])
        out = "".join(pieces)

    # Patch <img ...> alt
    skip = _ranges_to_skip(out)
    pieces = []
    last = 0
    for m in TAG_IMG_RE.finditer(out):
        if _in_ranges(m.start(), skip):
            continue
        tag = m.group(0)
        tag2, changed = _ensure_img_alt(tag)
        if changed:
            pieces.append(out[last:m.start()])
            pieces.append(tag2)
            last = m.end()
            counts.img_alt += 1
    if pieces:
        pieces.append(out[last:])
        out = "".join(pieces)

    return out, counts

def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded HTML Polish (v1) — contract-safe attribute hardening")
    ap.add_argument("--write", action="store_true", help="Apply changes (default dry-run)")
    ap.add_argument("--report", default=str(REPORT_PATH), help="JSON report output path")
    ap.add_argument("--files", nargs="*", default=[str(p) for p in DEFAULT_FILES], help="Template files to polish")
    args = ap.parse_args()

    report: Dict = {
        "version": "v1",
        "files": [],
        "summary": {"files_changed": 0, "rel_noopener": 0, "button_type": 0, "checkout_aria": 0, "img_alt": 0},
        "duplicate_static_ids": {},
    }

    for f in args.files:
        path = Path(f)
        if not path.exists():
            continue

        src = path.read_text(encoding="utf-8")
        dup = _find_duplicate_static_ids(src)
        if dup:
            report["duplicate_static_ids"][str(path)] = dup

        out, counts = polish_one(src)
        changed = out != src

        report["files"].append({
            "file": str(path),
            "changed": changed,
            "counts": counts.__dict__,
        })

        for k in ("rel_noopener", "button_type", "checkout_aria", "img_alt"):
            report["summary"][k] += getattr(counts, k)

        if not changed:
            continue

        report["summary"]["files_changed"] += 1

        if args.write:
            bak = path.with_suffix(path.suffix + ".bak_html_polish_v1")
            if not bak.exists():
                bak.write_text(src, encoding="utf-8")
                print(f"[ff-html] backup -> {bak}")
            path.write_text(out, encoding="utf-8")
            print(f"[ff-html] patched {path} ✅")

    # write report
    rp = Path(args.report)
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps(report, indent=2), encoding="utf-8")
    s = report["summary"]
    print(f"[ff-html] files_changed: {s['files_changed']} | rel: {s['rel_noopener']} | type: {s['button_type']} | checkout aria: {s['checkout_aria']} | img alt: {s['img_alt']}")
    print(f"[ff-html] report -> {rp}")

    # surface duplicate IDs if any (non-fatal)
    if report["duplicate_static_ids"]:
        print("[ff-html] ⚠️ duplicate static IDs detected (review report).")

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
