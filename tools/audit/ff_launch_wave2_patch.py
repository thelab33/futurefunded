from pathlib import Path
import shutil, time, re

HTML = Path("app/templates/index.html")
JS = Path("app/static/js/ff-app.js")

def backup(p, label):
    b = p.with_suffix(p.suffix + f".bak-{label}-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(p, b)
    return b

def patch_html():
    s = HTML.read_text()
    orig = s

    # 1. Sponsor grid
    s = re.sub(
        r'(<[^>]*data-ff-sponsor-wall[^>]*>)',
        r'\1\n  <div data-ff-sponsor-grid></div>',
        s,
        count=1
    )

    # 2. Ensure ff-empty
    s = re.sub(
        r'(data-ff-sponsor-wall-empty[^>]*class=")([^"]*)"',
        lambda m: m.group(1) + (m.group(2) + " ff-empty" if "ff-empty" not in m.group(2) else m.group(2)) + '"',
        s
    )

    # 3. Team media class fix
    s = s.replace(
        "ff-teamCard__mediaBackdrop",
        "ff-teamCard__media ff-teamCard__mediaBackdrop"
    )

    if s != orig:
        b = backup(HTML, "wave2")
        HTML.write_text(s)
        print("✅ HTML patched", b)

def patch_js():
    s = JS.read_text()
    orig = s

    # Remove dead selectors
    dead = [
        ".ff-integrationTile",
        ".ff-pill--success",
        ".ff-railcard",
    ]

    for d in dead:
        s = s.replace(d, "")

    if s != orig:
        b = backup(JS, "wave2")
        JS.write_text(s)
        print("✅ JS patched", b)

patch_html()
patch_js()
