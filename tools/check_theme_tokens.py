from pathlib import Path
import re

css = Path("app/static/css/ff.css").read_text()

m = re.search(
    r'FF_THEME_PRESETS_START(.*?)FF_THEME_PRESETS_END',
    css,
    re.S
)

if not m:
    raise SystemExit("❌ Theme preset block not found")

theme_block = m.group(1)

bad = []

for line in theme_block.splitlines():
    line = line.strip()

    # Only evaluate actual selector lines (not values like #ff6b00)
    if line.startswith('.') or line.startswith('#'):
        if re.search(r'\.ff-|#ff[\w-]+', line):
            bad.append(line)

if bad:
    print("⚠️ Invalid selectors found:")
    for b in bad:
        print(" -", b)
    raise SystemExit("❌ Theme block contains non-token selectors")

print("✅ Theme presets are token-pure.")