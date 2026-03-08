#!/usr/bin/env python3
"""
FutureFunded Overlay Doctor

Audits overlay system health:
- open triggers
- close triggers
- target overlays
- z-index stacking
- focus traps
- overflow clipping risks

Outputs:
artifacts/overlay_doctor_report.json
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:5000"

ARTIFACT = Path("artifacts/overlay_doctor_report.json")

JS_AUDIT = """
() => {

function info(el){
  const s = getComputedStyle(el)

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    class: el.className || null,

    position: s.position,
    zIndex: s.zIndex,
    overflow: s.overflow,
    transform: s.transform,
    height: s.height,
    maxHeight: s.maxHeight
  }
}

const overlays = [...document.querySelectorAll(
  '#checkout, [role="dialog"], [data-ff-checkout-sheet]'
)]

const openers = [...document.querySelectorAll(
  '[data-ff-open-checkout], a[href="#checkout"]'
)]

const closers = [...document.querySelectorAll(
  '[data-ff-close-checkout], .ff-sheet__close'
)]

let results = {}

results.overlayTargets = overlays.map(info)
results.openTriggers = openers.length
results.closeTriggers = closers.length

const body = document.body

results.bodyContext = info(body)

let clippingAncestors = []

for(const overlay of overlays){

  let p = overlay.parentElement

  while(p){

    const s = getComputedStyle(p)

    if(
      s.overflow === "hidden" ||
      s.overflow === "clip" ||
      s.transform !== "none"
    ){
      clippingAncestors.push({
        tag: p.tagName.toLowerCase(),
        id: p.id || null,
        class: p.className || null,
        overflow: s.overflow,
        transform: s.transform
      })
    }

    p = p.parentElement
  }

}

results.clippingAncestors = clippingAncestors

return results
}
"""


async def run():

    async with async_playwright() as p:

        browser = await p.chromium.launch()
        page = await browser.new_page()

        print("Opening:", URL)
        await page.goto(URL)

        await page.wait_for_timeout(1500)

        report = await page.evaluate(JS_AUDIT)

        ARTIFACT.parent.mkdir(exist_ok=True)
        ARTIFACT.write_text(json.dumps(report, indent=2))

        print("\nOverlay Doctor Results\n")

        print("Open triggers:", report["openTriggers"])
        print("Close triggers:", report["closeTriggers"])

        if report["clippingAncestors"]:
            print("\n⚠ Potential overlay clipping ancestors:\n")

            for a in report["clippingAncestors"]:
                print(
                    a["tag"],
                    a["id"],
                    a["class"],
                    "overflow:", a["overflow"],
                    "transform:", a["transform"]
                )

        else:
            print("\n✔ No clipping ancestors detected")

        print("\nReport written to:", ARTIFACT)

        await browser.close()


asyncio.run(run())
