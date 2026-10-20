import { test, expect } from "@playwright/test";

const slug = "connect-atx-elite";
const api = `/api/organizer/${slug}/dispatch`;

test.use({
  storageState: "playwright/.auth/organizer.json",
});

test("sign-out revokes the organizer session", async ({ page }) => {
  test.skip(
    process.env.FF_TEST_REVOKE_SESSION !== "YES",
    "Explicit session-revocation approval required."
  );

  await page.goto(`/organizer/${slug}`);

  const before = await page.context().request.get(api);
  expect(before.status()).toBe(200);

  const signOut = page.getByRole("button", {
    name: "Sign out",
    exact: true,
  });

  await expect(signOut).toBeVisible();
  await expect(signOut).toBeEnabled();

  await signOut.click();

  await expect(
    page.getByRole("textbox", { name: /email/i })
  ).toBeVisible({ timeout: 15000 });

  await expect.poll(async () => {
    const response = await page.context().request.get(api);
    return response.status();
  }).toBe(403);

  await page.reload();

  await expect(
    page.getByRole("textbox", { name: /email/i })
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Save draft" })
  ).toHaveCount(0);
});
