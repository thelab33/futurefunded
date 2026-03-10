#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path.cwd()

DEFAULT_HTML = ROOT / "app" / "templates" / "index.html"
DEFAULT_CSS = ROOT / "app" / "static" / "css" / "ff.css"
DEFAULT_JS_DIR = ROOT / "app" / "static" / "js"

CLASS_RE = re.compile(r"\.([A-Za-z_][A-Za-z0-9_-]*)")
ID_RE = re.compile(r"#([A-Za-z_][A-Za-z0-9_-]*)")
DATA_ATTR_RE = re.compile(
    r"\[data-ff-([a-z0-9_-]+)(?:[~|^$*]?=(?:\"[^\"]*\"|'[^']*'|[^\]]+))?\]",
    re.I,
)

GET_BY_ID_RE = re.compile(
    r'getElementById\(\s*(["\'])([A-Za-z_][A-Za-z0-9_-]*)\1\s*\)'
)
CLASSLIST_RE = re.compile(
    r'classList\.(?:add|remove|toggle|contains)\(\s*(["\'])([A-Za-z_][A-Za-z0-9_-]*)\1\s*\)'
)
GETATTR_RE = re.compile(
    r'(?:getAttribute|hasAttribute)\(\s*(["\'])(data-ff-[a-z0-9_-]+)\1\s*\)',
    re.I,
)
DATASET_RE = re.compile(r"dataset\.([A-Za-z][A-Za-z0-9]*)")

QUERY_SELECTOR_LITERAL_RE = re.compile(
    r'(?:querySelector|querySelectorAll|closest|matches)\(\s*(["\'])(.*?)\1\s*\)',
    re.S,
)

SCRIPT_SRC_JS_RE = re.compile(r'js/([A-Za-z0-9_./-]+\.js)')
JINJA_BLOCK_RE = re.compile(r"{%.*?%}|{#.*?#}", re.S)
JINJA_EXPR_RE = re.compile(r"{{.*?}}", re.S)

SKIPLIKE_CLASSNAMES = {"ff-skip", "ff-skiplink"}
OVERLAY_ID_HINTS = {"checkout", "drawer", "press-video", "sponsor-interest", "ff-onboarding"}

IGNORE_JS_CLASSES = {
    "hidden", "open", "closed", "hide", "close", "inner", "input", "item", "nav",
    "pill", "chip", "bar", "count", "amt", "num", "pct", "out", "paused", "fill",
    "focus", "toggle", "step", "target", "id", "length", "placeholder",
    "replace", "querySelector", "setAttribute", "preventDefault", "forEach",
    "escape", "shiftKey", "inline-flex", "sr-only",
    "is-active", "is-loading", "is-on", "is-open", "is-overlay-open",
    "is-selected", "is-visible", "is-media-missing",
    "animate-bounce", "animate-count", "animate-popIn", "animate-popOut", "bounce-temp",
    "ff-railcard",
}

IGNORE_DYNAMIC_CLASSES = {
    "is-open", "is-selected", "is-ready", "is-error", "is-loading", "is-vip",
    "ff-hide-mobile", "ff-hide-desktop", "ff-inline", "ff-center", "ff-m-0",
    "ff-mt-0", "ff-mt-1", "ff-mt-2", "ff-mt-3", "ff-mt-4", "ff-mb-0", "ff-mb-1",
    "ff-mb-2", "ff-mb-3", "ff-mb-4", "ff-p-0", "ff-gap-2", "ff-gap-3", "ff-gap-4",
    "ff-w-100", "ff-minw-0", "ff-nowrap", "ff-ta-right", "ff-underline", "ff-nounderline",
}

IGNORE_HTML_IDS_FOR_CSS = {"ffConfig", "ffSelectors"}

IGNORE_HTML_DATA_META = {
    "body", "brand", "build", "config", "data-mode", "fallback-label", "id",
    "totals-verified", "version",
}

