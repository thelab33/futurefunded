import { defineConfig, devices } from "@playwright/test";
import os from "node:os";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.BASE_URL ||
  "http://127.0.0.1:5000";

const isCI = Boolean(process.env.CI);
const isLocal = /127\.0\.0\.1|localhost/i.test(baseURL);

const grep = process.env.PW_GREP ? new RegExp(process.env.PW_GREP, "i") : undefined;
const grepInvert = process.env.PW_GREP_INVERT
  ? new RegExp(process.env.PW_GREP_INVERT, "i")
  : undefined;

const enableWebServer = process.env.PW_USE_WEBSERVER === "true";
const reuseExistingServer = !isCI;

const cpuCount = Math.max(1, os.cpus()?.length || 1);
const computedWorkers = isCI ? 2 : Math.min(6, Math.max(2, Math.floor(cpuCount * 0.5)));
const workers = Number.parseInt(process.env.PW_WORKERS || "", 10) || computedWorkers;

const mobileChromeEnabled = process.env.PW_ENABLE_MOBILE_CHROME === "true";
const mobileSafariEnabled = process.env.PW_ENABLE_MOBILE_SAFARI === "true";

const mobileProductionTests = [
  "**/qa/production/ff_launch_readiness.spec.ts",
  "**/qa/production/ff_launch_links_and_share.spec.ts",
  "**/qa/production/ff_mobile_launch_sanity.spec.ts",
  "**/qa/production/ff_content_trust.spec.ts"
];

const projects: any[] = [
  {
    name: "chromium",
    use: {
      browserName: "chromium"
    }
  }
];

if (mobileChromeEnabled) {
  projects.push({
    name: "mobile-chrome",
    testMatch: mobileProductionTests,
    use: {
      ...devices["Pixel 7"],
      baseURL,
      browserName: "chromium"
    }
  });
}

if (mobileSafariEnabled) {
  projects.push({
    name: "mobile-safari",
    testMatch: mobileProductionTests,
    use: {
      ...devices["iPhone 13"],
      baseURL,
      browserName: "webkit"
    }
  });
}

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  testIgnore: ["**/node_modules/**", "**/dist/**"],
  fullyParallel: false,
  forbidOnly: isCI,
  timeout: 45_000,
  globalTimeout: isCI ? 45 * 60_000 : undefined,
  retries: isCI ? 2 : 0,
  workers,
  grep,
  grepInvert,
  maxFailures: isCI ? 10 : undefined,
  reportSlowTests: { max: 12, threshold: 20_000 },
  outputDir: "test-results/artifacts",
  preserveOutput: "failures-only",

  expect: {
    timeout: 12_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02
    }
  },

  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/playwright-report.json" }]
  ],

  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1366, height: 900 },
    actionTimeout: 12_000,
    navigationTimeout: 25_000,
    trace: isCI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
    headless: process.env.PW_HEADFUL === "true" ? false : true,
    locale: "en-US",
    timezoneId: "America/Chicago"
  },

  projects,

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
