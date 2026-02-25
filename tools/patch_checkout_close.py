#!/usr/bin/env python3
import re
import sys
import shutil
from pathlib import Path

FILE = Path("app/static/js/ff-app.js")

if not FILE.exists():
    print("❌ Could not find app/static/js/ff-app.js")
    sys.exit(1)

src = FILE.read_text()

backup = FILE.with_suffix(".js.bak")
shutil.copy(FILE, backup)
print(f"📦 Backup created: {backup}")

# -----------------------------
# 1) Replace close() function
# -----------------------------
close_pattern = re.compile(
    r"function close\s*\([^)]*\)\s*\{.*?\n\s*\}",
    re.DOTALL,
)

new_close = """function close(opts) {
  var s = sheet();
  if (!s) return;

  var p = panel();

  // ---- HARD STATE FIRST (deterministic for Playwright) ----
  try {
    if (p) {
      p.hidden = true;
      p.setAttribute("hidden", "");
    }
  } catch (_) {}

  setOpen(s, false);

  // ---- Reset UI state safely ----
  try {
    var succ = DOM.checkoutSuccess();
    if (succ) succ.hidden = true;

    var stage = qs("[data-ff-checkout-stage='form']", s);
    if (stage) stage.hidden = false;
  } catch (_) {}

  // ---- Hash cleanup ----
  try {
    if (location.hash === "#checkout") {
      try { history.replaceState(null, "", "#home"); }
      catch (_) { location.hash = "#home"; }
    }
  } catch (_) {}

  // ---- Restore focus ----
  if (!(opts && opts.keepFocus)) {
    try { if (returnFocusEl && returnFocusEl.focus) returnFocusEl.focus(); } catch (_) {}
  }
  returnFocusEl = null;

  if (!(opts && opts.quiet)) {
    announce("Checkout closed");
  }
}"""

src_new, n = close_pattern.subn(new_close, src, count=1)

if n == 0:
    print("❌ Could not locate close() function. Aborting.")
    sys.exit(1)

print("✅ close() patched")

# -----------------------------
# 2) Inject panel unhide into open()
# -----------------------------
open_pattern = re.compile(
    r"(function open\s*\([^)]*\)\s*\{.*?setOpen\(s,\s*true\);\s*)",
    re.DOTALL,
)

def inject_open(match):
    return match.group(1) + """
  var p = panel();
  if (p) {
    try {
      p.hidden = false;
      p.removeAttribute("hidden");
    } catch (_) {}
  }
"""

src_new2, n2 = open_pattern.subn(inject_open, src_new, count=1)

if n2 == 0:
    print("❌ Could not inject open() patch. Aborting.")
    sys.exit(1)

print("✅ open() patched")

FILE.write_text(src_new2)
print("🎯 Patch complete.")
