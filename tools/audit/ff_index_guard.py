from pathlib import Path
from jinja2 import Environment, TemplateSyntaxError
from collections import Counter
import json
import re
import sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else "app/templates/index.html")
s = p.read_text(encoding="utf-8")

def fail(msg):
    print(f"❌ {msg}")
    sys.exit(1)

def info(msg):
    print(f"• {msg}")

try:
    Environment().parse(s)
    info("Jinja parse OK")
except TemplateSyntaxError as e:
    fail(f"Jinja syntax error at line {e.lineno}: {e.message}")
except Exception as e:
    fail(f"Jinja parse failed: {e}")

for tag in ("html", "head", "body", "main"):
    n = len(re.findall(fr"<{tag}\b", s, flags=re.I))
    if n != 1:
        fail(f"Expected exactly one <{tag}> tag, found {n}")
    info(f"Single <{tag}> tag OK")

for script_id in ("ffConfig", "ffSelectors"):
    n = len(re.findall(fr'id="{script_id}"', s))
    if n != 1:
        fail(f'Expected exactly one script id="{script_id}", found {n}')
    info(f'{script_id} payload count OK')

m = re.search(r'<script id="ffSelectors"[^>]*>\s*(\{.*?\})\s*</script>', s, flags=re.S)
if not m:
    fail("Could not extract ffSelectors JSON")

try:
    selectors = json.loads(m.group(1))
    hooks = selectors.get("hooks", {})
    info(f"ffSelectors JSON OK ({len(hooks)} hooks)")
except Exception as e:
    fail(f"ffSelectors JSON invalid: {e}")

literal_ids = re.findall(r'\bid="([^"]+)"', s)
dupe_ids = sorted(k for k, v in Counter(literal_ids).items() if v > 1)
if dupe_ids:
    fail("Duplicate literal IDs: " + ", ".join(dupe_ids[:20]))
info(f"Literal IDs OK ({len(set(literal_ids))} unique)")

ids_set = set(literal_ids)
refs = []

for attr in ("aria-controls", "aria-labelledby", "aria-describedby", "for"):
    for v in re.findall(fr'\b{attr}="([^"]+)"', s):
        if "{{" in v or "{%" in v:
            continue
        parts = v.split() if attr.startswith("aria-") else [v]
        refs.extend((attr, part) for part in parts if part)

for v in re.findall(r'href="#([^"]+)"', s):
    if "{{" in v or "{%" in v:
        continue
    refs.append(("href", v))

missing_refs = [(attr, ref) for attr, ref in refs if ref not in ids_set]
if missing_refs:
    sample = ", ".join(f"{a}→{r}" for a, r in missing_refs[:20])
    fail("Broken local references: " + sample)
info(f"Local references OK ({len(refs)} checked)")

critical_hooks = {
    "openCheckout": '[data-ff-open-checkout]',
    "closeCheckout": '[data-ff-close-checkout]',
    "checkoutSheet": '[data-ff-checkout-sheet]',
    "donationForm": '#donationForm',
    "openSponsor": '[data-ff-open-sponsor]',
    "closeSponsor": '[data-ff-close-sponsor]',
    "sponsorModal": '[data-ff-sponsor-modal]',
    "sponsorForm": '#sponsorForm',
    "sponsorWall": '[data-ff-sponsor-wall]',
    "sponsorWallEmpty": '[data-ff-sponsor-wall-empty]',
    "openOnboard": '[data-ff-open-onboard]',
    "closeOnboard": '[data-ff-close-onboard]',
    "onboardModal": '[data-ff-onboard-modal]',
    "floatingDonate": '[data-ff-floating-donate]',
    "backToTop": '[data-ff-backtotop]',
    "liveFeed": '[data-ff-live-feed]',
    "story": '[data-ff-story]',
    "burst": '[data-ff-burst]',
}

def selector_exists(sel: str) -> bool:
    if sel.startswith("#"):
        return bool(re.search(fr'\bid="{re.escape(sel[1:])}"', s))
    if sel.startswith("[data-ff-"):
        m = re.match(r"\[(data-ff-[a-zA-Z0-9_-]+)", sel)
        if m:
            return bool(re.search(fr'\b{re.escape(m.group(1))}\s*=', s))
    if sel.startswith("."):
        return bool(re.search(fr'\bclass="[^"]*\b{re.escape(sel[1:])}\b', s))
    return False

missing_hooks = [name for name, sel in critical_hooks.items() if not selector_exists(sel)]
if missing_hooks:
    fail("Missing critical DOM hooks: " + ", ".join(missing_hooks))
info("Critical DOM hooks OK")

if '<button type="submit" class="ff-sr">Send inquiry</button>' in s:
    print("⚠️  Optional cleanup: sponsor form still contains an extra hidden submit button.")
else:
    info("No extra hidden sponsor submit button")

print("✅ index.html audit passed")
