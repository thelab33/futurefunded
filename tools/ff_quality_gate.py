#!/usr/bin/env python3
"""
FutureFunded Contrast + OLED Legibility Audit + Smoke + Lighthouse + (Optional) Playwright Gate
(Cascade-Approx, Explainable, CI-friendly)

DROP-IN REPLACEMENT (v2.4.0)

Key upgrades:
- Optional Playwright gate (single-command CI)
- Unified process-group runner (hard kill on timeout)
- Cleaner artifact writing (stable "latest" + timestamped copies)
- Rich final summary JSON for CI annotations
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

Color = Tuple[float, float, float, float]  # r,g,b,a in 0..1
APP_VERSION = "ff_quality_gate.v2.4.0"

# =============================================================================
# Small utilities
# =============================================================================

def now_stamp() -> int:
    return int(time.time())

def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)

def write_text(path: str, s: str) -> None:
    ensure_dir(os.path.dirname(path) or ".")
    with open(path, "w", encoding="utf-8") as f:
        f.write(s or "")

def write_json(path: str, payload: Any) -> None:
    ensure_dir(os.path.dirname(path) or ".")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

def tail_lines(s: str, n: int = 40) -> str:
    lines = (s or "").splitlines()
    return "\n".join(lines[-n:])

def normalize_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return u
    if not re.match(r"^https?://", u, flags=re.IGNORECASE):
        u = "http://" + u
    return u

def _which_any(candidates: List[str]) -> Optional[str]:
    for c in candidates:
        p = shutil.which(c)
        if p:
            return p
    return None

# =============================================================================
# Unified subprocess runner (process-group kill on timeout)
# =============================================================================

@dataclass
class CmdResult:
    ok: bool
    returncode: Optional[int]
    stdout: str
    stderr: str
    timed_out: bool
    duration_s: float
    cmd: List[str]

def run_cmd_pg(cmd: List[str], timeout_s: int, env: Optional[Dict[str, str]] = None, debug: bool = False) -> CmdResult:
    if debug:
        print("---- DEBUG: run ----")
        print(" ".join(cmd))

    t0 = time.time()
    p: Optional[subprocess.Popen[str]] = None
    try:
        p = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
            env=env,
        )
        try:
            out, err = p.communicate(timeout=timeout_s)
            dt = time.time() - t0
            return CmdResult(ok=True, returncode=p.returncode, stdout=out or "", stderr=err or "", timed_out=False, duration_s=dt, cmd=cmd)
        except subprocess.TimeoutExpired:
            try:
                if p.pid:
                    os.killpg(p.pid, signal.SIGKILL)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
            out, err = p.communicate()
            dt = time.time() - t0
            return CmdResult(ok=False, returncode=p.returncode, stdout=out or "", stderr=err or "", timed_out=True, duration_s=dt, cmd=cmd)
    except KeyboardInterrupt:
        if p and p.pid:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        dt = time.time() - t0
        return CmdResult(ok=False, returncode=None, stdout="", stderr="Interrupted by user.", timed_out=False, duration_s=dt, cmd=cmd)
    except Exception as e:
        dt = time.time() - t0
        return CmdResult(ok=False, returncode=None, stdout="", stderr=f"{type(e).__name__}: {e}", timed_out=False, duration_s=dt, cmd=cmd)

# =============================================================================
# Color parsing + math (UNCHANGED from your v2.3.1 logic)
# =============================================================================

HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

RGB_COMMA_RE = re.compile(
    r"^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$",
    re.IGNORECASE,
)
RGB_SPACE_RE = re.compile(
    r"^rgba?\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*(?:/\s*([0-9.]+)\s*)?\)$",
    re.IGNORECASE,
)

HSL_COMMA_RE = re.compile(
    r"^hsla?\(\s*([0-9.]+)\s*(?:deg)?\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*(?:,\s*([0-9.]+)\s*)?\)$",
    re.IGNORECASE,
)
HSL_SPACE_RE = re.compile(
    r"^hsla?\(\s*([0-9.]+)\s*(?:deg)?\s+([0-9.]+)%\s+([0-9.]+)%\s*(?:/\s*([0-9.]+)\s*)?\)$",
    re.IGNORECASE,
)

COLOR_LITERAL_RE = re.compile(
    r"(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\))",
    re.IGNORECASE,
)

VAR_RE = re.compile(r"^var\(\s*--([a-zA-Z0-9\-_]+)\s*(?:,\s*(.+?)\s*)?\)$", re.IGNORECASE)

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def parse_hex(s: str) -> Optional[Color]:
    m = HEX_RE.match(s.strip())
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        r = int(h[0] * 2, 16)
        g = int(h[1] * 2, 16)
        b = int(h[2] * 2, 16)
        a = 255
    elif len(h) == 6:
        r = int(h[0:2], 16)
        g = int(h[2:4], 16)
        b = int(h[4:6], 16)
        a = 255
    else:
        r = int(h[0:2], 16)
        g = int(h[2:4], 16)
        b = int(h[4:6], 16)
        a = int(h[6:8], 16)
    return (r / 255.0, g / 255.0, b / 255.0, a / 255.0)

def _hsl_to_rgb(h: float, s: float, l: float) -> Tuple[float, float, float]:
    c = (1 - abs(2 * l - 1)) * s
    hp = (h % 360) / 60.0
    x = c * (1 - abs(hp % 2 - 1))
    r1 = g1 = b1 = 0.0
    if 0 <= hp < 1:
        r1, g1, b1 = c, x, 0
    elif 1 <= hp < 2:
        r1, g1, b1 = x, c, 0
    elif 2 <= hp < 3:
        r1, g1, b1 = 0, c, x
    elif 3 <= hp < 4:
        r1, g1, b1 = 0, x, c
    elif 4 <= hp < 5:
        r1, g1, b1 = x, 0, c
    else:
        r1, g1, b1 = c, 0, x
    m = l - c / 2
    return (r1 + m, g1 + m, b1 + m)

def parse_rgb_function(s: str) -> Optional[Color]:
    st = s.strip()
    m = RGB_COMMA_RE.match(st)
    if m:
        r = float(m.group(1))
        g = float(m.group(2))
        b = float(m.group(3))
        a = float(m.group(4) or 1)
        return (clamp01(r / 255.0), clamp01(g / 255.0), clamp01(b / 255.0), clamp01(a))
    m2 = RGB_SPACE_RE.match(st)
    if m2:
        r = float(m2.group(1))
        g = float(m2.group(2))
        b = float(m2.group(3))
        a = float(m2.group(4) or 1)
        return (clamp01(r / 255.0), clamp01(g / 255.0), clamp01(b / 255.0), clamp01(a))
    return None

def parse_hsl_function(s: str) -> Optional[Color]:
    st = s.strip()
    m = HSL_COMMA_RE.match(st) or HSL_SPACE_RE.match(st)
    if not m:
        return None
    h = float(m.group(1))
    s_ = clamp01(float(m.group(2)) / 100.0)
    l_ = clamp01(float(m.group(3)) / 100.0)
    a = clamp01(float(m.group(4) or 1))
    r, g, b = _hsl_to_rgb(h, s_, l_)
    return (clamp01(r), clamp01(g), clamp01(b), a)

def parse_color_literal(s: str) -> Optional[Color]:
    if not s:
        return None
    st = s.strip()
    if st.lower() == "transparent":
        return (0.0, 0.0, 0.0, 0.0)
    c = parse_rgb_function(st)
    if c:
        return c
    c = parse_hsl_function(st)
    if c:
        return c
    return parse_hex(st)

def composite(fg: Color, bg: Color) -> Color:
    fr, fg_, fb, fa = fg
    br, bg_, bb, ba = bg
    out_a = fa + ba * (1 - fa)
    if out_a <= 0:
        return (0.0, 0.0, 0.0, 0.0)
    out_r = (fr * fa + br * ba * (1 - fa)) / out_a
    out_g = (fg_ * fa + bg_ * ba * (1 - fa)) / out_a
    out_b = (fb * fa + bb * ba * (1 - fa)) / out_a
    return (out_r, out_g, out_b, out_a)

def srgb_to_linear(c: float) -> float:
    if c <= 0.03928:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4

def rel_luminance(rgb: Tuple[float, float, float]) -> float:
    r, g, b = rgb
    R = srgb_to_linear(r)
    G = srgb_to_linear(g)
    B = srgb_to_linear(b)
    return 0.2126 * R + 0.7152 * G + 0.0722 * B

def contrast_ratio(c1: Color, c2: Color) -> float:
    l1 = rel_luminance((c1[0], c1[1], c1[2]))
    l2 = rel_luminance((c2[0], c2[1], c2[2]))
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)

def fmt_ratio(x: float) -> str:
    return f"{x:.2f}:1"

def is_near_black(bg: Color, threshold_l: float = 0.015) -> bool:
    return rel_luminance((bg[0], bg[1], bg[2])) < threshold_l

# =============================================================================
# CSS token parsing (same approach; trimmed comments, same behavior)
# =============================================================================

TOKEN_RE = re.compile(r"--([a-zA-Z0-9\-_]+)\s*:\s*([^;{}]+);")

def _strip_css_comments(s: str) -> str:
    return re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)

def _find_matching_brace(s: str, lbrace_idx: int) -> Optional[int]:
    depth = 0
    in_str: Optional[str] = None
    esc = False
    for i in range(lbrace_idx, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            continue
        if ch in ("'", '"'):
            in_str = ch
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
    return None

def extract_all_layer_blocks(css: str, layer_name: str) -> List[str]:
    clean = _strip_css_comments(css)
    blocks: List[str] = []
    for m in re.finditer(rf"@layer\s+{re.escape(layer_name)}\b", clean, flags=re.IGNORECASE):
        lbrace = clean.find("{", m.end())
        if lbrace == -1:
            continue
        rbrace = _find_matching_brace(clean, lbrace)
        if rbrace is None:
            continue
        blocks.append(clean[lbrace : rbrace + 1])
    return blocks

@dataclass
class CssRule:
    selector: str
    body: str

def _extract_rules(css: str) -> List[CssRule]:
    rules: List[CssRule] = []
    s = css
    i = 0
    in_str: Optional[str] = None
    esc = False
    last_boundary = 0

    def _flush_selector(sel_end: int) -> str:
        return s[last_boundary:sel_end].strip()

    while i < len(s):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue

        if ch in ("'", '"'):
            in_str = ch
            i += 1
            continue

        if ch == "{":
            selector = _flush_selector(i)
            lbrace = i
            rbrace = _find_matching_brace(s, lbrace)
            if rbrace is None:
                break
            body = s[lbrace + 1 : rbrace].strip()

            if selector.startswith("@"):
                rules.extend(_extract_rules(body))
            else:
                rules.append(CssRule(selector=selector, body=body))

            i = rbrace + 1
            last_boundary = i
            continue

        i += 1

    return rules

def _selector_is_light(selector: str) -> bool:
    return bool(re.search(r"\.ff-root\b[^{]*\[\s*data-theme\s*=\s*(['\"]?)light\1\s*\]", selector, flags=re.IGNORECASE))

def _selector_is_dark(selector: str) -> bool:
    return bool(re.search(r"\.ff-root\b[^{]*\[\s*data-theme\s*=\s*(['\"]?)dark\1\s*\]", selector, flags=re.IGNORECASE))

def _selector_is_system_dark(selector: str) -> bool:
    return bool(re.search(r"\.ff-root\b[^{]*:not\(\s*\[\s*data-theme\s*\]\s*\)", selector, flags=re.IGNORECASE))

def _selector_is_base(selector: str) -> bool:
    if re.search(r"(^|,)\s*:root\b", selector, flags=re.IGNORECASE):
        return True
    if re.search(r"\[\s*data-ff-brand\s*\]", selector, flags=re.IGNORECASE):
        return True
    if ".ff-root" in selector:
        if _selector_is_light(selector) or _selector_is_dark(selector) or _selector_is_system_dark(selector):
            return False
        if re.search(r"\[\s*data-theme\s*=", selector, flags=re.IGNORECASE):
            return False
        return True
    return False

def parse_tokens_from_body(body: str) -> Dict[str, str]:
    toks: Dict[str, str] = {}
    for m in TOKEN_RE.finditer(body):
        toks[m.group(1).strip()] = m.group(2).strip()
    return toks

def merge_dicts_in_order(dicts: List[Dict[str, str]]) -> Dict[str, str]:
    merged: Dict[str, str] = {}
    for d in dicts:
        merged.update(d)
    return merged

@dataclass
class ThemeTokens:
    base: Dict[str, str]
    light: Dict[str, str]
    dark: Dict[str, str]
    system_dark: Dict[str, str]
    notes: List[str]

def parse_theme_tokens(css_path: str, debug: bool = False) -> ThemeTokens:
    css_raw = open(css_path, "r", encoding="utf-8").read()
    notes: List[str] = []

    token_layers = extract_all_layer_blocks(css_raw, "ff.tokens")
    if not token_layers:
        notes.append("WARN: Could not find @layer ff.tokens; falling back to whole file scan (less reliable).")
        token_layers = [_strip_css_comments(css_raw)]
    else:
        if len(token_layers) > 1:
            notes.append(f"NOTE: Found {len(token_layers)} @layer ff.tokens blocks; merging in file order (later wins).")

    rules_all: List[CssRule] = []
    for blk in token_layers:
        inner = blk.strip()
        if inner.startswith("{") and inner.endswith("}"):
            inner = inner[1:-1]
        rules_all.extend(_extract_rules(_strip_css_comments(inner)))

    base_dicts: List[Dict[str, str]] = []
    light_dicts: List[Dict[str, str]] = []
    dark_dicts: List[Dict[str, str]] = []
    sysd_dicts: List[Dict[str, str]] = []

    for r in rules_all:
        sel = r.selector.strip()
        toks = parse_tokens_from_body(r.body)
        if not sel or not toks:
            continue
        if _selector_is_light(sel):
            light_dicts.append(toks)
        elif _selector_is_dark(sel):
            dark_dicts.append(toks)
        elif _selector_is_system_dark(sel):
            sysd_dicts.append(toks)
        elif _selector_is_base(sel):
            base_dicts.append(toks)

    base_tokens = merge_dicts_in_order(base_dicts)
    light_tokens = merge_dicts_in_order(light_dicts)
    dark_tokens = merge_dicts_in_order(dark_dicts)
    sysd_tokens = merge_dicts_in_order(sysd_dicts)

    if not base_tokens:
        notes.append("WARN: No base token blocks detected (expected :root/[data-ff-brand]/.ff-root).")
    if not light_dicts:
        notes.append("WARN: No `.ff-root[data-theme=light] {}` token blocks found. Light audit uses base only.")
    if not dark_dicts:
        notes.append("WARN: No `.ff-root[data-theme=dark] {}` token blocks found. Dark audit uses base only.")
    if not sysd_dicts:
        notes.append("WARN: No `.ff-root:not([data-theme]) {}` token blocks found. system_dark audit may be meaningless.")

    if debug:
        print("---- DEBUG parse notes ----")
        for n in notes:
            print(n)

    return ThemeTokens(base=base_tokens, light=light_tokens, dark=dark_tokens, system_dark=sysd_tokens, notes=notes)

def build_theme(theme: ThemeTokens, mode: str) -> Dict[str, str]:
    merged = dict(theme.base)
    if mode == "light":
        merged.update(theme.light)
        return merged
    if mode == "dark":
        merged.update(theme.dark)
        return merged
    if mode == "system_dark":
        merged.update(theme.system_dark)
        return merged
    raise ValueError("mode must be light, dark, or system_dark")

def _resolve_var(tokens: Dict[str, str], raw: str) -> Optional[str]:
    m = VAR_RE.match(raw.strip())
    if not m:
        return None
    name = m.group(1)
    fallback = (m.group(2) or "").strip() or None
    val = tokens.get(name)
    if val is not None:
        return val
    return fallback

def resolve_colors(tokens: Dict[str, str], token_name: str, _seen: Optional[set] = None) -> Optional[List[Color]]:
    key = token_name.strip().lstrip("-")
    raw = tokens.get(key)
    if raw is None:
        return None

    if _seen is None:
        _seen = set()
    if key in _seen:
        return None
    _seen.add(key)

    maybe = _resolve_var(tokens, raw)
    if maybe is not None:
        vm = VAR_RE.match(maybe.strip())
        if vm:
            return resolve_colors(tokens, vm.group(1), _seen=_seen)
        raw = maybe

    lits = [m.group(1) for m in COLOR_LITERAL_RE.finditer(raw)]
    if lits:
        cols: List[Color] = []
        for lit in lits:
            c = parse_color_literal(lit)
            if c:
                cols.append(c)
        return cols if cols else None

    c = parse_color_literal(raw)
    return [c] if c else None

# =============================================================================
# Audit definitions / scoring
# =============================================================================

@dataclass
class Pair:
    fg: str
    bg: str
    label: str
    kind: str  # core | secondary | link | accent | decorative

def default_pairs(include_decorative: bool = False) -> List[Pair]:
    pairs: List[Pair] = [
        Pair("ff-text", "ff-page-bg", "Text on page bg", "core"),
        Pair("ff-muted", "ff-page-bg", "Muted on page bg", "secondary"),
        Pair("ff-subtle", "ff-page-bg", "Subtle on page bg", "secondary"),
        Pair("ff-text", "ff-surface", "Text on surface", "core"),
        Pair("ff-muted", "ff-surface", "Muted on surface", "secondary"),
        Pair("ff-text", "ff-surface2", "Text on surface2", "core"),
        Pair("ff-muted", "ff-surface2", "Muted on surface2", "secondary"),
        Pair("ff-text", "ff-glass", "Text on glass", "core"),
        Pair("ff-muted", "ff-glass", "Muted on glass", "secondary"),
        Pair("ff-link", "ff-page-bg", "Link on page bg", "link"),
        Pair("ff-link", "ff-surface", "Link on surface", "link"),
        Pair("ff-accent-text", "ff-page-bg", "Accent text on page bg", "accent"),
        Pair("ff-accent-text", "ff-surface", "Accent text on surface", "accent"),
        Pair("ff-accent-ink", "ff-accent", "Accent ink on accent fill", "accent"),
    ]
    if include_decorative:
        pairs += [
            Pair("ff-outline", "ff-page-bg", "Outline on page bg (decorative)", "decorative"),
            Pair("ff-outline-2", "ff-page-bg", "Outline-2 on page bg (decorative)", "decorative"),
        ]
    return pairs

def wcag_grade(r: float) -> Dict[str, bool]:
    return {"AA_normal": r >= 4.5, "AA_large": r >= 3.0, "AAA_normal": r >= 7.0}

def required_levels(kind: str, objective: str) -> Dict[str, bool]:
    if kind == "decorative":
        return {"AA_normal": False, "AAA_normal": False}
    if objective in ("aa", "comfort"):
        return {"AA_normal": True, "AAA_normal": False}
    if objective == "strict":
        if kind == "core":
            return {"AA_normal": True, "AAA_normal": True}
        return {"AA_normal": True, "AAA_normal": False}
    return {"AA_normal": True, "AAA_normal": False}

def score_report(rows: List[Dict[str, Any]], objective: str) -> Tuple[int, Dict[str, int]]:
    score = 100
    breakdown = {"missing": 0, "aa_fail": 0, "aaa_fail": 0}

    for row in rows:
        req = row.get("required", {"AA_normal": False, "AAA_normal": False})
        if row.get("kind") == "decorative":
            continue
        if "error" in row:
            if req.get("AA_normal"):
                score -= 10
                breakdown["missing"] += 1
            continue
        wc = row["wcag"]
        if req.get("AA_normal") and not wc["AA_normal"]:
            score -= 10
            breakdown["aa_fail"] += 1
            continue
        if req.get("AAA_normal") and not wc["AAA_normal"]:
            score -= 2
            breakdown["aaa_fail"] += 1

    return max(0, min(100, score)), breakdown

def audit_theme(tokens: Dict[str, str], mode: str, pairs: List[Pair], objective: str) -> Dict[str, Any]:
    results: List[Dict[str, Any]] = []
    page_bg_list = resolve_colors(tokens, "ff-page-bg") or [(1.0, 1.0, 1.0, 1.0)]
    page_bg = page_bg_list[0]

    for p in pairs:
        fg_list = resolve_colors(tokens, p.fg)
        bg_list = resolve_colors(tokens, p.bg)
        req = required_levels(p.kind, objective)

        if fg_list is None or bg_list is None:
            results.append({"label": p.label, "fg": p.fg, "bg": p.bg, "kind": p.kind, "required": req, "error": "missing/unsupported token"})
            continue

        worst_r: Optional[float] = None
        worst_payload: Optional[Tuple[Color, Color]] = None

        for fg in fg_list:
            for bg in bg_list:
                bg_eff = bg
                if bg_eff[3] < 1.0:
                    bg_eff = composite(bg_eff, page_bg)
                    bg_eff = (bg_eff[0], bg_eff[1], bg_eff[2], 1.0)

                fg_eff = fg
                if fg_eff[3] < 1.0:
                    fg_eff = composite(fg_eff, bg_eff)
                    fg_eff = (fg_eff[0], fg_eff[1], fg_eff[2], 1.0)

                r = contrast_ratio(fg_eff, bg_eff)
                if worst_r is None or r < worst_r:
                    worst_r = r
                    worst_payload = (fg_eff, bg_eff)

        if worst_r is None or worst_payload is None:
            results.append({"label": p.label, "fg": p.fg, "bg": p.bg, "kind": p.kind, "required": req, "error": "could not compute"})
            continue

        fg_eff, bg_eff = worst_payload
        results.append({
            "label": p.label,
            "fg": p.fg,
            "bg": p.bg,
            "kind": p.kind,
            "required": req,
            "ratio": worst_r,
            "ratio_fmt": fmt_ratio(worst_r),
            "wcag": wcag_grade(worst_r),
            "oled_flag_bg_near_black": bool(is_near_black(bg_eff)) if mode in ("dark", "system_dark") else False,
        })

    score, breakdown = score_report(results, objective)
    return {"mode": mode, "objective": objective, "score": score, "breakdown": breakdown, "results": results}

def to_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(f"# FutureFunded Contrast Audit — {report['mode'].upper().replace('_',' ')}")
    lines.append("")
    lines.append(f"**Objective:** `{report.get('objective','strict')}`")
    lines.append(f"**Final rating:** {report.get('score', '?')}/100")
    bd = report.get("breakdown", {}) or {}
    lines.append(f"**Breakdown:** missing={bd.get('missing',0)}, AA_fail={bd.get('aa_fail',0)}, AAA_fail={bd.get('aaa_fail',0)}")
    lines.append("")
    lines.append("| Pair | Contrast | AA | AAA | Req AA | Req AAA | OLED | Kind |")
    lines.append("|---|---:|:---:|:---:|:---:|:---:|:---:|---|")
    for row in report["results"]:
        req = row.get("required", {})
        if "error" in row:
            lines.append(
                f"| {row['label']} (`{row['fg']}` on `{row['bg']}`) | **ERR** |  |  | "
                f"{'✅' if req.get('AA_normal') else ''} | {'✅' if req.get('AAA_normal') else ''} |  | {row.get('kind','')} |"
            )
            continue
        wc = row["wcag"]
        lines.append(
            f"| {row['label']} (`{row['fg']}` on `{row['bg']}`)"
            f" | **{row['ratio_fmt']}**"
            f" | {'✅' if wc['AA_normal'] else '❌'}"
            f" | {'✅' if wc['AAA_normal'] else '❌'}"
            f" | {'✅' if req.get('AA_normal') else ''}"
            f" | {'✅' if req.get('AAA_normal') else ''}"
            f" | {'⚠️' if row.get('oled_flag_bg_near_black') else ''}"
            f" | {row.get('kind','')} |"
        )
    lines.append("")
    lines.append("**OLED flag** means the effective background luminance is extremely low;")
    lines.append("text can *feel* harsher on OLED even when WCAG passes.")
    return "\n".join(lines)

# =============================================================================
# Smoke / Lighthouse helpers
# =============================================================================

def find_chrome_bin() -> Optional[str]:
    env = os.environ.get("CHROME_BIN")
    if env and os.path.exists(env):
        return env
    return _which_any(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"])

def run_curl_smoke(url: str, out_dir: str, asserts: List[str], timeout_s: int, user_agent: str, debug: bool) -> Dict[str, Any]:
    ensure_dir(out_dir)
    u = normalize_url(url)
    curl = shutil.which("curl")
    if not curl:
        return {"ok": False, "engine": "curl", "error": "curl_not_found", "url": u}

    cmd = [curl, "-fsSL", "--max-time", str(timeout_s), "-A", user_agent, u]
    res = run_cmd_pg(cmd, timeout_s=timeout_s + 5, debug=debug)

    dom_path = os.path.join(out_dir, "curl_smoke_dom.html")
    err_path = os.path.join(out_dir, "curl_smoke_stderr.txt")
    write_text(dom_path, res.stdout)
    write_text(err_path, res.stderr)

    html = res.stdout or ""
    ok = (res.returncode == 0) and ("<html" in html.lower() or "<!doctype" in html.lower())
    missing = [a for a in asserts if a and a not in html]
    if missing:
        ok = False

    return {
        "ok": ok,
        "engine": "curl",
        "url": u,
        "returncode": res.returncode,
        "missing": missing,
        "dom_path": dom_path,
        "stderr_path": err_path,
        "stderr_tail": tail_lines(res.stderr, 30),
    }

def run_chrome_smoke(url: str, out_dir: str, chrome_bin: Optional[str], asserts: List[str], timeout_s: int, debug: bool, user_agent: str) -> Dict[str, Any]:
    ensure_dir(out_dir)
    u = normalize_url(url)
    chrome = chrome_bin or find_chrome_bin()
    if not chrome:
        return {"ok": False, "engine": "chrome", "error": "chrome_not_found", "url": u}

    tmp_profile = tempfile.mkdtemp(prefix="ff-chrome-smoke-")
    cmd = [
        chrome,
        "--headless=new",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-sync",
        "--disable-component-update",
        "--metrics-recording-only",
        "--mute-audio",
        "--hide-scrollbars",
        "--window-size=1280,720",
        f"--user-data-dir={tmp_profile}",
        f"--user-agent={user_agent}",
        "--disable-blink-features=AutomationControlled",
        "--virtual-time-budget=6000",
        "--dump-dom",
        u,
    ]

    try:
        res = run_cmd_pg(cmd, timeout_s=timeout_s, debug=debug)
    finally:
        shutil.rmtree(tmp_profile, ignore_errors=True)

    dom_path = os.path.join(out_dir, "chrome_smoke_dom.html")
    err_path = os.path.join(out_dir, "chrome_smoke_stderr.txt")
    write_text(dom_path, res.stdout)
    write_text(err_path, res.stderr)

    dom = res.stdout or ""
    ok = (res.returncode == 0) and ("<html" in dom.lower() or "<!doctype" in dom.lower())
    missing = [a for a in asserts if a and a not in dom]
    if missing:
        ok = False

    return {
        "ok": ok,
        "engine": "chrome",
        "url": u,
        "returncode": res.returncode,
        "missing": missing,
        "dom_path": dom_path,
        "stderr_path": err_path,
        "stderr_tail": tail_lines(res.stderr, 30),
    }

def parse_lh_thresholds(s: str) -> Dict[str, float]:
    defaults = {"performance": 0.85, "accessibility": 0.95, "best-practices": 0.90, "seo": 0.90}
    if not s:
        return defaults
    out = dict(defaults)
    for part in s.split(","):
        part = part.strip()
        if not part or "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip().lower()
        v = v.strip()
        try:
            f = float(v)
            if f > 1.0:
                f = f / 100.0
            out[k] = max(0.0, min(1.0, f))
        except ValueError:
            continue
    return out

def find_lighthouse_runner() -> List[str]:
    lh = shutil.which("lighthouse")
    if lh:
        return [lh]
    npx = shutil.which("npx")
    if npx:
        return [npx, "--yes", "lighthouse"]
    return []

def _lh_preset_flags(preset: str) -> List[str]:
    p = (preset or "mobile").strip().lower()
    if p == "mobile":
        return ["--form-factor", "mobile"]
    if p == "desktop":
        return ["--preset", "desktop", "--form-factor", "desktop"]
    if p in ("perf", "experimental"):
        return ["--preset", p]
    return ["--form-factor", "mobile"]

def run_lighthouse(url: str, out_dir: str, preset: str, thresholds: Dict[str, float], chrome_bin: Optional[str], timeout_s: int, debug: bool) -> Dict[str, Any]:
    ensure_dir(out_dir)
    u = normalize_url(url)

    runner = find_lighthouse_runner()
    if not runner:
        return {"ok": False, "error": "lighthouse_not_found", "url": u}

    chrome = chrome_bin or find_chrome_bin()

    env = dict(os.environ)
    env.setdefault("CI", "1")
    env["XDG_SESSION_TYPE"] = "x11"
    env.pop("WAYLAND_DISPLAY", None)
    env.pop("WAYLAND_SOCKET", None)

    chrome_flags = " ".join([
        "--headless=new",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--remote-debugging-port=0",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-sync",
        "--disable-component-update",
        "--metrics-recording-only",
        "--mute-audio",
        "--hide-scrollbars",
        "--disable-features=UseOzonePlatform",
        "--ozone-platform=x11",
    ])

    categories = ["performance", "accessibility", "best-practices", "seo"]
    stamp = now_stamp()
    base = os.path.join(out_dir, f"lighthouse_{preset}_{stamp}")
    json_path = f"{base}.report.json"
    html_path = f"{base}.report.html"
    stdout_path = os.path.join(out_dir, f"lighthouse_{preset}_{stamp}.stdout.txt")
    stderr_path = os.path.join(out_dir, f"lighthouse_{preset}_{stamp}.stderr.txt")
    summary_md = os.path.join(out_dir, f"lighthouse_{preset}.summary.md")

    common = (
        runner
        + [u]
        + ["--quiet"]
        + ["--port", "0"]
        + _lh_preset_flags(preset)
        + ["--only-categories", ",".join(categories)]
        + ["--chrome-flags", chrome_flags]
    )
    if chrome:
        common += ["--chrome-path", chrome]

    res_json = run_cmd_pg(common + ["--output", "json", "--output-path", json_path], timeout_s=timeout_s, env=env, debug=debug)
    write_text(stdout_path, res_json.stdout)
    write_text(stderr_path, res_json.stderr)

    if res_json.timed_out:
        return {"ok": False, "error": "lighthouse_timeout", "url": u, "stdout_path": stdout_path, "stderr_path": stderr_path}

    if not os.path.exists(json_path):
        err = (res_json.stderr or "").strip()
        payload = {
            "ok": False,
            "error": "lighthouse_no_report",
            "url": u,
            "returncode": res_json.returncode,
            "stdout_path": stdout_path,
            "stderr_path": stderr_path,
            "stderr_tail": tail_lines(err, 60),
        }
        if "Unable to connect to Chrome" in err:
            payload["why"] = "Lighthouse could not connect to its Chrome instance."
            payload["hints"] = [
                "Set CHROME_BIN or pass --chrome-bin explicitly.",
                "Avoid Snap/Flatpak Chrome in CI; prefer system chrome/chromium.",
                "Ensure headless deps exist (fonts, libnss3).",
                "If containerized, keep --no-sandbox and consider /dev/shm sizing.",
            ]
        return payload

    # best-effort HTML
    _ = run_cmd_pg(common + ["--output", "html", "--output-path", html_path], timeout_s=max(60, int(timeout_s * 0.75)), env=env, debug=debug)

    try:
        rep = json.loads(open(json_path, "r", encoding="utf-8").read())
    except Exception as e:
        return {"ok": False, "error": "lighthouse_bad_json", "url": u, "report_json": json_path, "why": f"{type(e).__name__}: {e}"}

    cats = rep.get("categories", {}) or {}
    scores: Dict[str, float] = {}
    for k in categories:
        sc = cats.get(k, {}).get("score")
        scores[k] = float(sc) if isinstance(sc, (int, float)) else -1.0

    failing = []
    for k, min_sc in thresholds.items():
        if k in scores and scores[k] >= 0 and scores[k] < min_sc:
            failing.append({"category": k, "score": scores[k], "threshold": min_sc})

    ok = (len(failing) == 0)

    lines = []
    lines.append(f"# Lighthouse Summary ({preset})")
    lines.append("")
    lines.append(f"- URL: {u}")
    lines.append(f"- stdout: {stdout_path}")
    lines.append(f"- stderr: {stderr_path}")
    lines.append("")
    for k in categories:
        sc = scores.get(k, -1.0)
        thr = thresholds.get(k)
        if sc < 0:
            lines.append(f"- {k}: (missing)")
        else:
            badge = "✅" if (thr is None or sc >= thr) else "❌"
            lines.append(f"- {k}: {int(sc*100)}/100 (min {int((thr or 0)*100)}) {badge}")
    write_text(summary_md, "\n".join(lines))

    return {
        "ok": ok,
        "url": u,
        "preset": preset,
        "thresholds": thresholds,
        "scores": scores,
        "failing": failing,
        "report_json": json_path,
        "report_html": html_path if os.path.exists(html_path) else None,
        "summary_md": summary_md,
        "stdout_path": stdout_path,
        "stderr_path": stderr_path,
    }

# =============================================================================
# Optional Playwright gate
# =============================================================================

def run_playwright(out_dir: str, cmd_str: str, timeout_s: int, debug: bool) -> Dict[str, Any]:
    ensure_dir(out_dir)
    stamp = now_stamp()
    stdout_path = os.path.join(out_dir, f"playwright_{stamp}.stdout.txt")
    stderr_path = os.path.join(out_dir, f"playwright_{stamp}.stderr.txt")

    cmd = shlex.split(cmd_str)
    res = run_cmd_pg(cmd, timeout_s=timeout_s, debug=debug)

    write_text(stdout_path, res.stdout)
    write_text(stderr_path, res.stderr)

    ok = (res.returncode == 0) and not res.timed_out
    return {
        "ok": ok,
        "cmd": cmd,
        "returncode": res.returncode,
        "timed_out": res.timed_out,
        "duration_s": res.duration_s,
        "stdout_path": stdout_path,
        "stderr_path": stderr_path,
        "stderr_tail": tail_lines(res.stderr, 80),
    }

# =============================================================================
# Main
# =============================================================================

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("css_path", help="Path to ff.css")
    ap.add_argument("--out", default="artifacts/contrast", help="Output directory for artifacts")
    ap.add_argument("--debug", action="store_true", help="Debug logging")
    ap.add_argument("--modes", default="light,dark", help="Comma list: light,dark,system_dark")
    ap.add_argument("--objective", default="strict", choices=["strict", "comfort", "aa"], help="Scoring objective")
    ap.add_argument("--include-decorative", action="store_true", help="Include decorative checks (not scored)")
    ap.add_argument("--fail-under", type=int, default=None, help="Exit nonzero if worst contrast score across modes < N")

    ap.add_argument("--url", default="", help="URL to test with smoke / Lighthouse")
    ap.add_argument("--chrome-bin", default="", help="Explicit Chrome/Chromium binary path (or CHROME_BIN)")
    ap.add_argument("--chrome-smoke", action="store_true", help="Run smoke test (Chrome/curl)")
    ap.add_argument("--smoke-engine", default="auto", choices=["auto", "chrome", "curl"])
    ap.add_argument("--smoke-user-agent", default="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
    ap.add_argument("--smoke-assert", action="append", default=[], help="Substring must exist in HTML/DOM (repeatable)")
    ap.add_argument("--smoke-timeout", type=int, default=12)
    ap.add_argument("--allow-missing-chrome", action="store_true")

    ap.add_argument("--lighthouse", action="store_true")
    ap.add_argument("--lh-preset", default="mobile", choices=["mobile", "desktop", "perf", "experimental"])
    ap.add_argument("--lh-thresholds", default="performance=0.85,accessibility=0.95,best-practices=0.90,seo=0.90")
    ap.add_argument("--lh-timeout", type=int, default=240)
    ap.add_argument("--allow-missing-lh", action="store_true")

    # New: Playwright gate
    ap.add_argument("--playwright", action="store_true", help="Run Playwright test suite as part of the gate")
    ap.add_argument("--pw-cmd", default="npx playwright test", help="Command to run Playwright")
    ap.add_argument("--pw-timeout", type=int, default=300, help="Timeout seconds for Playwright")

    ap.add_argument("--fail-ci", action="store_true", help="Fail (exit 1) if any enabled gate fails (smoke/lh/pw)")

    args = ap.parse_args()
    ensure_dir(args.out)

    final: Dict[str, Any] = {"version": APP_VERSION, "ts": now_stamp(), "ok": True, "gates": {}}

    theme = parse_theme_tokens(args.css_path, debug=args.debug)
    write_json(os.path.join(args.out, "parse_notes.json"), {"version": APP_VERSION, "notes": theme.notes})

    pairs = default_pairs(include_decorative=args.include_decorative)
    modes = [m.strip() for m in (args.modes or "").split(",") if m.strip()]

    worst = 101
    worst_mode: Optional[str] = None

    for mode in modes:
        rep = audit_theme(build_theme(theme, mode), mode, pairs, args.objective)
        worst = min(worst, rep["score"])
        worst_mode = mode if rep["score"] == worst else worst_mode

        write_json(os.path.join(args.out, f"contrast_{mode}.json"), rep)
        write_text(os.path.join(args.out, f"contrast_{mode}.md"), to_markdown(rep))
        print(f"✅ {mode}: rating {rep['score']}/100  →  {os.path.join(args.out, f'contrast_{mode}.md')}")

    if args.fail_under is not None and worst < args.fail_under:
        final["ok"] = False
        final["gates"]["contrast"] = {"ok": False, "why": f"worst={worst} < fail_under={args.fail_under}", "mode": worst_mode}
    else:
        final["gates"]["contrast"] = {"ok": True, "worst": worst, "mode": worst_mode}

    url = normalize_url(args.url)
    chrome_bin = (args.chrome_bin.strip() or None)

    # Smoke
    if args.chrome_smoke:
        if not url:
            final["gates"]["smoke"] = {"ok": True, "skipped": True, "why": "no --url provided"}
        else:
            asserts = args.smoke_assert or ['id="ffConfig"', 'class="ff-root"']
            smoke_dir = os.path.join(args.out, "smoke")
            ensure_dir(smoke_dir)

            if args.smoke_engine == "curl":
                payload = run_curl_smoke(url, os.path.join(smoke_dir, "curl"), asserts, min(args.smoke_timeout, 15), args.smoke_user_agent, args.debug)
            elif args.smoke_engine in ("auto", "chrome"):
                chrome_res = run_chrome_smoke(url, os.path.join(smoke_dir, "chrome"), chrome_bin, asserts, args.smoke_timeout, args.debug, args.smoke_user_agent)
                payload = chrome_res
                if args.smoke_engine == "auto" and not chrome_res.get("ok"):
                    curl_res = run_curl_smoke(url, os.path.join(smoke_dir, "curl"), asserts, min(args.smoke_timeout, 15), args.smoke_user_agent, args.debug)
                    payload = {"ok": bool(curl_res.get("ok")), "engine": "curl_fallback", "chrome": chrome_res, "curl": curl_res}
            else:
                payload = {"ok": False, "error": "bad_engine", "engine": args.smoke_engine}

            write_json(os.path.join(args.out, "smoke.json"), payload)

            if payload.get("ok"):
                print("✅ smoke: OK")
                final["gates"]["smoke"] = {"ok": True}
            else:
                # allow missing chrome if explicitly requested
                if args.allow_missing_chrome and payload.get("error") == "chrome_not_found":
                    print("⚠️ smoke: chrome missing (allowed)")
                    final["gates"]["smoke"] = {"ok": True, "allowed_missing_chrome": True}
                else:
                    print("❌ smoke: FAIL")
                    final["ok"] = False
                    final["gates"]["smoke"] = {"ok": False, "payload_path": os.path.join(args.out, "smoke.json")}

    # Lighthouse
    if args.lighthouse:
        if not url:
            final["gates"]["lighthouse"] = {"ok": True, "skipped": True, "why": "no --url provided"}
        else:
            thresholds = parse_lh_thresholds(args.lh_thresholds)
            payload = run_lighthouse(url, os.path.join(args.out, "lighthouse"), args.lh_preset, thresholds, chrome_bin, args.lh_timeout, args.debug)
            write_json(os.path.join(args.out, "lighthouse.json"), payload)

            if payload.get("ok"):
                print(f"✅ lighthouse: OK → {payload.get('summary_md')}")
                final["gates"]["lighthouse"] = {"ok": True, "summary_md": payload.get("summary_md")}
            else:
                # allow missing LH
                if args.allow_missing_lh and payload.get("error") in ("lighthouse_not_found", "lighthouse_no_report"):
                    print("⚠️ lighthouse: missing/unavailable (allowed)")
                    final["gates"]["lighthouse"] = {"ok": True, "allowed_missing_lh": True, "error": payload.get("error")}
                else:
                    print("❌ lighthouse: FAIL")
                    final["ok"] = False
                    final["gates"]["lighthouse"] = {"ok": False, "payload_path": os.path.join(args.out, "lighthouse.json")}

    # Playwright (new)
    if args.playwright:
        pw_dir = os.path.join(args.out, "playwright")
        payload = run_playwright(pw_dir, args.pw_cmd, args.pw_timeout, args.debug)
        write_json(os.path.join(args.out, "playwright.json"), payload)

        if payload.get("ok"):
            print("✅ playwright: OK")
            final["gates"]["playwright"] = {"ok": True}
        else:
            print("❌ playwright: FAIL")
            final["ok"] = False
            final["gates"]["playwright"] = {"ok": False, "payload_path": os.path.join(args.out, "playwright.json")}

    write_json(os.path.join(args.out, "final_summary.json"), final)

    if args.fail_ci and not final["ok"]:
        return 1

    # preserve previous behavior: only contrast fail-under triggers nonzero unless fail-ci is set
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
