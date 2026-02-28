#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import shutil
import sys

SCRIPT_SNIPPET = r"""<script {{ nonce_attr() }} src="{{ url_for('static', filename='js/ff-app.js') }}" defer></script>"""

CANDIDATES = [
    Path("app/templates/base.html"),
    Path("app/templates/index.html"),
]

def patch_file(p: Path) -> bool:
    if not p.exists():
        return False

    src = p.read_text(encoding="utf-8", errors="replace")
    orig = src

    # 1) If a script tag already references ff-app.js, ensure nonce_attr() is present.
    #    Match any <script ... src="...ff-app.js"...>
    def ensure_nonce(match: re.Match) -> str:
        tag = match.group(0)
        if "nonce_attr()" in tag:
            return tag
        # Insert {{ nonce_attr() }} right after <script
        tag = re.sub(r"<script\b", "<script {{ nonce_attr() }}", tag, count=1)
        return tag

    src = re.sub(
        r"<script\b[^>]*\bsrc\s*=\s*['\"][^'\"]*ff-app\.js[^'\"]*['\"][^>]*>\s*</script>",
        ensure_nonce,
        src,
        flags=re.I,
    )

    # 2) Ensure defer is present on the ff-app.js script tag
    def ensure_defer(match: re.Match) -> str:
        tag = match.group(0)
        if re.search(r"\bdefer\b", tag, flags=re.I):
            return tag
        # add defer before closing >
        tag = tag[:-9]  # strip "</script>"
        # ensure there's a space before defer
        if not tag.endswith(">"):
            return match.group(0)
        tag = tag[:-1] + " defer></script>"
        return tag

    src = re.sub(
        r"(<script\b[^>]*\bsrc\s*=\s*['\"][^'\"]*ff-app\.js[^'\"]*['\"][^>]*>\s*</script>)",
        ensure_defer,
        src,
        flags=re.I,
    )

    # 3) If no reference exists at all, insert snippet before </body>
    if not re.search(r"ff-app\.js", src, flags=re.I):
        if "</body>" in src:
            src = src.replace("</body>", f"  {SCRIPT_SNIPPET}\n</body>")
        else:
            src = src.rstrip() + "\n" + SCRIPT_SNIPPET + "\n"

    # 4) Dedupe: if multiple ff-app.js loaders exist, keep the last one only (safest near </body>)
    loaders = list(re.finditer(r"<script\b[^>]*\bff-app\.js\b[^>]*>\s*</script>", src, flags=re.I))
    if len(loaders) > 1:
        # remove all but last
        last = loaders[-1]
        keep_span = (last.start(), last.end())
        parts = []
        idx = 0
        for m in loaders[:-1]:
            parts.append(src[idx:m.start()])
            idx = m.end()
        parts.append(src[idx:])  # keep rest (includes the last loader)
        src = "".join(parts)

    if src != orig:
        bak = p.with_suffix(p.suffix + ".bak_loader")
        shutil.copyfile(p, bak)
        p.write_text(src, encoding="utf-8")
        print(f"[loader] patched ✅ {p} (backup -> {bak})")
        return True

    print(f"[loader] ok ✅ {p} (no changes)")
    return False

def main() -> int:
    changed = False
    for p in CANDIDATES:
        changed = patch_file(p) or changed

    if not any(p.exists() for p in CANDIDATES):
        print("[loader] ❌ No template candidates found.", file=sys.stderr)
        return 2

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
