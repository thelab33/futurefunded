#!/usr/bin/env python3
"""
FutureFunded — CLI Focus Audit
------------------------------

Loads the homepage in Playwright and prints:
- activeElement over time
- whether focus enters #checkout .ff-sheet__panel
- what steals focus (if anything)

Run:
  python tools/ff_focus_audit.py
"""

from playwright.sync_api import sync_playwright
import time

URL = "http://127.0.0.1:5000"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(URL)

        print("\n▶ Clicking checkout trigger…\n")
        page.click("[data-ff-open-checkout]")

        # Observe focus over time
        for i in range(12):
            ae = page.evaluate("""
              () => {
                const ae = document.activeElement;
                if (!ae) return null;
                return {
                  tag: ae.tagName,
                  id: ae.id || null,
                  cls: ae.className || null,
                  insidePanel: !!document
                    .querySelector('#checkout .ff-sheet__panel')
                    ?.contains(ae)
                };
              }
            """)
            print(f"[t+{i*50}ms] activeElement:", ae)
            time.sleep(0.05)

        # Final authoritative check
        result = page.evaluate("""
          () => {
            const panel = document.querySelector('#checkout .ff-sheet__panel');
            const ae = document.activeElement;
            return {
              panelExists: !!panel,
              activeExists: !!ae,
              focusedInside: !!(panel && ae && panel.contains(ae)),
              active: ae ? {
                tag: ae.tagName,
                id: ae.id || null,
                cls: ae.className || null
              } : null
            };
          }
        """)
        print("\n▶ FINAL STATE:", result)

        browser.close()

if __name__ == "__main__":
    main()
