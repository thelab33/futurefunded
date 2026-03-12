from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DEFAULT_FILE = Path("app/static/css/ff.css")
DEFAULT_REPORT = Path("tools/.artifacts/ff_layer_hygiene_report_v1.json")

LAYER_AT = "@layer"
EOF_MARK = "/* EOF: app/static/css/ff.css */"

# At-rules that are typically safe to exist unlayered (they don't directly style selectors)
SAFE_GLOBAL_AT_RULE_PREFIXES = (
    "@keyframes",
    "@font-face",
    "@counter-style",
    "@page",
    "@namespace",
)

# Unambiguous "tuck" destinations (conservative)
DEST_TOKENS = "ff.tokens"
DEST_CONTROLS = "ff.controls"

MARKER_PREFIX = "FF_LAYER_HYGIENE_TUCK_V1"


@dataclass(frozen=True)
class LayerBlock:
    name: str
    start: int
    end: int
    close_brace: int  # index of the final '}' in this block


@dataclass
class GlobalBlock:
    start: int
    end: int
    brace_open: int
    header: str
    kind: str  # style_rule | at_rule
    at_name: Optional[str]
    line: int
    preview: str
    tuck_layer: Optional[str] = None
    tuck_marker: Optional[str] = None


# ------------------------------ Lexing helpers ------------------------------ #

def _line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, max(0, idx)) + 1


def _sanitize_preview(s: str, limit: int = 160) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit] + ("…" if len(s) > limit else "")


def _scan_states(text: str):
    """
    Generator of (i, ch, in_comment, in_string, string_quote, escaped)
    Deterministic, handles /* */ comments and " ' strings with escapes.
    """
    in_comment = False
    in_string = False
    quote = ""
    escaped = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_comment:
            if ch == "*" and nxt == "/":
                in_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_string:
            if escaped:
                escaped = False
                i += 1
                continue
            if ch == "\\":
                escaped = True
                i += 1
                continue
            if ch == quote:
                in_string = False
                quote = ""
                i += 1
                continue
            i += 1
            continue

        # not in comment/string
        if ch == "/" and nxt == "*":
            in_comment = True
            i += 2
            continue

        if ch in ('"', "'"):
            in_string = True
            quote = ch
            i += 1
            continue

        yield i, ch
        i += 1


def _find_next_non_ws(text: str, i: int) -> int:
    n = len(text)
    while i < n and text[i].isspace():
        i += 1
    return i


def _match_word_at(text: str, i: int, word: str) -> bool:
    return text.startswith(word, i)


def _find_layer_blocks(text: str) -> List[LayerBlock]:
    """
    Find top-level @layer <name> { ... } blocks (not order statements).
    Deterministic brace matching (ignores braces inside strings/comments).
    """
    blocks: List[LayerBlock] = []
    n = len(text)

    # build a quick lookup of positions that are "code" (not in comment/string)
    code_positions = set(i for i, _ in _scan_states(text))

    i = 0
    while i < n:
        if i in code_positions and _match_word_at(text, i, LAYER_AT):
            # Look ahead to determine if block (@layer name {) vs order statement (@layer a, b;)
            j = i + len(LAYER_AT)
            j = _find_next_non_ws(text, j)

            # capture name up to '{' or ';' (whichever comes first at top-level)
            name_start = j
            # Walk forward until we hit '{' or ';' (in code)
            k = j
            brace_pos = -1
            semi_pos = -1
            while k < n:
                if k not in code_positions:
                    k += 1
                    continue
                ch = text[k]
                if ch == "{":
                    brace_pos = k
                    break
                if ch == ";":
                    semi_pos = k
                    break
                k += 1

            # order statement: ignore
            if semi_pos != -1 and (brace_pos == -1 or semi_pos < brace_pos):
                i = semi_pos + 1
                continue

            if brace_pos == -1:
                i += len(LAYER_AT)
                continue

            layer_name = text[name_start:brace_pos].strip()
            if not layer_name:
                layer_name = "(anonymous)"

            # match braces from brace_pos
            depth = 0
            m = brace_pos
            while m < n:
                if m in code_positions:
                    ch = text[m]
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            blocks.append(LayerBlock(name=layer_name, start=i, end=m + 1, close_brace=m))
                            i = m + 1
                            break
                m += 1
            else:
                # unbalanced; stop
                break

            continue

        i += 1

    return blocks


