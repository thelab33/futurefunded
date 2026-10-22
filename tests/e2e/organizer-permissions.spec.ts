import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
const state = "playwright/.auth/organizer.json";
// Fail when owner acceptance is unavailable; do not report a skipped suite as success.
if (!existsSync(state)) throw new Error("Owner session missing. Run node tests/cli/capture-organizer.mjs once.");
test.use({ storageState: state, trace: "off", screenshot: "off", video: "off" });
const endpoint = "/api/organizer/connect-atx-elite/members";
const owner = {label:"You",email:"owner@example.invalid",role:"owner",isCurrentUser:true,access:"active",manageable:true};
const target = {label:"Target",email:"target@example.invalid",role:"editor",isCurrentUser:false,access:"active",manageable:true};
test.beforeEach(async ({request}) => {
  const response = await request.get(endpoint);
  expect(response.status(), "Owner session revoked or unavailable; capture it once before acceptance.").toBe(200);
});
test("real owner directory resolves the current account", async ({request}) => {
  const response = await request.get(endpoint);
  const directory = await response.json();
  expect(directory.currentRole).toBe("owner");
  expect(directory.members.filter((m: {isCurrentUser:boolean}) => m.isCurrentUser)).toHaveLength(1);
  expect(directory.members.find((m: {isCurrentUser:boolean}) => m.isCurrentUser)).toMatchObject({manageable:true});
});
test("keyboard confirmation cancels safely, confirms role change, then removes", async ({page}) => {
  let members = [owner,target], writes = 0;
  // These intercepts test UI interactions; they never write a real membership.
  await page.route(`**${endpoint}`, route => route.fulfill({json:{currentRole:"owner",members}}));
  await page.route(`**${endpoint}/manage`, async route => {
    writes++;
    const input = route.request().postDataJSON();
    members = input.action === "remove" ? [owner] : [owner,{...target,role:input.role}];
    await route.fulfill({json:{success:true,action:input.action,role:input.role ?? null}});
  });
  await page.goto("/organizer/connect-atx-elite");
  await page.getByRole("combobox",{name:"Role for target@example.invalid",exact:true}).selectOption("publisher");
  const change = page.getByRole("button",{name:"Change role for target@example.invalid",exact:true});
  await change.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Confirm change",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group",{name:"Confirm permission change"})).toHaveCount(0);
  await expect(change).toBeFocused(); expect(writes).toBe(0);
  await change.press("Enter"); await page.getByRole("button",{name:"Confirm change",exact:true}).press("Enter");
  await expect(page.getByRole("combobox",{name:"Role for target@example.invalid",exact:true})).toHaveValue("publisher");
  await page.getByRole("button",{name:"Remove access for target@example.invalid",exact:true}).click();
  await page.getByRole("button",{name:"Confirm change",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Role for target@example.invalid",exact:true})).toHaveCount(0);
  expect(writes).toBe(2);
});
test("grant, conflict refresh, and failure feedback", async ({page}) => {
  let reads = 0, writes = 0;
  await page.route(`**${endpoint}`, route => {reads++; return route.fulfill({json:{currentRole:"owner",members:[owner]}});});
  await page.route(`**${endpoint}/manage`, route => {
    writes++;
    return route.fulfill(writes === 1 ? {json:{success:true}} : writes === 2
      ? {status:409,json:{error:"Organizer already has access."}}
      : {status:503,json:{error:"Permission change could not be completed."}});
  });
  await page.goto("/organizer/connect-atx-elite");
  const email = page.getByLabel("Existing verified account email",{exact:true});
  const add = page.getByRole("button",{name:"Add verified organizer",exact:true});
  await email.fill("target@example.invalid"); await add.click();
  await expect(page.getByRole("status").filter({hasText:"Organizer access updated"})).toBeVisible();
  await expect(email).toHaveValue("");
  await email.fill("target@example.invalid"); await add.click();
  await expect(page.getByRole("status").filter({hasText:"Organizer already has access"})).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThanOrEqual(3);
  await add.click();
  await expect(page.getByRole("status").filter({hasText:"Permission change could not be completed"})).toBeVisible();
});
test("self-demotion removes owner controls", async ({page}) => {
  await page.route(`**${endpoint}`, route => route.fulfill({json:{currentRole:"owner",members:[owner]}}));
  await page.route(`**${endpoint}/manage`, route => route.fulfill({json:{success:true,action:"change_role",role:"editor"}}));
  await page.goto("/organizer/connect-atx-elite");
  await page.getByRole("combobox",{name:"Role for owner@example.invalid",exact:true}).selectOption("editor");
  await page.getByRole("button",{name:"Change role for owner@example.invalid",exact:true}).click();
  await page.getByRole("button",{name:"Confirm change",exact:true}).click();
  await expect(page.getByRole("button",{name:"Add verified organizer",exact:true})).toHaveCount(0);
  await expect(page.getByRole("status").filter({hasText:"Your owner access changed"})).toBeVisible();
});
test("loading, directory error and retry", async ({page}) => {
  let failDirectory = true;
  let release: () => void = () => {};
  const loadingGate = new Promise<void>(resolve => {release = resolve;});
  await page.route(`**${endpoint}`, async route => {
    const failThisRequest = failDirectory;
    await loadingGate;
    if (route.request().failure()) return;
    if (failThisRequest) {
      await route.fulfill({status:503,json:{error:"Unavailable"}});
    } else {
      await route.fulfill({json:{currentRole:"owner",members:[owner]}});
    }
  });
  try {
    await page.goto("/organizer/connect-atx-elite");
    await expect(page.getByRole("status").filter({hasText:"Loading organizers"})).toBeVisible();
    release();
    await expect(page.getByRole("alert").filter({hasText:"Directory unavailable"})).toBeVisible();
    failDirectory = false;
    await page.getByRole("button",{name:"Retry",exact:true}).click();
    await expect(page.getByRole("combobox",{name:"Role for owner@example.invalid",exact:true})).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({behavior:"wait"});
  }
});
