#!/usr/bin/env python3
"""
tools/stripe_smoke_playwright.py
"""

import os, sys, json, asyncio
from pathlib import Path
from datetime import datetime, timezone
from playwright.async_api import async_playwright, TimeoutError as PwTimeoutError

BASE_URL = os.getenv("FF_BASE_URL", "http://127.0.0.1:5000/?smoke=1")
HEADLESS = os.getenv("FF_HEADLESS", "1") != "0"
AMOUNT_DOLLARS = str(os.getenv("FF_AMOUNT", "5"))
DONOR_EMAIL = os.getenv("FF_EMAIL", "smoke-test@example.com")
DONOR_NAME = os.getenv("FF_NAME", "Smoke Test")
TIMEOUT_MS = int(os.getenv("FF_TIMEOUT_MS", "45000"))
ARTIFACT_DIR = Path(os.getenv("FF_ARTIFACT_DIR", "tools/.artifacts"))
TRACE = os.getenv("FF_TRACE", "0") == "1"
DEBUG = os.getenv("FF_DEBUG", "0") == "1"
ACCEPT_SUBMITTED = os.getenv("FF_ACCEPT_SUBMITTED", "0") == "1"

ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

def _ts():
  return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

def log_ok(msg): print(f"✅ {msg}")
def log_warn(msg): print(f"⚠️ {msg}")
def log_info(msg): print(f"🔎 {msg}")
def log_dbg(msg):
  if DEBUG: print(f"🧪 {msg}")

def fail(msg, code=1):
  print(f"❌ {msg}")
  sys.exit(code)

async def ensure_app_initialized(page):
  await page.wait_for_function(
    expression="() => !!window.__FF_APP__ && window.__FF_APP__.initialized === true",
    timeout=TIMEOUT_MS
  )
  log_ok("ff-app.js initialized")

async def parse_ff_config(page):
  loc = page.locator("#ffConfig").first
  if not await loc.count():
    log_warn("Missing #ffConfig; continuing.")
    return None
  txt = await loc.text_content() or ""
  if not txt.strip():
    log_warn("#ffConfig empty; continuing.")
    return None
  try:
    cfg = json.loads(txt)
    log_ok("ffConfig JSON parsed")
    return cfg
  except Exception:
    log_warn("ffConfig invalid JSON; continuing.")
    return None

def extract_publishable_key(cfg):
  if not isinstance(cfg, dict): return ""
  candidates = [
    cfg.get("stripePk"),
    (cfg.get("payments") or {}).get("stripePk"),
    (cfg.get("payments") or {}).get("stripePublishableKey"),
    cfg.get("stripePublishableKey"),
    (cfg.get("stripe") or {}).get("publishableKey"),
  ]
  for v in candidates:
    if isinstance(v, str) and v.strip():
      return v.strip()
  return ""

async def ensure_checkout_open(page):
  await page.evaluate("""() => { try { if (location.hash !== '#checkout') location.hash = 'checkout'; } catch (e) {} }""")
  await page.wait_for_selector("#checkout, [data-ff-checkout-sheet], [data-ff-sheet]", timeout=20000)

  await page.wait_for_function("""() => {
    const el = document.querySelector('#checkout') || document.querySelector('[data-ff-checkout-sheet]') || document.querySelector('[data-ff-sheet]');
    if (!el) return false;
    const open = el.getAttribute('data-open') === 'true'
      || el.getAttribute('aria-hidden') === 'false'
      || el.classList.contains('is-open')
      || location.hash === '#checkout';
    return open && !el.hasAttribute('hidden');
  }""", timeout=TIMEOUT_MS)

  log_ok("Checkout opened (hash + open state)")

async def wait_for_stripe_loaded(page):
  try:
    await page.wait_for_function("() => !!document.getElementById('ffStripeJs')", timeout=20000)
    await page.wait_for_function("() => typeof window.Stripe === 'function'", timeout=20000)
    log_ok("Stripe JS loads correctly (#ffStripeJs present + window.Stripe)")
  except PwTimeoutError:
    fail("Stripe.js did not load (#ffStripeJs/window.Stripe missing)")

async def fill_donor_fields(page):
  try: await page.locator('[data-ff-amount-input], #donationAmount').first.fill(AMOUNT_DOLLARS)
  except Exception: log_warn("Amount input not found; continuing.")
  try: await page.locator('[data-ff-donor-name]').first.fill(DONOR_NAME)
  except Exception: log_warn("Name input not found; continuing.")
  try: await page.locator('[data-ff-email]').first.fill(DONOR_EMAIL)
  except Exception: log_warn("Email input not found; continuing.")
  log_ok("Filled donor fields")

async def wait_for_payment_element_iframe(page):
  try:
    await page.wait_for_selector("#paymentElement iframe, [data-ff-payment-element] iframe", timeout=20000)
    log_ok("Stripe Payment Element mounts (iframe detected)")
  except PwTimeoutError:
    fail("Stripe Payment Element iframe did not appear")

async def find_stripe_frame_with_selector(page, selectors):
  deadline = asyncio.get_event_loop().time() + (TIMEOUT_MS / 1000.0)
  while asyncio.get_event_loop().time() < deadline:
    frames = []
    for f in page.frames:
      u = (f.url or "").lower()
      if ("stripe" in u) or ("js.stripe.com" in u) or ("hooks.stripe.com" in u):
        frames.append(f)

    for f in frames:
      for sel in selectors:
        try:
          loc = f.locator(sel).first
          if await loc.count():
            return f, sel, f.url
        except Exception:
          continue

    await page.wait_for_timeout(150)
  return None, None, None

