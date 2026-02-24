#!/usr/bin/env python3
"""
FutureFunded — Version Auto-Patcher
----------------------------------
• Adds canonical APP_VERSION
• Injects global template versions (_v / FF_VERSION / asset_v)
• Fixes ffConfig version/buildId/assetV
• Fixes ff-version meta tags
• Idempotent (safe to re-run)
"""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

APP_INIT = ROOT / "app" / "__init__.py"
INDEX_HTML = ROOT / "app" / "templates" / "index.html"

APP_VERSION = "flagship-v16.3"


def die(msg):
    print(f"❌ {msg}")
    sys.exit(1)


def patch_init_py():
    text = APP_INIT.read_text()

    if "APP_VERSION =" not in text:
        text = re.sub(
            r"(import .*?\n)",
            r"\1\n# Canonical application version\nAPP_VERSION = \"" + APP_VERSION + "\"\n\n",
            text,
            count=1,
            flags=re.S,
        )

    if "app.config[\"APP_VERSION\"]" not in text:
        text = re.sub(
            r"(app = Flask\(.*?\)\n)",
            r"\1    app.config[\"APP_VERSION\"] = APP_VERSION\n    app.config[\"ASSET_VERSION\"] = APP_VERSION\n",
            text,
            count=1,
            flags=re.S,
        )

    if "inject_global_versions" not in text:
        text += """
# ---------------------------------------------------------------------
# Global template context: version + asset cache busting
# ---------------------------------------------------------------------
from flask import current_app

@app.context_processor
def inject_global_versions():
    v = current_app.config.get("APP_VERSION", "")
    return {
        "FF_VERSION": v,
        "_v": v,
        "asset_v": v,
    }
"""
    APP_INIT.write_text(text)
    print("✅ Patched app/__init__.py")


def patch_index_html():
    text = INDEX_HTML.read_text()

    text = re.sub(
        r'<meta name="ff-version" content="[^"]*"\s*/?>',
        '<meta name="ff-version" content="{{ FF_VERSION|e }}">',
        text,
    )
    text = re.sub(
        r'<meta name="ff:version" content="[^"]*"\s*/?>',
        '<meta name="ff:version" content="{{ FF_VERSION|e }}">',
        text,
    )

    text = re.sub(
        r'"version"\s*:\s*null',
        '"version": {{ FF_VERSION|tojson }}',
        text,
    )
    text = re.sub(
        r'"buildId"\s*:\s*null',
        '"buildId": {{ FF_VERSION|tojson }}',
        text,
    )
    text = re.sub(
        r'"assetV"\s*:\s*null',
        '"assetV": {{ FF_VERSION|tojson }}',
        text,
    )

    INDEX_HTML.write_text(text)
    print("✅ Patched templates/index.html")


def main():
    if not APP_INIT.exists():
        die("app/__init__.py not found")
    if not INDEX_HTML.exists():
        die("app/templates/index.html not found")

    patch_init_py()
    patch_index_html()

    print("\n🎉 Version auto-patch complete")
    print(f"   Canonical version: {APP_VERSION}")
    print("   Safe to re-run anytime")


if __name__ == "__main__":
    main()
