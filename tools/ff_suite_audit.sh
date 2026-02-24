#!/usr/bin/env bash
set -euo pipefail

echo "== Config files =="
ls -la playwright.config.* 2>/dev/null || true
ls -la tools/playwright*.config.* tools/playwright*.mjs 2>/dev/null || true
echo

echo "== Who calls playwright with --config/-c =="
rg -n "playwright test|--config|-c " package.json tools/*.sh tools/*.py tools/*.mjs 2>/dev/null || true
echo

echo "== Physical spec files (tests+tools) =="
find tests tools -maxdepth 2 -type f \( -name "*.spec.ts" -o -name "*.spec.js" -o -name "*.spec.mjs" -o -name "*.test.ts" -o -name "*.test.js" -o -name "*.test.mjs" \) -print | sort
echo

echo "== Playwright suite (default config) =="
npx playwright test --list || true
echo

if [ -f tools/playwright.ff.config.mjs ]; then
  echo "== Playwright suite (tools/playwright.ff.config.mjs) =="
  npx playwright test --list -c tools/playwright.ff.config.mjs || true
  echo
fi

echo "== Placeholder bombs =="
rg -n "<PASTE|PASTE THE|TODO: PASTE|__PASTE__|REPLACE ME|FIXME" tests tools || true
echo
