#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse, re, datetime as dt

VOID_TAGS = ("meta","link","img","hr","input","br","source","track","area","base","col","embed","param","wbr")

def backup_path(p: Path) -> Path:
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    return p.with_suffix(p.suffix + f".bak_html5norm_{ts}")

def strip_trailing_ws(s: str) -> str:
    # remove trailing spaces/tabs at EOL
    return re.sub(r"[ \t]+(?=\n)", "", s)

def fix_void_selfclose(s: str) -> tuple[str,int]:
    # Convert <meta .../> to <meta ...> for void elements
    n_total = 0
    for tag in VOID_TAGS:
        # match: <tag ... /> or <tag .../>
        pat = re.compile(rf"(?is)<{tag}\b([^>]*)\s*/>")
        s, n = pat.subn(rf"<{tag}\1>", s)
        n_total += n
    return s, n_total

def remove_redundant_roles(s: str) -> tuple[str,int]:
    # Safe removals: roles that HTML already provides
    rules = [
        (re.compile(r'(?is)<header\b([^>]*?)\s+role="banner"([^>]*)>'), r"<header\1\2>"),
        (re.compile(r'(?is)<footer\b([^>]*?)\s+role="contentinfo"([^>]*)>'), r"<footer\1\2>"),
        (re.compile(r'(?is)<section\b([^>]*?)\s+role="region"([^>]*)>'), r"<section\1\2>"),
        (re.compile(r'(?is)<(ul|ol)\b([^>]*?)\s+role="list"([^>]*)>'), r"<\1\2\3>"),
        (re.compile(r'(?is)<li\b([^>]*?)\s+role="listitem"([^>]*)>'), r"<li\1\2>"),
    ]
    n_total = 0
    for pat, rep in rules:
        s, n = pat.subn(rep, s)
        n_total += n
    return s, n_total

def remove_role_button_on_anchors(s: str) -> tuple[str,int]:
    pat = re.compile(r'(?is)<a\b([^>]*?)\s+role="button"([^>]*)>')
    s2, n = pat.subn(r"<a\1\2>", s)
    return s2, n

def remove_aria_hidden_on_focusables(s: str) -> tuple[str,int]:
    # html-validate flags aria-hidden on focusable elements (href, tabindex, form controls)
    # Minimal safe fix: drop aria-hidden="true" where the tag is focusable.
    focus_pat = re.compile(
        r'(?is)<(?P<tag>a|button|input|select|textarea)\b(?P<attrs>[^>]*?)\s+aria-hidden="true"(?P<tail>[^>]*)>'
    )
    def repl(m):
        attrs = (m.group("attrs") + m.group("tail")).replace(' aria-hidden="true"', "")
        return f'<{m.group("tag")}{attrs}>'
    s2, n = focus_pat.subn(repl, s)
    return s2, n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="HTML file to normalize")
    ap.add_argument("--write", action="store_true", help="overwrite file (default: write .norm.html)")
    ap.add_argument("--aggressive", action="store_true", help="also remove redundant roles, role=button, aria-hidden on focusables")
    args = ap.parse_args()

    p = Path(args.path)
    src = p.read_text(encoding="utf-8", errors="replace")
    cur = strip_trailing_ws(src)

    cur, n_void = fix_void_selfclose(cur)

    n_roles = n_rb = n_hidden = 0
    if args.aggressive:
        cur, n_roles = remove_redundant_roles(cur)
        cur, n_rb = remove_role_button_on_anchors(cur)
        cur, n_hidden = remove_aria_hidden_on_focusables(cur)

    if cur == src:
        print("FutureFunded — ff_html5_normalize")
        print(f"• File: {p}")
        print("• Result: NO-OP")
        return 0

    if args.write:
        bak = backup_path(p)
        bak.write_text(src, encoding="utf-8")
        p.write_text(cur, encoding="utf-8")
        out = p
        print("FutureFunded — ff_html5_normalize")
        print(f"• File: {p}")
        print("• Mode: WRITE")
        print(f"  - trailing whitespace stripped: yes")
        print(f"  - void selfclose fixed: {n_void}")
        if args.aggressive:
            print(f"  - redundant roles removed: {n_roles}")
            print(f"  - role=button removed from <a>: {n_rb}")
            print(f"  - aria-hidden removed on focusables: {n_hidden}")
        print(f"✅ Wrote changes. Backup: {bak}")
    else:
        out = p.with_suffix(".norm.html")
        out.write_text(cur, encoding="utf-8")
        print("FutureFunded — ff_html5_normalize")
        print(f"• In:  {p}")
        print(f"• Out: {out}")
        print(f"  - trailing whitespace stripped: yes")
        print(f"  - void selfclose fixed: {n_void}")
        if args.aggressive:
            print(f"  - redundant roles removed: {n_roles}")
            print(f"  - role=button removed from <a>: {n_rb}")
            print(f"  - aria-hidden removed on focusables: {n_hidden}")
        print("✅ Wrote normalized file.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