IGNORE_DATA_JS_OPTIONAL = {
    "active", "api", "autoscroll", "backdrop", "close", "cta", "current", "currency",
    "deadline", "decimals", "enhanced", "fail", "focus-probe", "frequency",
    "hero", "initial", "interval", "key", "leaderboard", "link", "locale",
    "modal", "mounted", "name", "native-share", "status", "target", "title",
    "toasts", "version", "theme", "source", "state", "tab", "team", "progress",
    "quick", "speed", "slots", "suffix", "threshold", "webdriver", "zone",
    "org", "org-name", "plan", "poll", "poll-ms", "qr-src", "sync", "sync-url",
    "stats-url", "storage-ns", "socket", "socket-ns", "share-url", "share-title",
    "share-desc", "prev-label", "next-event-at", "campaign", "cap", "csrf",
    "count-to", "create-intent-url", "donate-url", "has-stripe", "impact-amount",
    "impact-text", "leaderboard-api", "filter-query", "filter-tier", "vip-tiers",
    "team-key", "team-tag", "team-url", "totals-sse", "ttl-seconds",
    "open-privacy", "open-terms", "checkout-backdrop", "ways-panel", "ways-tab",
    "select-tier", "revealed", "original-html", "dedupe-window-seconds",
    "alloc-url", "base-href", "base-label", "autoclose-default", "default",
    "dc", "m", "num", "th", "spl", "src", "amt", "dimiss-url", "dismiss-url",
    "donor-wall-api", "onboard-archive", "onboard-draft-slug", "onboard-publish",
    "onboard-ready", "onboard-unpublish",
}



OPTIONAL_JS_CLASSES = {
    "ff-sponsorHasFallback",
    "ff-sponsorLogo__img",
    "ff-sponsorLogoReady",
    "is-passed",
    "is-urgent",
}

OPTIONAL_JS_IDS = {
    "payment-element",
}

OPTIONAL_JS_DATA = {
    "credibility-ready",
    "deadline-text",
    "sponsor-cred-ready",
    "sponsor-cred-v2",
    "cred-v3",
}

