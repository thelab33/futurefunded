#!/usr/bin/env python3
# (same script I gave you earlier — transforms :focus rules to :focus:not(:focus-visible))
from pathlib import Path
import sys, re
FOCUS_REGEX = re.compile(r"(?P<selectors>(?:[^{}]|\n)+?)\{(?P<body>(?:[^{}]|\n)*?)\}", re.M)
def transform_rule(selectors, body):
    sel = selectors
    if ":focus-visible" in sel or ":not(:focus-visible)" in sel: return selectors, False
    if ":focus" not in sel: return selectors, False
    if not re.search(r"outline\s*:\s*none\s*;", body, flags=re.I): return selectors, False
    new_sel = re.sub(r":focus(?![:\w-])", ":focus:not(:focus-visible)", selectors)
    return new_sel, True

def process(path):
    p = Path(path)
    txt = p.read_text(encoding='utf-8', errors='replace')
    changed = 0
    def repl(m):
        nonlocal changed
        s = m.group('selectors')
        b = m.group('body')
        new_s, did = transform_rule(s, b)
        if did: 
            changed += 1
            return new_s + "{" + b + "}"
        return m.group(0)
    out = FOCUS_REGEX.sub(repl, txt)
    if changed:
        bak = p.with_suffix(p.suffix + ".bak.focusfix")
        bak.write_text(txt, encoding='utf-8')
        p.write_text(out, encoding='utf-8')
        print(f"[patched] {p} (rules changed: {changed}) backup -> {bak}")
    else:
        print(f"[no-change] {p}")
    return changed

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python tools/fix_focus_none_to_not_focus_visible.py <file> ..."); sys.exit(2)
    total=0
    for f in sys.argv[1:]:
        total += process(f)
    print("Total rules changed:", total)
