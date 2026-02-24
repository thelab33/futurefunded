// tests/ff_smoke_gate.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * FutureFunded — Smoke Gate (page + hooks + overlays)
 * DROP-IN REPLACEMENT
 *
 * Fixes common “test is wrong” failures:
 * - Does NOT assume [data-ff-close-checkout] contains a nested <button> (your backdrop is often an <a>)
 * - Scopes amount-chip clicks to the OPEN checkout panel so hero chips behind the overlay don’t get targeted
 * - Drawer close: prefers a real close button; falls back to ESC; uses backdrop-corner only when viable
 * - Uses tolerant open/close detection: aria-hidden/data-open/is-open
 */

const BASE_URL = (() => {
  const raw = (process.env.BASE_URL || "http://127.0.0.1:5000/").trim();
  // normalize to exactly one trailing slash
  return raw.replace(/\/?$/, "/");
})();

type Hooks = Record<string, string>;

function withSmoke(url: string) {
  const u = new URL(url);
  u.searchParams.set("smoke", "1");
  if (!u.searchParams.get("mode")) u.searchParams.set("mode", "demo");
  return u.toString();
}

async function readHooks(page: Page): Promise<Hooks> {
  const defaults: Hooks = {
    openCheckout: "[data-ff-open-checkout]",
    closeCheckout: "[data-ff-close-checkout]",
    checkoutSheet: "[data-ff-checkout-sheet]",
    checkoutViewport: "[data-ff-checkout-viewport]",
    checkoutContent: "[data-ff-checkout-content]",
    donationForm: "#donationForm",
    amountInput: "[data-ff-amount-input]",
    amountChip: "[data-ff-amount]",
    teamId: 'input[data-ff-team-id][name="team_id"]',
    toasts: "[data-ff-toasts]",
    live: "[data-ff-live]",
    share: "[data-ff-share]",
    themeToggle: "[data-ff-theme-toggle]",
    openDrawer: "[data-ff-open-drawer]",
    closeDrawer: "[data-ff-close-drawer]",
    drawer: "[data-ff-drawer]",
    openSponsor: "[data-ff-open-sponsor]",
    closeSponsor: "[data-ff-close-sponsor]",
    sponsorModal: "[data-ff-sponsor-modal]",
    sponsorWall: "[data-ff-sponsor-wall]",
    openVideo: "[data-ff-open-video]",
    closeVideo: "[data-ff-close-video]",
    videoModal: "[data-ff-video-modal]",
    videoFrame: "[data-ff-video-frame]",
  };

  const script = page.locator("#ffSelectors");
  if (!(await script.count())) return defaults;

  const raw = (await script.textContent()) || "";
  try {
    const parsed = JSON.parse(raw);
    const hooks = parsed?.hooks ? (parsed.hooks as Hooks) : {};
    return { ...defaults, ...hooks };
  } catch {
    return defaults;
  }
}

async function gotoHome(page: Page) {
  const url = withSmoke(BASE_URL);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Keep deterministic: don’t wait on long polling / sockets.
  await page.waitForTimeout(200);
}

async function clickFirstVisible(locator: Locator, opts?: Parameters<Locator["click"]>[0]) {
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i);
    if (await el.isVisible()) {
      await el.scrollIntoViewIfNeeded();
      await el.click(opts);
      return;
    }
  }
  throw new Error(`No visible element found for locator: ${locator.toString()}`);
}

async function clickBackdropCorner(backdrop: Locator, corner: "tl" | "tr" | "bl" | "br" = "tl") {
  const box = await backdrop.boundingBox();
  if (!box) throw new Error("Backdrop has no bounding box (not rendered?)");

  const pad = 8;
  const xLeft = box.x + pad;
  const xRight = box.x + box.width - pad;
  const yTop = box.y + pad;
  const yBottom = box.y + box.height - pad;

  const x = corner === "tr" || corner === "br" ? xRight : xLeft;
  const y = corner === "bl" || corner === "br" ? yBottom : yTop;

  await backdrop.page().mouse.click(x, y);
}

async function assertSingleCheckoutSheet(page: Page) {
  const all = page.locator("[data-ff-checkout-sheet]");
  const count = await all.count();
  if (count !== 1) {
    const meta = await all.evaluateAll((els) =>
      els.map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: (el as HTMLElement).id || null,
        className: (el as HTMLElement).className || null,
        dataOpen: el.getAttribute("data-open"),
        ariaHidden: el.getAttribute("aria-hidden"),
        hidden: el.hasAttribute("hidden"),
      }))
    );
    throw new Error(
      `CRITICAL: expected exactly 1 [data-ff-checkout-sheet], found ${count}.\n` +
        `This is almost always duplicated checkout markup in index.html.\n` +
        `Matches:\n${JSON.stringify(meta, null, 2)}`
    );
  }
}

