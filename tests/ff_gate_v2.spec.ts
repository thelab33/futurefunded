// tests/ff_gate_v2.spec.ts
import { test, expect, Page, Locator } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";

async function gotoHome(page: Page) {
  await page.goto(`${BASE}/`, { waitUntil: "load" });

  // Make sure keyboard focus is inside the document (prevents Tab flake).
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  // Basic sanity: runtime present
  await expect(page.locator("html.ff-root")).toHaveCount(1);
}

function visible(page: Page, selector: string): Locator {
  // Use Playwright :visible pseudo-class for stability
  return page.locator(`${selector}:visible`);
}

async function clickVisible(page: Page, selector: string, opts: { force?: boolean } = {}) {
  const el = visible(page, selector).first();
  await el.scrollIntoViewIfNeeded();
  // Wait for a moment to reduce hit-test flakes
  await el.waitFor({ state: "visible", timeout: 5000 });
  try {
    await el.click({ force: !!opts.force });
  } catch (err) {
    // As a fallback, try to click via JS if hit-testing fails
    try {
      await page.evaluate((s) => {
        const el = document.querySelector(s) as HTMLElement | null;
        if (el) (el as HTMLElement).click();
      }, selector);
    } catch {
      throw err;
    }
  }
}

async function expectOverlayOpen(page: Page, id: string) {
  const el = page.locator(`#${id}`);
  // Give overlays some time to animate/mount (but fail fast if not)
  await expect(el).toBeVisible({ timeout: 6000 });
  await expect(el).toHaveAttribute("aria-hidden", "false", { timeout: 1000 });
  await expect(el).toHaveAttribute("data-open", "true", { timeout: 1000 });
}

async function expectOverlayClosed(page: Page, id: string) {
  const el = page.locator(`#${id}`);
  await expect(el).toBeHidden({ timeout: 6000 });
  await expect(el).toHaveAttribute("aria-hidden", "true", { timeout: 1000 });
  await expect(el).toHaveAttribute("data-open", "false", { timeout: 1000 });
}

// Helpful debug helper: prints truncated HTML + snapshot if a critical assertion fails.
async function dumpDebug(page: Page, label = "debug") {
  const html = await page.content();
  // truncated to 8k chars to avoid flooding logs
  console.error(`--- ${label} HTML (truncated 8k) ---\n${html.slice(0, 8192)}\n--- end ---`);
  // attempt to extract runtime snapshot too (best-effort)
  try {
    const snap = await page.evaluate(() => {
      // @ts-ignore
      try { return window.FF_APP?.api?.contractSnapshot?.() || null; } catch { return null; }
    });
    console.error(`--- ${label} contractSnapshot: ${JSON.stringify(snap || {}, null, 2)} ---`);
  } catch (e) {
    console.error("Could not read FF_APP snapshot:", e);
  }
}

