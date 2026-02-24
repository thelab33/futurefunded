import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import path from "path";
import os from "os";

/**
 * E2E env loading:
 * - E2E_ENV_FILE can point to a specific env file (e.g. .env.e2e)
 * - default falls back to .env.e2e
 */
dotenv.config({
  path: path.resolve(process.cwd(), process.env.E2E_ENV_FILE || ".env.e2e"),
});

// Configuration knobs (env-friendly)
const baseURL = process.env.E2E_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5000";
const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const defaultTestTimeout = Number(process.env.E2E_TEST_TIMEOUT || 45_000);
const defaultExpectTimeout = Number(process.env.E2E_EXPECT_TIMEOUT || 10_000);

// Workers: allow Playwright to decide locally, restrict in CI for determinism
const workers = isCI ? Math.max(1, Math.min(2, Math.floor(os.cpus().length / 2))) : undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,

  // Safety & CI behavior
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers,

  // Timeouts
  timeout: defaultTestTimeout,
  expect: { timeout: defaultExpectTimeout },

  // Reporters - keep list in console and a consumable HTML report
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],

  use: {
    baseURL,
    // actionTimeout controls clicks/type waits; navigationTimeout controls page.goto
    actionTimeout: Number(process.env.E2E_ACTION_TIMEOUT || 10_000),
    navigationTimeout: Number(process.env.E2E_NAV_TIMEOUT || 30_000),

    // Artifacts
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Browser launch options
    headless: isCI, // headful locally, headless in CI
    // slowMo: process.env.E2E_SLOWMO ? Number(process.env.E2E_SLOWMO) : 0,
  },

  /***************************************************************************
   * Web server: optional. Set E2E_NO_WEB_SERVER=1 to skip starting a server.
   * You can override the command with E2E_WEB_SERVER_CMD.
   *
   * Notes:
   * - reuseExistingServer: true locally (helps dev), false in CI for determinism
   ***************************************************************************/
  webServer: process.env.E2E_NO_WEB_SERVER
    ? undefined
    : {
        command:
          process.env.E2E_WEB_SERVER_CMD ||
          // Prefer a simple run script if you have one; fallback to flask run
          // Update the default if you use a different dev entrypoint.
          "python ./run.py --env test --no-reload --port 5000",
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: Number(process.env.E2E_WEB_SERVER_TIMEOUT || 60_000),
        env: {
          ...process.env,
          FF_ENV: process.env.FF_ENV || "testing",
          FLASK_ENV: process.env.FLASK_ENV || "testing",
          // Force deterministic behavior during E2E
          PYTHONUNBUFFERED: "1",
        },
      },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // optional overrides:
        viewport: { width: 1280, height: 800 },
      },
    },

    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 800 },
      },
    },

    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],

  // Global test match / grep patterns can be added here if you like:
  // grep: process.env.E2E_GREP || undefined,
});