IGNORE_UNUSED_IDS = {
    "checkoutDesc", "checkoutErrorText", "checkoutTitle", "ffDrawerDesc", "ffDrawerPanel",
    "ffDrawerTitle", "ffLive", "ffOnboardDesc", "ffOnboardStep1Title", "ffOnboardStep2Title",
    "ffOnboardStep3Title", "ffOnboardStep4Title", "ffOnboardTitle", "ffSuccessDesc",
    "ffSuccessTitle", "ffTopbar", "ffVideoDesc", "ffVideoStatus", "ffVideoTitle",
    "ff_focus_probe", "heroAccentLine", "heroLead", "heroPanelTitle", "heroTitle",
    "progressHint", "progressLead", "progressTitle", "sponsorEmailHelp", "sponsorErrorText",
    "sponsorInterestDesc", "sponsorInterestTitle", "sponsorInterestTrust", "sponsorTierLegend",
    "sponsorWallTitle", "sponsorsHint", "sponsorsLead", "sponsorsTitle", "tierChampionBullets",
    "tierChampionName", "tierCommunityBullets", "tierCommunityName", "tierPartnerBullets",
    "tierPartnerName", "tierVipBullets", "tierVipName", "trustEssentialsTitle", "trustFaqLead",
    "trustFaqTitle", "trustRefundsTitle", "trustUseFunds",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def strip_css_comments(s: str) -> str:
    return re.sub(r"/\*.*?\*/", "", s, flags=re.S)


def preprocess_html(text: str) -> str:
    text = JINJA_BLOCK_RE.sub(" ", text)
    text = JINJA_EXPR_RE.sub("X", text)
    return text


def kebab_from_camel(name: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", name)
    return s.replace("_", "-").lower()


class HookHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.classes: Counter[str] = Counter()
        self.ids: Counter[str] = Counter()
        self.data_ff: Counter[str] = Counter()
        self.anchors: list[tuple[str, str, str]] = []
        self.tag_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tag_count += 1
        amap = dict(attrs)

        class_attr = (amap.get("class") or "").replace("\n", " ")
        for cls in class_attr.split():
            cls = cls.strip()
            if not cls or "{" in cls or "%" in cls:
                continue
            self.classes[cls] += 1

        id_attr = (amap.get("id") or "").strip()
        if id_attr and "{" not in id_attr:
            self.ids[id_attr] += 1

        for k, _ in attrs:
            if k and k.startswith("data-ff-"):
                self.data_ff[k[8:]] += 1

        if tag == "a":
            href = amap.get("href") or ""
            if href.startswith("#"):
                self.anchors.append((href, class_attr, amap.get("id") or ""))


def extract_css_selectors(css_text: str) -> tuple[set[str], set[str], set[str]]:
    css_text = strip_css_comments(css_text)

    classes: set[str] = set()
    ids: set[str] = set()
    data_ff: set[str] = set()

    buf: list[str] = []
    quote: str | None = None
    escape = False

    for ch in css_text:
        if quote:
            buf.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            continue

        if ch in ("'", '"'):
            buf.append(ch)
            quote = ch
            continue

        if ch == "{":
            prelude = "".join(buf).strip()
            if prelude and not prelude.startswith("@"):
                classes.update(CLASS_RE.findall(prelude))
                ids.update(ID_RE.findall(prelude))
                data_ff.update(m.lower() for m in DATA_ATTR_RE.findall(prelude))
            buf = []
            continue

        if ch == "}":
            buf = []
            continue

        buf.append(ch)

    return classes, ids, data_ff


def extract_selectors_from_query(selector: str) -> tuple[set[str], set[str], set[str]]:
    if not any(token in selector for token in (".", "#", "[data-ff-")):
        return set(), set(), set()

    classes = set(CLASS_RE.findall(selector))
    ids = set(ID_RE.findall(selector))
    data_ff = {m.lower() for m in DATA_ATTR_RE.findall(selector)}
    return classes, ids, data_ff


def find_referenced_js_files(raw_html: str, js_dir: Path) -> list[Path]:
    found: list[Path] = []
    seen: set[Path] = set()

    for rel in SCRIPT_SRC_JS_RE.findall(raw_html):
        rel_path = Path(rel)
        candidate = js_dir / rel_path.name
        if candidate.exists() and candidate not in seen:
            found.append(candidate)
            seen.add(candidate)

        full_candidate = ROOT / "app" / "static" / "js" / rel_path
        if full_candidate.exists() and full_candidate not in seen:
            found.append(full_candidate)
            seen.add(full_candidate)

    fallback = js_dir / "ff-app.js"
    if not found and fallback.exists():
        found.append(fallback)

    return found


def collect_js_hooks(js_files: list[Path]) -> tuple[set[str], set[str], set[str], list[str]]:
    classes: set[str] = set()
    ids: set[str] = set()
    data_ff: set[str] = set()
    files: list[str] = []

    for p in js_files:
        files.append(str(p.relative_to(ROOT)))
        txt = read_text(p)

        for m in GET_BY_ID_RE.finditer(txt):
            ident = m.group(2)
            ids.add(ident)

        for m in CLASSLIST_RE.finditer(txt):
            cname = m.group(2)
            classes.add(cname)

        for _, raw in GETATTR_RE.findall(txt):
            data_ff.add(raw[8:].lower())

        for camel in DATASET_RE.findall(txt):
            name = kebab_from_camel(camel)
            if name.startswith("ff-"):
                name = name[3:]
            data_ff.add(name)

        for _, selector in QUERY_SELECTOR_LITERAL_RE.findall(txt):
            c, i, d = extract_selectors_from_query(selector)
            classes.update(c)
            ids.update(i)
            data_ff.update(d)

    return classes, ids, data_ff, files


def sorted_list(xs):
    return sorted(xs, key=lambda x: (str(x).lower(), str(x)))


def print_section(title: str, items: list[str], limit: int = 80) -> None:
    print(f"\n## {title} ({len(items)})")
    if not items:
        print("  - none")
        return
    for item in items[:limit]:
        print(f"  - {item}")
    if len(items) > limit:
        print(f"  ... +{len(items) - limit} more")


def main() -> int:
    ap = argparse.ArgumentParser(description="FutureFunded factory sanity audit v3")
    ap.add_argument("--html", default=str(DEFAULT_HTML))
    ap.add_argument("--css", default=str(DEFAULT_CSS))
    ap.add_argument("--js-dir", default=str(DEFAULT_JS_DIR))
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    html_path = Path(args.html)
    css_path = Path(args.css)
    js_dir = Path(args.js_dir)

    missing = [str(p) for p in (html_path, css_path) if not p.exists()]
    if missing:
        print("Missing required files:", ", ".join(missing), file=sys.stderr)
        return 2

    raw_html = read_text(html_path)
    html_text = preprocess_html(raw_html)

    parser = HookHTMLParser()
    parser.feed(html_text)

    css_classes, css_ids, css_data = extract_css_selectors(read_text(css_path))

    js_files = find_referenced_js_files(raw_html, js_dir)
    js_classes, js_ids, js_data, js_file_list = collect_js_hooks(js_files)

    html_classes = set(parser.classes)
    html_ids = set(parser.ids)
    html_data = set(parser.data_ff)

    duplicate_ids = sorted_list([k for k, v in parser.ids.items() if v > 1])

    html_classes_missing_css = sorted_list([
        c for c in html_classes
        if c.startswith("ff-") and c not in css_classes
    ])

    html_ids_missing_css = sorted_list([
        i for i in html_ids
        if i not in IGNORE_HTML_IDS_FOR_CSS
        and i not in OVERLAY_ID_HINTS
        and (i.startswith("ff") or i in {"progress", "sponsors", "teams", "story", "faq", "impact", "home", "content", "footer", "trust-faq"})
        and i not in css_ids
    ])

    js_classes_missing_html = sorted_list([
        c for c in js_classes
        if c not in html_classes
        and c not in IGNORE_JS_CLASSES
        and c not in OPTIONAL_JS_CLASSES
        and not c.startswith(("animate-", "opacity-", "translate-", "scale-", "fc-", "js-"))
    ])

    js_ids_missing_html = sorted_list([
        i for i in js_ids
        if i not in html_ids
        and i not in {"ffConfig", "ffSelectors"}
        and i not in OPTIONAL_JS_IDS
    ])

    js_data_missing_html = sorted_list([
        d for d in js_data
        if d not in html_data
        and d not in IGNORE_DATA_JS_OPTIONAL
        and d not in OPTIONAL_JS_DATA
    ])

    css_classes_unused = sorted_list([
        c for c in css_classes
        if c.startswith("ff-")
        and c not in html_classes
        and c not in js_classes
        and c not in IGNORE_DYNAMIC_CLASSES
    ])

    css_ids_unused = sorted_list([
        i for i in css_ids
        if i not in html_ids
        and i not in js_ids
        and i not in IGNORE_UNUSED_IDS
    ])

    css_data_unused = sorted_list([
        d for d in css_data
        if d not in html_data
        and d not in js_data
    ])

    broken_skip_targets = []
    for href, class_attr, anchor_id in parser.anchors:
        if set(class_attr.split()) & SKIPLIKE_CLASSNAMES:
            target = href[1:]
            if target not in html_ids:
                broken_skip_targets.append(f"{anchor_id or '<a without id>'} -> {href}")

    overlay_target_issues = sorted_list([
        f"JS expects #{overlay_id} but HTML target is missing"
        for overlay_id in OVERLAY_ID_HINTS
        if overlay_id in js_ids and overlay_id not in html_ids
    ])

    blocking = {
        "duplicate_ids": duplicate_ids,
        "html_ff_classes_missing_css": html_classes_missing_css,
        "js_classes_missing_html": js_classes_missing_html,
        "js_ids_missing_html": js_ids_missing_html,
        "js_data_ff_missing_html": js_data_missing_html,
        "broken_skip_targets": broken_skip_targets,
        "overlay_target_issues": overlay_target_issues,
    }

    review = {
        "html_ids_missing_css": html_ids_missing_css,
        "html_data_ff_meta_only": sorted_list([d for d in html_data if d in IGNORE_HTML_DATA_META]),
        "css_classes_unused_candidates": css_classes_unused,
        "css_ids_unused_candidates": css_ids_unused,
        "css_data_ff_unused_candidates": css_data_unused,
    }

    blocking_count = sum(len(v) for v in blocking.values())
    review_count = sum(len(v) for v in review.values())

    summary = {
        "files": {
            "html": str(html_path),
            "css": str(css_path),
            "js_dir": str(js_dir),
            "js_files_scanned": js_file_list,
        },
        "counts": {
            "html_tags": parser.tag_count,
            "html_classes": len(html_classes),
            "html_ids": len(html_ids),
            "html_data_ff": len(html_data),
            "css_classes": len(css_classes),
            "css_ids": len(css_ids),
            "css_data_ff": len(css_data),
            "js_classes": len(js_classes),
            "js_ids": len(js_ids),
            "js_data_ff": len(js_data),
        },
        "blocking": blocking,
        "review": review,
    }

    if args.json:
        print(json.dumps(summary, indent=2))
        return 1 if blocking_count else 0

    print("FutureFunded Factory Sanity Audit v3")
    print("=" * 41)
    print(f"HTML: {html_path}")
    print(f"CSS : {css_path}")
    print(f"JS  : {js_dir}")
    print(f"JS files scanned: {len(js_file_list)}")
    if js_file_list:
        for f in js_file_list:
            print(f"  - {f}")

    print()
    print("Counts")
    print("------")
    for k, v in summary["counts"].items():
        print(f"{k:24} {v}")

    print("\nBlocking")
    print("--------")
    for title, items in blocking.items():
        print_section(title.replace("_", " "), items)

    print("\nReview only")
    print("-----------")
    for title, items in review.items():
        print_section(title.replace("_", " "), items)

    print("\nResult")
    print("------")
    if blocking_count:
        print(f"FAIL — {blocking_count} blocking issue(s), {review_count} review item(s)")
        return 1

    print(f"PASS — 0 blocking issues, {review_count} review item(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