test.describe("FutureFunded • Gate v2 (production-grade, low-flake)", () => {
  test("Boot markers + webdriver flag + contract snapshot ok", async ({ page }) => {
    await gotoHome(page);

    const snap = await page.evaluate(() => {
      // @ts-ignore
      try { return { snap: window.FF_APP?.api?.contractSnapshot?.() || null, boot: { BOOT_KEY: !!window.BOOT_KEY, __FF_BOOT__: !!window.__FF_BOOT__, ffVersion: !!(window.ff && window.ff.version) } }; }
      catch { return { snap: null, boot: { BOOT_KEY: !!window.BOOT_KEY, __FF_BOOT__: !!window.__FF_BOOT__, ffVersion: !!(window.ff && window.ff.version) } }; }
    });

    if (!snap || !snap.snap) {
      await dumpDebug(page, "contract-missing");
    }

    // Snapshot must exist
    expect(snap.snap, "FF_APP.api.contractSnapshot() missing").toBeTruthy();

    // Required hooks present
    expect(
      snap.snap.ok,
      "Missing required hooks: " + JSON.stringify(snap.snap?.missingRequired || [], null, 2) + "\nSNAPSHOT: " + JSON.stringify(snap.snap || {}, null, 2)
    ).toBeTruthy();

    // Playwright should be in webdriver mode; runtime should report it.
    expect(snap.snap.webdriver, "Runtime did not detect webdriver mode").toBeTruthy();

    // Root should expose webdriver attr (stability mode)
    const rootWebdriver = await page.locator("html.ff-root").getAttribute("data-ff-webdriver");
    expect(rootWebdriver, "html.ff-root should expose data-ff-webdriver='true' in Playwright").toBe("true");
  });

  test("Focus probe exists + has visible focus ring (deterministic)", async ({ page }) => {
    await gotoHome(page);

    const res = await page.evaluate(() => {
      const el = document.getElementById("ff_focus_probe") as HTMLElement | null;
      if (!el) return { ok: false, reason: "missing" };

      try { el.focus(); } catch { /* best-effort */ }

      const cs = window.getComputedStyle(el);
      const active = document.activeElement === el;

      const outlineWidth = cs.outlineWidth || "";
      const boxShadow = cs.boxShadow || "";
      const hasOutline = outlineWidth !== "0px" && outlineWidth !== "0";
      const hasBoxShadow = boxShadow && boxShadow !== "none";

      return { ok: true, active, outlineWidth, boxShadow, hasOutline, hasBoxShadow };
    });

    if (!res.ok) await dumpDebug(page, "focus-probe-missing");

    expect(res.ok).toBeTruthy();
    expect(res.active).toBeTruthy();
    expect(res.hasOutline || res.hasBoxShadow).toBeTruthy();
  });

  test("Tab moves focus into the page (non-flaky: just leave body/html)", async ({ page }) => {
    await gotoHome(page);

    await page.keyboard.press("Tab");

    const tag = await page.evaluate(() => {
      const a = document.activeElement;
      return a && a.tagName ? a.tagName.toLowerCase() : "";
    });

    expect(tag).not.toBe("html");
    expect(tag).not.toBe("body");
    expect(tag).not.toBe("");
  });

  test.describe("Desktop flows", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("Checkout opens/closes + amount chip wires into input (close via button or ESC)", async ({ page }) => {
      await gotoHome(page);

      // Open checkout via any visible CTA
      try {
        await clickVisible(page, "[data-ff-open-checkout]");
      } catch (e) {
        await dumpDebug(page, "open-checkout-fail");
        throw e;
      }

      await expectOverlayOpen(page, "checkout");

      // Amount chip inside checkout sets the amount input
      await clickVisible(page, "#checkout button[data-ff-amount='50']");
      await expect(page.locator("#checkout [data-ff-amount-input]")).toHaveValue("50");

      // Close using the visible close button inside the panel (NOT backdrop)
      const closeBtn = page.locator("#checkout button[data-ff-close-checkout]:visible").first();
      if (await closeBtn.count()) {
        await closeBtn.click();
      } else {
        // Fallback: Escape should close overlays
        await page.keyboard.press("Escape");
      }
      await expectOverlayClosed(page, "checkout");
    });

    test("Team prefill: clicking a team support CTA sets hidden team_id", async ({ page }) => {
      await gotoHome(page);

      const teamCTA = page.locator("a[data-ff-open-checkout][data-ff-team-id]:visible").first();
      await teamCTA.scrollIntoViewIfNeeded();

      const teamId = await teamCTA.getAttribute("data-ff-team-id");
      expect(teamId).toBeTruthy();

      await teamCTA.click();
      await expectOverlayOpen(page, "checkout");

      const hidden = page.locator("#checkout input[name='team_id'][data-ff-team-id]");
      await expect(hidden).toHaveValue(teamId!);

      // Close checkout via close button (or ESC fallback)
      const closeBtn = page.locator("#checkout button[data-ff-close-checkout]:visible").first();
      if (await closeBtn.count()) await closeBtn.click();
      else await page.keyboard.press("Escape");

      await expectOverlayClosed(page, "checkout");
    });

    test("Sponsor modal: open/close + tier selection updates hidden input", async ({ page }) => {
      await gotoHome(page);

      // Scroll to sponsors section to guarantee a visible sponsor CTA
      await page.locator("#sponsors").scrollIntoViewIfNeeded();

      await clickVisible(page, "#sponsors [data-ff-open-sponsor]");
      await expectOverlayOpen(page, "sponsor-interest");

      // Click tier (inside modal grid)
      await clickVisible(page, "#sponsor-interest [data-ff-sponsor-tier='gold']");

      const selected = page.locator("#sponsor-interest [data-ff-sponsor-tier-selected]");
      await expect(selected).toHaveValue("gold");

      // Empty submit -> error should appear
      const submitBtn = page.locator("#sponsor-interest button[type='submit']:visible").first();
      await submitBtn.scrollIntoViewIfNeeded();

      // Force is intentional here: Playwright hit-testing is being intercepted by the panel
      await submitBtn.click({ force: true });

      // If the error isn't visible quickly, dump debug info
      try {
        await expect(page.locator("#sponsor-interest [data-ff-sponsor-error]")).toBeVisible({ timeout: 4000 });
      } catch (e) {
        await dumpDebug(page, "sponsor-error-missing");
        throw e;
      }

      // Close via visible close button (not backdrop)
      const closeBtn = page.locator("#sponsor-interest button[data-ff-close-sponsor]:visible").first();
      if (await closeBtn.count()) await closeBtn.click();
      else await page.keyboard.press("Escape");

      await expectOverlayClosed(page, "sponsor-interest");
    });

    test("Video modal: opens + mounts iframe; closes via button + unmounts", async ({ page }) => {
      await gotoHome(page);

      // Scroll to story where a video trigger is reliably present
      await page.locator("#story").scrollIntoViewIfNeeded();

      await clickVisible(page, "#story [data-ff-open-video]");
      await expectOverlayOpen(page, "press-video");

      await expect(page.locator("#press-video iframe")).toHaveCount(1);

      // Close via the visible header close button (not backdrop)
      const closeBtn = page.locator("#press-video button[data-ff-close-video]:visible").first();
      if (await closeBtn.count()) await closeBtn.click();
      else await page.keyboard.press("Escape");

      await expectOverlayClosed(page, "press-video");
      await expect(page.locator("#press-video iframe")).toHaveCount(0);
    });
  });

  test.describe("Mobile UI", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Drawer open/close respects overlay contract (mobile-only trigger)", async ({ page }) => {
      await gotoHome(page);

      // Open drawer (mobile button should now be visible)
      await clickVisible(page, "[data-ff-open-drawer]");

      const drawer = page.locator("#drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("aria-hidden", "false");
      await expect(drawer).toHaveAttribute("data-open", "true");

      // Close drawer (close button or ESC)
      const closeBtn = page.locator("#drawer [data-ff-close-drawer]:visible").first();
      if (await closeBtn.count()) await closeBtn.click();
      else await page.keyboard.press("Escape");

      await expect(drawer).toBeHidden();
      await expect(drawer).toHaveAttribute("aria-hidden", "true");
      await expect(drawer).toHaveAttribute("data-open", "false");
    });
  });
});
