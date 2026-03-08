#!/usr/bin/env python3
from pathlib import Path
import re, datetime as dt, argparse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    fp = Path(args.path)
    src = fp.read_text(encoding="utf-8", errors="replace")
    cur = src

    def add_attr(m):
        open_tag = m.group(1)
        end = m.group(3)  # <-- THIS IS THE ">" (not the quote)
        if re.search(r'\bdata-ff-donate\b', open_tag, flags=re.I):
            return m.group(0)
        return open_tag + ' data-ff-donate=""' + end

    # anchors opening checkout via href="#checkout"
    pat_a = re.compile(r'(<a\b[^>]*\bhref\s*=\s*(["\'])#checkout\2[^>]*)(>)', re.I|re.S)
    cur, n_a = pat_a.subn(add_attr, cur)

    # any <a|button> opening checkout via aria-controls="checkout"
    pat_c = re.compile(r'(<(?:a|button)\b[^>]*\baria-controls\s*=\s*(["\'])checkout\2[^>]*)(>)', re.I|re.S)
    cur, n_c = pat_c.subn(add_attr, cur)

    changed = (cur != src)
    print("FutureFunded — ff_add_donatehook")
    print(f"• File: {fp}")
    print(f"• Changes: href #checkout: {n_a} | aria-controls=checkout: {n_c}")
    print(f"• Result: {'CHANGED' if changed else 'NO-OP'}")

    if not changed:
        return 0

    if args.write:
        bak = fp.with_suffix(fp.suffix + f".bak_donatehook_ok_{dt.datetime.now():%Y%m%d_%H%M%S}")
        bak.write_text(src, encoding="utf-8")
        fp.write_text(cur, encoding="utf-8")
        print("✅ wrote file. backup:", bak)
    else:
        print("ℹ️ dry-run only (use --write).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
