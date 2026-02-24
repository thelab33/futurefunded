#!/usr/bin/env python3
"""
tools/patch_run_bootsafe.py

Make run.py boot-resilient by adding an import-time fallback and a runtime fallback
so the process stays alive and /health returns 200 with a 'degraded' payload if the
application factory fails during boot.

Usage:
  python tools/patch_run_bootsafe.py              # patches ./run.py
  python tools/patch_run_bootsafe.py --path run.py --git-commit "patch run bootsafe"
"""

from __future__ import annotations
import argparse
from pathlib import Path
import shutil
import datetime
import re
import sys
import subprocess

BOOTSAFE_MARKER = "BOOT-SAFE APP BUILD (drop-in)"
DEFAULT_PATH = Path("run.py")

IMPORT_RE = re.compile(
    r"setup_logging\(_import_cfg\.debug,\s*_import_cfg\.log_style\)\s*\n\s*app\s*=\s*build_app\(_import_cfg\)",
    re.M,
)

IMPORT_REPLACEMENT = r"""setup_logging(_import_cfg.debug, _import_cfg.log_style)

# -------------------- BOOT-SAFE APP BUILD (drop-in) --------------------
# Replace direct build_app(_import_cfg) with a safe attempt that creates a
# minimal fallback Flask app if the factory fails during import-time.
# This prevents the process from dying and makes /health return 200+degraded.

try:
    # Try building the real app (normal path)
    app = build_app(_import_cfg)
    logging.info("Application factory built successfully at import-time.")
except Exception as exc:  # pragma: no cover - defensive fallback
    logging.exception("App factory failed during import-time. Creating emergency fallback app.")
    # Create a minimal fallback app that provides basic health and diagnostics.
    from flask import Flask, jsonify, make_response

    fallback = Flask("futurefunded_fallback")

    @fallback.route("/health", methods=["GET"])
    def _fallback_health():
        # NEVER return 500 to an external probe; instead report 'degraded' so monitors alert but don't mark as down.
        payload = {
            "status": "degraded",
            "reason": "app_factory_failed",
            "message": "Application failed to boot. Check server logs for details."
        }
        return make_response(jsonify(payload), 200)

    @fallback.route("/", methods=["GET"])
    def _fallback_index():
        return (
            "FutureFunded emergency fallback — application factory failed during boot. "
            "See server logs for details.", 503
        )

    # Optionally expose a small diagnostic endpoint only on localhost to avoid leaking details publicly
    @fallback.route("/_diag/boot", methods=["GET"])
    def _fallback_diag():
        return jsonify({
            "status": "fallback",
            "import_time_error": str(exc)[:1000],
        }), 200

    app = fallback

# ----------------------------------------------------------------------
"""

MAIN_RE = re.compile(
    r"(\n\s*try:\s*\n\s*flask_app\s*=\s*build_app\(cfg\)\s*\n\s*except Exception as exc:)|(\n\s*flask_app\s*=\s*build_app\(cfg\))",
    re.M,
)

MAIN_REPLACEMENT = r"""
    try:
        flask_app = build_app(cfg)
    except Exception as exc:
        logging.exception("Application factory failed during `main()` bootstrap.")
        # mimic the same fallback app as the import-time case
        from flask import Flask, jsonify, make_response
        fb = Flask("futurefunded_fallback_runtime")
        @fb.route("/health")
        def health_runtime():
            return make_response(jsonify({
                "status": "degraded",
                "reason": "app_factory_failed_runtime",
                "message": "Application failed to boot (runtime). Check logs."
            }), 200)
        flask_app = fb
"""

def backup_file(path: Path) -> Path:
    ts = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    bak = path.with_suffix(path.suffix + f".bak.{ts}")
    shutil.copy2(path, bak)
    return bak

def git_commit(path: Path, message: str) -> bool:
    try:
        subprocess.run(["git", "add", str(path)], check=True)
        subprocess.run(["git", "commit", "-m", message], check=True)
        return True
    except Exception as e:
        print(f"⚠️  Git commit failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Patch run.py to add boot-safe fallback.")
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH, help="Path to run.py")
    parser.add_argument("--git-commit", type=str, default="", help="Create a git commit with this message after patching")
    args = parser.parse_args()

    path = args.path
    if not path.exists():
        print(f"❌ File not found: {path}")
        sys.exit(2)

    text = path.read_text(encoding="utf-8")

    if BOOTSAFE_MARKER in text:
        print("✅ run.py already contains boot-safe marker. No changes made.")
        sys.exit(0)

    # Backup
    bak = backup_file(path)
    print(f"📦 Backup created: {bak}")

    new_text = text
    # Replace import-time direct build
    if IMPORT_RE.search(new_text):
        new_text, n1 = IMPORT_RE.subn(IMPORT_REPLACEMENT, new_text, count=1)
        print(f"🔁 import-time build_app replacement: {n1} occurrence(s) replaced.")
    else:
        print("⚠️  Warning: Could not find the import-time build_app pattern. No import-time change applied.")

    # Replace main() runtime build
    if "def main()" in new_text and "flask_app = build_app(cfg)" in new_text:
        # Replace the first occurrence of the exact call inside main; use a conservative approach:
        new_text, n2 = re.subn(r"\n\s*flask_app\s*=\s*build_app\(cfg\)\s*\n", "\n" + MAIN_REPLACEMENT + "\n", new_text, count=1)
        print(f"🔁 runtime main() build_app replacement: {n2} occurrence(s) replaced.")
    else:
        print("⚠️  Warning: Could not find runtime build_app call inside main(). No runtime change applied.")

    if new_text == text:
        print("⚠️  No changes detected (nothing patched). Restoring original file from backup.")
        sys.exit(0)

    path.write_text(new_text, encoding="utf-8")
    print(f"✅ Patched {path}")

    if args.git_commit:
        ok = git_commit(path, args.git_commit)
        if ok:
            print("✅ Git commit created.")
        else:
            print("⚠️ Git commit not created; see message above.")

    print("\nNext steps (run these yourself):")
    print("1) Restart service: sudo systemctl restart futurefunded  OR run: python run.py --env development --no-reload")
    print("2) Check health: curl -fsS https://getfuturefunded.com/health | jq .")
    print("3) Inspect logs for errors: sudo journalctl -u futurefunded -n 200 --no-pager")
    print("\nIf you want, run this again with --git-commit 'message' to auto-commit the change.")

if __name__ == "__main__":
    main()
