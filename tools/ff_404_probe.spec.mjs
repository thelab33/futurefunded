import { test, expect } from "@playwright/test";

test("404 probe: page should load with zero missing assets", async ({ page }) => {
  const base = process.env.FF_BASE_URL || "http://127.0.0.1:5000/";
  const missing = [];
  const consoleErrs = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrs.push(msg.text());
  });

  page.on("response", (resp) => {
    const status = resp.status();
    if (status === 404) {
      const url = resp.url();
      // keep it focused on your own server
      if (url.startsWith("http://127.0.0.1:5000") || url.startsWith("http://localhost:5000")) {
        missing.push(url);
      }
    }
  });

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800); // give late assets a moment

  const uniq = [...new Set(missing)].sort();

  if (uniq.length) {
    // Print the missing list in a clean block
    console.log("\n==== 404 ASSETS (MISSING) ====");
    for (const u of uniq) console.log("404:", u);
    console.log("==== END 404 LIST ====\n");
  }

  if (consoleErrs.length) {
    console.log("\n==== CONSOLE ERRORS ====");
    for (const e of consoleErrs) console.log("ERR:", e);
    console.log("==== END CONSOLE ERRORS ====\n");
  }

  expect(uniq, "No missing assets (404) should occur on home load.").toEqual([]);
});
