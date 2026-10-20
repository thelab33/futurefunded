import test from "node:test";
import assert from "node:assert/strict";

const base =
  "http://127.0.0.1:3355/api/organizer/connect-atx-elite/dispatch";

test("Anonymous user cannot read organizer updates", async () => {
  const response = await fetch(base, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });

  assert.ok(
    [401, 403].includes(response.status),
    `Private dispatch unexpectedly returned HTTP ${response.status}`
  );
});
