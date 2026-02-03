import os
from pathlib import Path

TEMPLATE_DIR = Path("app/templates")

POWERED_BADGE = """
<!-- FF: Powered by badge -->
<div class="ff-poweredby">
  Powered by <strong>FutureFunded</strong>
</div>
"""

SKIP_LINK = """
<!-- FF: Accessibility Skip Link -->
<a href="#main" class="ff-skiplink">Skip to main content</a>
"""

GO_LIVE_COMMENT = """
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

LOGO_HELPER = """
{# FF: Logo fallback helper #}
{% set _org_logo = _org_logo|default(url_for('static', filename='images/fundchamps-fc.svg')) %}
"""

def inject_once(text, snippet, marker):
    if marker in text:
        return text
    return snippet + "\n" + text

def process_file(path: Path):
    original = path.read_text()

    updated = original

    # Add go-live comment at top
    updated = inject_once(updated, GO_LIVE_COMMENT, "FUTUREFUNDED GO-LIVE CHECKLIST")

    # Add skiplink after <body>
    if "<body" in updated and "ff-skiplink" not in updated:
        updated = updated.replace(
            "<body",
            "<body\n" + SKIP_LINK,
            1
        )

    # Add powered by badge before </footer> or end of body
    if "ff-poweredby" not in updated:
        if "</footer>" in updated:
            updated = updated.replace("</footer>", POWERED_BADGE + "\n</footer>")
        elif "</body>" in updated:
            updated = updated.replace("</body>", POWERED_BADGE + "\n</body>")

    # Add logo helper at top if not present
    updated = inject_once(updated, LOGO_HELPER, "Logo fallback helper")

    if updated != original:
        path.write_text(updated)
        print(f"✅ Updated: {path}")
    else:
        print(f"— Skipped (already good): {path}")

def main():
    for root, _, files in os.walk(TEMPLATE_DIR):
        for f in files:
            if f.endswith(".html"):
                process_file(Path(root) / f)

if __name__ == "__main__":
    main()
