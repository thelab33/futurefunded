#!/usr/bin/env python3
from __future__ import annotations

import re
import shutil
import sys
import time
from pathlib import Path

ROOT = Path.cwd()

AUDIT_FILE = ROOT / "tools/audit/ff_dom_contract_map.py"
JS_FILE = ROOT / "app/static/js/ff-app.js"
HTML_FILE = ROOT / "app/templates/index.html"

TARGETS = [AUDIT_FILE, JS_FILE, HTML_FILE]


def backup(path: Path, label: str) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak-{label}-{stamp}")
    shutil.copy2(path, bak)
    return bak


def replace_exact_once(text: str, old: str, new: str, notes: list[str], label: str) -> str:
    if old in text:
        text = text.replace(old, new)
        notes.append(label)
    return text


def replace_regex(text: str, pattern: str, repl: str, notes: list[str], label: str, flags: int = re.S) -> str:
    new_text, count = re.subn(pattern, repl, text, flags=flags)
    if count:
        notes.append(f"{label} ({count}x)")
    return new_text


def ensure_attr_on_opening_tag(html: str, match_pattern: str, attr_snippet: str, notes: list[str], label: str) -> str:
    """
    Add attr_snippet inside opening tag only if the tag matches and attr_snippet isn't already there.
    match_pattern should capture the whole opening tag.
    """
    pattern = re.compile(match_pattern, re.S)

    def repl(m: re.Match) -> str:
        tag = m.group(0)
        if attr_snippet in tag:
            return tag
        if tag.endswith(">"):
            notes.append(label)
            return tag[:-1] + " " + attr_snippet + ">"
        return tag

    return pattern.sub(repl, html, count=1)


def ensure_class_on_tag(html: str, match_pattern: str, class_name: str, notes: list[str], label: str) -> str:
    pattern = re.compile(match_pattern, re.S)

    def repl(m: re.Match) -> str:
        tag = m.group(0)

        class_m = re.search(r'class="([^"]*)"', tag)
        if not class_m:
            return tag

        classes = class_m.group(1).split()
        if class_name in classes:
            return tag

        new_classes = class_m.group(1).rstrip() + " " + class_name
        notes.append(label)
        return tag[:class_m.start(1)] + new_classes + tag[class_m.end(1):]

    return pattern.sub(repl, html, count=1)


def patch_audit_file(path: Path) -> tuple[bool, list[str]]:
    text = path.read_text(encoding="utf-8")
    original = text
    notes: list[str] = []

    old = "if depth == 0 and prelude and not prelude.startswith(\"@\"):"
    new = "if depth == 0 and prelude:"
    text = replace_exact_once(
        text,
        old,
        new,
        notes,
        "audit: allow selectors inside @layer blocks",
    )

    # Optional guard: don't count @keyframes from/to as selectors if later logic changes.
    text = replace_exact_once(
        text,
        'IGNORE_SELECTOR_PREFIXES = (":root", "@", "from", "to")',
        'IGNORE_SELECTOR_PREFIXES = (":root", "from", "to")',
        notes,
        "audit: keep ignoring from/to but not all @ preludes",
    )

    if text != original:
        bak = backup(path, "launch-hardening")
        path.write_text(text, encoding="utf-8")
        notes.insert(0, f"backup: {bak}")
        return True, notes
    return False, notes


def patch_js_file(path: Path) -> tuple[bool, list[str]]:
    text = path.read_text(encoding="utf-8")
    original = text
    notes: list[str] = []

    replacements = [
        (
            ".ff-sponsorWall",
            "[data-ff-sponsor-wall]",
            "js: normalize sponsor wall selector to data hook",
        ),
        (
            "#sponsors .ff-empty",
            "#sponsors [data-ff-sponsor-wall-empty], #sponsors .ff-empty",
            "js: allow sponsor empty state data hook",
        ),
        (
            'script[src="\' + src + \'"]',
            'script[src]',
            "js: kill invalid dynamic script selector",
        ),
        (
            "script[src=\"' + src + '\"]",
            "script[src]",
            "js: kill invalid dynamic script selector (double-quoted variant)",
        ),
        (
            ".ff-teamCard__media",
            ".ff-teamCard__media, .ff-teamCard__mediaBackdrop",
            "js: allow existing team media fallback class",
        ),
        (
            ".ff-sponsorCell",
            "[data-ff-sponsor-cell], .ff-sponsorCell",
            "js: allow sponsor cell data hook fallback",
        ),
    ]

    for old, new, label in replacements:
        text = replace_exact_once(text, old, new, notes, label)

    # If JS is looking for a teams wrapper hook, let it also fall back to #teams.
    text = replace_exact_once(
        text,
        "[data-ff-teams]",
        "[data-ff-teams], #teams",
        notes,
        "js: allow #teams fallback for teams root",
    )

    # If JS is looking for share campaign hook, allow main share button as fallback.
    text = replace_exact_once(
        text,
        "[data-ff-share-campaign]",
        "[data-ff-share-campaign], [data-ff-share]",
        notes,
        "js: allow main share hook as campaign fallback",
    )

    if text != original:
        bak = backup(path, "launch-hardening")
        path.write_text(text, encoding="utf-8")
        notes.insert(0, f"backup: {bak}")
        return True, notes
    return False, notes


