from __future__ import annotations

import argparse
import re
from pathlib import Path
from datetime import datetime

HTML_MARK = "FF_SPONSOR_TIERS_WRAP_V3"
CSS_MARK  = "FF_SPONSOR_SECTION_POLISH_V3"

# Also treat old markers as "already patched" to avoid re-wrapping.
HTML_MARK_OLD = "FF_SPONSOR_TIERS_WRAP_V2"
CSS_MARK_OLD  = "FF_SPONSOR_SECTION_POLISH_V2"

CSS_BLOCK = r'''
/* FF_SPONSOR_SECTION_POLISH_V3:BEGIN */
.ff-body .ff-sponsorTiers__inner{
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ff-root:not([data-theme="dark"]) .ff-body .ff-sponsorTiers__inner{
  border-top: 1px solid rgba(0, 0, 0, 0.06);
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
    0 14px 40px rgba(255, 128, 0, 0.18),
    0 0 0 1px rgba(255, 128, 0, 0.25);
}

/* VIP refinement (premium but restrained) */
.ff-body .ff-tierCard[data-ff-tier="vip"]{
  background:
    linear-gradient(180deg, rgba(255, 200, 120, 0.08), transparent),
    var(--ff-surface);
}

/* Subtle elevation hover */
.ff-body .ff-tierCard{
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.ff-body .ff-tierCard:hover{
  transform: translateY(-3px);
}

/* Webdriver stabilization */
:where(.ff-root)[data-ff-webdriver="true"] .ff-body :where(.ff-tierCard--recommended, .ff-tierCard){
  transform: none !important;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
}
/* FF_SPONSOR_SECTION_POLISH_V3:END */
'''.lstrip("\n")


SECTION_OPEN_RE = re.compile(
    r'<section\b[^>]*\bid\s*=\s*(["\'])sponsors\1[^>]*>',
    re.IGNORECASE
)

# Match ul opening tag whose class attribute contains ff-sponsorGrid (any order)
UL_GRID_RE = re.compile(
    r'<ul\b[^>]*\bclass\s*=\s*(["\'])(?:(?!\1).)*\bff-sponsorGrid\b(?:(?!\1).)*\1[^>]*>',
    re.IGNORECASE
)

# Used only as a sanity signal that we're in the Sponsors zone
SPONSOR_META_RE = re.compile(
    r'<div\b[^>]*\bclass\s*=\s*(["\'])(?:(?!\1).)*\bff-sponsorMeta\b(?:(?!\1).)*\1[^>]*>',
    re.IGNORECASE
)

TAG_SECTION_RE = re.compile(r'</?section\b[^>]*>', re.IGNORECASE)
TAG_UL_RE = re.compile(r'</?ul\b[^>]*>', re.IGNORECASE)


