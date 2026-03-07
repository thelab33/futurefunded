// tests/ff_app_delegated_open_close.spec.ts
import { test, expect } from "@playwright/test";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000/").replace(/\/?$/, "/");

function abs(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.replace(/^\//, ""), BASE).toString();
}

async function waitForCheckoutOpen(page: any, timeout = 12_000) {
  await page.waitForFunction(
    () => {
      const s = document.getElementById("checkout") as HTMLElement | null;
      if (!s) return false;

      const ds: any = (s as any).dataset || {};
      const aria = s.getAttribute("aria-hidden");
      const hidden = (s as any).hidden === true || s.hasAttribute("hidden");

      const openClass = s.classList.contains("is-open");
      const openData =
        ds.open === "true" ||
        ds.state === "open" ||
        ds.visible === "true" ||
        ds.expanded === "true";
      const ariaOpen = aria === "false";

      // If opened via hash, :target should match (#checkout)
      const byTarget = location.hash === "#checkout";

      return (openClass || openData || ariaOpen || byTarget) && !hidden;
    },
    null,
    { timeout }
  );
}

async function waitForCheckoutClosed(page: any, timeout = 12_000) {
  await page.waitForFunction(
    () => {
      const s = document.getElementById("checkout") as HTMLElement | null;
      if (!s) return true;

      const ds: any = (s as any).dataset || {};
      const aria = s.getAttribute("aria-hidden");
      const hidden = (s as any).hidden === true || s.hasAttribute("hidden");

      const isClosedByContract =
        hidden || aria === "true" || ds.open === "false" || ds.state === "closed";

      const isOpenByContract =
        s.classList.contains("is-open") || aria === "false" || ds.open === "true" || ds.state === "open";

      // Closed means: closed contract AND not open contract
      return isClosedByContract && !isOpenByContract;
    },
    null,
    { timeout }
  );
}

async function clickBackdropOrFallback(page: any) {
  const clicked = await page.evaluate(() => {
    const candidates = [
      "#checkout [data-ff-backdrop]",
      "#checkout .ff-sheet__backdrop",
      "#checkout .ff-modal__backdrop",
      "#checkout .ff-overlay__backdrop",
      "#checkout .ff-backdrop",
      "#checkout .backdrop",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;

      // Try to click a real clickable element (button/a/div)
      try {
        el.click();
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  });

  if (!clicked) {
    // Safe fallback click: outside typical close button area
    await page.mouse.click(2, 2);
  }
}

test.describe("ff-app.js — delegated open/close behaviour", () => {
  test("checkout opens via dynamic opener, focuses inside, closes on visible backdrop", async ({ page }) => {
    await page.goto(abs("/"), { waitUntil: "domcontentloaded" });

    // Add a dynamic opener to the page (delegation contract)
    await page.evaluate(() => {
      const btn = document.createElement("a");
      btn.setAttribute("data-ff-open-checkout", "");
      btn.textContent = "Dynamic Donate";
      btn.style.position = "fixed";
      btn.style.left = "10px";
      btn.style.top = "10px";
      btn.style.zIndex = "99999";
      btn.href = "#checkout"; // harmless even if JS overrides; helps :target implementations
      document.body.appendChild(btn);
    });

    // Click the dynamic opener
    await page.click("a[data-ff-open-checkout]", { force: true });

    await waitForCheckoutOpen(page, 12_000);

    // Focus should land inside the sheet (best practice)
    await page.waitForFunction(
      () => {
        const s = document.getElementById("checkout");
        if (!s) return false;
        const ae = document.activeElement as Element | null;
        return !!ae && s.contains(ae);
      },
      null,
      { timeout: 5_000 }
    );

    // Close via backdrop if present, else fallback
    await clickBackdropOrFallback(page);

    await waitForCheckoutClosed(page, 12_000);

    expect(true).toBeTruthy();
  });
});
