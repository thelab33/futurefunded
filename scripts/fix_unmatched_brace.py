#!/usr/bin/env python3
"""
Conservative fixer: remove unmatched '}' characters that make brace balance negative.

Behavior:
 - Scans file while respecting "#..." comments and single/double/triple-quoted strings.
 - When a '}' would decrease the balance below 0, mark that specific character as unmatched.
 - Rewrites file skipping only those unmatched '}' characters.
 - Writes a backup: <file>.bak_unmatched_<timestamp>.py
 - Prints which line(s) had unmatched braces and shows context.

Use: python3 scripts/fix_unmatched_brace.py app/__init__.py
"""
import sys, os, datetime
from pathlib import Path

def fix_file(path: Path):
    txt = path.read_text(encoding="utf-8")
    n = len(txt)
    unmatched_idxs = []
    balance = 0

    i = 0
    # state
    in_squote = False
    in_dquote = False
    in_triple_s = False
    in_triple_d = False
    escape = False
    in_comment = False

    while i < n:
        c = txt[i]

        # handle line comments (#) when not in string
        if not (in_squote or in_dquote or in_triple_s or in_triple_d):
            if c == '#':
                # skip to end of line
                j = txt.find("\n", i)
                if j == -1:
                    break
                i = j + 1
                in_comment = False
                continue

        # handle escapes inside strings
        if (in_squote or in_dquote or in_triple_s or in_triple_d) and c == "\\":
            escape = not escape
            i += 1
            continue
        else:
            escape = False

        # detect triple quotes (''' or """)
        if not (in_squote or in_dquote or in_triple_s or in_triple_d):
            # possible start of triple single
            if txt.startswith("'''", i):
                in_triple_s = True
                i += 3
                continue
            if txt.startswith('"""', i):
                in_triple_d = True
                i += 3
                continue

        # end triple quotes
        if in_triple_s and txt.startswith("'''", i):
            in_triple_s = False
            i += 3
            continue
        if in_triple_d and txt.startswith('"""', i):
            in_triple_d = False
            i += 3
            continue

        # single/double quote handling (not triple)
        if not (in_triple_s or in_triple_d):
            if not (in_squote or in_dquote):
                if c == "'":
                    # ensure not a triple (already handled)
                    in_squote = True
                    i += 1
                    continue
                if c == '"':
                    in_dquote = True
                    i += 1
                    continue
            else:
                # inside single/double quoted string: close if matching and not escaped
                if in_squote and c == "'" and not escape:
                    in_squote = False
                    i += 1
                    continue
                if in_dquote and c == '"' and not escape:
                    in_dquote = False
                    i += 1
                    continue
                i += 1
                continue

        # if we're inside any string/triple-string, skip normal parsing
        if in_squote or in_dquote or in_triple_s or in_triple_d:
            i += 1
            continue

        # now real parser: only outside strings/comments
        if c == '{':
            balance += 1
        elif c == '}':
            if balance <= 0:
                # unmatched - mark this char index
                unmatched_idxs.append(i)
                # do not decrease below 0; skip decrement so subsequent matches remain meaningful
            else:
                balance -= 1
        i += 1

    if not unmatched_idxs:
        print("No unmatched '}' characters found. Nothing changed.")
        return 0

    # Show affected line numbers and create new content skipping those exact indices
    # map char indices to line numbers
    lines = txt.splitlines(keepends=True)
    line_starts = []
    acc = 0
    for ln, piece in enumerate(lines, start=1):
        line_starts.append((acc, ln))
        acc += len(piece)

    def idx_to_line(idx):
        # binary search-ish
        lo, hi = 0, len(line_starts)-1
        while lo <= hi:
            mid = (lo+hi)//2
            start, ln = line_starts[mid]
            # start of next line?
            next_start = line_starts[mid+1][0] if mid+1 < len(line_starts) else acc
            if start <= idx < next_start:
                return ln
            if idx < start:
                hi = mid-1
            else:
                lo = mid+1
        return 1

    affected_lines = sorted({ idx_to_line(i) for i in unmatched_idxs })
    print("Found unmatched '}' at character positions:", unmatched_idxs)
    print("Affected line numbers:", affected_lines)

    # create backup
    bak = path.with_suffix(".bak_unmatched_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".py")
    bak.write_text(txt, encoding="utf-8")
    print("Backup written to:", bak)

    # Build new text skipping only those specific indices
    skip_set = set(unmatched_idxs)
    new_chars = []
    for ii, ch in enumerate(txt):
        if ii in skip_set:
            # report context: print the line (once)
            pass
        else:
            new_chars.append(ch)
    new_txt = "".join(new_chars)
    path.write_text(new_txt, encoding="utf-8")
    print("Wrote fixed file (unmatched '}' characters removed).")

    # show small context around each affected line for review
    for ln in affected_lines:
        start = max(0, ln-3)
        end = ln+2
        print("\n---- context around line", ln, "----")
        for i in range(start, min(end, len(lines))):
            prefix = f"{i+1:4d}: "
            print(prefix + lines[i].rstrip("\n"))
    return len(affected_lines)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/fix_unmatched_brace.py <path>")
        sys.exit(2)
    target = Path(sys.argv[1])
    if not target.exists():
        print("File not found:", target)
        sys.exit(2)
    changed = fix_file(target)
    if changed:
        print(f"\n✅ Removed {changed} unmatched '}}' occurrences. Please run: python -m py_compile {target} to validate.")
    else:
        print("\nNo modifications made.")
