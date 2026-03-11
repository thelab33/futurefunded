import { test, expect } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  "https://getfuturefunded.com";

const ALLOWED_OPTIONAL_404_PATTERNS = [
  /\/api\/activity-feed(?:\?|$)/i
];

function isAllowedOptional404(url: string, status: number): boolean {
  return status === 404 && ALLOWED_OPTIONAL_404_PATTERNS.some((rx) => rx.test(url));
}

function sameOriginish(url: string): boolean {
  return (
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("http://localhost") ||
    url.startsWith("https://127.0.0.1") ||
    url.startsWith("https://localhost") ||
    url.startsWith("https://getfuturefunded.com") ||
    url.startsWith("/")
  );
}

test.describe("FutureFunded — launch links and share readiness", () => {
  test("canonical, OG metadata, support links, and QR target are sane", async ({ page }) => {
    const badResponses: string[] = [];

    page.on("response", (res) => {
      const status = res.status();
      const url = res.url();
      if (sameOriginish(url) && status >= 400 && !isAllowedOptional404(url, status)) {
        badResponses.push(`${status} ${url}`);
      }
    });

    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const meta = await page.evaluate(() => {
      const q = (sel: string) =>
        (document.querySelector(sel) as HTMLMetaElement | HTMLLinkElement | null)?.getAttribute("content") ||
        (document.querySelector(sel) as HTMLLinkElement | null)?.getAttribute("href") ||
        "";

      const allLinks = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      const supportLinks = allLinks
        .map((a) => ({
          text: (a.textContent || "").trim(),
          href: a.getAttribute("href") || ""
        }))
        .filter((x) => /support|contact|privacy|terms/i.test(`${x.text} ${x.href}`));

      const qrCandidates = Array.from(document.querySelectorAll("img, canvas, svg, a[href]"))
        .map((el) => {
          const href = (el as HTMLAnchorElement).getAttribute?.("href") || "";
          const src = (el as HTMLImageElement).getAttribute?.("src") || "";
          const aria = el.getAttribute?.("aria-label") || "";
          const alt = (el as HTMLImageElement).getAttribute?.("alt") || "";
          const text = (el.textContent || "").trim();
          return { href, src, aria, alt, text };
        })
        .filter((x) => /qr|scan|share/i.test(`${x.href} ${x.src} ${x.aria} ${x.alt} ${x.text}`));

      return {
        title: document.title,
        canonical: q('link[rel="canonical"]'),
        ogTitle: q('meta[property="og:title"]'),
        ogDescription: q('meta[property="og:description"]'),
        ogImage: q('meta[property="og:image"]'),
        description: q('meta[name="description"]'),
        supportLinks,
        qrCandidates
      };
    });

    expect(meta.title).toBeTruthy();
    expect(meta.description, "meta description missing").toBeTruthy();
    expect(meta.canonical, "canonical link missing").toBeTruthy();
    expect(meta.ogTitle, "og:title missing").toBeTruthy();
    expect(meta.ogDescription, "og:description missing").toBeTruthy();
    expect(
      meta.supportLinks.length,
      "Expected support/contact/privacy/terms links to be present"
    ).toBeGreaterThan(0);
    expect(
      meta.qrCandidates.length,
      "Expected at least one QR/share candidate element"
    ).toBeGreaterThan(0);

    test.info().attach("launch-links-and-share.json", {
      body: JSON.stringify({ base: BASE, meta, badResponses }, null, 2),
      contentType: "application/json"
    });

    expect(badResponses, "Unexpected bad same-origin responses detected").toEqual([]);
  });
});
