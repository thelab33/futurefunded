#!/usr/bin/env node
import { spawn } from "node:child_process";

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32", // friendlier on Windows/WSL setups
      ...opts,
    });
    p.on("close", (code) => resolve(code ?? 1));
  });

const section = (label) => {
  console.log("");
  console.log("=".repeat(78));
  console.log(label);
  console.log("=".repeat(78));
};

const main = async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
  const project = process.env.PW_PROJECT || "chromium";

  console.log("🧪 FutureFunded Runtime Audit");
  console.log(`• BASE_URL: ${baseURL}`);
  console.log(`• PROJECT:  ${project}`);

  // 1) DOM scan (writes artifacts/ff_dom_report_v2.json)
  section("1) DOM Scanner");
  let code = await run("python", ["scripts/ff_scan_dom_v2.py"]);
  if (code !== 0) return process.exit(code);

  // 2) Contract snapshot test
  section("2) Runtime Contract Snapshot");
  code = await run("npx", [
    "playwright",
    "test",
    "--project=" + project,
    "tests/ff_runtime_contract.spec.ts",
  ], {
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
  });
  if (code !== 0) return process.exit(code);

  // 3) Your existing overlay + probe gates (adjust filenames if needed)
  section("3) Overlay + Focus Probe + Smoke Gates");
  code = await run("npx", [
    "playwright",
    "test",
    "--project=" + project,
    "tests/ff_prod_smoke_contract.spec.ts",
    "tests/ff_uiux_pro_gate.spec.ts",
  ], {
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
  });
  if (code !== 0) return process.exit(code);

  section("✅ PASS — Runtime audit complete");
  console.log("All runtime contracts satisfied. Ship it. 🚀");
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Runtime audit crashed:", err);
  process.exit(1);
});
