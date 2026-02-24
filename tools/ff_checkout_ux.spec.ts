// Add to tools/ff_checkout_ux.spec.ts (or inline into your existing closeCheckout/openCheckout tests)
// Premium gate: z-index / hit-test sanity checks so we *detect* regressions instead of force-clicking forever.

import { expect, Page } from "@playwright/test";

type LayerInfo = {
  ok: boolean;
  reason?: string;
  close?: any;
  backdrop?: any;
  top?: any;
  samplePoint?: { x: number; y: number };
};

async function assertCloseAboveBackdrop(page: Page) {
  const result: LayerInfo = await page.evaluate(() => {
    const root = document.querySelector("#checkout") || document.querySelector(".ff-sheet--checkout");
    if (!root) return { ok: false, reason: "checkout root not found" };

    const closeEl =
      root.querySelector('[data-ff-close-checkout]') ||
      root.querySelector("button[data-ff-close-checkout]");
    const backdropEl = root.querySelector(".ff-sheet__backdrop");

    if (!closeEl) return { ok: false, reason: "close button not found" };
    if (!backdropEl) return { ok: false, reason: "backdrop not found" };

    const closeRect = closeEl.getBoundingClientRect();
    const backRect = backdropEl.getBoundingClientRect();

    // Sample a point *inside* the close button (avoid edges)
    const x = Math.max(closeRect.left + 6, Math.min(closeRect.right - 6, closeRect.left + closeRect.width / 2));
    const y = Math.max(closeRect.top + 6, Math.min(closeRect.bottom - 6, closeRect.top + closeRect.height / 2));

    // Who is actually on top at that point?
    const top = document.elementFromPoint(x, y);

    const csClose = window.getComputedStyle(closeEl as Element);
    const csBack = window.getComputedStyle(backdropEl as Element);

    const zClose = Number.parseInt(csClose.zIndex || "0", 10);
    const zBack = Number.parseInt(csBack.zIndex || "0", 10);

    // Some backdrops are <a> tags and can intercept clicks if they sit above in stacking context.
    // The strongest check is hit-testing: elementFromPoint should be the close button or a descendant.
    const hitOk = !!(top && (top === closeEl || (closeEl as Element).contains(top)));

    // Secondary check: computed z-index if numeric (not "auto")
    const zOk =
      Number.isFinite(zClose) && Number.isFinite(zBack)
        ? zClose >= zBack
        : true; // don't fail solely on "auto"/NaN; rely on hit-test

    const peBack = csBack.pointerEvents; // "auto" will intercept if on top
    const peOk = !hitOk ? false : true; // if hitOk, pointer-events doesn't matter

    return {
      ok: hitOk && zOk && peOk,
      reason: !hitOk
        ? "backdrop is above close button at click point (hit-test failed)"
        : !zOk
          ? "computed z-index suggests close is below backdrop"
          : "unknown",
      samplePoint: { x, y },
      close: {
        tag: (closeEl as Element).tagName,
        zIndex: csClose.zIndex,
        position: csClose.position,
        pointerEvents: csClose.pointerEvents,
        rect: { left: closeRect.left, top: closeRect.top, width: closeRect.width, height: closeRect.height },
      },
      backdrop: {
        tag: (backdropEl as Element).tagName,
        zIndex: csBack.zIndex,
        position: csBack.position,
        pointerEvents: csBack.pointerEvents,
        rect: { left: backRect.left, top: backRect.top, width: backRect.width, height: backRect.height },
      },
      top: top
        ? {
            tag: (top as Element).tagName,
            id: (top as Element).id || null,
            class: (top as Element).className || null,
          }
        : null,
    };
  });

  expect(
    result.ok,
    [
      "Close button layering gate failed.",
      `Reason: ${result.reason}`,
      `Sample point: ${result.samplePoint ? `${Math.round(result.samplePoint.x)},${Math.round(result.samplePoint.y)}` : "n/a"}`,
      `Top-at-point: ${result.top ? `${result.top.tag} id=${result.top.id} class=${result.top.class}` : "null"}`,
      `Close: ${result.close ? `z=${result.close.zIndex} pos=${result.close.position} pe=${result.close.pointerEvents}` : "n/a"}`,
      `Backdrop: ${result.backdrop ? `z=${result.backdrop.zIndex} pos=${result.backdrop.position} pe=${result.backdrop.pointerEvents}` : "n/a"}`,
      "Fix: ensure the close button is in a higher stacking context than .ff-sheet__backdrop,",
      "and that the backdrop does NOT overlap the close button's clickable area.",
    ].join("\n")
  ).toBeTruthy();
}

export async function assertCheckoutLayeringIsSane(page: Page) {
  // Make sure checkout exists & is open before calling this
  await expect(page.locator("#checkout")).toBeAttached();
  await expect(page.locator("#checkout .ff-sheet__backdrop")).toBeAttached();
  await expect(page.locator("#checkout [data-ff-close-checkout]")).toBeAttached();

  // Wait a tick for transitions/layout
  await page.waitForTimeout(50);

  await assertCloseAboveBackdrop(page);
}
