from pathlib import Path
from collections import Counter
import re
import sys

CSS = Path(sys.argv[1] if len(sys.argv) > 1 else "app/static/css/ff.css")

def fail(msg):
    print(f"❌ {msg}")
    sys.exit(1)

def info(msg):
    print(f"• {msg}")

if not CSS.exists():
    fail(f"CSS file not found: {CSS}")

s = CSS.read_text(encoding="utf-8")

if not s.strip():
    fail("CSS file is empty.")
info("CSS file exists and is non-empty")

# -------------------------------------------------------------------
# 1) merge conflict markers
# -------------------------------------------------------------------
if re.search(r'^(<{7}(?: .*)?$|={7}$|>{7}(?: .*)?$)', s, flags=re.M):
    fail("Merge conflict markers found in CSS file.")
info("No merge conflict markers")

# -------------------------------------------------------------------
# 2) brace balance (comments/strings stripped)
# -------------------------------------------------------------------
def strip_comments_and_strings(text: str) -> str:
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    text = re.sub(r'"(?:\\.|[^"\\])*"', '""', text)
    text = re.sub(r"'(?:\\.|[^'\\])*'", "''", text)
    return text

clean = strip_comments_and_strings(s)
depth = 0
for i, ch in enumerate(clean):
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth < 0:
            fail("Unbalanced braces: found closing brace before matching opener.")

if depth != 0:
    fail(f"Unbalanced braces: final depth is {depth}.")
info("Brace balance OK")

# -------------------------------------------------------------------
# 3) duplicate marker blocks
# -------------------------------------------------------------------
critical_markers = [
    "FF_STORY_POSTER_PICTURE_FIX_V1",
    "FF_STORY_POSTER_HARD_RESCUE_V2",
]

marker_failures = []
for marker in critical_markers:
    count = s.count(marker)
    if count > 1:
        marker_failures.append(f"{marker} appears {count} times")

if marker_failures:
    fail("Duplicate rescue markers found: " + " | ".join(marker_failures))

info("Critical rescue marker duplication OK")

# -------------------------------------------------------------------
# 4) empty @media blocks
# -------------------------------------------------------------------
empty_media = re.findall(r'@media[^{]+\{\s*\}', s, flags=re.S)
if empty_media:
    fail(f"Empty @media block(s) found: {len(empty_media)}")

info("No empty @media blocks")

# -------------------------------------------------------------------
# 5) duplicate keyframes (warning only)
# -------------------------------------------------------------------
keyframes = re.findall(r'@keyframes\s+([A-Za-z0-9_-]+)', s)
dupe_keyframes = sorted(name for name, count in Counter(keyframes).items() if count > 1)
if dupe_keyframes:
    print("⚠️  Duplicate keyframe names detected (review): " + ", ".join(dupe_keyframes))
else:
    info("No duplicate keyframe names detected")

# -------------------------------------------------------------------
# 6) !important count (warning only)
# -------------------------------------------------------------------
important_count = len(re.findall(r'!important\b', s))
if important_count > 75:
    print(f"⚠️  High !important count detected: {important_count}")
else:
    info(f"!important count looks manageable: {important_count}")

# -------------------------------------------------------------------
# 7) repeated high-risk selectors (warning only)
# -------------------------------------------------------------------
watch_selectors = [
    r'\.ff-section\s*\{',
    r'\.ff-btn\s*\{',
    r'\.ff-help\s*\{',
    r'\.ff-teamCard\s*\{',
    r'\.ff-topbarGoal\s*\{',
    r'\.ff-footerTray\s*\{',
    r'\.ff-storyPoster\s*\{',
]
watch_hits = {}
for pat in watch_selectors:
    count = len(re.findall(pat, s))
    if count > 1:
        watch_hits[pat] = count

if watch_hits:
    print("⚠️  Repeated high-risk selectors detected:")
    for pat, count in watch_hits.items():
        print(f"   - {pat}: {count}")
else:
    info("No repeated high-risk selector blocks detected")

print("✅ ff.css hard gate passed")
