from pathlib import Path
import shutil
import sys
import time
import re

p = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/js/ff-app.js")
if not p.exists():
    print(f"❌ JS file not found: {p}")
    raise SystemExit(1)

s = p.read_text(encoding="utf-8")
lines = s.splitlines(keepends=True)
original = s

def is_start(line: str) -> bool:
    return bool(re.match(r'^<{7}(?: .*)?$', line))

def is_mid(line: str) -> bool:
    return bool(re.match(r'^={7}$', line))

def is_end(line: str) -> bool:
    return bool(re.match(r'^>{7}(?: .*)?$', line))

out = []
i = 0
changed = 0
real_conflicts = []

while i < len(lines):
    line = lines[i]
    if not is_start(line.rstrip("\n")):
        out.append(line)
        i += 1
        continue

    start_idx = i
    i += 1
    left = []

    while i < len(lines) and not is_mid(lines[i].rstrip("\n")):
        left.append(lines[i])
        i += 1

    if i >= len(lines):
        print("❌ Unterminated merge conflict: missing =======")
        raise SystemExit(1)

    i += 1
    right = []

    while i < len(lines) and not is_end(lines[i].rstrip("\n")):
        right.append(lines[i])
        i += 1

    if i >= len(lines):
        print("❌ Unterminated merge conflict: missing >>>>>>>")
        raise SystemExit(1)

    end_idx = i
    i += 1

    if left == right:
        out.extend(left)
        changed += 1
    else:
        real_conflicts.append((start_idx + 1, end_idx + 1, "".join(left), "".join(right)))
        out.extend(lines[start_idx:i])

if real_conflicts:
    print(f"❌ Found {len(real_conflicts)} real conflict block(s). No changes written.")
    print()
    for n, (start, end, left, right) in enumerate(real_conflicts[:10], start=1):
        print(f"--- conflict #{n} lines {start}-{end} ---")
        print("LEFT:")
        print(left[:1200] if left.strip() else "[empty]")
        print("RIGHT:")
        print(right[:1200] if right.strip() else "[empty]")
        print()
    raise SystemExit(1)

new_s = "".join(out)

if new_s == original:
    print("ℹ️ No auto-cleanable conflict markers found.")
    raise SystemExit(0)

backup = p.with_suffix(p.suffix + f".bak-conflict-clean-{time.strftime('%Y%m%d-%H%M%S')}")
shutil.copy2(p, backup)
p.write_text(new_s, encoding="utf-8")

print(f"✅ Cleaned {changed} identical conflict block(s)")
print(f"🛟 Backup: {backup}")
print(f"✅ Wrote: {p}")