async function isOverlayOpen(overlay: Locator): Promise<boolean> {
  return await overlay.evaluate((el) => {
    const ariaHidden = el.getAttribute("aria-hidden");
    const dataOpen = el.getAttribute("data-open");
    const hidden = (el as HTMLElement).hasAttribute("hidden");
    const cls = (el as HTMLElement).classList;
    return ariaHidden === "false" || dataOpen === "true" || cls.contains("is-open") || (!hidden && ariaHidden !== "true");
  });
}

async function waitOverlayOpen(overlay: Locator, timeoutMs = 10_000) {
  await expect
    .poll(async () => isOverlayOpen(overlay), { timeout: timeoutMs })
    .toBeTruthy();
}

async function waitOverlayClosed(overlay: Locator, timeoutMs = 10_000) {
  await expect
    .poll(async () => !(await isOverlayOpen(overlay)), { timeout: timeoutMs })
    .toBeTruthy();
}

async function overlayDebug(page: Page, rootSel: string, panelSel: string, backdropSel: string) {
  return await page.evaluate(
    ({ rootSel, panelSel, backdropSel }) => {
      const root = document.querySelector(rootSel) as HTMLElement | null;
      const panel = document.querySelector(panelSel) as HTMLElement | null;
      const backdrop = document.querySelector(backdropSel) as HTMLElement | null;

      const cs = (el: Element | null) => {
        if (!el) return null;
        const s = getComputedStyle(el as Element);
        return {
          tag: (el as HTMLElement).tagName.toLowerCase(),
          id: (el as HTMLElement).id || null,
          className: (el as HTMLElement).className || null,
          position: s.position,
          zIndex: s.zIndex,
          pointerEvents: s.pointerEvents,
          display: s.display,
          opacity: s.opacity,
          transform: s.transform,
        };
      };

      const panelParentIsRoot = !!panel && !!root && panel.parentElement === root;
      const backdropParentIsRoot = !!backdrop && !!root && backdrop.parentElement === root;
      const backdropInsidePanel = !!panel && !!backdrop && panel.contains(backdrop);

      return {
        ok: true,
        structure: {
          panelIsDirectChildOfRoot: panelParentIsRoot,
          backdropIsDirectChildOfRoot: backdropParentIsRoot,
          backdropIsInsidePanel: backdropInsidePanel,
        },
        root: cs(root),
        panel: cs(panel),
        backdrop: cs(backdrop),
      };
    },
    { rootSel, panelSel, backdropSel }
  );
}

async function safeClickOrExplain(el: Locator, explain: () => Promise<string>, timeout = 10_000) {
  try {
    await el.click({ trial: true, timeout: Math.min(5_000, timeout) });
    await el.click({ timeout });
  } catch (e) {
    throw new Error(`${await explain()}\n\nOriginal error:\n${String(e)}`);
  }
}