def _is_inside_ranges(idx: int, ranges: List[Tuple[int, int]]) -> bool:
    for a, b in ranges:
        if a <= idx < b:
            return True
    return False


def _find_top_level_blocks(text: str) -> List[Tuple[int, int, int]]:
    """
    Return list of (header_start, block_end, brace_open_index) for top-level blocks.
    header_start is best-effort start of the rule header.
    """
    n = len(text)
    code_positions = set(i for i, _ in _scan_states(text))

    blocks = []
    depth = 0
    last_term = 0  # last ';' or '}' at depth 0
    i = 0
    while i < n:
        if i not in code_positions:
            i += 1
            continue
        ch = text[i]

        if ch == "{":
            if depth == 0:
                header_start = last_term
                brace_open = i

                # find matching close
                d = 0
                j = i
                while j < n:
                    if j in code_positions:
                        cj = text[j]
                        if cj == "{":
                            d += 1
                        elif cj == "}":
                            d -= 1
                            if d == 0:
                                block_end = j + 1
                                blocks.append((header_start, block_end, brace_open))
                                last_term = block_end
                                i = block_end
                                break
                    j += 1
                else:
                    break
                continue

            depth += 1

        elif ch == "}":
            if depth > 0:
                depth -= 1
            if depth == 0:
                last_term = i + 1

        elif ch == ";" and depth == 0:
            last_term = i + 1

        i += 1

    return blocks


# ------------------------------ Classification ------------------------------ #

def _extract_header(text: str, header_start: int, brace_open: int) -> str:
    h = text[header_start:brace_open].strip()
    # trim trailing comments/spaces
    h = re.sub(r"/\*.*?\*/", "", h, flags=re.S).strip()
    # keep last logical line if huge
    if "\n" in h:
        lines = [ln.strip() for ln in h.splitlines() if ln.strip()]
        h = lines[-1] if lines else h
    return h


def _classify_block(header: str) -> Tuple[str, Optional[str]]:
    if header.startswith("@"):
        at = header.split(None, 1)[0].strip()
        return "at_rule", at
    return "style_rule", None


def _dest_layer_for_block(header: str, body: str) -> Optional[str]:
    """
    Conservative heuristics:
    - Token blocks: .ff-root... with mostly --ff-* custom props
    - Checkout/overlay hardening: contains #checkout / ff-sheet / ff-modal / FF_OVERLAY markers
    Otherwise: None (report only).
    """
    h = header.strip()

    # Overlay/checkout very explicit
    if (
        "#checkout" in h
        or "#checkout" in body
        or "FF_OVERLAY_" in body
        or ".ff-sheet" in h
        or ".ff-modal" in h
        or "data-ff-close-checkout" in body
        or "data-ff-open-checkout" in body
    ):
        return DEST_CONTROLS

    # Token block: .ff-root scoped + mostly custom properties
    if h.startswith(".ff-root") or h.startswith(":where(.ff-root") or ".ff-root[" in h:
        # If body contains non custom-prop declarations heavily, don't tuck.
        decl_lines = [ln.strip() for ln in body.splitlines() if ":" in ln and ";" in ln]
        if not decl_lines:
            return DEST_TOKENS
        custom = 0
        noncustom = 0
        for ln in decl_lines:
            prop = ln.split(":", 1)[0].strip()
            if prop.startswith("--ff-") or prop.startswith("--ff_") or prop.startswith("--ff"):
                custom += 1
            elif prop in ("color-scheme",):
                custom += 1
            else:
                noncustom += 1
        if custom > 0 and noncustom == 0:
            return DEST_TOKENS

    return None


def _make_marker(header: str, body: str, dest: str) -> str:
    norm = (dest + "\n" + header.strip() + "\n" + _sanitize_preview(body, 500)).encode("utf-8")
    h = hashlib.sha1(norm).hexdigest()[:10]
    return f"{MARKER_PREFIX}_{h}"


# ------------------------------ Patching engine ----------------------------- #

