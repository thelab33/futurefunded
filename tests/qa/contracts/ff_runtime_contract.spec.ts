import { test, expect } from "@playwright/test";

type OverlayEntry = { exists?: boolean } | boolean | null | undefined;

type ContractSnapshot = {
  ok?: boolean;
  webdriver?: boolean;
  missingRequired?: string[];
  focusProbe?: {
    exists?: boolean;
    tabbable?: boolean;
  } | boolean | null;
  overlays?: Record<string, OverlayEntry>;
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function overlayExists(snap: ContractSnapshot | null, ...keys: string[]): boolean {
  const overlays = snap?.overlays || {};

  return keys.some((key) => {
    const value = overlays[key];

    if (value && typeof value === "object") {
      return !!value.exists;
    }

    return !!value;
  });
}

function focusProbeExists(snap: ContractSnapshot | null): boolean {
  const probe = snap?.focusProbe;

  if (probe && typeof probe === "object") {
    return !!probe.exists;
  }

  return !!probe;
}

function focusProbeTabbable(snap: ContractSnapshot | null): boolean {
  const probe = snap?.focusProbe;

  if (probe && typeof probe === "object") {
    return !!probe.tabbable;
  }

  return !!probe;
}

test("FutureFunded • Runtime Contract Snapshot (required hooks + overlays + probe)", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });

  await page.waitForFunction(
    () => Boolean((window as any).FF_APP?.api?.contractSnapshot),
    undefined,
    { timeout: 10_000 }
  );

  const debug = await page.evaluate(() => {
    const w = window as any;

    let snap = null;
    try {
      snap = w.FF_APP?.api?.contractSnapshot?.() ?? null;
    } catch {
      snap = null;
    }

    return {
      snap,
      hasFFApp: !!w.FF_APP,
      hasApi: !!w.FF_APP?.api,
      hasContractSnapshot: typeof w.FF_APP?.api?.contractSnapshot === "function",
      dom: {
        focusProbe: !!document.getElementById("ff_focus_probe"),
        checkout: !!document.getElementById("checkout"),
        sponsorInterest: !!document.getElementById("sponsor-interest"),
        pressVideo: !!document.getElementById("press-video"),
        terms: !!document.getElementById("terms"),
        privacy: !!document.getElementById("privacy")
      },
      html: document.documentElement?.outerHTML?.slice(0, 4096) ?? ""
    };
  });

  const snap = (debug.snap ?? null) as ContractSnapshot | null;

  if (!snap) {
    console.error(
      [
        "FF_APP.api.contractSnapshot() returned null",
        `hasFFApp: ${debug.hasFFApp}`,
        `hasApi: ${debug.hasApi}`,
        `hasContractSnapshot: ${debug.hasContractSnapshot}`,
        `DOM presence: ${pretty(debug.dom)}`,
        `HTML (first 4k chars):\n${debug.html}`
      ].join("\n")
    );
  }

  expect(
    snap,
    [
      "FF_APP.api.contractSnapshot() missing",
      `hasFFApp: ${debug.hasFFApp}`,
      `hasApi: ${debug.hasApi}`,
      `hasContractSnapshot: ${debug.hasContractSnapshot}`,
      `DOM presence: ${pretty(debug.dom)}`
    ].join("\n")
  ).toBeTruthy();

  expect(
    !!snap?.ok,
    [
      `Missing required hooks: ${pretty(snap?.missingRequired || [])}`,
      `SNAPSHOT: ${pretty(snap || {})}`
    ].join("\n")
  ).toBeTruthy();

  expect(
    focusProbeExists(snap),
    [
      "Focus probe missing (ff_focus_probe)",
      `focusProbe: ${pretty(snap?.focusProbe)}`,
      `DOM focusProbe: ${debug.dom.focusProbe}`
    ].join("\n")
  ).toBeTruthy();

  expect(
    focusProbeTabbable(snap),
    [
      "Focus probe not tabbable — check CSS/ordering",
      `focusProbe: ${pretty(snap?.focusProbe)}`
    ].join("\n")
  ).toBeTruthy();

  expect(
    !!snap?.webdriver,
    `Runtime did not detect webdriver mode (navigator.webdriver)\nSNAPSHOT: ${pretty(snap || {})}`
  ).toBeTruthy();

  const requiredOverlays = [
    { label: "checkout", keys: ["checkout"] },
    { label: "sponsor-interest", keys: ["sponsor-interest", "sponsor"] },
    { label: "press-video", keys: ["press-video", "video"] },
    { label: "terms", keys: ["terms"] },
    { label: "privacy", keys: ["privacy"] }
  ];

  for (const overlay of requiredOverlays) {
    expect(
      overlayExists(snap, ...overlay.keys),
      [
        `Overlay #${overlay.label} missing`,
        `Accepted keys: ${overlay.keys.join(", ")}`,
        `Overlays snapshot: ${pretty(snap?.overlays || {})}`,
        `DOM presence: ${pretty(debug.dom)}`
      ].join("\n")
    ).toBeTruthy();
  }
});
