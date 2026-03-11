import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
const isCI = !!process.env.CI;
const isLocal = /127\.0\.0\.1|localhost/i.test(baseURL);

const grep = process.env.PW_GREP ? new RegExp(process.env.PW_GREP, "i") : undefined;
const grepInvert = process.env.PW_GREP_INVERT
  ? new RegExp(process.env.PW_GREP_INVERT, "i")
  : undefined;

const reuseExistingServer = !isCI;
const enableWebServer = process.env.PW_USE_WEBSERVER === "true";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  testIgnore: ["**/node_modules/**", "**/dist/**"],
  fullyParallel: false,
  forbidOnly: isCI,
  timeout: 45_000,
  globalTimeout: isCI ? 45 * 60_000 : undefined,
  expect: {
    timeout: 12_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02
    }
  },
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 1,
  grep,
  grepInvert,
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/playwright-report.json" }]
  ],
  outputDir: "test-results/artifacts",
  maxFailures: isCI ? 10 : undefined,

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
    headless: true,
    locale: "en-US",
    timezoneId: "America/Chicago"
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium"
      }
    },
    {
      name: "mobile-chrome",
      testMatch: [
        "**/qa/production/ff_launch_readiness.spec.ts",
        "**/qa/production/ff_launch_links_and_share.spec.ts",
        "**/qa/production/ff_mobile_launch_sanity.spec.ts",
        "**/qa/production/ff_content_trust.spec.ts"
      ],
      use: {
        ...devices["Pixel 7"],
        baseURL,
        browserName: "chromium"
      }
    },
    {
      name: "mobile-safari",
      testMatch: [
        "**/qa/production/ff_launch_readiness.spec.ts",
        "**/qa/production/ff_launch_links_and_share.spec.ts",
        "**/qa/production/ff_mobile_launch_sanity.spec.ts",
        "**/qa/production/ff_content_trust.spec.ts"
      ],
      use: {
        ...devices["iPhone 13"],
        baseURL,
        browserName: "webkit"
      }
    }
  ],

  ...(enableWebServer && isLocal
    ? {
        webServer: {
          command: process.env.PW_WEBSERVER_COMMAND || "python run.py",
          url: baseURL,
          timeout: 120_000,
          reuseExistingServer,
          stdout: "ignore",
          stderr: "pipe"
        }
      }
    : {})
});