def analyze(text: str) -> Dict:
    # Optional: stop scanning after first EOF marker for "single source of truth" behavior
    eof_pos = text.find(EOF_MARK)
    scan_text = text if eof_pos < 0 else text[:eof_pos]

    layer_blocks = _find_layer_blocks(scan_text)
    layer_ranges = [(b.start, b.end) for b in layer_blocks]

    # Build quick index of layer occurrences by name
    layers_by_name: Dict[str, List[LayerBlock]] = {}
    for b in layer_blocks:
        layers_by_name.setdefault(b.name.strip(), []).append(b)

    top_blocks = _find_top_level_blocks(scan_text)

    globals_: List[GlobalBlock] = []
    for header_start, block_end, brace_open in top_blocks:
        if _is_inside_ranges(brace_open, layer_ranges):
            continue

        header = _extract_header(scan_text, header_start, brace_open)
        if not header:
            continue
        # ignore @layer blocks themselves if found (should be inside ranges, but safe)
        if header.startswith("@layer"):
            continue

        kind, at_name = _classify_block(header)
        body = scan_text[header_start:block_end]
        line = _line_of(scan_text, header_start)
        preview = _sanitize_preview(header)

        gb = GlobalBlock(
            start=header_start,
            end=block_end,
            brace_open=brace_open,
            header=header,
            kind=kind,
            at_name=at_name,
            line=line,
            preview=preview,
        )
        globals_.append(gb)

    # classify safety
    violations = []
    allowed = []
    for g in globals_:
        if g.kind == "at_rule" and g.at_name and any(g.at_name.startswith(p) for p in SAFE_GLOBAL_AT_RULE_PREFIXES):
            allowed.append(g)
        else:
            violations.append(g)

    return {
        "scan_cut_at_eof": eof_pos if eof_pos >= 0 else None,
        "layer_blocks": layer_blocks,
        "layers_by_name": layers_by_name,
        "global_blocks_all": globals_,
        "violations": violations,
        "allowed": allowed,
    }


def apply_tucks(text: str, analysis_obj: Dict, write: bool) -> Tuple[str, List[GlobalBlock]]:
    """
    Remove tuckable global blocks and insert them into an existing destination layer.
    Never creates new @layer blocks.
    """
    eof_pos = text.find(EOF_MARK)
    scan_text = text if eof_pos < 0 else text[:eof_pos]
    suffix = "" if eof_pos < 0 else text[eof_pos:]  # preserve anything after EOF as-is (normally just EOF/comment)

    layer_blocks: List[LayerBlock] = analysis_obj["layer_blocks"]
    layers_by_name: Dict[str, List[LayerBlock]] = analysis_obj["layers_by_name"]
    violations: List[GlobalBlock] = analysis_obj["violations"]

    # Determine tuck destinations (very conservative)
    tuckable: List[GlobalBlock] = []
    for g in violations:
        body = scan_text[g.start:g.end]
        dest = _dest_layer_for_block(g.header, body)
        if not dest:
            continue

        # require layer exists exactly once
        candidates = layers_by_name.get(dest, [])
        if len(candidates) != 1:
            continue

        marker = _make_marker(g.header, body, dest)
        if marker in scan_text:
            # already tucked (idempotent)
            continue

        g.tuck_layer = dest
        g.tuck_marker = marker
        tuckable.append(g)

    if not tuckable:
        return text, []

    # Remove tuckable blocks (reverse order for stable indices)
    tuckable_sorted = sorted(tuckable, key=lambda x: x.start, reverse=True)
    removed = scan_text
    for g in tuckable_sorted:
        removed = removed[:g.start] + "\n\n" + removed[g.end:]

    # Re-analyze layers after removals to get correct close brace indices
    post = analyze(removed)
    post_layers_by_name: Dict[str, List[LayerBlock]] = post["layers_by_name"]

    # Group snippets by destination layer in original order (top->bottom)
    tuckable_in_order = sorted(tuckable, key=lambda x: x.start)
    by_layer: Dict[str, List[str]] = {}
    for g in tuckable_in_order:
        body = scan_text[g.start:g.end].rstrip()
        snippet = (
            "\n\n"
            f"/* ============================================================================\n"
            f"[ff-layer] {g.tuck_marker}\n"
            f"Source: global (unlayered) block at line {g.line}\n"
            f"Header: {g.preview}\n"
            f"Action: tucked into @{DEST_TOKENS if g.tuck_layer==DEST_TOKENS else DEST_CONTROLS} (existing layer)\n"
            f"Note: This is conservative and only runs when destination is unambiguous.\n"
            f"============================================================================ */\n\n"
            f"{body}\n"
        )
        by_layer.setdefault(g.tuck_layer or "", []).append(snippet)

    # Insert snippets at end of destination layer blocks (before closing brace)
    out = removed
    # insert in reverse index order (so earlier inserts don't shift later positions)
    inserts: List[Tuple[int, str]] = []
    for dest, snippets in by_layer.items():
        candidates = post_layers_by_name.get(dest, [])
        if len(candidates) != 1:
            continue
        lb = candidates[0]
        insert_at = lb.close_brace
        inserts.append((insert_at, "".join(snippets)))

    for insert_at, blob in sorted(inserts, key=lambda t: t[0], reverse=True):
        out = out[:insert_at] + blob + out[insert_at:]

    # Reattach suffix (EOF and anything after)
    return out + suffix, tuckable


