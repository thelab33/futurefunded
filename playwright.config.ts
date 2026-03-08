import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: isCI,
  timeout: 45_000,
  expect: {
    timeout: 12_000
  },
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 1,
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }]
  ],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1366, height: 900 },
    actionTimeout: 12_000,
    navigationTimeout: 25_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
    headless: true
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium"
      }
    }
  ]
});
