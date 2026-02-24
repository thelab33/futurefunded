#!/usr/bin/env python3
import re, sys, pathlib

p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "app/templates/index.html").read_text(encoding="utf-8")

def count(rx): return len(re.findall(rx, p))

assert count(r'\|tojson\b') == 1, "Expected exactly 1 tojson usage"
assert count(r'id="ffConfig"') == 1, "Expected exactly 1 #ffConfig"
assert count(r'id="ffSelectors"') == 1, "Expected exactly 1 #ffSelectors"
assert count(r'<body\b') == 1 and count(r'</body>') == 1, "Expected exactly one body open/close"
assert count(r'<head\b') == 1 and count(r'</head>') == 1, "Expected exactly one head open/close"

m = re.search(r'<script id="ffSelectors"[^>]*>(.*?)</script>', p, re.S)
assert m, "ffSelectors block missing"
blk = m.group(1)
assert "{{" not in blk and "{%" not in blk, "Template tokens found inside ffSelectors JSON"

print("✅ index.html audit passed")

