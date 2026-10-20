import { test, expect } from "@playwright/test";
import { chmodSync } from "node:fs";

const slug = "connect-atx-elite";
const stateFile = "playwright/.auth/organizer.json";

test("capture verified organizer session", async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto(`/organizer/${slug}`);

  console.log(
    "\nSign in using your authorized Gmail account.\n" +
    "Open the magic link in THIS Playwright browser.\n" +
    "You have five minutes to complete sign-in.\n"
  );

  let authorized = false;
  const deadline = Date.now() + 270_000;

  while (Date.now() < deadline) {
    const response = await page.request.get(
      `/api/organizer/${slug}/dispatch`,
      { failOnStatusCode: false }
    );

    if (response.status() === 200) {
      authorized = true;
      break;
    }

    // The login link may have opened another browser tab.
    for (const tab of page.context().pages()) {
      if (tab !== page && tab.url().includes("/organizer/")) {
        await page.goto(`/organizer/${slug}`);
        break;
      }
    }

    await page.waitForTimeout(2000);
  }

  expect(authorized, "Verified organizer session required").toBe(true);

  await page.context().storageState({ path: stateFile });
  chmodSync(stateFile, 0o600);

  console.log("PASS: Authorized session captured securely.");
});
