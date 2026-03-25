from pathlib import Path
from collections import defaultdict
import re
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/js/ff-app.js")
if not p.exists():
    print(f"❌ JS file not found: {p}")
    raise SystemExit(1)

lines = p.read_text(encoding="utf-8").splitlines()

def info(msg):
    print(f"• {msg}")

def warn(msg):
    print(f"⚠️  {msg}")

def line_hits(pattern):
    rx = re.compile(pattern)
    hits = []
    for i, line in enumerate(lines, start=1):
        if rx.search(line):
            hits.append((i, line.rstrip()))
    return hits

# -------------------------------------------------------------------
# 1) duplicate named functions with line numbers
# -------------------------------------------------------------------
fn_map = defaultdict(list)
fn_rx = re.compile(r'\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')

for i, line in enumerate(lines, start=1):
    for m in fn_rx.finditer(line):
        fn_map[m.group(1)].append(i)

dupes = {name: locs for name, locs in fn_map.items() if len(locs) > 1}
if dupes:
    warn("Duplicate named functions found:")
    for name in sorted(dupes):
        print(f"   - {name}: lines {', '.join(map(str, dupes[name][:12]))}")
else:
    info("No duplicate named functions detected")

# -------------------------------------------------------------------
# 2) boot / startup entrypoints
# -------------------------------------------------------------------
entry_patterns = {
    "DOMContentLoaded listeners": r'addEventListener\(\s*[\'"]DOMContentLoaded[\'"]',
    "window load listeners": r'addEventListener\(\s*[\'"]load[\'"]',
    "boot() calls": r'\bboot\s*\(',
    "init() calls": r'\binit[A-Za-z0-9_$]*\s*\(',
}

for label, pat in entry_patterns.items():
    hits = line_hits(pat)
    if hits:
        info(f"{label}: {len(hits)} hit(s)")
        for ln, src in hits[:12]:
            print(f"   - {ln}: {src[:160]}")
    else:
        info(f"{label}: none")

# -------------------------------------------------------------------
# 3) risky direct DOM chains
# -------------------------------------------------------------------
risk_patterns = {
    "querySelector direct chain":
        r'\b(?:document|d)\.querySelector\([^)]*\)\.(?:addEventListener|classList|setAttribute|removeAttribute|focus|append|prepend|scrollIntoView|showModal|close)\b',
    "getElementById direct chain":
        r'\b(?:document|d)\.getElementById\([^)]*\)\.(?:addEventListener|classList|setAttribute|removeAttribute|focus|append|prepend|scrollIntoView|showModal|close)\b',
    "qs() direct chain":
        r'\bqs\([^)]*\)\.(?:addEventListener|classList|setAttribute|removeAttribute|focus|append|prepend|scrollIntoView|showModal|close)\b',
    "qsa()[index] direct chain":
        r'\bqsa\([^)]*\)\s*\[[^\]]+\]\.(?:addEventListener|classList|setAttribute|removeAttribute|focus|append|prepend|scrollIntoView|showModal|close)\b',
}

risk_total = 0
for label, pat in risk_patterns.items():
    hits = line_hits(pat)
    risk_total += len(hits)
    if hits:
        warn(f"{label}: {len(hits)} hit(s)")
        for ln, src in hits[:20]:
            print(f"   - {ln}: {src[:180]}")
    else:
        info(f"{label}: none")

# -------------------------------------------------------------------
# 4) direct selector + property access
# -------------------------------------------------------------------
prop_hits = line_hits(
    r'\b(?:document|d)\.(?:querySelector|getElementById)\([^)]*\)\.[A-Za-z_$][A-Za-z0-9_$]*'
)
prop_hits = [
    (ln, src) for ln, src in prop_hits
    if not re.search(r'\.(?:matches|closest|hasAttribute|getAttribute)\b', src)
]

if prop_hits:
    warn(f"Direct selector property access: {len(prop_hits)} hit(s)")
    for ln, src in prop_hits[:20]:
        print(f"   - {ln}: {src[:180]}")
else:
    info("No direct selector property access hits")

# -------------------------------------------------------------------
# 5) summary
# -------------------------------------------------------------------
print()
print("✅ ff-app.js runtime risk scan complete")
print(f"• Total risky direct-chain hits: {risk_total}")
