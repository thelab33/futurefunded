from pathlib import Path
import sys

p = Path("yarn.lock")
if p.exists():
    print("FAIL: yarn.lock exists, but npm is the canonical package manager.")
    sys.exit(1)

print("PASS: yarn.lock not present.")
