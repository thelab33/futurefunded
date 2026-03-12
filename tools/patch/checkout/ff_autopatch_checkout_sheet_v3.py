#!/usr/bin/env python3
"""
FutureFunded — Auto-Patch v3: Checkout Focus-Correct Overlay
------------------------------------------------------------

Fixes final checkout UX gate by ensuring focus moves
inside the dialog panel on open.

Idempotent • CSP-safe • Hook-safe • WCAG-aligned
"""

from pathlib import Path
import re
import sys

FF_APP_JS = Path("app/static/js/ff-app.js")

MARKER_START = "/* ff-autopatch:checkout-sheet-v3:start */"
MARKER_END = "/* ff-autopatch:checkout-sheet-v3:end */"

PATCH = f"""
{MARKER_START}

/* Canonical checkout open/close with focus correctness */

function ffGetCheckoutCtx() {{
  var sheet = document.getElementById("checkout");
  if (!sheet) return null;
  var panel = sheet.querySelector(".ff-sheet__panel");
  return {{ sheet: sheet, panel: panel }};
}}

function ffFocusInside(panel) {{
  if (!panel) return;

  var focusable = panel.querySelector(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  if (focusable) {{
    focusable.focus({{ preventScroll: true }});
  }} else {{
    panel.setAttribute("tabindex", "-1");
    panel.focus({{ preventScroll: true }});
  }}
}}

function ffOpenCheckout() {{
  var ctx = ffGetCheckoutCtx();
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

    // Defer focus until after layout
    requestAnimationFrame(function () {{
      ffFocusInside(panel);
    }});
  }}
}}

function ffCloseCheckout() {{
  var ctx = ffGetCheckoutCtx();
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

    # Remove older autopatches
    src = re.sub(
        r"/\* ff-autopatch:checkout-sheet.*?:start \*/.*?/\* ff-autopatch:checkout-sheet.*?:end \*/",
        "",
        src,
        flags=re.S,
    )

    if MARKER_START in src:
        print("ℹ️ v3 autopatch already applied")
        return

    iife = re.search(r"\}\)\(\);\s*$", src, re.M)
    if iife:
        src = src[: iife.start()] + "\n\n" + PATCH + "\n\n" + src[iife.start():]
    else:
        src = src.rstrip() + "\n\n" + PATCH + "\n"

    FF_APP_JS.write_text(src, encoding="utf-8")

    print("✅ Checkout UX autopatch v3 (focus-correct) applied")
    print("🧪 Run: npx playwright test tests/ff_checkout_ux_v2.spec.ts")


if __name__ == "__main__":
    main()
