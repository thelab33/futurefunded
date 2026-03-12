from __future__ import annotations

import argparse
import re
from pathlib import Path

DEFAULT_FILE = Path("app/static/css/ff.css")

# Match any line that is JUST the EOF marker (allow whitespace)
EOF_LINE_RE = re.compile(
    r'(?m)^[ \t]*/\*\s*EOF:\s*app/static/css/ff\.css\s*\*/[ \t]*\r?\n?'
)

CANONICAL_EOF = "/* EOF: app/static/css/ff.css */\n"


def patch(path: Path, write: bool) -> int:
    src = path.read_text(encoding="utf-8")

    # remove all EOF lines
    cleaned, n = EOF_LINE_RE.subn("", src)

    # re-add one canonical EOF at end
    out = cleaned.rstrip() + "\n\n" + CANONICAL_EOF

    if out == src:
        print("[ff-single-eof] no changes needed ✅")
        return 0

    if not write:
        print("[ff-single-eof] dry-run: would patch", path)
        print(f"[ff-single-eof] removed EOF lines: {n}")
        return 0

    bak = path.with_suffix(path.suffix + ".bak_single_eof_v1")
    if not bak.exists():
        bak.write_text(src, encoding="utf-8")
        print(f"[ff-single-eof] backup -> {bak}")

    path.write_text(out, encoding="utf-8")
    print("[ff-single-eof] patched ff.css ✅")
    print(f"[ff-single-eof] removed EOF lines: {n}")
    print("[ff-single-eof] ensured ONE EOF at end ✅")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=str(DEFAULT_FILE))
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    p = Path(args.file)
    if not p.exists():
        raise SystemExit(f"[ff-single-eof] missing file: {p}")
    return patch(p, write=bool(args.write))


if __name__ == "__main__":
    raise SystemExit(main())
