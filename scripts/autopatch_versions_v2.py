#!/usr/bin/env python3
"""
FutureFunded — Version Auto-Patcher (Factory-Safe v2)
----------------------------------------------------
• Ensures APP_VERSION exists
• Registers context processor INSIDE create_app()
• Fixes ffConfig + meta tags
• Safe to re-run
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

    # 1) Ensure APP_VERSION constant
    if "APP_VERSION =" not in text:
        text = re.sub(
            r"(import .*?\n)",
            r'\1\n# Canonical application version\nAPP_VERSION = "' + APP_VERSION + '"\n\n',
            text,
            count=1,
            flags=re.S,
        )

    # 2) Ensure config assignment inside create_app
    if 'app.config["APP_VERSION"]' not in text:
        text = re.sub(
            r"(def create_app\(.*?\):\n(?:.|\n)*?app = Flask\(.*?\)\n)",
            r'\1    app.config["APP_VERSION"] = APP_VERSION\n    app.config["ASSET_VERSION"] = APP_VERSION\n',
            text,
            count=1,
            flags=re.S,
        )

    # 3) Remove broken @app.context_processor if present
    text = re.sub(
        r"@app\.context_processor\s+def inject_global_versions\(\):.*?}\n",
        "",
        text,
        flags=re.S,
    )

    # 4) Inject factory-safe registration
    if "inject_global_versions(" not in text:
        text = re.sub(
            r"(def create_app\(.*?\):\n(?:.|\n)*?app = Flask\(.*?\)\n)",
            r"""\1    # Global template context: version + asset cache busting
    def inject_global_versions():
        v = app.config.get("APP_VERSION", "")
        return {
            "FF_VERSION": v,
            "_v": v,
            "asset_v": v,
        }

    app.context_processor(inject_global_versions)\n""",
            text,
            count=1,
            flags=re.S,
        )

    APP_INIT.write_text(text)
    print("✅ Patched app/__init__.py (factory-safe)")


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

    print("\n🎉 Version auto-patch v2 complete")
    print(f"   Canonical version: {APP_VERSION}")
    print("   Factory-safe. Safe to re-run.")


if __name__ == "__main__":
    main()