def patch_html_file(path: Path) -> tuple[bool, list[str]]:
    html = path.read_text(encoding="utf-8")
    original = html
    notes: list[str] = []

    # 1) Add data-ff-teams to the teams section root if missing.
    html = ensure_attr_on_opening_tag(
        html,
        r'<section\b[^>]*\bid="teams"\b[^>]*>',
        'data-ff-teams',
        notes,
        "html: add data-ff-teams to #teams section",
    )

    # 2) Add data-ff-team-card to first ff-teamCard opening tag pattern(s).
    #    Applied globally via regex replacement callback.
    team_card_pattern = re.compile(r'<article\b[^>]*class="[^"]*\bff-teamCard\b[^"]*"[^>]*>', re.S)

    def team_card_repl(m: re.Match) -> str:
        tag = m.group(0)
        changed = False

        if 'data-ff-team-card' not in tag:
            tag = tag[:-1] + ' data-ff-team-card>'
            changed = True

        class_m = re.search(r'class="([^"]*)"', tag)
        if class_m:
            classes = class_m.group(1).split()
            if "ff-teamCard" in classes and "ff-teamCard__media" not in classes:
                # Do NOT add .ff-teamCard__media to article root — wrong semantics.
                pass

        if changed:
            notes.append("html: add data-ff-team-card to ff-teamCard article")
        return tag

    html = team_card_pattern.sub(team_card_repl, html)

    # 3) Add data-ff-team-name on templated team name ids.
    html = replace_regex(
        html,
        r'(id="team-\{\{\s*tid\|e\s*\}\}-name")(?![^>]*data-ff-team-name)',
        r'\1 data-ff-team-name="{{ tid|e }}"',
        notes,
        "html: add data-ff-team-name fallback on team name id",
    )

    # 4) Add ff-sponsorWall class to sponsor wall root if data hook exists.
    sponsor_wall_pattern = re.compile(
        r'<([a-zA-Z0-9]+)\b([^>]*\bdata-ff-sponsor-wall\b[^>]*)class="([^"]*)"([^>]*)>',
        re.S,
    )

    def sponsor_wall_repl(m: re.Match) -> str:
        tag_name, before_class, class_val, after_class = m.groups()
        classes = class_val.split()
        if "ff-sponsorWall" not in classes:
            classes.append("ff-sponsorWall")
            notes.append("html: add ff-sponsorWall class to sponsor wall root")
        return f'<{tag_name}{before_class}class="{" ".join(classes)}"{after_class}>'

    html = sponsor_wall_pattern.sub(sponsor_wall_repl, html, count=1)

    # 5) Add ff-empty class to sponsor empty state if data hook exists.
    sponsor_empty_pattern = re.compile(
        r'<([a-zA-Z0-9]+)\b([^>]*\bdata-ff-sponsor-wall-empty\b[^>]*)class="([^"]*)"([^>]*)>',
        re.S,
    )

    def sponsor_empty_repl(m: re.Match) -> str:
        tag_name, before_class, class_val, after_class = m.groups()
        classes = class_val.split()
        if "ff-empty" not in classes:
            classes.append("ff-empty")
            notes.append("html: add ff-empty class to sponsor empty state")
        return f'<{tag_name}{before_class}class="{" ".join(classes)}"{after_class}>'

    html = sponsor_empty_pattern.sub(sponsor_empty_repl, html, count=1)

    # 6) Add data-ff-sponsor-cell + ff-sponsorCell on sponsor cards inside sponsor wall.
    sponsor_card_pattern = re.compile(
        r'<article\b([^>]*class="[^"]*\bff-card\b[^"]*"[^>]*)>',
        re.S,
    )

    def sponsor_card_repl(m: re.Match) -> str:
        tag = "<article" + m.group(1) + ">"
        # Only patch if it looks sponsor-related.
        if "sponsor" not in tag.lower():
            return tag

        class_m = re.search(r'class="([^"]*)"', tag)
        if class_m:
            classes = class_m.group(1).split()
            changed = False
            if "ff-sponsorCell" not in classes:
                classes.append("ff-sponsorCell")
                changed = True
            tag = tag[:class_m.start(1)] + " ".join(classes) + tag[class_m.end(1):]
            if 'data-ff-sponsor-cell' not in tag:
                tag = tag[:-1] + ' data-ff-sponsor-cell>'
                changed = True
            if changed:
                notes.append("html: add sponsor cell fallback class/data hook")
        return tag

    html = sponsor_card_pattern.sub(sponsor_card_repl, html)

    if html != original:
        bak = backup(path, "launch-hardening")
        path.write_text(html, encoding="utf-8")
        notes.insert(0, f"backup: {bak}")
        return True, notes
    return False, notes


def main() -> int:
    missing = [str(p) for p in TARGETS if not p.exists()]
    if missing:
        print("❌ Missing required files:")
        for item in missing:
            print(f"  - {item}")
        return 1

    changed_any = False
    report: list[tuple[str, bool, list[str]]] = []

    for label, fn, path in [
        ("audit", patch_audit_file, AUDIT_FILE),
        ("js", patch_js_file, JS_FILE),
        ("html", patch_html_file, HTML_FILE),
    ]:
        changed, notes = fn(path)
        report.append((label, changed, notes))
        changed_any = changed_any or changed

    print("✅ Launch hardening patch complete")
    print("")

    for label, changed, notes in report:
        status = "CHANGED" if changed else "NO-CHANGE"
        print(f"[{status}] {label}")
        for note in notes:
            print(f"  • {note}")
        if not notes:
            print("  • no applicable patch found")
        print("")

    if not changed_any:
        print("ℹ️ No file content changed. This usually means the patterns already match your current code.")
    else:
        print("Next recommended commands:")
        print("  python3 tools/audit/ff_dom_contract_map.py")
        print("  sed -n '1,220p' tmp/ff_dom_contract_report.md")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
