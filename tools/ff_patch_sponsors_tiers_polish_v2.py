from __future__ import annotations

import argparse
import re
from pathlib import Path
from datetime import datetime

HTML_MARK = "FF_SPONSOR_TIERS_WRAP_V2"
CSS_MARK  = "FF_SPONSOR_SECTION_POLISH_V2"

CSS_BLOCK = r'''
/* FF_SPONSOR_SECTION_POLISH_V2:BEGIN */
.ff-body .ff-sponsorTiers__inner{
  padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,.06);
}

.ff-root:not([data-theme="dark"]) .ff-body .ff-sponsorTiers__inner{
  border-top: 1px solid rgba(0,0,0,.06);
}

/* Tighten grid spacing */
.ff-body .ff-sponsorGrid{
  margin-top: 18px;
  gap: 18px;
}

/* Recommended refinement */
.ff-body .ff-tierCard--recommended{
  position: relative;
  transform: translateY(-4px);
  box-shadow:
    0 14px 40px rgba(255,128,0,.18),
    0 0 0 1px rgba(255,128,0,.25);
}

/* VIP refinement (premium but restrained) */
.ff-body .ff-tierCard[data-ff-tier="vip"]{
  background:
    linear-gradient(180deg, rgba(255,200,120,.08), transparent),
    var(--ff-surface);
}

/* Subtle elevation hover */
.ff-body .ff-tierCard{
  transition: transform .2s ease, box-shadow .2s ease;
}
.ff-body .ff-tierCard:hover{
  transform: translateY(-3px);
}

/* Webdriver stabilization */
:where(.ff-root)[data-ff-webdriver="true"] .ff-body :where(.ff-tierCard--recommended, .ff-tierCard){
  transform: none !important;
  box-shadow: 0 0 0 1px rgba(0,0,0,.08) !important;
}
/* FF_SPONSOR_SECTION_POLISH_V2:END */
'''.lstrip("\n")


def backup(path: Path, suffix: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_{suffix}_{ts}")
    bak.write_text(path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    return bak


def patch_css(css_path: Path) -> tuple[bool, Path | None]:
    css = css_path.read_text(encoding="utf-8", errors="replace")
    if CSS_MARK in css:
        return False, None

    m = re.search(r"/\*\s*EOF:\s*app/static/css/ff\.css\s*\*/", css)
    if not m:
        raise SystemExit("❌ Could not find CSS EOF marker: /* EOF: app/static/css/ff.css */")

    bak = backup(css_path, "sponsors_css_polish_v2")
    out = css[:m.start()] + "\n" + CSS_BLOCK + "\n" + css[m.start():]
    css_path.write_text(out, encoding="utf-8")
    return True, bak


def extract_sponsors_section(html: str) -> tuple[str, int, int]:
    # Grab the first <section id="sponsors" ...> ... </section>
    # This is conservative (single section), and avoids touching other ul grids.
    m = re.search(r'(<section\b[^>]*\bid="sponsors"\b[\s\S]*?</section>)', html)
    if not m:
        raise SystemExit('❌ Could not find <section id="sponsors">...</section> in index.html')
    return m.group(1), m.start(1), m.end(1)


def patch_sponsors_html(html_path: Path) -> tuple[bool, Path | None]:
    html = html_path.read_text(encoding="utf-8", errors="replace")
    if HTML_MARK in html:
        return False, None

    sponsors, a, b = extract_sponsors_section(html)

    # Sanity: must contain sponsor grid + sponsor meta row in expected order
    if 'class="ff-sponsorGrid"' not in sponsors:
        raise SystemExit('❌ Could not find class="ff-sponsorGrid" inside sponsors section')
    if 'class="ff-row ff-row--between' not in sponsors or 'ff-sponsorMeta' not in sponsors:
        raise SystemExit('❌ Could not find ff-sponsorMeta row inside sponsors section')

    # 1) Replace the opening <ul class="ff-sponsorGrid"...> with wrapper section+inner+p(sR)+ul
    sponsors2 = re.sub(
        r'(\s*)<ul\s+class="ff-sponsorGrid"([^>]*)>',
        r'\1<!-- ' + HTML_MARK + r' -->'
        r'\1<section class="ff-sponsorTiers ff-mt-3" aria-label="Sponsorship tiers">'
        r'\1  <div class="ff-sponsorTiers__inner">'
        r'\1    <p class="ff-sr">Choose a sponsorship level to support the team and receive recognition.</p>'
        r'\1'
        r'\1    <ul class="ff-sponsorGrid"\2>',
        sponsors,
        count=1
    )

    # 2) Close the wrapper right before the sponsor meta row begins
    sponsors2 = re.sub(
        r'(\s*)</ul>\s*\n(\s*)<div\s+class="ff-row\s+ff-row--between[^"]*ff-sponsorMeta"',
        r'\1</ul>\n\1  </div>\n\1</section>\n\n\2<div class="ff-row ff-row--between ff-wrap ff-ais ff-gap-2 ff-sponsorMeta"',
        sponsors2,
        count=1
    )

    if sponsors2 == sponsors:
        raise SystemExit("❌ Sponsors HTML patch made no changes (pattern mismatch).")

    bak = backup(html_path, "sponsors_tiers_wrap_v2")
    out = html[:a] + sponsors2 + html[b:]
    html_path.write_text(out, encoding="utf-8")
    return True, bak


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default="app/templates/index.html")
    ap.add_argument("--css", default="app/static/css/ff.css")
    args = ap.parse_args()

    html_path = Path(args.html)
    css_path = Path(args.css)

    if not html_path.exists():
        raise SystemExit(f"❌ Missing HTML file: {html_path}")
    if not css_path.exists():
        raise SystemExit(f"❌ Missing CSS file: {css_path}")

    changed_html, bak_html = patch_sponsors_html(html_path)
    changed_css,  bak_css  = patch_css(css_path)

    print("✅ Patch complete")
    print(f"• HTML: {'changed' if changed_html else 'already patched'} -> {html_path}")
    if bak_html: print(f"  🗄️  backup: {bak_html}")
    print(f"• CSS : {'changed' if changed_css else 'already patched'} -> {css_path}")
    if bak_css: print(f"  🗄️  backup: {bak_css}")

if __name__ == "__main__":
    main()
