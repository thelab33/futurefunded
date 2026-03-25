from pathlib import Path
from collections import defaultdict
import re
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/js/ff-app.js")
if not p.exists():
    print(f"❌ JS file not found: {p}")
    raise SystemExit(1)

lines = p.read_text(encoding="utf-8").splitlines()

def print_context(title, line_no, radius=4):
    start = max(1, line_no - radius)
    end = min(len(lines), line_no + radius)
    print(f"\n--- {title} @ lines {start}-{end} ---")
    for i in range(start, end + 1):
        mark = ">>" if i == line_no else "  "
        print(f"{mark} {i:5d}: {lines[i-1]}")

fn_rx = re.compile(r'\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
dom_ready_rx = re.compile(r'addEventListener\(\s*[\'"]DOMContentLoaded[\'"]')
load_rx = re.compile(r'addEventListener\(\s*[\'"]load[\'"]')
boot_call_rx = re.compile(r'\bboot\s*\(')

fn_map = defaultdict(list)
for i, line in enumerate(lines, start=1):
    for m in fn_rx.finditer(line):
        fn_map[m.group(1)].append(i)

dupes = {name: locs for name, locs in fn_map.items() if len(locs) > 1}

print("=== DUPLICATE FUNCTION MAP ===")
if not dupes:
    print("✅ No duplicate named functions")
else:
    for name in sorted(dupes):
        print(f"\n{name}: {', '.join(map(str, dupes[name]))}")
        for ln in dupes[name][:8]:
            print_context(f"function {name}", ln, radius=3)

print("\n=== DOMContentLoaded LISTENERS ===")
dom_hits = [i for i, line in enumerate(lines, start=1) if dom_ready_rx.search(line)]
if not dom_hits:
    print("✅ None")
else:
    print(f"Found {len(dom_hits)} hit(s): {', '.join(map(str, dom_hits))}")
    for ln in dom_hits[:20]:
        print_context("DOMContentLoaded", ln, radius=3)

print("\n=== WINDOW LOAD LISTENERS ===")
load_hits = [i for i, line in enumerate(lines, start=1) if load_rx.search(line)]
if not load_hits:
    print("✅ None")
else:
    print(f"Found {len(load_hits)} hit(s): {', '.join(map(str, load_hits))}")
    for ln in load_hits[:20]:
        print_context("load listener", ln, radius=3)

print("\n=== boot() CALLS ===")
boot_hits = [i for i, line in enumerate(lines, start=1) if boot_call_rx.search(line)]
if not boot_hits:
    print("✅ None")
else:
    print(f"Found {len(boot_hits)} hit(s): {', '.join(map(str, boot_hits[:40]))}")
    for ln in boot_hits[:30]:
        print_context("boot() call", ln, radius=3)

print("\n✅ ff-app.js boot map complete")
