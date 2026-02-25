#!/usr/bin/env python3
"""
FutureFunded — Auto-Patch v2: Checkout Sheet + Panel Canonical State
-------------------------------------------------------------------

Fixes checkout UX gate failures by ensuring BOTH:
- sheet (#checkout)
- panel (.ff-sheet__panel)

are opened and closed deterministically.

Idempotent • CSP-safe • Hook-safe
"""

from pathlib import Path
import re
import sys

FF_APP_JS = Path("app/static/js/ff-app.js")

MARKER_START = "/* ff-autopatch:checkout-sheet-v2:start */"
MARKER_END = "/* ff-autopatch:checkout-sheet-v2:end */"

PATCH = f"""
{MARKER_START}

/* Canonical checkout open/close — sheet + panel */
function ffGetCheckout() {{
  var sheet = document.getElementById("checkout");
  if (!sheet) return null;
  var panel = sheet.querySelector(".ff-sheet__panel");
  return {{ sheet: sheet, panel: panel }};
}}

function ffOpenCheckout() {{
  var ctx = ffGetCheckout();
  if (!ctx) return;

  var sheet = ctx.sheet;
  var panel = ctx.panel;

  sheet.removeAttribute("hidden");
  sheet.setAttribute("aria-hidden", "false");
  sheet.setAttribute("data-open", "true");
  sheet.classList.add("is-open");

  if (panel) {{
    panel.removeAttribute("hidden");
    panel.classList.add("is-open");
    panel.focus({{ preventScroll: true }});
  }}
}}

function ffCloseCheckout() {{
  var ctx = ffGetCheckout();
  if (!ctx) return;

  var sheet = ctx.sheet;
  var panel = ctx.panel;

  sheet.setAttribute("aria-hidden", "true");
  sheet.setAttribute("data-open", "false");
  sheet.classList.remove("is-open");
  sheet.setAttribute("hidden", "");

  if (panel) {{
    panel.classList.remove("is-open");
    panel.setAttribute("hidden", "");
  }}
}}

/* Click → open */
document.addEventListener("click", function (e) {{
  var trigger = e.target.closest("[data-ff-open-checkout]");
  if (!trigger) return;
  e.preventDefault();
  ffOpenCheckout();
}});

/* :target reconciliation */
function ffSyncCheckoutHash() {{
  if (location.hash === "#checkout") {{
    ffOpenCheckout();
  }}
}}

window.addEventListener("hashchange", ffSyncCheckoutHash);
ffSyncCheckoutHash();

/* Escape → close */
document.addEventListener("keydown", function (e) {{
  if (e.key !== "Escape") return;
  var sheet = document.getElementById("checkout");
  if (sheet && sheet.getAttribute("data-open") === "true") {{
    ffCloseCheckout();
  }}
}});

{MARKER_END}
""".strip()


def main():
    if not FF_APP_JS.exists():
        print("❌ ff-app.js not found")
        sys.exit(1)

    src = FF_APP_JS.read_text(encoding="utf-8")

    # Remove v1 patch if present
    src = re.sub(
        r"/\* ff-autopatch:checkout-sheet:start \*/.*?/\* ff-autopatch:checkout-sheet:end \*/",
        "",
        src,
        flags=re.S,
    )

    if MARKER_START in src:
        print("ℹ️ v2 autopatch already applied")
        return

    # Insert before IIFE close
    iife = re.search(r"\}\)\(\);\s*$", src, re.M)
    if iife:
        src = src[: iife.start()] + "\n\n" + PATCH + "\n\n" + src[iife.start():]
    else:
        src = src.rstrip() + "\n\n" + PATCH + "\n"

    FF_APP_JS.write_text(src, encoding="utf-8")

    print("✅ Checkout sheet + panel autopatch v2 applied")
    print("🧪 Run: npx playwright test tests/ff_checkout_ux_v2.spec.ts")


if __name__ == "__main__":
    main()
