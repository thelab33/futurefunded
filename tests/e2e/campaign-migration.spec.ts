import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import path from "node:path";
const route="/c/connect-atx-elite";
for(const width of [1440,1024,390]) {
 test(`campaign geometry and real images at ${width}px`,async ({page}) => {
  await page.setViewportSize({width,height:1000});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const response=await page.goto(route);expect(response?.status()).toBe(200);
  await expect(page.locator("#campaign-title")).toHaveText("Fund the season. Back every athlete.");
  await expect(page.locator('[data-campaign-shell]')).toBeVisible();
  await expect(page.locator('[data-orbit-exhibit]')).toHaveCount(6);
  // Load offscreen images for this full-page review without changing application loading.
  await page.locator("img").evaluateAll(images=>images.forEach(image=>{(image as HTMLImageElement).loading="eager";}));
  await expect.poll(()=>page.evaluate(()=>document.fonts.status),{timeout:10000,message:"Campaign fonts should finish loading"}).toBe("loaded");
  await expect.poll(()=>page.locator("img").evaluateAll(images=>images
    .filter(image=>!(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth===0)
    .map(image=>(image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src)),
    {timeout:10000,message:"Campaign images should load; unresolved URLs are listed below"}).toEqual([]);
  const geometry=await page.evaluate(()=>{
    const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,
      story:box('[data-orbit-region="story"]'),giving:box('[data-orbit-region="giving"]'),needs:box('[data-orbit-region="program"]')};
  });
  expect(geometry.overflow).toBe(false);
  if(width===1440){expect(Math.abs(geometry.story.y-geometry.giving.y)).toBeLessThan(2);expect(Math.abs(geometry.needs.y-geometry.giving.y)).toBeLessThan(2);expect(geometry.story.x).toBeLessThan(geometry.giving.x);expect(geometry.giving.x).toBeLessThan(geometry.needs.x);}
  if(width===390)expect(geometry.giving.y).toBeLessThan(geometry.story.y);
  expect(errors).toEqual([]);
  if(process.env.FF_CAMPAIGN_REVIEW_DIR){mkdirSync(process.env.FF_CAMPAIGN_REVIEW_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FF_CAMPAIGN_REVIEW_DIR,`campaign-${width}.png`),fullPage:true});}
 });
}
test("six chapters open and close with keyboard focus restored",async ({page})=>{
 await page.goto(route);const dialog=page.locator("#campaign-detail-dialog");
 for(const id of ["story","plan","squads","partners","share","support"]){
  const trigger=page.locator(`[data-orbit-exhibit="${id}"]`);
  await trigger.scrollIntoViewIfNeeded();await trigger.focus();await trigger.press("Enter");
  await expect(dialog).toBeVisible();await expect(dialog.locator("[data-dialog-title]")).toBeFocused();
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 }
});
test("needs disclosures and custom giving validation work without checkout",async ({page})=>{
 const donations:string[]=[];page.on("request",request=>{if(request.url().includes("/api/donations/"))donations.push(request.url());});
 await page.goto(route);
 const need=page.locator('[data-season-priority="practice"] summary');await need.click();await expect(page.locator('[data-season-priority="practice"]')).toHaveAttribute("open","");
 const custom=page.locator('input[inputmode="decimal"]').first();await custom.fill("0");
 await page.getByRole("button",{name:"Support the season",exact:true}).first().click();
 await expect(custom).toBeFocused();await expect(page.locator("#campaign-detail-dialog")).not.toBeVisible();
 await custom.fill("42.50");await page.getByRole("button",{name:"Support the season",exact:true}).first().click();
 const dialog=page.locator("#campaign-detail-dialog");await expect(dialog).toBeVisible();await expect(dialog.getByText("$42.50",{exact:true})).toBeVisible();
 await expect(dialog.locator('input[name="donorEmail"]')).toHaveCount(0);
 await expect(dialog.getByText("Payments are not being accepted.",{exact:false})).toBeVisible();expect(donations).toEqual([]);
});
test("newsletter opens only on request and stays pending despite authentication email setup",async ({page})=>{
 const submissions:string[]=[];page.on("request",request=>{if(request.url().includes("/api/newsletter"))submissions.push(request.url());});
 await page.goto(route);const dialog=page.locator("#newsletter-updates-dialog");await expect(dialog).not.toBeVisible();
 const trigger=page.getByRole("button",{name:"Get season updates",exact:false});await trigger.click();await expect(dialog).toBeVisible();
 await expect(dialog).toHaveAttribute("data-newsletter-configured","false");await expect(dialog.getByText("Season updates are coming.",{exact:true})).toBeVisible();
 await expect(dialog.locator('input[type="email"]')).toHaveCount(0);await page.keyboard.press("Escape");await expect(trigger).toBeFocused();expect(submissions).toEqual([]);
});
test("share link and QR use the current campaign without query parameters",async ({page})=>{
 await page.goto(route+"?source=preview#giving");const input=page.locator("#campaign-share-rail-link");await expect(input).toHaveValue(/\/c\/connect-atx-elite$/);
 await expect(page.locator("svg[aria-label*='QR code']")).toHaveCount(1);
 await expect(page.locator("[data-checkout-ready='true']")).toHaveCount(0);
});
test("unknown campaigns return 404 and checkout returns never imply a payment",async ({page})=>{
 const missing=await page.goto("/c/unknown-campaign");expect(missing?.status()).toBe(404);
 await page.goto(route+"?checkout=returned");await expect(page.getByRole("status").filter({hasText:"does not prove payment"})).toBeVisible();
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content",/noindex/);
});
test("campaign styles remain isolated after client navigation into Organizer Studio preview",async ({page})=>{
 await page.goto("/organizer-preview");
 const before=await page.locator("main").evaluate(element=>{const s=getComputedStyle(element);return {font:s.font,color:s.color,background:s.backgroundColor};});
 await page.goto("/");await page.getByRole("link",{name:"Explore the campaign",exact:false}).click();await expect(page.locator("#campaign-title")).toBeVisible();
 await page.goBack();await page.getByRole("link",{name:"Explore Organizer Studio preview",exact:false}).click();
 await expect(page.getByText("VISUAL PREVIEW — SAMPLE DATA ONLY.",{exact:true})).toBeVisible();
 const after=await page.locator("main").evaluate(element=>{const s=getComputedStyle(element);return {font:s.font,color:s.color,background:s.backgroundColor};});
 expect(after).toEqual(before);
});
