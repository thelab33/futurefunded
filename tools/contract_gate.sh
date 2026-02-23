#!/usr/bin/env bash
set -euo pipefail

echo "== Contract diff =="
python3 tools/ff_contract_snapshot.py app/templates/index.html tools/contracts/baseline.json
python3 tools/ff_contract_snapshot.py app/templates/index.vnext.html tools/contracts/vnext.json
python3 tools/ff_contract_diff.py tools/contracts/baseline.json tools/contracts/vnext.json

echo "== Quick invariants =="
rg -n 'id="ffConfig"' app/templates/index.vnext.html | wc -l | awk '{if ($1!=1) exit 1}'
rg -n 'id="ffSelectors"' app/templates/index.vnext.html | wc -l | awk '{if ($1!=1) exit 1}'
echo "OK ✅"
