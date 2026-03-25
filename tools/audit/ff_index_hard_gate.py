from pathlib import Path
from jinja2 import Environment, TemplateSyntaxError
from bs4 import BeautifulSoup
from collections import Counter, defaultdict
import json
import re
import sys

TEMPLATE = Path(sys.argv[1] if len(sys.argv) > 1 else "app/templates/index.html")
STATIC_ROOT = Path(sys.argv[2] if len(sys.argv) > 2 else "app/static")

if not TEMPLATE.exists():
    print(f"❌ Template not found: {TEMPLATE}")
    sys.exit(1)

s = TEMPLATE.read_text(encoding="utf-8")
soup = BeautifulSoup(s, "html.parser")

DYNAMIC_TOKENS = ("{{", "{%", "{#")

def fail(msg):
    print(f"❌ {msg}")
    sys.exit(1)

def info(msg):
    print(f"• {msg}")

def is_dynamic(value: str | None) -> bool:
    if value is None:
        return False
    return any(tok in value for tok in DYNAMIC_TOKENS)

def literal_attr_values(attr_name: str):
    pattern = re.compile(fr'\b{re.escape(attr_name)}="([^"]+)"', re.I | re.S)
    for m in pattern.finditer(s):
        value = m.group(1)
        if is_dynamic(value):
            continue
        yield value

def literal_ids_from_source():
    ids = re.findall(r'\bid="([^"]+)"', s, flags=re.I)
    return [v for v in ids if not is_dynamic(v)]

# -------------------------------------------------------------------
# 0) basic file sanity
# -------------------------------------------------------------------
if not s.lstrip().startswith("<!DOCTYPE html>"):
    fail("Doctype is missing or not the first non-whitespace content.")
info("Doctype placement OK")

# -------------------------------------------------------------------
# 1) Jinja syntax
# -------------------------------------------------------------------
try:
    Environment().parse(s)
    info("Jinja parse OK")
except TemplateSyntaxError as e:
    fail(f"Jinja syntax error at line {e.lineno}: {e.message}")
except Exception as e:
    fail(f"Jinja parse failed: {e}")

# -------------------------------------------------------------------
# 2) singular structural tags
# -------------------------------------------------------------------
for tag in ("html", "head", "body", "main"):
    n = len(re.findall(fr"<{tag}\b", s, flags=re.I))
    if n != 1:
        fail(f"Expected exactly one <{tag}> tag, found {n}")
    info(f"Single <{tag}> tag OK")

# -------------------------------------------------------------------
# 3) JSON payloads
# -------------------------------------------------------------------
for script_id in ("ffConfig", "ffSelectors"):
    n = len(re.findall(fr'id="{script_id}"', s))
    if n != 1:
        fail(f'Expected exactly one script id="{script_id}", found {n}')
    info(f'{script_id} payload count OK')

m = re.search(
    r'<script id="ffSelectors"[^>]*>\s*(\{.*?\})\s*</script>',
    s,
    flags=re.S
)
if not m:
    fail("Could not extract ffSelectors JSON payload.")

try:
    selectors = json.loads(m.group(1))
    hooks = selectors.get("hooks", {})
    if not isinstance(hooks, dict) or not hooks:
        fail("ffSelectors JSON parsed, but hooks object is empty or invalid.")
    info(f"ffSelectors JSON OK ({len(hooks)} hooks)")
except Exception as e:
    fail(f"ffSelectors JSON invalid: {e}")

# -------------------------------------------------------------------
# 4) all selector hooks resolve in DOM
# -------------------------------------------------------------------
missing_hooks = []
bad_selector_syntax = []

for name, selector in hooks.items():
    try:
        found = soup.select(selector)
    except Exception as e:
        bad_selector_syntax.append((name, selector, str(e)))
        continue
    if not found:
        missing_hooks.append((name, selector))

if bad_selector_syntax:
    fail(
        "Invalid selector syntax in ffSelectors: " +
        ", ".join(f"{name}={selector}" for name, selector, _ in bad_selector_syntax[:12])
    )

if missing_hooks:
    fail(
        "Missing DOM hooks from ffSelectors: " +
        ", ".join(f"{name}={selector}" for name, selector in missing_hooks[:20])
    )
info("All ffSelectors hooks resolve in DOM")

# -------------------------------------------------------------------
# 5) duplicate literal IDs
# -------------------------------------------------------------------
literal_ids = literal_ids_from_source()
dupe_ids = sorted(k for k, v in Counter(literal_ids).items() if v > 1)
if dupe_ids:
    fail("Duplicate literal IDs: " + ", ".join(dupe_ids[:20]))
info(f"Literal IDs OK ({len(set(literal_ids))} unique)")

id_set = set(literal_ids)

# -------------------------------------------------------------------
# 6) broken local references (literal-only)
# -------------------------------------------------------------------
broken_refs = []

for value in literal_attr_values("aria-controls"):
    for ref in value.split():
        if ref and not is_dynamic(ref) and ref not in id_set:
            broken_refs.append(("aria-controls", ref))

