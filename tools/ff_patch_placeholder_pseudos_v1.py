from __future__ import annotations
from pathlib import Path
from datetime import datetime

MARK = "FF_PATCH_PLACEHOLDER_PSEUDOS_V1"

def backup(p: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    b = p.with_suffix(p.suffix + f".bak_{MARK}_{ts}")
    b.write_text(p.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    return b

def main() -> None:
    p = Path("app/static/css/ff.css")
    if not p.exists():
        raise SystemExit("❌ ff.css not found")

    css = p.read_text(encoding="utf-8", errors="replace")
    if MARK in css:
        print("✅ Already patched")
        return

    bak = backup(p)

    # Replace non-standard pseudos with ::placeholder (standard)
    css2 = css.replace("::input-placeholder", "::placeholder")
    css2 = css2.replace(":input-placeholder", "::placeholder")

    # Stamp marker at EOF (or append)
    stamp = f"\n\n/* {MARK} */\n"
    if stamp.strip() not in css2:
        css2 += stamp

    p.write_text(css2, encoding="utf-8")
    print("✅ Patched placeholder pseudos")
    print(f"🗄️  backup: {bak}")

if __name__ == "__main__":
    main()
