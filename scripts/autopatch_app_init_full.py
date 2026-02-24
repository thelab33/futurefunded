#!/usr/bin/env python3
"""
FutureFunded — app/__init__.py FULL FILE AUTO-PATCHER
----------------------------------------------------
• Fixes invalid escaped quotes (\" → ")
• Removes illegal global @app.context_processor
• Ensures clean APP_VERSION + config wiring
• Idempotent & factory-safe
"""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "app" / "__init__.py"
APP_VERSION = "flagship-v16.3"


def die(msg: str):
    print(f"❌ {msg}")
    sys.exit(1)


def main():
    if not TARGET.exists():
        die("app/__init__.py not found")

    text = TARGET.read_text()

    changed = False

    # ------------------------------------------------------------------
    # 1) Fix escaped quotes introduced by bad regex patches
    # ------------------------------------------------------------------
    if '\\"' in text:
        text = text.replace('\\"', '"')
        changed = True
        print("✔ Fixed escaped quotes")

    # ------------------------------------------------------------------
    # 2) Remove illegal global @app.context_processor block (EOF)
    # ------------------------------------------------------------------
    bad_block = re.compile(
        r"\n# -{5,}\n# Global template context: version \+ asset cache busting\n# -{5,}\n.*?inject_global_versions\(\):.*?}\n",
        re.S,
    )

    if bad_block.search(text):
        text = bad_block.sub("\n", text)
        changed = True
        print("✔ Removed illegal global context_processor")

    # ------------------------------------------------------------------
    # 3) Ensure canonical APP_VERSION exists (clean literal)
    # ------------------------------------------------------------------
    if "APP_VERSION =" not in text:
        text = re.sub(
            r"(from __future__ import annotations\s*)",
            r'\1\n# Canonical application version\nAPP_VERSION = "' + APP_VERSION + '"\n',
            text,
            count=1,
        )
        changed = True
        print("✔ Injected APP_VERSION constant")

    # ------------------------------------------------------------------
    # 4) Ensure app.config wiring uses valid Python
    # ------------------------------------------------------------------
    if 'app.config["APP_VERSION"] = APP_VERSION' not in text:
        text = re.sub(
            r"(app = Flask\(.*?\)\n)",
            r'\1    app.config["APP_VERSION"] = APP_VERSION\n    app.config["ASSET_VERSION"] = APP_VERSION\n',
            text,
            count=1,
            flags=re.S,
        )
        changed = True
        print("✔ Wired APP_VERSION into app.config")

    if changed:
        TARGET.write_text(text)
        print("\n🎉 app/__init__.py fully patched and repaired")
    else:
        print("ℹ No changes needed (file already clean)")


if __name__ == "__main__":
    main()
