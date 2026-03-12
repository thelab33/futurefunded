#!/usr/bin/env bash
set -euo pipefail

echo "== AUDIT TOOLS =="
find tools/audit -maxdepth 1 -type f | sort || true
echo

echo "== RUNTIME TOOLS =="
find tools/runtime -maxdepth 1 -type f | sort || true
echo

echo "== DEPLOY TOOLS =="
find tools/deploy -maxdepth 1 -type f | sort || true
echo

echo "== PATCH TOOLS =="
find tools/patch -type f | sort || true
echo

echo "== QA TESTS =="
find tests -type f \( -name "*.spec.ts" -o -name "*.spec.js" \) | sort || true
echo

echo "== ARCHIVE COUNT =="
find _archive -type f | wc -l || true
