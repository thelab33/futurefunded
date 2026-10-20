import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

const base = "http://127.0.0.1:3355";
const slug = "connect-atx-elite";
const api = `/api/organizer/${slug}/dispatch`;

test.use({
  storageState: "playwright/.auth/organizer.json",
});

test("complete authenticated development draft lifecycle", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  loadEnvConfig(process.cwd(), true);

  // Refuse to run against anything except the approved development DB.
  const env = process.env;
  const connection = new URL(
    env.FF_M3_DISPATCH_DATABASE_URL || ""
  );

  expect(env.FF_DEVELOPMENT_STUDIO).toBe("1");
  expect(env.NODE_ENV).not.toBe("production");
  expect(env.BETTER_AUTH_URL).toBe(base);
  expect(connection.hostname).toBe(
    "ep-shy-mode-atp5qqux.c-9.us-east-1.aws.neon.tech"
  );
  expect(connection.pathname).toBe("/neondb");
  expect(connection.searchParams.get("sslmode"))
    .toBe("verify-full");

  // The public campaign connection must remain switched off.
  await page.goto(`/organizer/${slug}`);

  const publicStatus = page
    .getByLabel("Current season communications")
    .getByText("Public connection off", { exact: true });

  await expect(publicStatus).toHaveCount(1);
  await expect(publicStatus).toBeVisible();

  const headers = { Origin: base };

  async function read() {
    const response = await request.get(api);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.role).toBe("owner");
    return body.entries as Array<{
      id: string;
      title: string;
      summary: string;
      category: string;
      status: string;
      version: number;
    }>;
  }

  const original = await read();

  // Use a category already accepted by this deployment.
  const category = original[0]?.category;
  expect(typeof category).toBe("string");
  expect(category?.length).toBeGreaterThan(0);

  const title = `FutureFunded CLI check ${randomUUID()}`;
  const summary =
    "Synthetic development update verifying secure organizer draft persistence.";

  console.log("=== Create private draft ===");

  const created = await request.post(api, {
    headers,
    data: { title, summary, category },
  });

  expect(created.status()).toBe(201);

  const createdBody = await created.json();
  expect(typeof createdBody.id).toBe("string");

  const id = createdBody.id as string;
  const recordURL = `${api}/${encodeURIComponent(id)}`;

  function find(entries: Awaited<ReturnType<typeof read>>) {
    return entries.find(item => item.id === id);
  }

  let item = find(await read());
  expect(item?.title).toBe(title);
  expect(item?.summary).toBe(summary);
  expect(item?.status).toBe("draft");

  console.log("PASS: Draft persisted.");

  await page.reload();

  item = find(await read());
  expect(item?.status).toBe("draft");

  console.log("PASS: Draft survives reload.");

  const initialVersion = item!.version;
  const revisedSummary =
    "Synthetic development update edited by the FutureFunded CLI workflow.";

  console.log("=== Edit draft ===");

  const edited = await request.patch(recordURL, {
    headers,
    data: {
      title,
      summary: revisedSummary,
      category,
      version: initialVersion,
    },
  });

  expect(edited.status()).toBe(200);

  item = find(await read());
  expect(item?.summary).toBe(revisedSummary);
  expect(item!.version).toBeGreaterThan(initialVersion);

  console.log("PASS: Draft edited and version advanced.");

  console.log("=== Reject stale edit ===");

  const stale = await request.patch(recordURL, {
    headers,
    data: {
      title,
      summary: "This stale change must not be saved.",
      category,
      version: initialVersion,
    },
  });

  expect(stale.status()).toBe(409);

  item = find(await read());
  expect(item?.summary).toBe(revisedSummary);

  console.log("PASS: Stale edit rejected.");

  console.log("=== Move into staging ===");

  const staged = await request.post(recordURL, {
    headers,
    data: { action: "publish", version: item!.version },
  });

  expect(staged.status()).toBe(200);

  item = find(await read());
  expect(item?.status).toBe("published");

  console.log("PASS: Staging state persisted.");

  console.log("=== Return to private draft ===");

  const returned = await request.post(recordURL, {
    headers,
    data: { action: "unpublish", version: item!.version },
  });

  expect(returned.status()).toBe(200);

  item = find(await read());
  expect(item?.status).toBe("draft");

  console.log("PASS: Update returned to private draft.");
  console.log("PASS: Complete organizer lifecycle.");
  console.log("Synthetic record retained for development review.");
});
