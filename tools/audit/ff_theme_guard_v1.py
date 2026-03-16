from __future__ import annotations

from pathlib import Path
import re

CSS_PATH = Path("app/static/css/ff.css")

FORBIDDEN = (
    "display",
    "position",
    "grid-template",
    "grid-column",
    "grid-row",
    "flex",
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "overflow",
    "z-index",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
)

THEME_SELECTOR_RE = re.compile(
    r'html\.ff-root\[(?:data-ff-theme|data-ff-brand)="[^"]+"\]\s*\{(?P<body>.*?)\}',
    re.S,
)

DECL_RE = re.compile(r'(?P<prop>[a-zA-Z-]+)\s*:')

def main() -> int:
    if not CSS_PATH.exists():
        print(f"[ff-theme-guard] FAIL: missing {CSS_PATH}")
        return 2

    css = CSS_PATH.read_text(encoding="utf-8", errors="ignore")
    violations: list[tuple[str, str]] = []

    for m in THEME_SELECTOR_RE.finditer(css):
        body = m.group("body")
        selector = m.group(0).split("{", 1)[0].strip()
        for decl in DECL_RE.finditer(body):
            prop = decl.group("prop").strip().lower()
            if any(prop == bad or prop.startswith(bad + "-") for bad in FORBIDDEN):
                violations.append((selector, prop))

    if violations:
        print("[ff-theme-guard] FAIL: structural properties found inside theme token blocks:")
        for selector, prop in violations:
            print(f"  - {selector} -> {prop}")
        return 2

    print("[ff-theme-guard] OK: theme blocks are token-only.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
