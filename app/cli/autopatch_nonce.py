# app/cli/autopatch_nonce.py
from __future__ import annotations

import click
from pathlib import Path

PATCH_SIGNATURE = "# AUTO-NONCE-PATCH"
TARGET_FILE = Path("app/__init__.py")

SAFE_BLOCK = f"""
        try:
            html = resp.get_data(as_text=True)
        except UnicodeDecodeError:
            # {PATCH_SIGNATURE}: Skipped non-UTF-8 response (safe silent pass)
            return resp
"""

@click.command("autopatch-nonce")
def autopatch_nonce() -> None:
    """
    Patch FutureFunded's auto-nonce handler to silently skip
    non-UTF-8 responses without emitting warnings.
    """

    if not TARGET_FILE.exists():
        click.secho("❌ app/__init__.py not found.", fg="red")
        return

    raw = TARGET_FILE.read_text()

    if PATCH_SIGNATURE in raw:
        click.secho("⏭️  Patch already applied.", fg="yellow")
        return

    patched = []
    injected = False

    for line in raw.splitlines(keepends=True):
        patched.append(line)

        # Look for the injection trigger
        if "html = resp.get_data(as_text=True)" in line and not injected:
            patched.append(SAFE_BLOCK)
            injected = True

    TARGET_FILE.write_text("".join(patched))

    if injected:
        click.secho("✨ Auto-nonce silent-skip patch applied successfully!", fg="green")
    else:
        click.secho("⚠️  Injection point not found. Patch skipped.", fg="yellow")

