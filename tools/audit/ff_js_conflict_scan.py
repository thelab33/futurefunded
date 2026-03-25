from pathlib import Path
import re
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/js/ff-app.js")
if not p.exists():
    print(f"❌ JS file not found: {p}")
    raise SystemExit(1)

lines = p.read_text(encoding="utf-8").splitlines()

def is_conflict_line(line: str) -> bool:
    return bool(
        re.match(r'^<{7}(?: .*)?$', line) or
        re.match(r'^={7}$', line) or
        re.match(r'^>{7}(?: .*)?$', line)
    )

hits = [i for i, line in enumerate(lines, start=1) if is_conflict_line(line)]
if not hits:
    print("✅ No merge conflict markers found")
    raise SystemExit(0)

print(f"❌ Found {len(hits)} merge conflict marker lines in {p}")
print()

for ln in hits:
    start = max(1, ln - 4)
    end = min(len(lines), ln + 4)
    print(f"--- context lines {start}-{end} ---")
    for i in range(start, end + 1):
        mark = ">>" if i == ln else "  "
        print(f"{mark} {i:5d}: {lines[i-1]}")
    print()
