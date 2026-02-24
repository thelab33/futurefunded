#!/usr/bin/env python3
"""
generate_css_stubs.py
Reads a newline-separated list of selectors and writes a conservative stub CSS file.
Usage:
  python tools/generate_css_stubs.py missing.txt app/static/css/_auto_stubs.css
"""
import sys, os

TEMPLATE_HEADER = """/* Auto-generated CSS stubs — gentle defaults */
@layer ff.components {
"""
TEMPLATE_FOOTER = "\n}\n"

def canonicalize(sel):
    sel = sel.strip()
    if not sel:
        return ""
    return sel

def render_selector_block(sel):
    # very conservative default: ensure block-level display and minimal spacing
    if sel.startswith("."):
        return f"{sel} {{ display:block; margin:0.25rem 0; }}\n"
    if sel.startswith("#"):
        return f"{sel} {{ display:block; }}\n"
    # fallback
    return f"{sel} {{ display:block; }}\n"

def main():
    if len(sys.argv) < 3:
        print("Usage: generate_css_stubs.py <missing_list.txt> <out.css>", file=sys.stderr)
        sys.exit(2)
    infile, outfile = sys.argv[1], sys.argv[2]
    if not os.path.isfile(infile):
        print("Missing input file", infile, file=sys.stderr)
        sys.exit(2)
    with open(infile, "r", encoding="utf-8") as fh:
        sels = [canonicalize(l) for l in fh if l.strip()]
    with open(outfile, "w", encoding="utf-8") as fh:
        fh.write(TEMPLATE_HEADER)
        for s in sels:
            fh.write(render_selector_block(s))
        fh.write(TEMPLATE_FOOTER)
    print("Wrote stubs to", outfile)

if __name__ == "__main__":
    main()
