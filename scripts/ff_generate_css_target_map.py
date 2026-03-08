#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Set

INDEX_PATH = Path("app/templates/index.html")

JINJA_PATTERNS = [
    re.compile(r"{#.*?#}", re.DOTALL),
    re.compile(r"{%.*?%}", re.DOTALL),
    re.compile(r"{{.*?}}", re.DOTALL),
]


def strip_jinja(text: str) -> str:
    out = text
    for pat in JINJA_PATTERNS:
        out = pat.sub("", out)
    return out


class SectionMapParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.section_stack: List[str] = []
        self.sections: Dict[str, Dict[str, Set[str]]] = defaultdict(
            lambda: {
                "classes": set(),
                "ids": set(),
                "data_attrs": set(),
                "tags": set(),
            }
        )
        self.global_classes: Set[str] = set()
        self.global_data_attrs: Set[str] = set()

    def handle_starttag(self, tag: str, attrs: List[tuple[str, str | None]]) -> None:
        attr_map = {k: (v or "") for k, v in attrs}
        section_id = None

        if tag == "section" and attr_map.get("id"):
            section_id = attr_map["id"]
            self.section_stack.append(section_id)

        current = self.section_stack[-1] if self.section_stack else "__global__"

        self.sections[current]["tags"].add(tag)

        if "id" in attr_map:
            self.sections[current]["ids"].add(attr_map["id"])

        if "class" in attr_map:
            for cls in attr_map["class"].split():
                if cls.strip():
                    self.sections[current]["classes"].add(cls.strip())
                    self.global_classes.add(cls.strip())

        for key in attr_map:
            if key.startswith("data-ff-"):
                self.sections[current]["data_attrs"].add(key)
                self.global_data_attrs.add(key)

    def handle_endtag(self, tag: str) -> None:
        if tag == "section" and self.section_stack:
            self.section_stack.pop()


def main() -> int:
    raw = INDEX_PATH.read_text(encoding="utf-8")
    text = strip_jinja(raw)

    parser = SectionMapParser()
    parser.feed(text)

    result = {
        "file": str(INDEX_PATH),
        "sections": {
            name: {
                "class_count": len(data["classes"]),
                "classes": sorted(data["classes"]),
                "id_count": len(data["ids"]),
                "ids": sorted(data["ids"]),
                "data_attr_count": len(data["data_attrs"]),
                "data_attrs": sorted(data["data_attrs"]),
                "tags": sorted(data["tags"]),
            }
            for name, data in parser.sections.items()
        },
        "global_class_count": len(parser.global_classes),
        "global_classes": sorted(parser.global_classes),
        "global_data_ff_attr_count": len(parser.global_data_attrs),
        "global_data_ff_attrs": sorted(parser.global_data_attrs),
    }

    out_path = Path("artifacts/ff_css_target_map.json")
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"\n[ok] wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
