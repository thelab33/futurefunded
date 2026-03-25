from pathlib import Path
from collections import Counter
import subprocess
import json
import re
import sys

JS_PATH = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/js/ff-app.js")
HTML_PATH = Path(sys.argv[2] if len(sys.argv) > 2 else "app/templates/index.html")

def fail(msg):
    print(f"❌ {msg}")
    sys.exit(1)

def info(msg):
    print(f"• {msg}")

if not JS_PATH.exists():
    fail(f"JS file not found: {JS_PATH}")

if not HTML_PATH.exists():
    fail(f"Template file not found: {HTML_PATH}")

js = JS_PATH.read_text(encoding="utf-8")
html = HTML_PATH.read_text(encoding="utf-8")

if not js.strip():
    fail("JS file is empty.")
info("JS file exists and is non-empty")

# -------------------------------------------------------------------
# 1) hard syntax gate
# -------------------------------------------------------------------
node_check = subprocess.run(
    ["node", "--check", str(JS_PATH)],
    capture_output=True,
    text=True
)
if node_check.returncode != 0:
    detail = (node_check.stderr or node_check.stdout or "").strip()
    fail("Node syntax check failed:\n" + detail)

info("Node syntax OK")

# -------------------------------------------------------------------
# 2) merge-conflict markers
# -------------------------------------------------------------------
conflict_marker_pat = re.compile(
    r'^(<{7}(?: .*)?$|={7}$|>{7}(?: .*)?$)',
    flags=re.M
)
if conflict_marker_pat.search(js):
    fail("Merge conflict markers found in JS file.")

info("No merge conflict markers")

# -------------------------------------------------------------------
# 3) production footguns
# -------------------------------------------------------------------
if re.search(r"\bdebugger\s*;", js):
    fail("Found `debugger;` statement in production JS.")

info("No debugger statements")

console_hits = re.findall(r"\bconsole\.(log|debug|trace|dir|table)\s*\(", js)
if console_hits:
    print("⚠️  Console diagnostics still present: " + ", ".join(sorted(set(console_hits))))
else:
    info("No console diagnostics found")

# -------------------------------------------------------------------
# 4) duplicate named functions (warning only)
# -------------------------------------------------------------------
fn_names = re.findall(r"\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(", js)
dupe_fns = sorted(name for name, count in Counter(fn_names).items() if count > 1)
if dupe_fns:
    print("⚠️  Duplicate function names detected (review): " + ", ".join(dupe_fns[:20]))
else:
    info("No duplicate named function declarations detected")

# -------------------------------------------------------------------
# 5) extract ffSelectors hooks from index.html
# -------------------------------------------------------------------
m = re.search(
    r'<script id="ffSelectors"[^>]*>\s*(\{.*?\})\s*</script>',
    html,
    flags=re.S
)
if not m:
    fail("Could not extract ffSelectors JSON from index.html")

try:
    selectors = json.loads(m.group(1))
except Exception as e:
    fail(f"ffSelectors JSON parse failed: {e}")

hooks = selectors.get("hooks", {})
if not isinstance(hooks, dict) or not hooks:
    fail("ffSelectors hooks object missing or empty")

hook_names = set(hooks.keys())
info(f"Loaded ffSelectors hooks from index.html ({len(hook_names)} hooks)")

# -------------------------------------------------------------------
# 6) strong selector-contract references in JS
# -------------------------------------------------------------------
strong_ref_patterns = [
    r'ffSelectors\.hooks\.([A-Za-z_][A-Za-z0-9_]*)',
    r'ffSelectors\.hooks\[\s*[\'"]([A-Za-z_][A-Za-z0-9_]*)[\'"]\s*\]',
    r'SELECTORS\.hooks\.([A-Za-z_][A-Za-z0-9_]*)',
    r'SELECTORS\.hooks\[\s*[\'"]([A-Za-z_][A-Za-z0-9_]*)[\'"]\s*\]',
    r'selectors\.hooks\.([A-Za-z_][A-Za-z0-9_]*)',
    r'selectors\.hooks\[\s*[\'"]([A-Za-z_][A-Za-z0-9_]*)[\'"]\s*\]',
]

strong_refs = set()
for pat in strong_ref_patterns:
    strong_refs.update(re.findall(pat, js))

unknown_strong = sorted(ref for ref in strong_refs if ref not in hook_names)
if unknown_strong:
    fail(
        "JS references unknown ffSelectors hook names: " +
        ", ".join(unknown_strong[:30])
    )

if strong_refs:
    info(f"Strong ffSelectors hook refs OK ({len(strong_refs)} used in JS)")
else:
    print("⚠️  No strong ffSelectors hook-reference pattern found in JS. This may be normal.")

# -------------------------------------------------------------------
# 7) ambiguous hook refs (warning only)
# -------------------------------------------------------------------
ambiguous_patterns = [
    r'(?<![A-Za-z0-9_$])(hooks|HOOKS)\.([A-Za-z_][A-Za-z0-9_]*)',
    r'(?<![A-Za-z0-9_$])(hooks|HOOKS)\[\s*[\'"]([A-Za-z_][A-Za-z0-9_]*)[\'"]\s*\]',
]

ambiguous_refs = set()

for pat in ambiguous_patterns:
    for match in re.findall(pat, js):
        if isinstance(match, tuple):
            ref = match[-1]
        else:
            ref = match
        ambiguous_refs.add(ref)

unknown_ambiguous = sorted(ref for ref in ambiguous_refs if ref not in hook_names)

if unknown_ambiguous:
    print(
        "⚠️  Possible unknown hook refs (ambiguous pattern, review manually): " +
        ", ".join(unknown_ambiguous[:30])
    )
else:
    info("No ambiguous unknown hook refs detected")

# -------------------------------------------------------------------
# 8) payload references
# -------------------------------------------------------------------
if "ffConfig" in js:
    info("ffConfig reference detected in JS")
else:
    print("⚠️  No ffConfig reference detected in JS")

if "ffSelectors" in js:
    info("ffSelectors reference detected in JS")
else:
    print("⚠️  No ffSelectors reference detected in JS")

# -------------------------------------------------------------------
# 9) DOM interaction smell check
# -------------------------------------------------------------------
required_strings = [
    "querySelector",
    "addEventListener",
]
missing_required = [token for token in required_strings if token not in js]
if missing_required:
    print("⚠️  Expected interaction primitives not found: " + ", ".join(missing_required))
else:
    info("Core DOM interaction primitives present")

print("✅ ff-app.js contract gate passed")
