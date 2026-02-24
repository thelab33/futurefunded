#!/usr/bin/env python3
"""
FutureFunded — Success Receipt + Confetti + Sponsor FX Injector
Idempotent • Hook-safe • CSP-safe
"""

from pathlib import Path

JS_FILE = Path("app/static/js/ff-app.js")

SUCCESS_FN = """
function showSuccessReceipt(amount) {
  const shell = document.querySelector(".ff-checkoutShell");
  if (!shell) return;

  shell.innerHTML = `
    <div class="ff-checkoutSuccess">
      <div class="ff-checkoutSuccess__icon">✓</div>
      <h2 class="ff-checkoutSuccess__title">Thank you for your support</h2>
      <p class="ff-checkoutSuccess__meta">
        $${amount} donated · Receipt sent instantly
      </p>

      <div class="ff-row ff-gap-2 ff-mt-4">
        <button class="ff-btn ff-btn--primary ff-btn--pill" data-ff-share>
          Share fundraiser
        </button>
        <a class="ff-btn ff-btn--secondary ff-btn--pill" href="#home">
          Back to site
        </a>
      </div>
    </div>
  `;
}
""".strip()

CONFETTI_FN = """
function launchConfetti() {
  import("https://cdn.skypack.dev/canvas-confetti")
    .then(({ default: confetti }) => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#ff8a00", "#ffd28a", "#ffffff"]
      });
    })
    .catch(() => {});
}
""".strip()

SPONSOR_FX_FN = """
function animateSponsorWall() {
  document
    .querySelectorAll(".ff-sponsorWall__item")
    .forEach((el, i) => {
      el.style.animationDelay = `${i * 60}ms`;
    });
}
""".strip()

WIRE_HINT = "// FF_SUCCESS_WIRED"

def main():
    if not JS_FILE.exists():
        raise SystemExit("❌ ff-app.js not found")

    src = JS_FILE.read_text()

    changed = False

    def inject(fn, name):
        nonlocal src, changed
        if name not in src:
            src += "\\n\\n" + fn
            changed = True
            print(f"✔ Injected {name}")
        else:
            print(f"• {name} already present")

    inject(SUCCESS_FN, "showSuccessReceipt")
    inject(CONFETTI_FN, "launchConfetti")
    inject(SPONSOR_FX_FN, "animateSponsorWall")

    # Wire Stripe success ONLY ONCE
    if WIRE_HINT not in src:
        src = src.replace(
            "if (paymentIntent.status === \"succeeded\") {",
            "if (paymentIntent.status === \"succeeded\") {\n"
            "        showSuccessReceipt(paymentIntent.amount / 100);\n"
            "        launchConfetti();\n"
            f"        {WIRE_HINT}\n"
        )
        changed = True
        print("✔ Wired success receipt + confetti")

    if changed:
        JS_FILE.write_text(src)
        print("✅ ff-app.js updated successfully")
    else:
        print("✅ No changes needed")

if __name__ == "__main__":
    main()

