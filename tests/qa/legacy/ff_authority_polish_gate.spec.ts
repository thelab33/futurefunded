import { test, expect } from "@playwright/test";

function parseRgb(input: string): [number, number, number] {
  const m = input.match(/rgba?\(([^)]+)\)/i);
  if (!m) return [255, 255, 255];
  const parts = m[1].split(",").map((v) => Number(v.trim()));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

test.describe("FutureFunded • Authority Polish Gate", () => {
  test("desktop polish states look intentional", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);

    await expect(page.locator("#home")).toBeVisible();
    await expect(page.locator("#impact")).toBeVisible();
    await expect(page.locator("#sponsors")).toBeVisible();
    await expect(page.locator("#teams")).toBeVisible();
    await expect(page.locator("#story")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();

    const floating = page.locator("[data-ff-tabs]");
    await expect(floating).toHaveCount(1);

    const floatingState = await floating.evaluate((el) => {
      const cs = window.getComputedStyle(el as HTMLElement);
      return {
        opacity: cs.opacity,
        visibility: cs.visibility,
        pointerEvents: cs.pointerEvents,
      };
    });

    expect(
      floatingState.opacity === "0" ||
      floatingState.visibility === "hidden" ||
      floatingState.pointerEvents === "none"
    ).toBeTruthy();

    const mutedContrast = await page.locator(".ff-help.ff-muted").first().evaluate((el) => {
      function luminance(r: number, g: number, b: number) {
        const a = [r, g, b].map((v) => {
          const n = v / 255;
          return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      }

      function parseRgb(input: string): [number, number, number] {
        const m = input.match(/rgba?\(([^)]+)\)/i);
        if (!m) return [255, 255, 255];
        const parts = m[1].split(",").map((v) => Number(v.trim()));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
      }

      function bg(node: HTMLElement | null): string {
        let cur: HTMLElement | null = node;
        while (cur) {
          const c = getComputedStyle(cur).backgroundColor;
          if (c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)") return c;
          cur = cur.parentElement;
        }
        return "rgb(255, 255, 255)";
      }

      const fg = parseRgb(getComputedStyle(el as HTMLElement).color);
      const bgc = parseRgb(bg(el as HTMLElement));
      const l1 = luminance(fg[0], fg[1], fg[2]);
      const l2 = luminance(bgc[0], bgc[1], bgc[2]);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return ratio;
    });

    expect(mutedContrast).toBeGreaterThan(4.2);

    const teamCard = page.locator(".ff-teamCard").first();
    await expect(teamCard).toBeVisible();
    await expect(teamCard.locator(".ff-teamCard__media")).toBeVisible();
    await expect(teamCard.locator(".ff-teamCard__stats")).toBeVisible();
    await expect(teamCard.locator(".ff-teamStat")).toHaveCount(3);

    const sponsorWall = page.locator("[data-ff-sponsor-wall]");
    if (await sponsorWall.count()) {
      await expect(sponsorWall).toBeVisible();

      const sponsorWallStyle = await sponsorWall.evaluate((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        return {
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
        };
      });

      expect(parseFloat(sponsorWallStyle.borderRadius)).toBeGreaterThanOrEqual(12);
      expect(sponsorWallStyle.boxShadow).not.toBe("none");
    }

    const storyPoster = page.locator(".ff-storyPoster").first();
    await expect(storyPoster).toBeVisible();

    const storyPosterStyle = await storyPoster.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return {
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
      };
    });

    expect(parseFloat(storyPosterStyle.borderRadius)).toBeGreaterThanOrEqual(16);
    expect(storyPosterStyle.boxShadow).not.toBe("none");
  });

  test("mobile keeps the floating donate CTA intentional", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);

    const floating = page.locator("[data-ff-tabs]");
    await expect(floating).toBeVisible();

    const box = await floating.boundingBox();
    expect(box).not.toBeNull();

    const donateBtn = floating.locator("[data-ff-open-checkout]").first();
    await expect(donateBtn).toBeVisible();
  });
});
