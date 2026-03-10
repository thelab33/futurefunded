from pathlib import Path
import re
import json

ROOT = Path(".")
HTML = ROOT / "app/templates/index.html"
JS = ROOT / "app/static/js/ff-app.js"
CSS = ROOT / "app/static/css/ff.css"

if not HTML.exists():
    raise SystemExit(f"Missing {HTML}")

html = HTML.read_text(encoding="utf-8")
js = JS.read_text(encoding="utf-8") if JS.exists() else ""
css = CSS.read_text(encoding="utf-8") if CSS.exists() else ""

def uniq(seq):
    return sorted(set(seq))

report = {
    "template_file": str(HTML),
    "template_extends": uniq(re.findall(r'{%\s*extends\s+[\'"]([^\'"]+)[\'"]\s*%}', html)),
    "template_includes": uniq(re.findall(r'{%\s*include\s+[\'"]([^\'"]+)[\'"]\s*%}', html)),
    "template_imports": uniq(re.findall(r'{%\s*(?:import|from)\s+[\'"]([^\'"]+)[\'"]', html)),
    "static_filenames": uniq(re.findall(r"url_for\(\s*['\"]static['\"]\s*,\s*filename\s*=\s*['\"]([^'\"]+)['\"]", html)),
    "endpoints": uniq(re.findall(r"url_for\(\s*['\"]([^'\"]+)['\"]", html)),
    "data_ff_hooks_in_html": uniq(re.findall(r'data-ff-[a-z0-9-]+', html)),
    "data_ff_hooks_in_js": uniq(re.findall(r'data-ff-[a-z0-9-]+', js)),
    "ids_in_html": uniq(re.findall(r'id="([A-Za-z0-9_-]+)"', html)),
    "src_attrs": uniq(re.findall(r'src="([^"]+)"', html)),
    "href_attrs": uniq(re.findall(r'href="([^"]+)"', html)),
}

report["hooks_missing_from_html_but_used_in_js"] = [
    h for h in report["data_ff_hooks_in_js"] if h not in report["data_ff_hooks_in_html"]
]

report["local_static_candidates"] = [
    x for x in (report["src_attrs"] + report["href_attrs"])
    if x.startswith("/static/") or "static" in x
]

print(json.dumps(report, indent=2))