async def fill_stripe_payment_element(page):
  number_sels = ['input[name="cardnumber"]','input[name="cardNumber"]','input[autocomplete="cc-number"]']
  exp_sels = ['input[name="exp-date"]','input[name="expDate"]','input[autocomplete="cc-exp"]']
  cvc_sels = ['input[name="cvc"]','input[name="cardCvc"]','input[autocomplete="cc-csc"]']
  zip_sels = ['input[name="postal"]','input[name="postalCode"]','input[autocomplete="postal-code"]']

  log_info("⏳ Locating Stripe frames…")

  f, sel, url = await find_stripe_frame_with_selector(page, number_sels)
  if not f: 
    shot = ARTIFACT_DIR / f"stripe_fill_fail_{_ts()}.png"
    await page.screenshot(path=str(shot), full_page=True)
    fail(f"Could not find card number input in any Stripe frame. Screenshot: {shot}")
  log_ok("Card number input found")
  log_dbg(f"Card frame: {url}")
  await f.locator(sel).fill("4242 4242 4242 4242")

  f, sel, _ = await find_stripe_frame_with_selector(page, exp_sels)
  if not f: fail("Could not find expiry input in any Stripe frame")
  await f.locator(sel).fill("12 / 34")

  f, sel, _ = await find_stripe_frame_with_selector(page, cvc_sels)
  if not f: fail("Could not find CVC input in any Stripe frame")
  await f.locator(sel).fill("123")

  f, sel, _ = await find_stripe_frame_with_selector(page, zip_sels)
  if f:
    await f.locator(sel).fill("78754")

  log_ok("Filled Stripe Payment Element (4242 / 12-34 / 123)")

async def wait_for_stripe_confirm_seen(page):
  try:
    res = await page.wait_for_response(
      lambda r: (r.request.method == "POST") and ("api.stripe.com" in r.url) and ("/v1/payment_intents" in r.url),
      timeout=20000
    )
    log_info(f"↩️ Stripe confirm request seen -> {res.status}")
    return True
  except Exception:
    log_warn("No Stripe confirm request observed (api.stripe.com/v1/payment_intents). ConfirmPayment likely never fired.")
    return False

async def submit_payment(page):
  pay = page.locator("#payBtn, [data-ff-pay-btn]").first
  if not await pay.count():
    fail("Pay button not found")
  # start confirm watcher BEFORE click
  watcher = asyncio.create_task(wait_for_stripe_confirm_seen(page))
  await pay.click()
  log_ok("Clicked Pay")
  await watcher

async def wait_for_success(page):
  # strict signals
  async def wait_dataset():
    await page.wait_for_selector('html[data-ff-paid="true"][data-ff-paid-provider="stripe"]', timeout=20000)

  async def wait_receipt():
    await page.wait_for_selector('[data-ff-checkout-receipt]:not([hidden])', timeout=20000)

  async def wait_thankyou():
    await page.wait_for_url("**/thank-you**", timeout=20000)

  tasks = [asyncio.create_task(wait_dataset()), asyncio.create_task(wait_receipt()), asyncio.create_task(wait_thankyou())]
  done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
  for p in pending: p.cancel()
  log_ok("Success signal detected")

async def main():
  log_info(f"Stripe Smoke (Python) → {BASE_URL}")
  log_info(f"Headless: {HEADLESS}")

  async with async_playwright() as p:
    browser = await p.chromium.launch(headless=HEADLESS)
    context = await browser.new_context()

    if TRACE:
      await context.tracing.start(screenshots=True, snapshots=True, sources=True)
      log_dbg("Tracing enabled (FF_TRACE=1)")

    page = await context.new_page()

    def on_console(m):
      t = m.type  # property (string)
      if DEBUG or t == "error":
        print(f"[console:{t}] {m.text}")
    page.on("console", on_console)

    try:
      await page.goto(BASE_URL, wait_until="domcontentloaded")

      await ensure_app_initialized(page)

      cfg = await parse_ff_config(page)
      pk = extract_publishable_key(cfg) if cfg else ""
      if pk:
        if not pk.startswith("pk_test_"):
          fail(f"Publishable key not test-mode (expected pk_test_*). Got: {pk[:16]}…")
        log_ok("Stripe test publishable key detected")
      else:
        log_warn("Publishable key not found in ffConfig (continuing).")

      await ensure_checkout_open(page)
      await wait_for_stripe_loaded(page)

      await fill_donor_fields(page)
      await wait_for_payment_element_iframe(page)
      await fill_stripe_payment_element(page)

      await submit_payment(page)

      try:
        await wait_for_success(page)
      except Exception:
        shot = ARTIFACT_DIR / f"stripe_no_success_{_ts()}.png"
        await page.screenshot(path=str(shot), full_page=True)
        fail(f"No deterministic success marker (dataset/receipt/thank-you). Screenshot: {shot}")

      print("\n🎉 STRIPE SMOKE TEST: PASS (Python)\n")

      if TRACE:
        trace_path = ARTIFACT_DIR / f"stripe_smoke_trace_{_ts()}.zip"
        await context.tracing.stop(path=str(trace_path))
        log_info(f"Trace saved: {trace_path}")

    finally:
      try: await browser.close()
      except Exception: pass

if __name__ == "__main__":
  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    print("\nInterrupted.")
    sys.exit(130)
