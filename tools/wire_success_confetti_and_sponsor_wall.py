#!/usr/bin/env python3
"""
FutureFunded — Final Wiring Patch
• Sponsor wall animation trigger
• Confetti guards (once + reduced motion)
• Scroll-lock cleanup after success
Idempotent • Hook-safe • CSP-safe
"""

from pathlib import Path

JS_FILE = Path("app/static/js/ff-app.js")

CONFETTI_GUARD = """
if (window.__ffConfettiFired) return;
window.__ffConfettiFired = true;
""".strip()

REDUCED_MOTION_GUARD = """
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
""".strip()

SPONSOR_WALL_WIRING = """
// FF_SPONSOR_WALL_WIRED
document.addEventListener("DOMContentLoaded", () => {
  if (typeof animateSponsorWall === "function") {
    animateSponsorWall();
  }
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-ff-refresh-sponsors]")) {
    setTimeout(() => {
      if (typeof animateSponsorWall === "function") {
        animateSponsorWall();
      }
    }, 50);
  }
});
""".strip()

SCROLL_UNLOCK = """
document.documentElement.removeAttribute("data-ff-scroll-locked");
""".strip()

def main():
    if not JS_FILE.exists():
        raise SystemExit("❌ ff-app.js not found")

    src = JS_FILE.read_text()
    changed = False

    # --- Patch launchConfetti guards ---
    if "function launchConfetti()" in src and "__ffConfettiFired" not in src:
        src = src.replace(
            "function launchConfetti() {",
            "function launchConfetti() {\n  " +
            REDUCED_MOTION_GUARD.replace("\n", "\n  ") + "\n  " +
            CONFETTI_GUARD.replace("\n", "\n  ")
        )
        print("✔ Added confetti guards")
        changed = True
    else:
        print("• Confetti guards already present")

    # --- Ensure scroll unlock after success receipt ---
    if "showSuccessReceipt" in src and "removeAttribute(\"data-ff-scroll-locked\")" not in src:
        src = src.replace(
            "shell.innerHTML = `",
            "document.documentElement.removeAttribute(\"data-ff-scroll-locked\");\n\n  shell.innerHTML = `"
        )
        print("✔ Ensured scroll unlock after success")
        changed = True
    else:
        print("• Scroll unlock already handled")

    # --- Sponsor wall animation wiring ---
    if "FF_SPONSOR_WALL_WIRED" not in src:
        src += "\n\n" + SPONSOR_WALL_WIRING
        print("✔ Wired sponsor wall animation")
        changed = True
    else:
        print("• Sponsor wall already wired")

    if changed:
        JS_FILE.write_text(src)
        print("✅ ff-app.js updated successfully")
    else:
        print("✅ No changes needed")

if __name__ == "__main__":
    main()

