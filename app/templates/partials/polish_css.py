import glob
import re


def patch_file(filepath, patches):
    with open(filepath) as f:
        css = f.read()
    orig = css
    for find, repl in patches:
        css = re.sub(find, repl, css, flags=re.MULTILINE)
    if css != orig:
        print(f"Patched {filepath}")
        with open(filepath, "w") as f:
            f.write(css)


# Patch list: (regex, replacement)
patches = [
    # Hero wordmark opacity & z-index
    (r"(\.fc-hero-wordmark[^{]*\{[^\}]*?)opacity:\s*[^;]+;", r"\1opacity: 0.05;"),
    (r"(\.fc-hero-wordmark[^{]*\{[^\}]*?)z-index:\s*\d+;", r"\1z-index: 1;"),
    # Feature tile background gradient
    (
        r"(\.feature-tile[^{]*\{[^\}]*?)background:\s*linear-gradient[^;]+;",
        r"\1background: linear-gradient(160deg, #191929 85%, #232339 100%);",
    ),
    # Feature tile box-shadow
    (
        r"(\.feature-tile[^{]*\{[^\}]*?)box-shadow:[^;]+;",
        r"\1box-shadow: 0 8px 32px #0007, 0 2px 8px #fff2 inset;",
    ),
    # Border for extra pop
    (
        r"(\.feature-tile[^{]*\{[^\}]*?)(})",
        r"\1border: 1.5px solid rgba(255,255,255,0.04);\2",
    ),
    # Badge margin
    (
        r"(\.badge[^{]*\{[^\}]*?)margin-bottom:[^;]+;",
        r"\1margin-bottom: 0.7em; margin-right:0.5rem; vertical-align: middle;",
    ),
    # Tile-title font size & shadow
    (r"(\.tile-title[^{]*\{[^\}]*?)font-size:[^;]+;", r"\1font-size: 1.36rem;"),
    (
        r"(\.tile-title[^{]*\{[^\}]*?)text-shadow:[^;]+;",
        r"\1text-shadow: 0 2px 8px #0005;",
    ),
    # Tile-title margin top
    (r"(\.tile-title[^{]*\{[^\}]*?)(})", r"\1margin-top: 0.3em;\2"),
    # Hero photo z-index
    (r"(\.fc-hero-photo[^{]*\{[^\}]*?)z-index:[^;]+;", r"\1z-index: 2;"),
    # Gold CTA button shadow polish
    (
        r"(\.fc-hero-cta\s*\.btn\.gold[^{]*\{[^\}]*?)box-shadow:[^;]+;",
        r"\1box-shadow: 0 0 0 0 #facc1550, 0 0 14px 3px #facc1580;",
    ),
    # Footer donate vertical-align
    (
        r"(\.footer-donate[^{]*\{[^\}]*?)vertical-align:[^;]+;",
        r"\1vertical-align: middle; margin-top: 1px;",
    ),
]

# Patch all css files in static/css/
for cssfile in glob.glob("app/static/css/*.css"):
    patch_file(cssfile, patches)

print("✨ All done! Refresh your browser for agency-level upgrades.")
