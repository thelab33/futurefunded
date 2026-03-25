#!/usr/bin/env bash
set -euo pipefail

CSS="app/static/css/ff.css"

echo "==> ff.css hard gate"
python tools/audit/ff_css_hard_gate.py "$CSS"

echo
echo "==> stylelint"
npx stylelint "$CSS" --config .stylelintrc.json

echo
echo "==> checksum snapshot"
mkdir -p tools/audit/.snapshots
sha256sum "$CSS" | tee tools/audit/.snapshots/ff.css.sha256

echo
echo "✅ ff.css freeze-ready"
