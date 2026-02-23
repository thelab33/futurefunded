#!/usr/bin/env node
/**
 * FutureFunded — Axe A11y Gate (Playwright)
 * File: tools/axe_gate.mjs
 *
 * Usage:
 *   node tools/axe_gate.mjs https://getfuturefunded.com/ --out artifacts/a11y --fail-under serious
 *
 * Exit codes:
 *   0 = pass
 *   1 = a11y gate failed
 *   2 = runtime/tooling failure (playwright missing, navigation error, etc.)
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseArgs(argv) {
  const args = {
    url: "",
    out: "artifacts/a11y",
    timeout: 20000,
    waitUntil: "networkidle",
    failUnder: "serious", // minor|moderate|serious|critical
    screenshot: false,
    debug: false,
  };

  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith("--out=")) args.out = a.split("=", 2)[1];
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--timeout="))
      args.timeout = Number(a.split("=", 2)[1]);
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a.startsWith("--wait-until=")) args.waitUntil = a.split("=", 2)[1];
    else if (a === "--wait-until") args.waitUntil = argv[++i];
    else if (a.startsWith("--fail-under=")) args.failUnder = a.split("=", 2)[1];
    else if (a === "--fail-under") args.failUnder = argv[++i];
    else if (a === "--screenshot") args.screenshot = true;
    else if (a === "--debug") args.debug = true;
    else positional.push(a);
  }

  if (positional.length) args.url = positional[0];
  return args;
}

// Order severity from least to most strict
const SEVERITY_ORDER = ["minor", "moderate", "serious", "critical"];

function severityAtLeast(impact, threshold) {
  const a = SEVERITY_ORDER.indexOf(String(impact || "").toLowerCase());
  const t = SEVERITY_ORDER.indexOf(String(threshold || "").toLowerCase());
  if (a === -1) return false;
  if (t === -1) return true; // unknown threshold => treat as strictest? keep simple: fail on any known.
  return a >= t;
}

function summarize(violations, failUnder) {
  const counts = { minor: 0, moderate: 0, serious: 0, critical: 0, unknown: 0 };
  for (const v of violations || []) {
    const imp = String(v.impact || "unknown").toLowerCase();
    if (counts[imp] === undefined) counts.unknown++;
    else counts[imp]++;
  }

  const failing = (violations || []).filter((v) =>
    severityAtLeast(v.impact, failUnder),
  );
  return { counts, failingCount: failing.length, failing };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error(
      "Usage: node tools/axe_gate.mjs <url> [--out artifacts/a11y] [--fail-under serious]",
    );
    process.exit(2);
  }

  ensureDir(args.out);
  const stamp = nowStamp();
  const jsonPath = path.join(args.out, `axe_${stamp}.json`);
  const summaryPath = path.join(args.out, `axe_${stamp}.summary.md`);
  const htmlPath = path.join(args.out, `axe_${stamp}.page.html`);
  const shotPath = path.join(args.out, `axe_${stamp}.png`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--mute-audio",
        "--hide-scrollbars",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    if (args.debug) console.log(`→ navigating: ${args.url}`);
    const resp = await page.goto(args.url, {
      waitUntil: args.waitUntil,
      timeout: args.timeout,
    });
    const status = resp ? resp.status() : null;

    // Save rendered HTML snapshot (useful for debugging a11y failures)
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, "utf-8");

    if (args.screenshot) {
      await page.screenshot({ path: shotPath, fullPage: true });
    }

    // Run Axe
    const builder = new AxeBuilder({ page });
    const results = await builder.analyze();

    const violations = results?.violations || [];
    const passes = results?.passes || [];
    const incomplete = results?.incomplete || [];
    const inapplicable = results?.inapplicable || [];

    const { counts, failingCount, failing } = summarize(
      violations,
      args.failUnder,
    );

    const payload = {
      ok: failingCount === 0,
      url: args.url,
      httpStatus: status,
      failUnder: args.failUnder,
      counts,
      totals: {
        violations: violations.length,
        passes: passes.length,
        incomplete: incomplete.length,
        inapplicable: inapplicable.length,
      },
      artifacts: {
        json: jsonPath,
        summary: summaryPath,
        pageHtml: htmlPath,
        screenshot: args.screenshot ? shotPath : null,
      },
      violations,
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf-8");

    // Write summary markdown (compact + actionable)
    const lines = [];
    lines.push(`# Axe A11y Summary`);
    lines.push("");
    lines.push(`- URL: ${args.url}`);
    lines.push(`- HTTP status: ${status ?? "unknown"}`);
    lines.push(`- Gate: fail if impact >= **${args.failUnder}**`);
    lines.push("");
    lines.push(`## Counts`);
    lines.push(`- critical: ${counts.critical}`);
    lines.push(`- serious: ${counts.serious}`);
    lines.push(`- moderate: ${counts.moderate}`);
    lines.push(`- minor: ${counts.minor}`);
    lines.push("");
    lines.push(`## Result`);
    lines.push(
      payload.ok ? `✅ PASS` : `❌ FAIL (failing violations: ${failingCount})`,
    );
    lines.push("");
    lines.push(`## Top failing violations (up to 10)`);
    for (const v of failing.slice(0, 10)) {
      const imp = String(v.impact || "unknown");
      lines.push(`- **${imp}**: ${v.id} — ${v.help}`);
      if (Array.isArray(v.nodes) && v.nodes.length) {
        const node = v.nodes[0];
        const target = Array.isArray(node.target)
          ? node.target.join(", ")
          : String(node.target || "");
        lines.push(`  - target: \`${target}\``);
      }
    }
    lines.push("");
    lines.push(`Artifacts:`);
    lines.push(`- JSON: ${jsonPath}`);
    lines.push(`- Page HTML: ${htmlPath}`);
    if (args.screenshot) lines.push(`- Screenshot: ${shotPath}`);

    fs.writeFileSync(summaryPath, lines.join("\n"), "utf-8");

    if (payload.ok) {
      console.log(`✅ axe: PASS → ${summaryPath}`);
      process.exit(0);
    } else {
      console.log(`❌ axe: FAIL → ${summaryPath}`);
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ axe: runtime failure");
    console.error(String(e?.stack || e));
    process.exit(2);
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
  }
}

main();
