from __future__ import annotations

import argparse
import re
from pathlib import Path

APP_DIR = Path("app")

# Templates we want to replace with index.html (keep existing context kwargs intact)
TO_INDEX = {
    "pages/home.html",
    "privacy.html",
    "terms.html",
    "donate.html",
    "about.html",
    "sponsor_list.html",
    "thank_you.html",
    "tiers.html",
    "become_sponsor.html",
    "error.html",
    "legal/privacy.html",
    "legal/terms.html",
    "legal/refunds.html",
    "support/support.html",
    "support/support_success.html",
}

# Templates we want to disable entirely (admin/dev surfaces)
TO_ABORT_404 = {
    "admin/dashboard.html",
    "admin/sponsors.html",
    "admin/goals.html",
    "admin/transactions.html",
    "dev/stripe_smoke.html",
}

# render_template("x", ... ) matcher (handles multiline)
RENDER_CALL_RE = re.compile(
    r"render_template\(\s*([\"'])(?P<tpl>[^\"']+)\1(?P<rest>\s*,.*?|\s*)\)",
    re.S,
)

FLASK_IMPORT_RE = re.compile(r"(?m)^(from\s+flask\s+import\s+)(.+)$")

def ensure_abort_import(src: str) -> str:
    if "abort(" not in src:
        return src
    # already has abort import
    for m in FLASK_IMPORT_RE.finditer(src):
        imports = m.group(2)
        if re.search(r"\babort\b", imports):
            return src

    # extend first "from flask import ..." if present
    m = FLASK_IMPORT_RE.search(src)
    if m:
        prefix = m.group(1)
        imports = m.group(2).strip()
        # avoid trailing comments
        parts = [p.strip() for p in imports.split(",") if p.strip()]
        if "abort" not in parts:
            parts.append("abort")
        new_line = prefix + ", ".join(parts)
        return src[:m.start()] + new_line + src[m.end():]

    # else insert a new import near top (after future imports/shebang/module doc)
    insert_at = 0
    lines = src.splitlines(True)
    for i, line in enumerate(lines[:40]):
        if line.startswith("#!") or line.strip().startswith("#"):
            continue
        if line.strip().startswith('"""') or line.strip().startswith("'''"):
            # skip module docstring block
            # naive: insert after first docstring ends
            pass
        # insert after first non-comment line if it's __future__ import
        if line.strip().startswith("from __future__ import"):
            insert_at = i + 1
            break
        insert_at = i
        break

    lines.insert(insert_at + 1, "from flask import abort\n")
    return "".join(lines)

def patch_file(path: Path, write: bool) -> tuple[bool, int, int]:
    src = path.read_text(encoding="utf-8")
    patched = src
    n_to_index = 0
    n_abort = 0

    def repl(m: re.Match) -> str:
        nonlocal n_to_index, n_abort
        tpl = (m.group("tpl") or "").strip().lstrip("/")
        rest = m.group("rest") or ""

        if tpl in TO_INDEX:
            n_to_index += 1
            return f'render_template("index.html"{rest})'

        if tpl in TO_ABORT_404:
            n_abort += 1
            return "abort(404)"

        return m.group(0)

    patched = RENDER_CALL_RE.sub(repl, patched)

    # If we introduced abort(404), ensure abort is imported
    if n_abort > 0:
        patched = ensure_abort_import(patched)

    changed = patched != src
    if not changed:
        return False, 0, 0

    if not write:
        return True, n_to_index, n_abort

    bak = path.with_suffix(path.suffix + ".bak_onepager_tpl_v1")
    if not bak.exists():
        bak.write_text(src, encoding="utf-8")
        print(f"[ff-onepager] backup -> {bak}")
    path.write_text(patched, encoding="utf-8")
    return True, n_to_index, n_abort

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="Apply patch (default dry-run)")
    args = ap.parse_args()

    changed_files = 0
    total_to_index = 0
    total_abort = 0

    for py in APP_DIR.rglob("*.py"):
        try:
            changed, n_i, n_a = patch_file(py, write=bool(args.write))
        except Exception:
            continue
        if changed:
            changed_files += 1
            total_to_index += n_i
            total_abort += n_a
            if not args.write:
                print(f"[ff-onepager] would patch: {py} (to_index={n_i}, abort404={n_a})")
            else:
                print(f"[ff-onepager] patched: {py} (to_index={n_i}, abort404={n_a})")

    print(f"[ff-onepager] files_changed: {changed_files} | to_index: {total_to_index} | abort404: {total_abort}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
