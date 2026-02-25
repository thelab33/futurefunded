from __future__ import annotations

import os
from pathlib import Path

TEMPLATE_DIR = Path("app/templates")

POWERED_BADGE = """\
<!-- FF: Powered by badge -->
<div class="ff-poweredby">
  Powered by <strong>FutureFunded</strong>
</div>
"""

SKIP_LINK = """\
<!-- FF: Accessibility Skip Link -->
<a href="#main" class="ff-skiplink">Skip to main content</a>
"""

GO_LIVE_COMMENT = """\
<!--
💎 FUTUREFUNDED GO-LIVE CHECKLIST (UI/UX)

1. LOGO wired from Flask context (_org_logo)
2. Accessibility: skiplinks, focus rings, ARIA
3. Responsive test on mobile/tablet/desktop
4. Powered by FutureFunded badge present
5. PWA icons + manifest verified
6. No overflow / no bleed / theme verified
-->
"""

LOGO_HELPER = """\
{# FF: Logo fallback helper #}
{% set _org_logo = _org_logo|default(url_for('static', filename='images/fundchamps-fc.svg')) %}
"""

# Marker tokens so we can inject idempotently across many templates.
MARK_GO_LIVE = "FUTUREFUNDED GO-LIVE CHECKLIST"
MARK_SKIP = "FF: Accessibility Skip Link"
MARK_POWERED = "FF: Powered by badge"
MARK_LOGO = "FF: Logo fallback helper"

# Some templates use <main id="content"> etc; keep skiplink target stable.
# Your index.html already uses #content; this script uses #main as written.
# Ensure your templates actually have id="main" or update SKIP_LINK accordingly.
BODY_TAG_PREFIX = "<body"


def _read_text(path: Path) -> str:
  return path.read_text(encoding="utf-8", errors="ignore")


def _write_text(path: Path, text: str) -> None:
  path.write_text(text, encoding="utf-8")


def inject_once(text: str, snippet: str, marker: str) -> str:
  if marker in text:
    return text
  return snippet + "\n" + text


def _insert_after_opening_body(text: str, snippet: str) -> str:
  """
  Inserts `snippet` immediately after the first <body ...> tag (on the next line),
  preserving whatever attributes exist on <body>.
  """
  if MARK_SKIP in text:
    return text

  i = text.lower().find("<body")
  if i < 0:
    return text

  # Find end of the <body ...> tag.
  j = text.find(">", i)
  if j < 0:
    return text

  # Insert right after the tag close.
  insert_at = j + 1
  return text[:insert_at] + "\n" + snippet + "\n" + text[insert_at:]


def _insert_powered_before_footer_or_body(text: str, snippet: str) -> str:
  if MARK_POWERED in text:
    return text

  if "</footer>" in text:
    return text.replace("</footer>", snippet + "\n</footer>", 1)

  if "</body>" in text:
    return text.replace("</body>", snippet + "\n</body>", 1)

  return text


def process_file(path: Path) -> None:
  original = _read_text(path)
  updated = original

  # 1) Go-live comment at top (idempotent)
  updated = inject_once(updated, GO_LIVE_COMMENT, MARK_GO_LIVE)

  # 2) Logo helper at top (idempotent)
  updated = inject_once(updated, LOGO_HELPER, MARK_LOGO)

  # 3) Skiplink right after <body ...> (idempotent)
  updated = _insert_after_opening_body(updated, SKIP_LINK)

  # 4) Powered by badge before </footer> else before </body> (idempotent)
  updated = _insert_powered_before_footer_or_body(updated, POWERED_BADGE)

  if updated != original:
    _write_text(path, updated)
    print(f"✅ Updated: {path}")
  else:
    print(f"— Skipped (already good): {path}")


def main() -> None:
  if not TEMPLATE_DIR.is_dir():
    raise SystemExit(f"Template directory not found: {TEMPLATE_DIR}")

  for root, _, files in os.walk(TEMPLATE_DIR):
    for f in files:
      if f.endswith(".html"):
        process_file(Path(root) / f)


if __name__ == "__main__":
  main()