for value in literal_attr_values("aria-labelledby"):
    for ref in value.split():
        if ref and not is_dynamic(ref) and ref not in id_set:
            broken_refs.append(("aria-labelledby", ref))

for value in literal_attr_values("aria-describedby"):
    for ref in value.split():
        if ref and not is_dynamic(ref) and ref not in id_set:
            broken_refs.append(("aria-describedby", ref))

for value in literal_attr_values("for"):
    ref = value.strip()
    if ref and not is_dynamic(ref) and ref not in id_set:
        broken_refs.append(("for", ref))

for ref in re.findall(r'href="#([^"]+)"', s, flags=re.I | re.S):
    ref = ref.strip()
    if ref and not is_dynamic(ref) and ref not in id_set:
        broken_refs.append(("href", ref))

if broken_refs:
    fail(
        "Broken local references: " +
        ", ".join(f"{attr}->{ref}" for attr, ref in broken_refs[:20])
    )
info("Local references OK")

# -------------------------------------------------------------------
# 7) button hygiene
# -------------------------------------------------------------------
buttons_missing_type = []
for btn in soup.find_all("button"):
    if not btn.has_attr("type"):
        text = " ".join(btn.stripped_strings)[:60]
        buttons_missing_type.append(text or "<icon button>")

if buttons_missing_type:
    fail("Buttons missing type=: " + ", ".join(buttons_missing_type[:20]))
info("Button type attributes OK")

# -------------------------------------------------------------------
# 8) anchor hygiene
# -------------------------------------------------------------------
bad_hrefs = []
for a in soup.find_all("a", href=True):
    href = a["href"].strip().lower()
    if href == "" or href.startswith("javascript:"):
        bad_hrefs.append(a.get_text(" ", strip=True)[:60] or "<link>")

if bad_hrefs:
    fail("Unsafe/empty hrefs found: " + ", ".join(bad_hrefs[:20]))
info("Anchor hrefs OK")

# -------------------------------------------------------------------
# 9) form field hygiene
# -------------------------------------------------------------------
form_errors = []

for idx, form in enumerate(soup.find_all("form"), start=1):
    fid = form.get("id") or f"form#{idx}"

    fields = form.find_all(["input", "select", "textarea"])
    missing_name = []
    grouped = defaultdict(list)

    for field in fields:
        t = (field.get("type") or "").lower()
        if field.name == "input" and t in {"submit", "button", "reset", "image"}:
            continue

        name = field.get("name")
        if not name:
            missing_name.append(str(field)[:120].replace("\n", " "))
            continue

        grouped[name].append((field.name, t))

    if missing_name:
        form_errors.append(f"{fid} has controls missing name=")

    dup_names = []
    for name, specs in grouped.items():
        if len(specs) <= 1:
            continue

        types = {t for _, t in specs}
        tag_names = {tag for tag, _ in specs}

        # allow normal grouped radios/checkboxes and explicit array-style names
        if name.endswith("[]"):
            continue
        if tag_names == {"input"} and types.issubset({"radio", "checkbox"}):
            continue

        dup_names.append(name)

    if dup_names:
        form_errors.append(f"{fid} has duplicate field names: {', '.join(sorted(dup_names)[:10])}")

if form_errors:
    fail("Form hygiene failure: " + " | ".join(form_errors[:20]))
info("Form control names OK")

# -------------------------------------------------------------------
# 10) image alt hygiene
# -------------------------------------------------------------------
imgs_missing_alt = []
for img in soup.find_all("img"):
    if img.get("alt") is None:
        src = img.get("src", "")[:80]
        imgs_missing_alt.append(src or "<img>")

if imgs_missing_alt:
    fail("Images missing alt text: " + ", ".join(imgs_missing_alt[:20]))
info("Image alt attributes OK")

# -------------------------------------------------------------------
# 11) inline executable script guard
# -------------------------------------------------------------------
bad_inline_scripts = []
for script in soup.find_all("script"):
    script_type = (script.get("type") or "").strip().lower()
    has_src = script.has_attr("src")
    body = script.string if script.string is not None else script.get_text()
    body = (body or "").strip()

    if has_src:
        continue
    if script_type in {"application/json", "importmap"}:
        continue
    if body:
        script_id = script.get("id") or "<inline-script>"
        bad_inline_scripts.append(script_id)

if bad_inline_scripts:
    fail("Unexpected inline executable script blocks: " + ", ".join(bad_inline_scripts[:20]))
info("No unexpected inline executable scripts")

# -------------------------------------------------------------------
# 12) literal static asset existence
# -------------------------------------------------------------------
asset_refs = re.findall(
    r'url_for\(\s*[\'"]static[\'"]\s*,\s*filename\s*=\s*[\'"]([^\'"]+)[\'"]',
    s
)
missing_assets = []
for rel in sorted(set(asset_refs)):
    asset_path = STATIC_ROOT / rel
    if not asset_path.exists():
        missing_assets.append(rel)

if missing_assets:
    fail("Missing literal static assets: " + ", ".join(missing_assets[:20]))
info(f"Literal static assets OK ({len(set(asset_refs))} checked)")

print("✅ index.html hard gate passed")
