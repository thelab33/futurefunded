#!/usr/bin/env python3
"""
FutureFunded — Auto-Patch: Checkout Sheet Canonical State
----------------------------------------------------------

Fixes checkout overlay contract violations by injecting
deterministic open/close helpers and bindings into ff-app.js.

Safe:
- Idempotent
- CSP-safe
- Hook-safe
- No selector renames
- No removals

Target:
- app/static/js/ff-app.js
"""

from pathlib import Path
import re
import sys

FF_APP_JS = Path("app/static/js/ff-app.js")

MARKER_START = "/* ff-autopatch:checkout-sheet:start */"
MARKER_END = "/* ff-autopatch:checkout-sheet:end */"

PATCH_BLOCK = f"""
{MARKER_START}

/* Canonical checkout sheet helpers — DO NOT EDIT */
function ffOpenSheet(sheet) {{
  if (!sheet) return;
  sheet.removeAttribute("hidden");
  sheet.setAttribute("aria-hidden", "false");
  sheet.setAttribute("data-open", "true");
  sheet.classList.add("is-open");
}}

function ffCloseSheet(sheet) {{
  if (!sheet) return;
  sheet.setAttribute("aria-hidden", "true");
  sheet.setAttribute("data-open", "false");
  sheet.classList.remove("is-open");
  sheet.setAttribute("hidden", "");
}}

/* Click → open */
document.addEventListener("click", function (e) {{
  var trigger = e.target.closest("[data-ff-open-checkout]");
  if (!trigger) return;
  var sheet = document.getElementById("checkout");
  if (!sheet) return;
  e.preventDefault();
  ffOpenSheet(sheet);
}});

/* :target reconciliation */
function ffSyncCheckoutHash() {{
  if (location.hash === "#checkout") {{
    ffOpenSheet(document.getElementById("checkout"));
  }}
}}

window.addEventListener("hashchange", ffSyncCheckoutHash);
ffSyncCheckoutHash();

/* Escape → close */
document.addEventListener("keydown", function (e) {{
  if (e.key !== "Escape") return;
  var sheet = document.getElementById("checkout");
  if (sheet && sheet.getAttribute("data-open") === "true") {{
    ffCloseSheet(sheet);
  }}
}});

{MARKER_END}
""".strip()


def main():
    if not FF_APP_JS.exists():
        print(f"❌ ff-app.js not found at {FF_APP_JS}")
        sys.exit(1)

    src = FF_APP_JS.read_text(encoding="utf-8")

    # Already patched?
    if MARKER_START in src and MARKER_END in src:
        print("ℹ️ Checkout sheet autopatch already applied — no changes needed.")
        return

    # Insert before closing IIFE if present
    iife_close = re.search(r"\}\)\(\);\s*$", src, re.M)
    if iife_close:
        patched = (
            src[: iife_close.start()]
            + "\n\n"
            + PATCH_BLOCK
            + "\n\n"
            + src[iife_close.start():]
        )
    else:
        # Fallback: append
        patched = src.rstrip() + "\n\n" + PATCH_BLOCK + "\n"

    FF_APP_JS.write_text(patched, encoding="utf-8")

    print("✅ Checkout sheet canonical state patch applied successfully.")
    print("🧪 Run: npx playwright test tests/ff_checkout_ux_v2.spec.ts")


if __name__ == "__main__":
    main()
