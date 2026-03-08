#!/usr/bin/env python3
"""
FutureFunded Overlay Layout Inspector

Finds layout rules that can clip or trap the checkout overlay.

Scans the DOM for:
- position
- overflow
- transform
- z-index
- height
- max-height
- contain
- filter

Usage:
    python ff_overlay_layout_inspector.py

Requires:
    playwright
"""

import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:5000"
TARGET = "#checkout"

ARTIFACT = Path("artifacts/checkout_layout_inspection.json")


JS_INSPECT = """
(target) => {

function getInfo(el) {

  const s = window.getComputedStyle(el)

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    class: el.className || null,

    position: s.position,
    overflow: s.overflow,
    overflowX: s.overflowX,
    overflowY: s.overflowY,

    transform: s.transform,
    zIndex: s.zIndex,

    height: s.height,
    maxHeight: s.maxHeight,

    contain: s.contain,
    filter: s.filter
  }
}

const el = document.querySelector(target)

if (!el) {
  return { error: "target not found" }
}

let chain = []
let current = el

while (current) {

  chain.push(getInfo(current))

  current = current.parentElement
}

return chain
}
"""


async def run():

    async with async_playwright() as p:

        browser = await p.chromium.launch()
        page = await browser.new_page()

        print("Opening page:", URL)
        await page.goto(URL)

        await page.wait_for_timeout(1500)

        chain = await page.evaluate(JS_INSPECT, TARGET)

        ARTIFACT.parent.mkdir(exist_ok=True)
        ARTIFACT.write_text(json.dumps(chain, indent=2))

        print("Inspection written to:", ARTIFACT)

        print("\nPotential clipping risks:\n")

        for node in chain:

            if isinstance(node, dict):

                if (
                    node["overflow"] in ["hidden", "clip"]
                    or node["transform"] != "none"
                    or node["contain"] != "none"
                    or node["filter"] != "none"
                ):
                    print("⚠", node["tag"], node["id"], node["class"])
                    print("   overflow:", node["overflow"])
                    print("   transform:", node["transform"])
                    print("   contain:", node["contain"])
                    print("   filter:", node["filter"])
                    print()

        await browser.close()


asyncio.run(run())
