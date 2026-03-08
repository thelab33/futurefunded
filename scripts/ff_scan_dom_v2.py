#!/usr/bin/env python3
"""
FutureFunded DOM Scanner v2
- counts ff-* classes
- counts data-ff-* hooks
- detects sections
- detects modal targets (even if hidden)
- counts open/close triggers
Writes: artifacts/ff_dom_report_v2.json
"""

import json, re
from pathlib import Path
from bs4 import BeautifulSoup

HTML = Path("app/templates/index.html")
OUT = Path("artifacts/ff_dom_report_v2.json")

def strip_jinja(txt: str) -> str:
    txt = re.sub(r"\{\{.*?\}\}", "", txt, flags=re.S)
    txt = re.sub(r"\{%.*?%\}", "", txt, flags=re.S)
    return txt

def main():
    raw = strip_jinja(HTML.read_text(encoding="utf-8", errors="replace"))
    soup = BeautifulSoup(raw, "html.parser")

    classes = set()
    hooks = set()
    sections = set()

    for el in soup.find_all(True):
        if el.get("class"):
            classes.update(el.get("class"))
        for a in el.attrs:
            if a.startswith("data-ff"):
                hooks.add(a)
        if el.name == "section" and el.get("id"):
            sections.add(el["id"])

    modal_targets = soup.select(".ff-modal, .ff-sheet, [role='dialog']")
    modal_ids = []
    for m in modal_targets:
        mid = m.get("id") or ""
        modal_ids.append(mid)

    openers = soup.select("[data-ff-open-checkout], [data-ff-open-sponsor], [data-ff-open-video], a[href='#checkout'], a[href='#sponsor-interest'], a[href='#press-video']")
    closers = soup.select("[data-ff-close-checkout], [data-ff-close-sponsor], [data-ff-close-video], [data-ff-close-terms], [data-ff-close-privacy], a[href='#home']")

    report = {
        "ff_classes_count": len([c for c in classes if c.startswith("ff-")]),
        "data_hooks_count": len(hooks),
        "sections_count": len(sections),
        "sections": sorted(sections),
        "modal_targets_count": len(modal_targets),
        "modal_ids": modal_ids,
        "open_triggers_count": len(openers),
        "close_triggers_count": len(closers),
        "sample_open_triggers": [str(getattr(x, "attrs", {}))[:180] for x in openers[:10]],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("🔎 FutureFunded DOM Scanner v2")
    print("ff-* classes:", report["ff_classes_count"])
    print("data hooks:", report["data_hooks_count"])
    print("sections:", report["sections_count"])
    print("modals (targets):", report["modal_targets_count"], report["modal_ids"])
    print("open triggers:", report["open_triggers_count"])
    print("close triggers:", report["close_triggers_count"])
    print("📄 Report written to:", OUT)

if __name__ == "__main__":
    main()
