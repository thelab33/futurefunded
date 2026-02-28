import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000/";

test.describe("ff-app.js — delegated open/close behaviour", () => {
  test("checkout opens via dynamic opener, focuses inside, closes on visible backdrop", async ({ page }) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    // add a dynamic opener to the page
    await page.evaluate(() => {
      const btn = document.createElement("a");
      btn.setAttribute("data-ff-open-checkout", "");
      btn.textContent = "Dynamic Donate";
      btn.style.position = "fixed";
      btn.style.left = "10px";
      btn.style.top = "10px";
      btn.style.zIndex = "99999";
      document.body.appendChild(btn);
    });

    // click the dynamic opener
    await page.click("a[data-ff-open-checkout]");

    // wait for checkout to be marked open (contract)
    await page.waitForFunction(() => {
      const s = document.getElementById("checkout");
      if (!s) return false;
      const ds: any = (s as any).dataset || {};
      const aria = s.getAttribute("aria-hidden");
      const hidden = (s as any).hidden === true || s.hasAttribute("hidden");
      const openClass = s.classList.contains("is-open");
      const openData = ds.open === "true" || ds.state === "open";
      const ariaOpen = aria === "false";
      return (openClass || openData || ariaOpen) && !hidden;
    }, null, { timeout: 10000 });

    // focus should land inside the sheet (best practice)
    await page.waitForFunction(() => {
      const s = document.getElementById("checkout");
      if (!s) return false;
      const ae = document.activeElement;
      return !!ae && s.contains(ae);
    }, null, { timeout: 4000 });

    // click a backdrop if present, else click near top-left as fallback
    const clickedBackdrop = await page.evaluate(() => {
      const candidates = [
        "#checkout [data-ff-backdrop]",
        "#checkout .ff-backdrop",
        "#checkout .backdrop"
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) { el.click(); return true; }
      }
      return false;
    });

    if (!clickedBackdrop) {
      await page.mouse.click(2, 2);
    }

    // ensure checkout is closed by contract
    await page.waitForFunction(() => {
      const s = document.getElementById("checkout");
      if (!s) return true;
      const ds: any = (s as any).dataset || {};
      const aria = s.getAttribute("aria-hidden");
      const hidden = (s as any).hidden === true || s.hasAttribute("hidden");

      const isClosed = hidden || ds.open === "false" || aria === "true";
      const isOpen = s.classList.contains("is-open") || ds.open === "true" || aria === "false";
      return isClosed && !isOpen;
    }, null, { timeout: 8000 });

    expect(true).toBeTruthy();
  });
});
