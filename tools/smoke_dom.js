#!/usr/bin/env node
// Minimal smoke_dom — hits the homepage and ensures HTTP 200 (Node 20+ fetch)
// Deterministic: timeout + clear exit codes.

const raw = process.env.SMOKE_URL || "http://127.0.0.1:5000/"\;
const url = String(raw).trim();

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 8000);

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { ac, done: () => clearTimeout(t) };
}

(async () => {
  try {
    if (!globalThis.fetch) {
      console.error("DOM smoke error: global fetch() not available. Use Node 18+ (recommended Node 20).");
      process.exit(2);
    }

    const { ac, done } = withTimeout(TIMEOUT_MS);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: { "User-Agent": "futurefunded-smoke/1.0" },
    }).finally(done);

    if (res && res.status === 200) {
      console.log("DOM smoke test passed");
      process.exit(0);
    }

    const body = res ? await res.text().catch(() => "") : "";
    console.error("DOM smoke failed:", {
      url,
      status: res && res.status,
      statusText: res && res.statusText,
      bodyPreview: body ? body.slice(0, 180) : "",
    });
    process.exit(2);
  } catch (e) {
    const msg = e && e.name === "AbortError"
      ? `Request timed out after ${TIMEOUT_MS}ms`
      : (e && e.message ? e.message : String(e));
    console.error("DOM smoke error:", msg);
    process.exit(2);
  }
})();
