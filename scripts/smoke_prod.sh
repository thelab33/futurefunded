#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"

echo "--- smoke: listening ---"
ss -ltnp | grep ':5000 ' || {
  echo "ERROR: nothing is listening on :5000"
  exit 1
}

echo "--- smoke: endpoints ---"
python - <<'PY'
import json
import os
import sys
import urllib.request

base = os.environ.get("BASE_URL", "http://127.0.0.1:5000")
urls = [
    f"{base}/stats",
    f"{base}/api/stats",
]

ok = True

for url in urls:
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            body = r.read().decode()
            print(url)
            print("STATUS:", r.status)
            print(body)
            print()

            if r.status != 200:
                ok = False

            try:
                json.loads(body)
            except Exception:
                print(f"ERROR: response was not valid JSON for {url}")
                ok = False

    except Exception as e:
        print(url)
        print("ERROR:", repr(e))
        print()
        ok = False

if not ok:
    sys.exit(1)
PY

echo "Smoke passed."