test.describe("FutureFunded — smoke gate (page + hooks + overlays)", () => {
  test("home loads clean: no same-origin 404s, no console errors, core hooks exist", async ({ page }) => {
    const origin = new URL(BASE_URL).origin;

    const consoleErrs: string[] = [];
    const assetErrs: string[] = [];

    page.on("pageerror", (e) => consoleErrs.push(String((e as any)?.message || e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrs.push(m.text());
    });

    page.on("response", async (res) => {
      try {
        const u = new URL(res.url());
        if (u.origin !== origin) return;

        const status = res.status();
        if (status < 400) return;

        const isAsset =
          u.pathname.startsWith("/static/") ||
          u.pathname === "/favicon.ico" ||
          u.pathname === "/manifest.webmanifest" ||
          /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(u.pathname);

        if (isAsset) assetErrs.push(`${status} ${u.pathname}`);
      } catch {
        // ignore
      }
    });

    await gotoHome(page);
    const hooks = await readHooks(page);

    // Core config scripts should exist
    await expect(page.locator("#ffConfig[data-ff-config]")).toHaveCount(1);
    await expect(page.locator("#ffSelectors")).toHaveCount(1);

    // Root/body contracts
    await expect(page.locator("html.ff-root")).toHaveCount(1);
    await expect(page.locator("body.ff-body[data-ff-body]")).toHaveCount(1);

    // Hooks exist (counts, not visibility)
    expect(await page.locator(hooks.openCheckout).count()).toBeGreaterThan(0);
    expect(await page.locator(hooks.share).count()).toBeGreaterThan(0);
    expect(await page.locator(hooks.themeToggle).count()).toBeGreaterThan(0);
    expect(await page.locator(hooks.toasts).count()).toBe(1);

    await assertSingleCheckoutSheet(page);
    await expect(page.locator("#drawer[data-ff-drawer]")).toHaveCount(1);
    await expect(page.locator("#sponsor-interest[data-ff-sponsor-modal]")).toHaveCount(1);

    if (assetErrs.length) {
      throw new Error(`Same-origin ASSET errors detected:\n${assetErrs.join("\n")}`);
    }
    if (consoleErrs.length) {
      throw new Error(`Console/page errors detected:\n${consoleErrs.join("\n")}`);
    }
  });

  test("checkout overlay contract: open via click; backdrop MUST be sibling; close via close control + backdrop corner + ESC", async ({
    page,
  }) => {
    await gotoHome(page);
    const hooks = await readHooks(page);

    await assertSingleCheckoutSheet(page);

    const sheet = page.locator("#checkout[data-ff-checkout-sheet]");
    await expect(sheet).toHaveCount(1);

    // Open via a visible CTA
    await clickFirstVisible(page.locator(hooks.openCheckout), { timeout: 10_000 });
    await waitOverlayOpen(sheet, 10_000);

    // Structural gate: backdrop and panel MUST be direct children of #checkout
    const dbg = await overlayDebug(page, "#checkout", "#checkout .ff-sheet__panel", "#checkout .ff-sheet__backdrop");
    if (
      !dbg.structure.panelIsDirectChildOfRoot ||
      !dbg.structure.backdropIsDirectChildOfRoot ||
      dbg.structure.backdropIsInsidePanel
    ) {
      throw new Error(
        `CRITICAL: checkout DOM structure is wrong (backdrop must be sibling of panel).\n${JSON.stringify(dbg, null, 2)}`
      );
    }

    const panel = sheet.locator(".ff-sheet__panel").first();
    const backdrop = sheet.locator(".ff-sheet__backdrop").first();

    // Prefer a close control INSIDE the panel. Fallback to any [data-ff-close-checkout].
    const closeInPanel = panel.locator("[data-ff-close-checkout]").first();
    const closeAny = sheet.locator("[data-ff-close-checkout]").first();

    const closeEl = (await closeInPanel.count()) ? closeInPanel : closeAny;

    await safeClickOrExplain(
      closeEl,
      async () => {
        const dbg2 = await overlayDebug(page, "#checkout", "#checkout .ff-sheet__panel", "#checkout .ff-sheet__backdrop");
        return `Close control click FAILED (stacking/pointer-events likely wrong).\nOverlay debug:\n${JSON.stringify(dbg2, null, 2)}`;
      },
      10_000
    );

    await waitOverlayClosed(sheet, 10_000);

    // Re-open
    await clickFirstVisible(page.locator(hooks.openCheckout), { timeout: 10_000 });
    await waitOverlayOpen(sheet, 10_000);

    // Close via backdrop corner (avoid clicking under panel)
    await clickBackdropCorner(backdrop, "tl");
    await waitOverlayClosed(sheet, 10_000);

    // Re-open
    await clickFirstVisible(page.locator(hooks.openCheckout), { timeout: 10_000 });
    await waitOverlayOpen(sheet, 10_000);

    // Close via ESC
    await page.keyboard.press("Escape");
    await waitOverlayClosed(sheet, 10_000);
  });

  test("checkout prefill: amount chip is clickable INSIDE checkout and sets amount input", async ({ page }) => {
    await gotoHome(page);
    const hooks = await readHooks(page);

    await assertSingleCheckoutSheet(page);

    const sheet = page.locator("#checkout[data-ff-checkout-sheet]");
    await clickFirstVisible(page.locator(hooks.openCheckout), { timeout: 10_000 });
    await waitOverlayOpen(sheet, 10_000);

    const panel = sheet.locator(".ff-sheet__panel").first();
    await expect(panel).toHaveCount(1);

    const amountInput = panel.locator(hooks.amountInput).first();
    await expect(amountInput).toHaveCount(1);

    // IMPORTANT: scope chips to the open panel so we never hit hero chips behind the overlay.
    const chips = panel.locator(hooks.amountChip);
    await expect(chips).toHaveCountGreaterThan(0);

    // Prefer $50 specifically if present; otherwise click the first panel chip.
    const chip50 = chips.filter({ hasText: "$50" }).first();
    const chipToClick = (await chip50.count()) ? chip50 : chips.first();

    await safeClickOrExplain(
      chipToClick,
      async () => {
        const dbg = await overlayDebug(page, "#checkout", "#checkout .ff-sheet__panel", "#checkout .ff-sheet__backdrop");
        return `Amount chip click FAILED (overlay/panel stacking is intercepting clicks).\nOverlay debug:\n${JSON.stringify(dbg, null, 2)}`;
      },
      10_000
    );

    const val = await amountInput.inputValue();
    expect(val.replace(/[^\d.]/g, ""), "Expected amount input to reflect chip selection").not.toBe("");
  });

  test("payments mounts visible when checkout open (Stripe + PayPal placeholders allowed)", async ({ page }) => {
    await gotoHome(page);
    const hooks = await readHooks(page);

    await assertSingleCheckoutSheet(page);

    const sheet = page.locator("#checkout[data-ff-checkout-sheet]");
    await clickFirstVisible(page.locator(hooks.openCheckout), { timeout: 10_000 });
    await waitOverlayOpen(sheet, 10_000);

    const panel = sheet.locator(".ff-sheet__panel").first();

    const stripeMount = panel.locator("#paymentElement, [data-ff-payment-element], [data-ff-stripe-mount]").first();
    const paypalMount = panel.locator("#paypalButtons, [data-ff-paypal-mount]").first();

    await expect(stripeMount).toBeVisible({ timeout: 10_000 });
    await expect(paypalMount).toBeVisible({ timeout: 10_000 });
  });

  test.describe("mobile-only smoke (drawer + sponsor modal)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("drawer opens and closes (prefer close button, fallback ESC, lastly backdrop corner)", async ({ page }) => {
      await gotoHome(page);
      const hooks = await readHooks(page);

      const drawerRoot = page.locator("#drawer[data-ff-drawer]");
      await expect(drawerRoot).toHaveCount(1);

      await clickFirstVisible(page.locator(hooks.openDrawer), { timeout: 10_000 });
      await waitOverlayOpen(drawerRoot, 10_000);

      // Prefer a close button inside the panel (most deterministic).
      const panel = page.locator("#ffDrawerPanel").first();
      const closeBtnInPanel = panel.locator('button[aria-label*="Close"], [data-ff-close-drawer-btn]').first();

      if (await closeBtnInPanel.count()) {
        await safeClickOrExplain(
          closeBtnInPanel,
          async () => `Drawer close button click failed (likely stacking).`,
          10_000
        );
        await waitOverlayClosed(drawerRoot, 10_000);
        return;
      }

      // Next best: ESC should always close if you support it.
      await page.keyboard.press("Escape");
      try {
        await waitOverlayClosed(drawerRoot, 5_000);
        return;
      } catch {
        // Fall through to backdrop corner attempt.
      }

      // Last resort: click backdrop corner (only works if backdrop is actually clickable)
      const backdrop = drawerRoot.locator(".ff-drawer__backdrop, [data-ff-close-drawer]").first();
      await clickBackdropCorner(backdrop, "tl");
      await waitOverlayClosed(drawerRoot, 10_000);
    });

    test("sponsor modal opens and closes", async ({ page }) => {
      await gotoHome(page);
      const hooks = await readHooks(page);

      const modal = page.locator("#sponsor-interest[data-ff-sponsor-modal]");
      await expect(modal).toHaveCount(1);

      await clickFirstVisible(page.locator(hooks.openSponsor), { timeout: 10_000 });
      await waitOverlayOpen(modal, 10_000);

      // Prefer close button inside modal if present; else backdrop corner; else ESC.
      const panelClose = modal.locator("[data-ff-close-sponsor]").first();
      const backdrop = modal.locator(".ff-modal__backdrop").first();

      if (await panelClose.count()) {
        await safeClickOrExplain(
          panelClose,
          async () => `Sponsor modal close click failed (stacking).`,
          10_000
        );
      } else if (await backdrop.count()) {
        await clickBackdropCorner(backdrop, "tl");
      } else {
        await page.keyboard.press("Escape");
      }

      await waitOverlayClosed(modal, 10_000);
    });
  });

  test("video modal opens and closes (if present)", async ({ page }) => {
    await gotoHome(page);
    const hooks = await readHooks(page);

    const openVideo = page.locator(hooks.openVideo);
    if (!(await openVideo.count())) test.skip(true, "No video trigger present");

    const modal = page.locator(hooks.videoModal);
    await expect(modal).toHaveCount(1);

    await clickFirstVisible(openVideo, { timeout: 10_000, noWaitAfter: true });
    await waitOverlayOpen(modal, 10_000);

    const closeAny = modal.locator("[data-ff-close-video]").first();
    const backdrop = modal.locator(".ff-modal__backdrop").first();

    if (await closeAny.count()) {
      // If it's a backdrop link, corner click is safer than center click.
      const tag = await closeAny.evaluate((el) => el.tagName.toLowerCase());
      const cls = (await closeAny.getAttribute("class")) || "";
      if (tag === "a" && cls.includes("backdrop") && (await backdrop.count())) {
        await clickBackdropCorner(backdrop, "tl");
      } else {
        await safeClickOrExplain(closeAny, async () => `Video close click failed (stacking).`, 10_000);
      }
    } else if (await backdrop.count()) {
      await clickBackdropCorner(backdrop, "tl");
    } else {
      await page.keyboard.press("Escape");
    }

    await waitOverlayClosed(modal, 10_000);
  });
});
