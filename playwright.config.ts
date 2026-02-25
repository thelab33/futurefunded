// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: ".",
  testMatch: [
    "tests/**/*.spec.ts",
    "tests/**/*.spec.js",
    "tests/**/*.spec.mjs",
    "tools/**/*.spec.ts",
    "tools/**/*.spec.js",
    "tools/**/*.spec.mjs",
  ],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: [["line"]],

  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
