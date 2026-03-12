#!/usr/bin/env python3
import subprocess
import argparse
import time
import os


def steps(url, version):

    return [

        ("Deploy sanity",
         "PYTHONPATH=. python tools/deploy/ff_deploy_sanity.py"),

        ("Live site version check",
         f"bash tools/deploy/check_live_site.sh {url} {version}"),

        ("Production readiness",
         f"PLAYWRIGHT_BASE_URL={url} npx playwright test tests/qa/production/ff_launch_readiness.spec.ts"),

        ("Production mobile sanity",
         f"PLAYWRIGHT_BASE_URL={url} npx playwright test tests/qa/production/ff_mobile_launch_sanity.spec.ts"),

    ]


def run(url, version):

    failed = 0
    total = 0

    for name, cmd in steps(url, version):

        print(f"\n=== {name} ===")
        print(cmd)

        start = time.time()
        result = subprocess.run(cmd, shell=True)
        elapsed = time.time() - start

        total += elapsed

        if result.returncode == 0:
            print(f"PASS ({elapsed:.1f}s)")
        else:
            print(f"FAIL ({elapsed:.1f}s)")
            failed += 1
            break

    print("\n==============================")
    print("FutureFunded Production Smoke")
    print("==============================")
    print("Failures:", failed)
    print("Total time:", round(total,1),"seconds")

    return failed


if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--version", required=True)

    args = parser.parse_args()

    exit(run(args.url, args.version))
