import json
from collections import defaultdict
from pathlib import Path

REPORT = Path(".reports/css_audit.json")
OUT = Path("app/static/css/_missing-stubs.css")

data = json.loads(REPORT.read_text())

groups = defaultdict(list)

for item in data["missing"]["classes"]:
    name = item["name"]
    root = name.split("__")[0].split("--")[0]
    groups[root].append(name)

lines = []
lines.append("/*")
lines.append("  AUTO-GENERATED CSS STUBS")
lines.append("  Purpose: ensure semantic coverage for existing HTML")
lines.append("  Safe to delete once fully styled")
lines.append("*/\n")

for root, classes in sorted(groups.items()):
    lines.append(f"/* ================= {root} ================= */")
    for cls in sorted(classes):
        lines.append(f".{cls} {{")
        lines.append("  /* TODO: style */")
        lines.append("}")
    lines.append("")

OUT.write_text("\n".join(lines))
print(f"Wrote {OUT}")
