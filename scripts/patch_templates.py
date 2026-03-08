#!/usr/bin/env python3
"""
scripts/patch_templates.py

Safe auto-patch for app/templates/index.html:
 - backup -> app/templates/index.html.bak_YYYYmmdd_HHMMSS
 - replace duplicate id attributes for repeating team items into data- attributes
 - prefer static_url('...') helper for inline static references when template tokens are present
 - inject a fail-safe donation fallback block before </main> if not already present

Run from repo root:
  python scripts/patch_templates.py
"""
from pathlib import Path
import datetime
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
TPL = ROOT / "app" / "templates" / "index.html"

if not TPL.exists():
    print("ERROR: cannot find template:", TPL)
    sys.exit(2)

txt = TPL.read_text(encoding="utf-8")
bak = TPL.with_suffix(".bak_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".html")
bak.write_text(txt, encoding="utf-8")
print("Backup created:", bak.name)

changes = []

# 1) Replace problematic duplicate ID attributes used in repeated team markup.
#    id="team-{{ _tid|e }}-meta"  ->  data-team-meta="{{ _tid|e }}"
#    id="team-{{ _tid|e }}-name"  ->  data-team-name="{{ _tid|e }}"
pattern_meta = r'id\s*=\s*"team-\{\{\s*_tid\|e\s*\}\}-meta"'
if re.search(pattern_meta, txt):
    txt = re.sub(pattern_meta, 'data-team-meta="{{ _tid|e }}"', txt)
    changes.append("Replaced id team-{{ _tid|e }}-meta -> data-team-meta")

pattern_name = r'id\s*=\s*"team-\{\{\s*_tid\|e\s*\}\}-name"'
if re.search(pattern_name, txt):
    txt = re.sub(pattern_name, 'data-team-name="{{ _tid|e }}"', txt)
    changes.append("Replaced id team-{{ _tid|e }}-name -> data-team-name")

# 2) Normalize static asset tokens that might leak into rendered output:
#    Replace occurrences of {{ url_for('static', filename='...') }} with {{ static_url('...') }}
#    This leverages the static_url jinja helper we added in app/__init__.py and is safer when proxying.
def replace_url_for(match):
    inner = match.group(1)
    # inner will be like "css/ff.css" or "js/ff-app.js"
    return "{{ static_url('" + inner + "') }}"

# match patterns like {{ url_for('static', filename='css/ff.css') }}
urlfor_re = re.compile(r"\{\{\s*url_for\(\s*['\"]static['\"]\s*,\s*filename\s*=\s*['\"]([^'\"]+)['\"]\s*\)\s*\}\}")
if urlfor_re.search(txt):
    txt, n = urlfor_re.subn(replace_url_for, txt)
    changes.append(f"Rewrote {n} occurrences of url_for('static',...) to static_url(...)")

# 3) Ensure FF version tokens are present in defaults (safety; if missing)
#    If template references {{ _v }} directly somewhere (rare), keep it; we already added _v to context
#    No rewrite necessary here, but we log detection.
if "{{ _v }}" in txt or "{{ _app|e }}" in txt or "{{ _app }}" in txt:
    changes.append("Detected template asset/version tokens ({{ _v }} / {{ _app }}). Context defaults expected.")

# 4) Inject fail-safe donation fallback block before </main> if not already present
fallback_marker = "<!-- donation-fallback -->"
if fallback_marker not in txt:
    fallback_html = """
    <!-- donation-fallback -->
    <div id="donation-fallback" class="ff-card ff-mt-3" aria-live="polite" role="region">
      <h3 class="ff-h4">Quick donation options (fallback)</h3>
      <p class="ff-lead">If the fast checkout fails, please use one of these alternatives:</p>
      <ul>
        <li>PayPal: <a href="https://paypal.me/YourOrg" target="_blank" rel="noopener noreferrer">paypal.me/YourOrg</a></li>
        <li>Email us for manual help: <a href="mailto:donations@yourdomain.org">donations@yourdomain.org</a></li>
      </ul>
      <noscript>
        <p class="ff-muted">JavaScript is required for the quick checkout — use the PayPal link above or email us for assistance.</p>
      </noscript>
    </div>
    <!-- /donation-fallback -->
    """
    # Try to inject before the closing </main> tag, else before </body>, else append at end
    if "</main>" in txt:
        txt = txt.replace("</main>", fallback_html + "\n</main>", 1)
        changes.append("Injected donation fallback before </main>")
    elif "</body>" in txt:
        txt = txt.replace("</body>", fallback_html + "\n</body>", 1)
        changes.append("Injected donation fallback before </body>")
    else:
        txt = txt + "\n" + fallback_html
        changes.append("Appended donation fallback to end of template")

# 5) Simple sanity: remove accidental duplicate empty attributes like id="" or data-="" (no-op safety)
txt = re.sub(r'\s+(id|data-[a-z0-9\-_]+)\s*=\s*""', '', txt, flags=re.I)

# Write patched file
TPL.write_text(txt, encoding="utf-8")
print("Wrote patched template:", TPL.name)

# Summary
print("\nSummary of changes:")
if changes:
    for c in changes:
        print(" -", c)
else:
    print(" - (no changes were required)")

print("\nBackup file:", bak.name)
print("Next steps:")
print("  1) git add -p app/templates/index.html && review the patch.")
print("  2) Restart your Flask app (or uwsgi/gunicorn) and re-run ff_prod_smoke.py.")
print("  3) If getfuturefunded.com is behind Cloudflare, purge the cache for the URL (or 'Purge Everything' during testing).")
