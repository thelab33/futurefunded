// tests/ff_checkout_ux.spec.ts
import { test, expect, Page } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.PW_BASE_URL ||
  process.env.BASE_URL ||
  "http://127.0.0.1:5000";

async function installExternalMocks(page: Page) {
  await page.route(/https:\/\/js\.stripe\.com\/v3\/?(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "/* mocked stripe */\n" +
        "window.Stripe = function(){ return { elements(){ return {}; }, confirmPayment: async ()=>({}) }; };",
    });
  });

  await page.route(/https:\/\/www\.paypal\.com\/sdk\/js(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "/* mocked paypal */\n" +
        "window.paypal = { Buttons: () => ({ render: async () => {} }) };",
    });
  });

  await page.route(/https:\/\/www\.youtube-nocookie\.com\/embed\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>mock video</body></html>",
    });
  });
}

function attachConsoleGuards(page: Page) {
  const errors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text() || "";
      const ignorable =
        text.includes("Failed to load resource") ||
        text.includes("net::ERR") ||
        text.includes("favicon") ||
        text.includes("ERR_BLOCKED_BY_CLIENT");
      if (!ignorable) errors.push(text);
    }
  });

  page.on("pageerror", (err) => pageErrors.push(String(err)));

  return {
    assertNoHardErrors: async () => {
      expect(pageErrors, `Uncaught pageerror(s):\n${pageErrors.join("\n")}`).toEqual([]);
      expect(errors, `Console error(s):\n${errors.join("\n")}`).toEqual([]);
    },
  };
}

async function waitCheckoutOpen(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-ff-checkout-sheet]");
    if (!el) return false;
    const hidden = (el as HTMLElement).hasAttribute("hidden") || (el as any).hidden === true;
    const ariaHidden = el.getAttribute("aria-hidden");
    const dataOpen = el.getAttribute("data-open");
    const clsOpen = el.classList.contains("is-open");
    const target = location.hash === "#checkout";
    return !hidden && (ariaHidden === "false" || dataOpen === "true" || clsOpen || target);
  });
}

async function waitCheckoutClosed(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-ff-checkout-sheet]");
    if (!el) return false;
    const hidden = (el as HTMLElement).hasAttribute("hidden") || (el as any).hidden === true;
    const ariaHidden = el.getAttribute("aria-hidden");
    const dataOpen = el.getAttribute("data-open");
    const clsOpen = el.classList.contains("is-open");
    return (hidden || ariaHidden === "true" || dataOpen === "false") && !clsOpen;
  });
}

test.describe("FutureFunded checkout UX gate", () => {
  test("opens via click; focus moves into dialog; closes cleanly", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

    const opener = page.locator("[data-ff-open-checkout]").first();
    await expect(opener).toHaveCount(1);

    await opener.click();
    await waitCheckoutOpen(page);

    const sheet = page.locator("#checkout[data-ff-checkout-sheet]");
    const panel = page.locator("#checkout .ff-sheet__panel[role='dialog']");
    await expect(sheet).toHaveCount(1);
    await expect(panel).toHaveCount(1);
    await expect(panel).toBeVisible();

    const focusInside = await page.evaluate(() => {
      const active = document.activeElement;
      const panel = document.querySelector("#checkout .ff-sheet__panel");
      if (!active || !panel) return false;
      return panel === active || panel.contains(active);
    });
    expect(focusInside, "Expected focus to move into checkout dialog").toBeTruthy();

    await expect(page.locator("#checkout [data-ff-checkout-viewport]")).toHaveCount(1);
    await expect(page.locator("#checkout [data-ff-checkout-content]")).toHaveCount(1);
    await expect(page.locator("#checkout [data-ff-checkout-scroll]")).toHaveCount(1);

    const closeBtn = page.locator("#checkout button[data-ff-close-checkout]").first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await waitCheckoutClosed(page);
    await guard.assertNoHardErrors();
  });

  test("opens via :target (#checkout) and closes via backdrop", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    await page.goto(`${BASE_URL}/#checkout`, { waitUntil: "domcontentloaded" });
    await waitCheckoutOpen(page);

    const backdrop = page.locator("#checkout .ff-sheet__backdrop[data-ff-close-checkout]");
    await expect(backdrop).toHaveCount(1);
    await backdrop.click({ force: true });

    await waitCheckoutClosed(page);
    await guard.assertNoHardErrors();
  });

  test("closes on Escape", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

    await page.locator("[data-ff-open-checkout]").first().click();
    await waitCheckoutOpen(page);

    await page.keyboard.press("Escape");
    await waitCheckoutClosed(page);

    await guard.assertNoHardErrors();
  });

  test("amount chips update the amount input", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

    await page.locator("[data-ff-open-checkout]").first().click();
    await waitCheckoutOpen(page);

    // ✅ Scope to the checkout form so we don't accidentally click hero/impact chips.
    const form = page.locator("#checkout form#donationForm");
    await expect(form).toHaveCount(1);

    const amountInput = form.locator("[data-ff-amount-input]");
    await expect(amountInput).toHaveCount(1);

    const chip50 = form.locator('button[data-ff-amount="50"]').first();
    await expect(chip50).toHaveCount(1);

    await chip50.scrollIntoViewIfNeeded();
    await chip50.click();

    const v = await amountInput.inputValue();
    expect(v, "Expected amount input to reflect chip selection").toMatch(/50/);

    await guard.assertNoHardErrors();
  });

  test("team preload sets hidden team_id inside checkout form", async ({ page }) => {
    await installExternalMocks(page);
    const guard = attachConsoleGuards(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

    const teamTrigger = page
      .locator('a[data-ff-open-checkout][data-ff-team-id], button[data-ff-open-checkout][data-ff-team-id]')
      .first();

    await expect(teamTrigger).toHaveCount(1);

    const teamId = (await teamTrigger.getAttribute("data-ff-team-id")) || "default";
    await teamTrigger.click();

    await waitCheckoutOpen(page);

    const hiddenTeam = page.locator('#checkout form#donationForm input[name="team_id"][data-ff-team-id]');
    await expect(hiddenTeam).toHaveCount(1);

    const val = await hiddenTeam.inputValue();
    expect(val, "Expected hidden team_id to match clicked trigger").toBe(teamId);

    await guard.assertNoHardErrors();
  });
});
