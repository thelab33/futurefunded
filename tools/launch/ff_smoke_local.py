#!/usr/bin/env python3
import subprocess
import time
import os

STEPS = [
    ("Hook contract",
     "PYTHONPATH=. python tools/audit/ff_hook_required_check.py --required tools/.artifacts/ff_required_hooks_v1.txt --js app/static/js/ff-app.js"),

    ("CSS contract audit",
     "PYTHONPATH=. python tools/audit/ff_css_contract_audit.py"),

    ("DOM smoke",
     "node tools/runtime/smoke_dom.js"),

    ("Playwright contracts",
     "npm run pw:contracts"),

    ("Playwright flows",
     "npm run pw:flows"),

    ("Playwright integration",
     "npm run pw:integration"),

    ("Playwright UX",
     "npm run pw:ux"),
]


def run():
    failed = 0
    total = 0

    for name, cmd in STEPS:
        print(f"\n=== {name} ===")
        print(cmd)

        start = time.time()
        result = subprocess.run(cmd, shell=True, env=os.environ)
        elapsed = time.time() - start

        total += elapsed

        if result.returncode == 0:
            print(f"PASS ({elapsed:.1f}s)")
        else:
            print(f"FAIL ({elapsed:.1f}s)")
            failed += 1
            break

    print("\n===========================")
    print("FutureFunded Smoke Summary")
    print("===========================")
    print("Failures:", failed)
    print("Total time:", round(total,1),"seconds")

    return failed


if __name__ == "__main__":
    exit(run())
