import { chromium } from "@playwright/test";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mkdir, chmod, rename, rm } from "node:fs/promises";
import path from "node:path";

const base = "http://127.0.0.1:3355";
const slug = "connect-atx-elite";
const endpoint = `/api/organizer/${slug}/dispatch`;
const destination = path.resolve("playwright/.auth/organizer.json");
const temporary = destination + ".pending";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ baseURL: base });
const terminal = createInterface({ input: stdin, output: stdout });

try {
  const page = await context.newPage();
  await page.goto(`/organizer/${slug}`);

  console.log("\nSign in with your Gmail account.");
  console.log("Open the magic link in THIS Chromium window.");
  console.log("Do not close Chromium.");
  await terminal.question(
    "When the authenticated dashboard appears, press Enter: "
  );

  const cookies = await context.cookies(base);
  console.log("Browser cookies present:", cookies.length > 0);

  if (!cookies.some(c => c.name.includes("session_token"))) {
    throw new Error(
      "No Better Auth session cookie in this Playwright browser. " +
      "Do not save this session."
    );
  }

  const response = await context.request.get(endpoint);
  if (response.status() !== 200) {
    throw new Error(
      `Browser session is not authorized: HTTP ${response.status()}`
    );
  }

  await mkdir(path.dirname(destination), {
    recursive: true,
    mode: 0o700
  });

  await rm(temporary, { force: true });
  await context.storageState({ path: temporary });
  await chmod(temporary, 0o600);

  // The saved session must work independently of this browser.
  const restored = await browser.newContext({
    baseURL: base,
    storageState: temporary
  });

  try {
    const restoredCookies = await restored.cookies(base);
    if (!restoredCookies.some(c => c.name.includes("session_token"))) {
      throw new Error("Saved session contains no session cookie.");
    }

    const check = await restored.request.get(endpoint);
    console.log("Restored session HTTP:", check.status());

    if (check.status() !== 200) {
      throw new Error("Saved authentication state is not portable.");
    }
  } finally {
    await restored.close();
  }

  await rename(temporary, destination);
  console.log("PASS: Portable authenticated session verified and saved.");
} catch (error) {
  console.error("STOP:", error.message);
  process.exitCode = 1;
} finally {
  await rm(temporary, { force: true });
  terminal.close();
  await context.close();
  await browser.close();
}
