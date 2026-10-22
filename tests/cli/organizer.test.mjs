import test from "node:test";
import assert from "node:assert/strict";

const base = "http://127.0.0.1:3355";

test("Better Auth health endpoint responds", async () => {
  const response = await fetch(`${base}/api/auth/ok`, {
    signal: AbortSignal.timeout(10000),
  });

  assert.equal(response.status, 200);
});

test("Organizer Studio route renders", async () => {
  const response = await fetch(
    `${base}/organizer/connect-atx-elite`,
    { signal: AbortSignal.timeout(10000), redirect: "manual" }
  );

  assert.ok(
    [200, 302, 303, 307, 308].includes(response.status),
    `Unexpected Organizer Studio status: ${response.status}`
  );
});
