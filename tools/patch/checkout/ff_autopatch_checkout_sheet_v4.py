#!/usr/bin/env python3
"""
FutureFunded — Auto-Patch v4: Checkout Focus-Sticky Overlay
-----------------------------------------------------------

Fixes checkout UX gate focus assertion by ensuring focus moves
inside the dialog panel and stays there via a short retry loop.

Idempotent • CSP-safe • Hook-safe
"""

from pathlib import Path
import re
import sys

FF_APP_JS = Path("app/static/js/ff-app.js")

MARKER_START = "/* ff-autopatch:checkout-sheet-v4:start */"
MARKER_END = "/* ff-autopatch:checkout-sheet-v4:end */"

PATCH = f"""
{MARKER_START}

/* Canonical checkout open/close with focus-sticky retry */

function ffGetCheckoutCtx() {{
  var sheet = document.getElementById("checkout");
  if (!sheet) return null;
  var panel = sheet.querySelector(".ff-sheet__panel");
  return {{ sheet: sheet, panel: panel }};
}}

function ffIsFocusable(el) {{
  if (!el) return false;
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (el.getAttribute("hidden") !== null) return false;
  // offsetParent null can be false-neg for fixed elements; use client rect
  var r = el.getClientRects();
  return !!(r && r.length);
}}

function ffFindFirstTabbable(panel) {{
  if (!panel) return null;
  var candidates = panel.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  for (var i = 0; i < candidates.length; i++) {{
    var el = candidates[i];
    if (ffIsFocusable(el)) return el;
  }}
  return null;
}}

function ffEnsureFocusInside(panel, maxFrames) {{
  if (!panel) return;
  var framesLeft = (typeof maxFrames === "number" ? maxFrames : 12);

  function attempt() {{
    var ae = document.activeElement;
    var ok = !!(ae && panel.contains(ae));
    if (ok) return;

    var target = ffFindFirstTabbable(panel);
    if (target) {{
      try {{ target.focus({{ preventScroll: true }}); }} catch (e) {{ try {{ target.focus(); }} catch (_) {{}} }}
    }} else {{
      // Ensure panel is focusable
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      try {{ panel.focus({{ preventScroll: true }}); }} catch (e2) {{ try {{ panel.focus(); }} catch (_) {{}} }}
    }}

    framesLeft -= 1;
    if (framesLeft > 0) {{
      requestAnimationFrame(attempt);
    }}
  }}

  // Do one immediate attempt, then keep trying over a few frames
  attempt();
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

    // Force focus in now, then retry across frames in case something steals it.
    ffEnsureFocusInside(panel, 12);
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

/* Click → open (do NOT rely on hash) */
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


def main() -> None:
    if not FF_APP_JS.exists():
        print(f"❌ ff-app.js not found at: {FF_APP_JS}")
        sys.exit(1)

    src = FF_APP_JS.read_text(encoding="utf-8")

    # Remove older checkout autopatches (v1/v2/v3/etc)
    src = re.sub(
        r"/\*\s*ff-autopatch:checkout-sheet.*?:start\s*\*/.*?/\*\s*ff-autopatch:checkout-sheet.*?:end\s*\*/",
        "",
        src,
        flags=re.S,
    )

    if MARKER_START in src:
        print("ℹ️ v4 autopatch already applied — no changes needed.")
        return

    # Insert before IIFE close if present
    iife = re.search(r"\}\)\(\);\s*$", src, re.M)
    if iife:
        src = src[: iife.start()] + "\n\n" + PATCH + "\n\n" + src[iife.start():]
    else:
        src = src.rstrip() + "\n\n" + PATCH + "\n"

    FF_APP_JS.write_text(src, encoding="utf-8")
    print("✅ Checkout UX autopatch v4 (focus-sticky) applied")
    print("🧪 Run: npx playwright test tests/ff_checkout_ux_v2.spec.ts")


if __name__ == "__main__":
    main()
