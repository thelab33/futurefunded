import re
from pathlib import Path

html = Path("app/templates/index.html").read_text()

sections = re.findall(
    r'FF SECTION:\s*([A-Z\- ]+)',
    html
)

print("\nCSS SECTION TEMPLATE\n")

for s in sections:
    print(f"""
/* ======================================================
SECTION: {s}
====================================================== */
""")
