// scripts/ensure-cache.cjs
const fs = require("fs");
const path = require("path");

const dirs = [
  path.resolve(process.cwd(), ".cache"),
  path.resolve(process.cwd(), ".playwright"),
  path.resolve(process.cwd(), ".playwright", "html-report"),
  path.resolve(process.cwd(), ".playwright", "test-results"),
];
for (const d of [".cache", ".playwright", ".playwright/html-report", ".playwright/test-results"]) {
  fs.mkdirSync(path.resolve(process.cwd(), d), { recursive: true });
}
for (const d of dirs) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {}
}
