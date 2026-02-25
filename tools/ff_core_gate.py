from __future__ import annotations

from pathlib import Path
import re
import sys

INDEX = Path("app/templates/index.html")

# Only these core assets are allowed from /static/css and /static/js.
ALLOWED_CSS = {"/static/css/ff.css"}
ALLOWED_JS = {"/static/js/ff-app.js"}

# Deterministic, minimal parsing (no heavy HTML parser needed).
html = INDEX.read_text(encoding="utf-8", errors="ignore")

# Capture href/src values, tolerate single quotes + whitespace.
css = set(re.findall(r"""href\s*=\s*["']([^"']+\.css[^"']*)["']""", html, flags=re.IGNORECASE))
js = set(re.findall(r"""src\s*=\s*["']([^"']+\.js[^"']*)["']""", html, flags=re.IGNORECASE))

def _base_path(url: str) -> str:
  # Strip query/hash to compare the actual asset path.
  return url.split("#", 1)[0].split("?", 1)[0].strip()

# Only gate assets under the core static namespaces.
bad_css = {c for c in css if "/static/css/" in c and _base_path(c) not in ALLOWED_CSS}
bad_js = {j for j in js if "/static/js/" in j and _base_path(j) not in ALLOWED_JS}

if bad_css or bad_js:
  print("❌ Core gate failed. index.html loads non-core assets:")
  for c in sorted(bad_css):
    print("  CSS:", c)
  for j in sorted(bad_js):
    print("  JS :", j)
  sys.exit(1)

print("✅ Core gate passed: only ff.css + ff-app.js referenced.")
