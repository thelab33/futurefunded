// tests/qa/production/ff_content_trust.spec.ts
import { test, expect } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "https://getfuturefunded.com";

const FORBIDDEN_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\bdemo\b/i,
  /\bpreview only\b/i,
  /\btest card\b/i,
  /\bfake\b/i
];

test.describe("FutureFunded — content trust checks", () => {
  test("page has trust-critical content and no obvious placeholder residue", async ({ page }) => {
    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const bodyText = await page.locator("body").innerText();
    const compactText = bodyText.replace(/\s+/g, " ").trim();

    const matches = FORBIDDEN_PATTERNS.filter((rx) => rx.test(compactText)).map(String);

    expect(compactText.length, "Body text unexpectedly tiny").toBeGreaterThan(500);
    expect(compactText, "Support/contact wording should exist").toMatch(/support|contact/i);
    expect(compactText, "Donation wording should exist").toMatch(/donate|support the season|fund/i);
    expect(compactText, "Privacy or terms wording should exist").toMatch(/privacy|terms/i);

    test.info().attach("content-trust.json", {
      body: JSON.stringify(
        {
          base: BASE,
          forbiddenMatches: matches,
          sample: compactText.slice(0, 2500)
        },
        null,
        2
      ),
      contentType: "application/json"
    });

    expect(matches, "Forbidden placeholder/demo residue detected").toEqual([]);
  });
});
