import { test, expect } from "@playwright/test";

test.use({
  storageState: "playwright/.auth/organizer.json",
});

test("authorized organizer can read development updates", async ({ request }) => {
  const response = await request.get(
    "/api/organizer/connect-atx-elite/dispatch"
  );

  expect(response.status()).toBe(200);

  const data = await response.json();

  expect(Array.isArray(data.entries)).toBe(true);
  expect(["owner", "publisher", "editor"]).toContain(data.role);
});
