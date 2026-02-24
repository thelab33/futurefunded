// scripts/ensure-cache.js
// Ensures local cache/report directories exist for audits (Lighthouse, etc.)
// Safe to run repeatedly.

const fs = require("fs");
const path = require("path");

const dirs = [
  path.resolve(process.cwd(), ".cache"),
  path.resolve(process.cwd(), ".playwright"),
  path.resolve(process.cwd(), ".playwright", "html-report"),
  path.resolve(process.cwd(), ".playwright", "test-results"),
];

for (const d of dirs) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (e) {
    // best-effort only
  }
}

process.exit(0);
