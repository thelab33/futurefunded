#!/usr/bin/env python3
"""
FutureFunded — Checkout Close Forensic Diagnoser
File: tools/ff_diagnose_checkout_close.py

Purpose:
Diagnose why checkout opened via :target (#checkout) fails to close
after backdrop click, according to UX gate invariants.

Run:
  python3 tools/ff_diagnose_checkout_close.py
  BASE_URL=http://127.0.0.1:5000/ python3 tools/ff_diagnose_checkout_close.py
"""

from playwright.sync_api import sync_playwright
import os
import json
import time

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5000/")
TIMEOUT = 10_000


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        url = BASE_URL
        if "?" in url:
            url += "&smoke=1"
        else:
            url += "?smoke=1"

        print(f"\n[ff-diagnose] loading {url}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(300)

        print("[ff-diagnose] opening checkout via :target")
        page.evaluate("location.hash = '#checkout'")
        page.wait_for_timeout(500)

        sheet_count = page.locator("[data-ff-checkout-sheet]").count()
        if sheet_count != 1:
            print(f"\n❌ ERROR: expected 1 checkout sheet, found {sheet_count}")
            browser.close()
            return

        print("[ff-diagnose] clicking backdrop")
        backdrop = page.locator(
            "#checkout > .ff-sheet__backdrop, #checkout > a.ff-sheet__backdrop"
        ).first

        box = backdrop.bounding_box()
        if not box:
            print("\n❌ ERROR: backdrop has no bounding box")
            browser.close()
            return

        # Click safe corner
        page.mouse.click(box["x"] + 8, box["y"] + 8)
        page.wait_for_timeout(500)

        print("[ff-diagnose] polling checkout closed state…")
        closed = False
        start = time.time()

        while time.time() - start < 5:
            closed = page.evaluate("""
                () => {
                  const el = document.querySelector('[data-ff-checkout-sheet]');
                  if (!el) return false;

                  const hiddenAttr = el.hasAttribute('hidden') || el.hidden === true;
                  const ariaHidden = el.getAttribute('aria-hidden') === 'true';
                  const dataOpen = el.getAttribute('data-open') === 'false';
                  const hashCleared = location.hash !== '#checkout';

                  return hiddenAttr && ariaHidden && dataOpen && hashCleared;
                }
            """)
            if closed:
                break
            page.wait_for_timeout(200)

        if closed:
            print("\n✅ Checkout closed cleanly. No bug detected.")
            browser.close()
            return

        print("\n🚨 CHECKOUT DID NOT CLOSE — FORENSIC REPORT\n")

        report = page.evaluate("""
            () => {
              const el = document.querySelector('[data-ff-checkout-sheet]');
              const backdrop = document.querySelector('#checkout > .ff-sheet__backdrop');
              const panel = document.querySelector('#checkout > .ff-sheet__panel');

              const cs = el ? getComputedStyle(el) : null;

              return {
                locationHash: location.hash,
                checkout: el ? {
                  id: el.id,
                  className: el.className,
                  hiddenAttr: el.hasAttribute('hidden'),
                  hiddenProp: el.hidden === true,
                  ariaHidden: el.getAttribute('aria-hidden'),
                  dataOpen: el.getAttribute('data-open'),
                  display: cs?.display,
                  visibility: cs?.visibility,
                  opacity: cs?.opacity,
                  pointerEvents: cs?.pointerEvents,
                  position: cs?.position,
                  zIndex: cs?.zIndex,
                } : null,
                structure: {
                  backdropIsDirectChild: !!backdrop && backdrop.parentElement?.id === 'checkout',
                  panelIsDirectChild: !!panel && panel.parentElement?.id === 'checkout',
                  backdropInsidePanel: !!panel && !!backdrop && panel.contains(backdrop),
                },
                duplicates: document.querySelectorAll('[data-ff-checkout-sheet]').length
              };
            }
        """)

        print(json.dumps(report, indent=2))

        print("\n🧠 INTERPRETATION GUIDE:")
        print("- hiddenAttr false → missing `hidden` toggle")
        print("- ariaHidden !== 'true' → a11y state not updated")
        print("- dataOpen !== 'false' → JS close handler not firing")
        print("- locationHash === '#checkout' → hash never cleared")
        print("- backdropInsidePanel === true → DOM structure invalid")
        print("- duplicates > 1 → duplicate checkout sections")

        browser.close()


if __name__ == "__main__":
    main()
