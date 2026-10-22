import { test, expect } from "@playwright/test";

const slug = "connect-atx-elite";
const api = `/api/organizer/${slug}/dispatch`;

test("anonymous visitor cannot open private workspace", async ({ page }) => {
  await page.goto(`/organizer/${slug}`);
  await expect(
    page.getByRole("textbox", { name: /email/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft" })
  ).toHaveCount(0);
});

test("anonymous visitor cannot read private updates", async ({ request }) => {
  const response = await request.get(api);
  expect([401, 403]).toContain(response.status());
});

test("anonymous visitor cannot create an update", async ({ request }) => {
  const response = await request.post(api, {
    headers: {
      Origin: "http://127.0.0.1:3355",
    },
    data: {
      title: "Unauthorized browser test",
      summary: "This record must never be created.",
      category: "general",
    },
  });
  expect([401, 403]).toContain(response.status());
});

test("anonymous visitor cannot edit an update", async ({ request }) => {
  const response = await request.patch(`${api}/unauthorized-test-id`, {
    headers: {
      Origin: "http://127.0.0.1:3355",
    },
    data: {
      title: "Unauthorized edit",
      version: 1,
    },
  });
  expect([401, 403]).toContain(response.status());
});
