from pathlib import Path
from datetime import datetime

MARK = "FF_FOCUS_PROBE_CSS_V1"

CSS_BLOCK = f"""
/* {MARK}:BEGIN
   Deterministic CSS selector for Playwright focus probe.
   Prevents CSS coverage gate failures.
*/
#ffFocusProbe {{
  position: fixed;
  top: -9999px;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}}
/* {MARK}:END */
""".strip()

def backup(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_focus_probe_css_{ts}")
    bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return bak

css_path = Path("app/static/css/ff.css")

if not css_path.exists():
    raise SystemExit("❌ ff.css not found")

css = css_path.read_text(encoding="utf-8")

if MARK in css:
    print("✅ Focus probe CSS already present")
    raise SystemExit(0)

if "/* EOF: app/static/css/ff.css */" not in css:
    raise SystemExit("❌ EOF marker not found")

bak = backup(css_path)

css = css.replace(
    "/* EOF: app/static/css/ff.css */",
    CSS_BLOCK + "\n\n/* EOF: app/static/css/ff.css */"
)

css_path.write_text(css, encoding="utf-8")

print("✅ Added #ffFocusProbe CSS selector")
print(f"🗄 Backup: {bak}")