def build_report(path: Path, analysis_obj: Dict, tucked: List[GlobalBlock]) -> Dict:
    layer_blocks: List[LayerBlock] = analysis_obj["layer_blocks"]
    violations: List[GlobalBlock] = analysis_obj["violations"]
    allowed: List[GlobalBlock] = analysis_obj["allowed"]

    report = {
        "file": str(path),
        "layers_found": [{"name": b.name, "start": b.start, "end": b.end} for b in layer_blocks],
        "violations": [
            {
                "line": g.line,
                "kind": g.kind,
                "at_name": g.at_name,
                "header": g.preview,
                "tuck_layer": g.tuck_layer,
                "tuck_marker": g.tuck_marker,
            }
            for g in violations
        ],
        "allowed_global_at_rules": [
            {
                "line": g.line,
                "kind": g.kind,
                "at_name": g.at_name,
                "header": g.preview,
            }
            for g in allowed
        ],
        "tucked": [
            {
                "line": g.line,
                "header": g.preview,
                "dest_layer": g.tuck_layer,
                "marker": g.tuck_marker,
            }
            for g in tucked
        ],
        "summary": {
            "violations_total": len(violations),
            "allowed_total": len(allowed),
            "tucked_total": len(tucked),
        },
    }
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded CSS Layer Hygiene (v1)")
    ap.add_argument("--file", default=str(DEFAULT_FILE), help="Path to ff.css")
    ap.add_argument("--write", action="store_true", help="Apply safe tucks (default report-only)")
    ap.add_argument("--fail", action="store_true", help="Exit non-zero if violations remain after optional tucks")
    ap.add_argument("--report", default=str(DEFAULT_REPORT), help="Write JSON report here (default tools/.artifacts/...)")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"[ff-layer] missing file: {path}")

    src = path.read_text(encoding="utf-8")
    analysis_obj = analyze(src)

    tucked: List[GlobalBlock] = []
    out = src
    if args.write:
        out, tucked = apply_tucks(src, analysis_obj, write=True)
        if out != src:
            bak = path.with_suffix(path.suffix + ".bak_layer_hygiene_v1")
            if not bak.exists():
                bak.write_text(src, encoding="utf-8")
                print(f"[ff-layer] backup -> {bak}")
            path.write_text(out, encoding="utf-8")
            print(f"[ff-layer] patched {path} ✅")
        else:
            print("[ff-layer] no safe tucks applied (already clean or ambiguous) ✅")

        # Re-analyze after patch for accurate fail/report
        analysis_obj = analyze(out)

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = build_report(path, analysis_obj, tucked)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Console summary
    s = report["summary"]
    print(f"[ff-layer] violations: {s['violations_total']} | allowed globals: {s['allowed_total']} | tucked: {s['tucked_total']}")
    print(f"[ff-layer] report -> {report_path}")

    # Fail only on non-allowed violations
    if args.fail and s["violations_total"] > 0:
        print("[ff-layer] FAIL: unlayered rule blocks detected.")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
