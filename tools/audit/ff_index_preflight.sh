#!/usr/bin/env bash
set -euo pipefail

echo "==> index.html guard"
python tools/audit/ff_index_guard.py app/templates/index.html

echo
echo "==> index.html hard gate"
python tools/audit/ff_index_hard_gate.py app/templates/index.html app/static

echo
echo "✅ index.html preflight complete"
