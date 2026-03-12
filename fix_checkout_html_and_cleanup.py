#!/usr/bin/env python3
"""
FutureFunded checkout HTML repair + sanitation script.

What this fixes automatically:

1. Removes malformed hidden input with escaped quotes
2. Removes duplicate hidden team_id inputs
3. Ensures exactly ONE canonical hidden team_id field exists
4. Removes hidden inputs accidentally embedded inside labels
5. Cleans stray newline characters inside Jinja URL strings
6. Creates timestamped backups before modifying anything

Safe to run multiple times (idempotent).
"""

import re
import shutil
from datetime import datetime
from pathlib import Path

INDEX = Path("app/templates/index.html")

if not INDEX.exists():
    raise SystemExit("index.html not found at app/templates/index.html")

html = INDEX.read_text(encoding="utf-8")
original = html

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = INDEX.with_name(f"index.html.bak-{stamp}")
shutil.copy2(INDEX, backup)

print(f"Backup created: {backup}")

# --------------------------------------------------
# 1. Remove malformed escaped hidden input
# --------------------------------------------------

html = re.sub(
    r'<input\s+name=\\"team_id\\"[^>]*?>',
    "",
    html,
    flags=re.IGNORECASE,
)

# --------------------------------------------------
# 2. Remove all existing team_id hidden inputs
# --------------------------------------------------

team_inputs = re.findall(
    r'<input[^>]*name=["\']team_id["\'][^>]*>', html, flags=re.IGNORECASE
)

html = re.sub(
    r'<input[^>]*name=["\']team_id["\'][^>]*>',
    "",
    html,
    flags=re.IGNORECASE,
)

if team_inputs:
    print(f"Removed {len(team_inputs)} existing team_id inputs")

# --------------------------------------------------
# 3. Insert ONE canonical hidden team_id after form open
# --------------------------------------------------

form_pattern = re.compile(r'(<form[^>]*id=["\']donationForm["\'][^>]*>)', re.I)

canonical_input = (
    '\n<input name="team_id" type="hidden" value="default" data-ff-team-id="" />\n'
)

if form_pattern.search(html):
    html = form_pattern.sub(r"\1" + canonical_input, html, count=1)
    print("Inserted canonical team_id hidden input")
else:
    print("WARNING: donationForm not found — input not inserted")

# --------------------------------------------------
# 4. Remove hidden inputs inside labels
# --------------------------------------------------

label_cleanup = re.sub(
    r'(<label[^>]*>)(.*?<input[^>]*type=["\']hidden["\'][^>]*>)(.*?</label>)',
    r"\1\3",
    html,
    flags=re.I | re.S,
)

html = label_cleanup

# --------------------------------------------------
# 5. Clean newline pollution in Jinja strings
# --------------------------------------------------

html = re.sub(r'"https://getfuturefunded.com\s+"', '"https://getfuturefunded.com"', html)
html = re.sub(r'"https://getfuturefunded.com/\s+"', '"https://getfuturefunded.com/"', html)
html = re.sub(r'support@getfuturefunded.com\s+"', 'support@getfuturefunded.com"', html)

# --------------------------------------------------
# Write patched file
# --------------------------------------------------

if html != original:
    INDEX.write_text(html, encoding="utf-8")
    print("index.html patched successfully")
else:
    print("No changes needed")

print("Done.")
