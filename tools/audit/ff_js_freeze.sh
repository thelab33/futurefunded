#!/usr/bin/env bash
set -euo pipefail

JS="app/static/js/ff-app.js"
HTML="app/templates/index.html"

echo "==> ff-app.js contract gate"
python tools/audit/ff_js_contract_gate.py "$JS" "$HTML"

echo
echo "==> ff-app.js runtime risk scan"
python tools/audit/ff_js_runtime_risk_scan.py "$JS"

echo
echo "==> ff-app.js boot map"
python tools/audit/ff_js_boot_map.py "$JS" >/tmp/ff_js_boot_map.txt
echo "• Boot map generated at /tmp/ff_js_boot_map.txt"

echo
echo "==> ff-app.js checksum snapshot"
mkdir -p tools/audit/.snapshots
sha256sum "$JS" | tee tools/audit/.snapshots/ff-app.js.sha256

echo
echo "✅ ff-app.js freeze-ready"
