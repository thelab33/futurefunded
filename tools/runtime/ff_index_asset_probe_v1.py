from __future__ import annotations

# --- ff: repo-root sys.path bootstrap ---
import sys
from pathlib import Path as _Path
_REPO_ROOT = _Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
# --- end bootstrap ---


import argparse
import json
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlsplit, urlunsplit

STATIC_ROOTS = [Path("app/static"), Path("static"), Path("public")]
STATIC_PREFIX = "/static/"

URLISH_RE = re.compile(r"^(https?://|/)", re.I)

def norm_url(u: str) -> str:
    u = (u or "").strip().strip('"').strip("'")
    if not u:
        return ""
    try:
        s = urlsplit(u)
        # normalize: keep scheme/netloc/path/query, drop fragments
        return urlunsplit((s.scheme, s.netloc, s.path, s.query, ""))
    except Exception:
        return u

def split_srcset(v: str) -> List[str]:
    out: List[str] = []
    if not v:
        return out
    for part in v.split(","):
        part = part.strip()
        if not part:
            continue
        url = part.split()[0].strip()
        if url:
            out.append(url)
    return out

class URLCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: Set[str] = set()

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        ad = {k.lower(): (v or "") for k, v in attrs}
        # common url attrs
        for k in ("src", "href", "poster", "data-ff-video-src", "data-ff-logo", "data-ff-image"):
            v = ad.get(k, "")
            if v:
                self._add(v)

        # srcset flavors
        for k in ("srcset", "imagesrcset"):
            v = ad.get(k, "")
            for u in split_srcset(v):
                self._add(u)

        # meta content that is a url (og:image, twitter:image, etc.)
        if tag.lower() == "meta":
            content = ad.get("content", "")
            if content and URLISH_RE.match(content.strip()):
                self._add(content)

    def _add(self, v: str) -> None:
        v = norm_url(v)
        if v:
            self.urls.add(v)

def resolve_static_file(url_path: str) -> Tuple[Optional[Path], Optional[Path]]:
    """
    Returns (root, file_path) if url_path is a /static/... file that exists in any static root.
    """
    if not url_path.startswith(STATIC_PREFIX):
        return None, None
    rel = url_path[len(STATIC_PREFIX):].lstrip("/")
    for root in STATIC_ROOTS:
        fp = root / rel
        if fp.exists() and fp.is_file():
            return root, fp
    return None, None

def main() -> int:
    ap = argparse.ArgumentParser(description="Render / and produce an asset manifest from rendered HTML (v1)")
    ap.add_argument("--paths", nargs="*", default=["/"], help="Paths to request (default: /)")
    ap.add_argument("--out", default="tools/.artifacts/ff_index_asset_probe_v1.json", help="Report JSON output path")
    ap.add_argument("--strict", action="store_true", help="Fail (exit 2) if any /static assets are missing")
    args = ap.parse_args()

    # import lazily so the script can exist even if app import is slow
    from app import create_app  # type: ignore

    app = create_app()
    results: Dict[str, dict] = {}
    missing_static: List[dict] = []
    found_static: List[dict] = []
    externals: Set[str] = set()
    internal_routes: Set[str] = set()

    with app.test_client() as c:
        for p in args.paths:
            resp = c.get(p)
            status = resp.status_code
            body = resp.get_data(as_text=True) if resp.mimetype and "html" in resp.mimetype else ""
            collector = URLCollector()
            if body:
                collector.feed(body)

            urls = sorted(collector.urls)
            # classify
            per_path = {
                "status": status,
                "urls_total": len(urls),
                "urls": urls,
            }
            results[p] = per_path

            for u in urls:
                s = urlsplit(u)
                if s.scheme and s.netloc:
                    externals.add(f"{s.scheme}://{s.netloc}")
                if s.path.startswith("/") and not s.path.startswith(STATIC_PREFIX):
                    internal_routes.add(s.path)

                root, fp = resolve_static_file(s.path)
                if s.path.startswith(STATIC_PREFIX):
                    if fp:
                        found_static.append({
                            "url": u,
                            "path": s.path,
                            "root": str(root),
                            "file": str(fp),
                            "bytes": fp.stat().st_size,
                        })
                    else:
                        missing_static.append({
                            "url": u,
                            "path": s.path,
                            "searched_roots": [str(r) for r in STATIC_ROOTS],
                        })

    report = {
        "paths": args.paths,
        "static_roots": [str(r) for r in STATIC_ROOTS],
        "found_static_total": len(found_static),
        "missing_static_total": len(missing_static),
        "external_origins": sorted(externals),
        "internal_routes_referenced": sorted(internal_routes),
        "found_static": sorted(found_static, key=lambda x: x["path"]),
        "missing_static": sorted(missing_static, key=lambda x: x["path"]),
        "by_path": results,
    }

    outp = Path(args.out)
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"[ff-assets] wrote: {outp}")
    print(f"[ff-assets] found /static assets: {len(found_static)}")
    print(f"[ff-assets] missing /static assets: {len(missing_static)}")
    print(f"[ff-assets] external origins: {len(externals)}")

    if args.strict and missing_static:
        print("[ff-assets] FAIL: missing /static assets referenced by rendered HTML")
        for m in missing_static[:50]:
            print(" -", m["path"])
        return 2

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