def backup(path: Path, suffix: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak_{suffix}_{ts}")
    bak.write_text(path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    return bak


def iter_template_files(root: Path) -> list[Path]:
    exts = (".html", ".jinja", ".j2")
    files: list[Path] = []
    if root.is_file():
        return [root]
    if not root.exists():
        return []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in exts:
            files.append(p)
    return sorted(files)


def find_sponsors_host_file(explicit_html: Path, templates_root: Path) -> Path:
    """
    Deterministic resolution order:
      1) try explicit_html (even if it’s index.html)
      2) scan templates_root for a file containing <section id='sponsors'...>
      3) scan templates_root for a file containing ff-sponsorGrid + ff-sponsorMeta
    """
    candidates: list[Path] = []

    if explicit_html.exists() and explicit_html.is_file():
        candidates.append(explicit_html)

    candidates.extend([p for p in iter_template_files(templates_root) if p not in candidates])

    # Pass 1: true sponsors section marker
    for p in candidates:
        s = p.read_text(encoding="utf-8", errors="replace")
        if SECTION_OPEN_RE.search(s):
            return p

    # Pass 2: sponsor grid + meta row (common in partials)
    for p in candidates:
        s = p.read_text(encoding="utf-8", errors="replace")
        if UL_GRID_RE.search(s) and SPONSOR_META_RE.search(s):
            return p

    raise SystemExit(
        f"❌ Could not locate Sponsors markup in {explicit_html} and scan of {templates_root}.\n"
        "   Looked for: <section id='sponsors'> OR ff-sponsorGrid + ff-sponsorMeta"
    )


def slice_balanced_section(doc: str, open_m: re.Match) -> tuple[int, int]:
    """
    Return [start, end) slice for the <section ...>...</section> that starts at open_m.
    Handles nested <section> by balancing tags.
    """
    start = open_m.start()
    depth = 0
    for m in TAG_SECTION_RE.finditer(doc, start):
        tag = m.group(0).lower()
        if tag.startswith("</"):
            depth -= 1
            if depth == 0:
                return start, m.end()
        else:
            depth += 1
    raise SystemExit("❌ Unbalanced <section> tags while slicing Sponsors section.")


def find_balanced_ul_end(doc: str, ul_open_start: int) -> int:
    """
    Find the matching </ul> end index for the <ul ...> that begins at ul_open_start,
    balancing nested <ul> (tier bullet lists won’t break us).
    Returns end position (index after the closing tag).
    """
    depth = 0
    for m in TAG_UL_RE.finditer(doc, ul_open_start):
        tag = m.group(0).lower()
        if tag.startswith("</"):
            depth -= 1
            if depth == 0:
                return m.end()
        else:
            depth += 1
    raise SystemExit("❌ Unbalanced <ul> tags while locating sponsor grid end.")


def patch_sponsors_html(html_path: Path, templates_root: Path) -> tuple[bool, Path | None, Path]:
    raw = html_path.read_text(encoding="utf-8", errors="replace")

    if HTML_MARK in raw or HTML_MARK_OLD in raw:
        return False, None, html_path

    # Locate the real file that contains the Sponsors section/grid (might be a partial)
    host = find_sponsors_host_file(html_path, templates_root)
    doc = host.read_text(encoding="utf-8", errors="replace")

    if HTML_MARK in doc or HTML_MARK_OLD in doc:
        return False, None, host

    # Prefer operating within the actual sponsors section if present (safer).
    open_m = SECTION_OPEN_RE.search(doc)
    if open_m:
        s_a, s_b = slice_balanced_section(doc, open_m)
        zone = doc[s_a:s_b]
        zone_offset = s_a
    else:
        zone = doc
        zone_offset = 0

    # Find the sponsor grid UL open
    ul_m = UL_GRID_RE.search(zone)
    if not ul_m:
        raise SystemExit(f'❌ Could not find ff-sponsorGrid <ul> in {host}')

    ul_open = ul_m.group(0)
    ul_open_start = zone_offset + ul_m.start()

    # Determine indentation from the line the <ul> starts on
    line_start = doc.rfind("\n", 0, ul_open_start) + 1
    indent = re.match(r"[ \t]*", doc[line_start:ul_open_start]).group(0)

    # Find the balanced end of THIS ul (so nested <ul> won’t break us)
    ul_end = find_balanced_ul_end(doc, ul_open_start)

    # Sanity: ensure sponsor meta row exists after grid end (strong signal we're in the right place)
    tail = doc[ul_end:ul_end + 20000]
    if not SPONSOR_META_RE.search(tail):
        # If we're not inside a sponsors section, this might be a false-positive grid.
        # Still allow patch if we were inside section; otherwise bail to avoid unintended wrap.
        if not open_m:
            raise SystemExit(
                f"❌ Found ff-sponsorGrid in {host} but could not confirm ff-sponsorMeta after it.\n"
                "   Refusing to wrap to avoid touching the wrong list."
            )

    wrapper_open = (
        f'{indent}<!-- {HTML_MARK} -->\n'
        f'{indent}<section class="ff-sponsorTiers ff-mt-3" aria-label="Sponsorship tiers">\n'
        f'{indent}  <div class="ff-sponsorTiers__inner">\n'
        f'{indent}    <p class="ff-sr">Choose a sponsorship level to support the team and receive recognition.</p>\n\n'
        f'{indent}    {ul_open}\n'
    )

    wrapper_close = (
        f'\n{indent}  </div>\n'
        f'{indent}</section>\n'
    )

    # Replace the UL open tag (only the first match in zone)
    before_ul = doc[:ul_open_start]
    after_ul_open = doc[ul_open_start + len(ul_open):]
    doc2 = before_ul + wrapper_open + after_ul_open

    # ul_end moved because we inserted wrapper_open (minus original ul_open length).
    delta = len(wrapper_open) - len(ul_open)
    ul_end2 = ul_end + delta

    doc3 = doc2[:ul_end2] + wrapper_close + doc2[ul_end2:]

    if doc3 == doc:
        raise SystemExit("❌ Sponsors HTML patch made no changes (unexpected).")

    bak = backup(host, "sponsors_tiers_wrap_v3")
    host.write_text(doc3, encoding="utf-8")
    return True, bak, host


def remove_old_css_block(css: str) -> str:
    # Remove v2 block if present (upgrade in place)
    css = re.sub(
        r'/\*\s*FF_SPONSOR_SECTION_POLISH_V2:BEGIN\s*\*/[\s\S]*?/\
\*\s*FF_SPONSOR_SECTION_POLISH_V2:END\s*\*/\s*',
        '',
        css,
        flags=re.IGNORECASE
    )
    return css


def patch_css(css_path: Path) -> tuple[bool, Path | None]:
    css = css_path.read_text(encoding="utf-8", errors="replace")

    if CSS_MARK in css:
        return False, None

    # If v2 exists, remove it and replace with v3 (still idempotent after upgrade)
    had_old = (CSS_MARK_OLD in css)
    if had_old:
        css = remove_old_css_block(css)

    m = re.search(r"/\*\s*EOF:\s*app/static/css/ff\.css\s*\*/", css)
    if not m:
        raise SystemExit("❌ Could not find CSS EOF marker: /* EOF: app/static/css/ff.css */")

    bak = backup(css_path, "sponsors_css_polish_v3")
    out = css[:m.start()] + "\n" + CSS_BLOCK + "\n" + css[m.start():]
    css_path.write_text(out, encoding="utf-8")
    return True, bak


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default="app/templates/index.html",
                    help="Entry template (index.html). If sponsors live in a partial, patcher will auto-find it.")
    ap.add_argument("--templates-root", default="app/templates",
                    help="Templates directory to scan for sponsors partials.")
    ap.add_argument("--css", default="app/static/css/ff.css")
    args = ap.parse_args()

    html_path = Path(args.html)
    templates_root = Path(args.templates_root)
    css_path = Path(args.css)

    if not css_path.exists():
        raise SystemExit(f"❌ Missing CSS file: {css_path}")
    if not html_path.exists():
        # still allow scan if index.html moved; but require templates root
        if not templates_root.exists():
            raise SystemExit(f"❌ Missing HTML entry: {html_path} and missing templates root: {templates_root}")

    html_changed = False
    css_changed = False
    bak_html = None
    bak_css = None
    host_file = None

    errors: list[str] = []

    # Patch HTML (auto-finds partial)
    try:
        html_changed, bak_html, host_file = patch_sponsors_html(html_path, templates_root)
    except SystemExit as e:
        errors.append(str(e))

    # Patch CSS (even if HTML failed)
    try:
        css_changed, bak_css = patch_css(css_path)
    except SystemExit as e:
        errors.append(str(e))

    print("✅ Patch run complete")
    if host_file:
        print(f"• HTML host: {host_file}")
        print(f"  HTML: {'changed' if html_changed else 'already patched'}")
        if bak_html:
            print(f"  🗄️  backup: {bak_html}")
    else:
        print("• HTML: not patched (see errors below)")

    print(f"• CSS : {'changed' if css_changed else 'already patched'} -> {css_path}")
    if bak_css:
        print(f"  🗄️  backup: {bak_css}")

    if errors:
        print("\n⚠️  Notes:")
        for msg in errors:
            print(" - " + msg)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
