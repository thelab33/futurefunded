#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import sys

p = Path("app/static/css/ff.css")
if not p.exists():
    print("ERR: app/static/css/ff.css not found. Run from repo root.")
    sys.exit(2)

s = p.read_text(encoding="utf-8")
open_count = s.count("{")
close_count = s.count("}")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
bak = p.with_suffix(p.suffix + f".bak-{stamp}")
bak.write_text(s, encoding="utf-8")
print(f"[backup] written -> {bak}")

print(f"[diagnostic] open braces: {open_count}, close braces: {close_count}")
diff = open_count - close_count

# show context around the reported error (line 1830)
err_line = 1830
lines = s.splitlines()
start = max(0, err_line - 15)
end = min(len(lines), err_line + 15)
print(f"\n[context] lines {start+1}..{end} (around {err_line}):\n")
for i in range(start, end):
    print(f"{i+1:5d}: {lines[i]}")

if diff == 0:
    print("\nNo net brace imbalance detected (opens == closes). There may be unmatched braces inside single-line rules or other syntax issues. Consider linting again.")
    sys.exit(0)

if diff > 0:
    print(f"\nAuto-fix candidate: {diff} unmatched opening '{{' (will append {diff} closing '}}' at EOF).")
    confirm = None
    # automatic in CI-friendly mode; just apply
    appended = ("\n\n/* [ff-autofix] Appended %d missing closing brace(s) on %s */\n" % (diff, stamp)) + ("}\n" * diff)
    new = s + appended
    p.write_text(new, encoding="utf-8")
    print(f"[fixed] Appended {diff} closing brace(s) to {p}.")
    print("✅ Please re-run: npm run audit:prod")
    sys.exit(0)

if diff < 0:
    print(f"\nDetected {abs(diff)} extra closing '}}' than opening '{{' (diff < 0).")
    print("Auto-removal of '}' is dangerous and not performed automatically.")
    # show first 60 lines where '}' appears frequently to help manual fix
    print("\nTop lines containing '}' near the error zone for inspection:\n")
    # find lines with '}' and print a few near the error line
    locations = [i+1 for i,l in enumerate(lines) if '}' in l]
    near = [ln for ln in locations if abs(ln - err_line) < 80]
    for ln in (near[:25] or locations[:25]):
        print(f"{ln:5d}: {lines[ln-1]}")
    print("\nRecommendation: open the file in an editor, inspect the shown context and remove the stray '}' or repair the surrounding block. After editing, re-run the audit.")
    sys.exit(3)
