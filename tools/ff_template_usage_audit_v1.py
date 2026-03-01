from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

from jinja2 import Environment, meta

APP_DIR = Path("app")
TEMPLATES_DIR = APP_DIR / "templates"
DEFAULT_REPORT = Path("tools/.artifacts/ff_template_usage_report_v1.json")

PY_RENDER_RE = re.compile(
    r'render_template\(\s*([\'"])(?P<tpl>[^\'"]+\.html?)\1', re.M
)

# Conservative ignore folders
IGNORE_DIRS = {"_archive", "__pycache__", ".pytest_cache"}


@dataclass
class TplNode:
    name: str
    path: Path
    refs: List[str]
    dynamic_refs: int = 0


def iter_files(root: Path, exts: Tuple[str, ...]) -> Iterable[Path]:
    for p in root.rglob("*"):
        if p.is_dir():
            continue
        if any(part in IGNORE_DIRS for part in p.parts):
            continue
        if p.suffix.lower() in exts:
            yield p


def find_python_entry_templates(app_dir: Path) -> List[str]:
    entries: List[str] = []
    for py in iter_files(app_dir, (".py",)):
        try:
            s = py.read_text(encoding="utf-8")
        except Exception:
            continue
        for m in PY_RENDER_RE.finditer(s):
            tpl = m.group("tpl").strip()
            if tpl and tpl not in entries:
                entries.append(tpl)
    return entries


def normalize_template_name(name: str) -> str:
    return name.strip().lstrip("/")


def build_jinja_graph(templates_dir: Path) -> Dict[str, TplNode]:
    env = Environment(autoescape=True)
    graph: Dict[str, TplNode] = {}

    for f in iter_files(templates_dir, (".html", ".jinja", ".j2")):
        rel = str(f.relative_to(templates_dir)).replace("\\", "/")
        name = normalize_template_name(rel)

        try:
            src = f.read_text(encoding="utf-8")
        except Exception:
            continue

        refs: List[str] = []
        dyn = 0
        try:
            ast = env.parse(src)
            for t in meta.find_referenced_templates(ast) or []:
                if t is None:
                    dyn += 1
                    continue
                refs.append(normalize_template_name(t))
        except Exception:
            # If parsing fails, keep node but no refs
            pass

        graph[name] = TplNode(name=name, path=f, refs=refs, dynamic_refs=dyn)

    return graph


def reachable(graph: Dict[str, TplNode], roots: List[str]) -> Set[str]:
    seen: Set[str] = set()
    stack: List[str] = [normalize_template_name(r) for r in roots if r]

    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        node = graph.get(cur)
        if not node:
            continue
        for nxt in node.refs:
            if nxt not in seen:
                stack.append(nxt)

    return seen


def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded template usage audit (v1)")
    ap.add_argument("--report", default=str(DEFAULT_REPORT))
    ap.add_argument("--archive", action="store_true", help="Move unused templates to _archive_unused_v1 (safe quarantine)")
    ap.add_argument("--roots", nargs="*", default=[], help="Optional explicit root templates (e.g. index.html)")
    args = ap.parse_args()

    if not TEMPLATES_DIR.exists():
        raise SystemExit(f"[ff-tpl] missing templates dir: {TEMPLATES_DIR}")

    graph = build_jinja_graph(TEMPLATES_DIR)

    py_roots = find_python_entry_templates(APP_DIR)
    roots = args.roots or py_roots or ["index.html"]

    live = reachable(graph, roots)

    all_tpls = sorted(graph.keys())
    unused = [t for t in all_tpls if t not in live]

    report = {
        "roots": roots,
        "python_roots": py_roots,
        "templates_total": len(all_tpls),
        "reachable_total": len(live),
        "unused_total": len(unused),
        "unused": unused,
        "dynamic_refs": {k: v.dynamic_refs for k, v in graph.items() if v.dynamic_refs},
    }

    rp = Path(args.report)
    rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"[ff-tpl] roots: {roots}")
    print(f"[ff-tpl] reachable: {len(live)} / {len(all_tpls)}")
    print(f"[ff-tpl] unused candidates: {len(unused)}")
    print(f"[ff-tpl] report -> {rp}")

    if unused:
        print("\n[ff-tpl] unused template candidates:")
        for t in unused[:200]:
            print(" -", t)
        if len(unused) > 200:
            print(f" ... {len(unused)-200} more")

    if args.archive and unused:
        dest_dir = TEMPLATES_DIR / "_archive_unused_v1"
        dest_dir.mkdir(parents=True, exist_ok=True)
        moved = 0
        for t in unused:
            node = graph.get(t)
            if not node:
                continue
            src = node.path
            rel = Path(t)
            dest = dest_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            moved += 1
        print(f"\n[ff-tpl] archived {moved} templates -> {dest_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
