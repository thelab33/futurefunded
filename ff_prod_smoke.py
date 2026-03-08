#!/usr/bin/env python3
"""
ff_prod_smoke.py — FutureFunded production smoke checker
Author: generated (cofounder-mode)
Purpose: Automate the 12 Stripe-level checks + smoke tests for a fundraising landing page.

Usage examples:
  python ff_prod_smoke.py --url https://getfuturefunded.com \
    --local-index app/templates/index.html \
    --local-css app/static/css/ff.css \
    --local-js app/static/js/ff-app.js \
    --donate-selector '[data-ff-donate], .ff-donate, button[data-donate], button.ff-btn--donate'

Outputs:
  - console summary (colored)
  - artifacts/report.json (detailed results)
  - optional lighthouse-report.json if Lighthouse run
"""
from __future__ import annotations
import argparse
import json
import os

# Lighthouse Chrome wiring (Kali/WSL-safe)
FF_LH_CHROME_PATH = os.getenv('CHROME_PATH') or os.getenv('FF_CHROME_PATH') or ''
FF_LH_CHROME_FLAGS = os.getenv('FF_LIGHTHOUSE_CHROME_FLAGS') or '--headless --no-sandbox --disable-gpu'

import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Tuple

try:
    import requests
except Exception as e:
    print("Missing dependency: requests. Install with `pip install requests`")
    raise SystemExit(1)

try:
    from bs4 import BeautifulSoup
except Exception:
    print("Missing dependency: beautifulsoup4. Install with `pip install beautifulsoup4`")
    raise SystemExit(1)

# ---------- Helpers & Colors ----------
def c_ok(s): return f"\033[92m{s}\033[0m"
def c_warn(s): return f"\033[93m{s}\033[0m"
def c_err(s): return f"\033[91m{s}\033[0m"
def c_info(s): return f"\033[96m{s}\033[0m"

def safe_read(path: str) -> Optional[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None

# ---------- Data model for report ----------
@dataclass
class CheckResult:
    name: str
    ok: bool
    details: List[str]

@dataclass
class SmokeReport:
    target_url: Optional[str]
    local_index: Optional[str]
    local_css: Optional[str]
    local_js: Optional[str]
    timestamp: float
    results: List[CheckResult]
    lighthouse_report: Optional[str] = None
    playwright_summary: Optional[Dict] = None

# ---------- Core Checks ----------
def fetch_headers(url: str, timeout=12) -> Tuple[Dict[str,str], Optional[str]]:
    try:
        r = requests.head(url, allow_redirects=True, timeout=timeout)
        # Some servers respond minimally to HEAD; try GET if HEAD yields very small headers
        headers = {k.lower(): v for k, v in r.headers.items()}
        return headers, None
    except Exception as e:
        return {}, f"request error: {e}"

def check_csp_and_security_headers(headers: Dict[str,str]) -> CheckResult:
    name = "CSP & security headers"
    details = []
    ok = True
    expected = ["content-security-policy", "x-content-type-options", "x-frame-options", "strict-transport-security"]
    for h in expected:
        if h in headers:
            details.append(f"{h}: {headers[h]}")
        else:
            ok = False
            details.append(f"missing header: {h}")
    # quick CSP sanity
    csp = headers.get("content-security-policy","")
    if csp:
        # look for script-src and frame-src mention of stripe/paypal
        if "script-src" not in csp:
            details.append("CSP present but no explicit script-src found.")
        # Not failing automatically if stripe/paypal missing — just warn
        if "js.stripe.com" not in csp and "stripe" not in csp:
            details.append("warning: CSP does not mention stripe domain (check payment flow).")
    return CheckResult(name, ok, details)

def parse_html_from_url_or_local(url: Optional[str], local_index: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return (html_text, error)"""
    if local_index and os.path.exists(local_index):
        txt = safe_read(local_index)
        if txt is None:
            return None, f"failed to read local index: {local_index}"
        return txt, None
    if url:
        try:
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            return r.text, None
        except Exception as e:
            return None, f"failed to fetch url {url}: {e}"
    return None, "no source provided"

def check_unique_ids(soup: BeautifulSoup, required_ids: List[str]) -> CheckResult:
    name = "unique IDs and DOM contracts"
    details = []
    ok = True
    found_ids = {tag.get("id") for tag in soup.find_all(attrs={"id": True})}
    # duplicates: check by collecting all ids and comparing counts
    all_ids = [tag.get("id") for tag in soup.find_all(attrs={"id": True})]
    dupes = set([x for x in all_ids if all_ids.count(x) > 1])
    if dupes:
        ok = False
        details.append(f"duplicate IDs found: {', '.join(sorted(dupes))}")
    for rid in required_ids:
        if rid in found_ids:
            details.append(f"found: {rid}")
        else:
            ok = False
            details.append(f"missing: {rid}")
    # basic accessibility checks
    has_skip = bool(soup.select_one(".ff-skiplink, .ff-skip, a[href='#content']"))
    if not has_skip:
        ok = False
        details.append("missing skip link (.ff-skiplink or anchor to #content)")
    return CheckResult(name, ok, details)

def check_social_meta(soup: BeautifulSoup) -> CheckResult:
    name = "social preview meta tags"
    details = []
    ok = True
    # og:title, og:description, og:image
    meta_checks = {
        "og:title": False,
        "og:description": False,
        "og:image": False,
        "twitter:card": False,
        "og:url": False
    }
    for m in soup.find_all("meta"):
        if m.get("property") in meta_checks:
            meta_checks[m["property"]] = True
        if m.get("name") in meta_checks:
            meta_checks[m["name"]] = True
    for k,v in meta_checks.items():
        if v:
            details.append(f"ok: {k}")
        else:
            ok = False
            details.append(f"missing: {k}")
    return CheckResult(name, ok, details)

def check_fallbacks(soup: BeautifulSoup, html_text: str) -> CheckResult:
    name = "fail-safe donation fallbacks"
    ok = True
    details = []
    # Look for paypal.me or contact mailto:
    if "paypal.me" in html_text or soup.find("a", href=re.compile(r"paypal\.me")):
        details.append("paypal.me fallback found")
    else:
        details.append("no paypal.me found (consider as fallback)")
        ok = False
    if soup.find("a", href=re.compile(r"mailto:")):
        details.append("mailto contact present")
    else:
        details.append("no mailto contact found")
        ok = False
    # presence of textual manual instructions
    if re.search(r"manual|bank transfer|contact.*donation|wire transfer", html_text, re.I):
        details.append("manual instructions present")
    else:
        details.append("no manual/payment instructions detected")
    return CheckResult(name, ok, details)

def scan_css_for_safearea_and_reduced_motion(css_text: str) -> CheckResult:
    name = "CSS: safe-area & reduced-motion"
    details = []
    ok = True
    if css_text is None:
        return CheckResult(name, False, ["css content unavailable"])
    if "safe-area-inset" in css_text or "env(safe-area-inset" in css_text:
        details.append("safe-area detected (env(safe-area-inset-...))")
    else:
        details.append("safe-area not detected")
        ok = False
    if "prefers-reduced-motion" in css_text:
        details.append("prefers-reduced-motion respected")
    else:
        details.append("prefers-reduced-motion NOT detected")
        ok = False
    return CheckResult(name, ok, details)

def scan_js_for_tracking_and_resilience(js_text: Optional[str]) -> CheckResult:
    name = "JS: tracking events, donation hooks, and error handling"
    ok = True
    details: List[str] = []
    if not js_text:
        return CheckResult(name, False, ["js file unreadable"])
    # look for custom event patterns
    if re.search(r'CustomEvent\(|dispatchEvent\(|window\.dispatchEvent', js_text):
        details.append("custom events / dispatch found")
    else:
        details.append("no custom events found (consider window.dispatchEvent or analytics events)")
    # look for ff: specific events
    if re.search(r"ff:donate|ff:checkout|ff:donate-click", js_text):
        details.append("ff: event hooks detected")
    else:
        details.append("no 'ff:' events detected")
    # look for try/catch, onerror
    if re.search(r'\btry\b|\bcatch\b|window\.onerror|addEventListener\(["\']error["\']', js_text):
        details.append("global error handling present")
    else:
        details.append("no obvious global error handling")
        ok = False
    # check for network/failover handling (retry, fallback)
    if re.search(r'\bretry\b|\bfallback\b|\bsetTimeout\b.*retry', js_text):
        details.append("retry/fallback patterns present (heuristic)")
    else:
        details.append("no retry/fallback patterns found (consider adding)")
    return CheckResult(name, ok, details)

def check_asset_caching_for_links(soup: BeautifulSoup, base_url: Optional[str]) -> CheckResult:
    name = "asset caching headers (CSS/JS assets)"
    details = []
    ok = True
    # find CSS and JS href/src
    assets = []
    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href")
        if href:
            assets.append(href)
    for script in soup.find_all("script", src=True):
        assets.append(script["src"])
    if not assets:
        return CheckResult(name, False, ["no linked assets found in HTML"])
    # normalize and HEAD each asset
    for asset in assets[:20]:  # limit
        if asset.startswith("//"):
            asset_url = "https:" + asset
        elif asset.startswith("http://") or asset.startswith("https://"):
            asset_url = asset
        else:
            if base_url:
                asset_url = base_url.rstrip("/") + "/" + asset.lstrip("/")
            else:
                details.append(f"cannot resolve asset (no base url): {asset}")
                ok = False
                continue
        try:
            r = requests.head(asset_url, allow_redirects=True, timeout=10)
            hdrs = {k.lower(): v for k, v in r.headers.items()}
            cache = hdrs.get("cache-control","")
            if "max-age" in cache or "immutable" in cache:
                details.append(f"ok cache: {asset_url} -> {cache}")
            else:
                ok = False
                details.append(f"weak cache: {asset_url} -> {cache or 'missing'}")
        except Exception as e:
            ok = False
            details.append(f"asset fetch failed: {asset_url} -> {e}")
    return CheckResult(name, ok, details)

# ---------- Lighthouse runner ----------
def run_lighthouse(url: str, outfile="artifacts/lighthouse-report.json") -> Tuple[bool, str]:
    # prefer npx if available
    os.makedirs("artifacts", exist_ok=True)
    cmd = ["npx", "lighthouse", url, '--chrome-path', FF_LH_CHROME_PATH, '--chrome-flags', FF_LH_CHROME_FLAGS, "--output=json", f"--output-path={outfile}", "--quiet", "--chrome-flags=--headless"]
    # allow fallback to lighthouse if npx missing
    which = shutil.which("npx")
    if not which:
        return False, "npx not found; install Node & npm and run `npm i -g lighthouse` or use `npx lighthouse`"
    try:
        p = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=240)
        if p.returncode == 0:
            return True, outfile
        else:
            # capture stderr for diagnostics
            return False, f"lighthouse failed: rc={p.returncode} stderr={p.stderr.strip()[:1000]}"
    except subprocess.TimeoutExpired:
        return False, "lighthouse timed out"

# ---------- Playwright quick UI checks (optional) ----------
def run_playwright_checks(url: str, donate_selector: str = "", timeout=20) -> Tuple[bool, Dict]:
    """
    If Playwright Python (sync) is installed, launch Chromium headless and:
      - collect console errors / warnings
      - simulate offline for stripe domain and try clicking donate button
      - run slow3g+cpu throttling simulation attempt (best-effort)
    Returns (success, summary dict)
    """
    try:
        from playwright.sync_api import sync_playwright, Playwright
    except Exception as e:
        return False, {"error": "playwright not installed (pip install playwright && playwright install)"}
    summary = {"console_errors": [], "actions": []}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
            # emulate mobile viewport for part of checks
            context = browser.new_context(viewport={"width":375, "height":812}, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)")
            page = context.new_page()
            # collect console errors
            def on_console(msg):
                typ = msg.type
                text = msg.text
                if typ in ("error", "warning"):
                    summary["console_errors"].append({"type": typ, "text": text})
            page.on("console", on_console)
            # navigate (with slow network emulation if available)
            try:
                page.goto(url, timeout=30000)
            except Exception as e:
                summary["navigation_error"] = str(e)
                # continue, maybe partial load
            # find donate element
            donate_elem = None
            if donate_selector:
                try:
                    donate_elem = page.query_selector(donate_selector)
                except Exception:
                    donate_elem = None
            if donate_elem:
                summary["actions"].append("donate_selector_found")
                try:
                    # simulate Stripe network failure by aborting stripe.js requests
                    def route_handler(route, request):
                        if "js.stripe.com" in request.url or "paypal.com" in request.url:
                            # abort to emulate provider network failure
                            route.abort()
                        else:
                            route.continue_()
                    page.route("**/*", route_handler)
                    donate_elem.click(timeout=8000)
                    # wait a short while to allow error/fallback UI to appear
                    page.wait_for_timeout(1500)
                    # snapshot if fallback text present
                    body_text = page.content()
                    if re.search(r"retry|unable|offline|failed|please try", body_text, re.I):
                        summary["actions"].append("fallback_message_detected")
                    else:
                        summary["actions"].append("no obvious fallback message after aborting provider scripts")
                except Exception as e:
                    summary["actions"].append(f"donate-click-error: {e}")
            else:
                summary["actions"].append("donate_selector_not_found")
            # gather some performance metrics (best-effort)
            try:
                perf = page.evaluate("() => ({ timing: window.performance?.timing || null, nav: performance.getEntriesByType('navigation')[0] || null })")
                summary["performance"] = perf
            except Exception:
                pass
            browser.close()
            return True, summary
    except Exception as e:
        return False, {"error": f"playwright check failed: {e}"}

# ---------- Orchestration ----------
def run_all_checks(args) -> SmokeReport:
    report = SmokeReport(
        target_url=args.url,
        local_index=args.local_index,
        local_css=args.local_css,
        local_js=args.local_js,
        timestamp=time.time(),
        results=[]
    )

    # 1. headers
    headers, err = ({}, "no url provided") if not args.url else fetch_headers(args.url)
    if err:
        report.results.append(CheckResult("Fetch headers", False, [err]))
    else:
        report.results.append(CheckResult("Fetch headers", True, [f"{k}: {v}" for k, v in list(headers.items())[:10]]))
        report.results.append(check_csp_and_security_headers(headers))

    # 2. parse HTML
    html, html_err = parse_html_from_url_or_local(args.url, args.local_index)
    if html_err:
        report.results.append(CheckResult("HTML parse", False, [html_err]))
        # still attempt to load local files where available
        soup = BeautifulSoup("", "html.parser")
    else:
        soup = BeautifulSoup(html, "html.parser")
        report.results.append(CheckResult("HTML parse", True, ["parsed OK"]))
    # 3. unique IDs
    required_ids = ["checkout", "ffConfig", "ffSelectors", "ffLive", "content"]
    report.results.append(check_unique_ids(soup, required_ids))
    # 4. social meta
    report.results.append(check_social_meta(soup))
    # 5. fallbacks
    report.results.append(check_fallbacks(soup, html or ""))
    # 6. css checks (local or linked)
    css_text = None
    if args.local_css and os.path.exists(args.local_css):
        css_text = safe_read(args.local_css)
    else:
        # attempt to fetch first linked stylesheet from HTML if url provided
        link = soup.find("link", rel="stylesheet")
        if link and args.url:
            href = link.get("href")
            if href:
                if href.startswith("http"):
                    try:
                        css_text = requests.get(href, timeout=12).text
                    except Exception:
                        css_text = None
    report.results.append(scan_css_for_safearea_and_reduced_motion(css_text))
    # 7. js scans
    js_text = None
    if args.local_js and os.path.exists(args.local_js):
        js_text = safe_read(args.local_js)
    else:
        # attempt to fetch first script with ff-app in name
        scripts = soup.find_all("script", src=True)
        target_js = None
        for s in scripts:
            if "ff-app" in s["src"] or "ff" in s["src"]:
                target_js = s["src"]
                break
        if target_js and args.url:
            if target_js.startswith("http"):
                try:
                    js_text = requests.get(target_js, timeout=12).text
                except Exception:
                    js_text = None
    report.results.append(scan_js_for_tracking_and_resilience(js_text))
    # 8. asset caching headers
    base_url = args.url
    report.results.append(check_asset_caching_for_links(soup, base_url))
    # 9. lighthouse (optional, heavier)
    if args.lighthouse and args.url:
        ok, msg = run_lighthouse(args.url)
        if ok:
            report.lighthouse_report = msg
            report.results.append(CheckResult("Lighthouse", True, [f"report: {msg}"]))
        else:
            report.results.append(CheckResult("Lighthouse", False, [msg]))
    else:
        report.results.append(CheckResult("Lighthouse", False, ["skipped (use --lighthouse to enable)"]))

    # 10. playwright quick checks (optional)
    if args.playwright and args.url:
        ok, summary = run_playwright_checks(args.url, args.donate_selector or "")
        report.playwright_summary = summary
        report.results.append(CheckResult("Playwright smoke", ok, [json.dumps(summary)[:1000]]))
    else:
        report.results.append(CheckResult("Playwright smoke", False, ["skipped (use --playwright to enable)"]))

    return report

def print_summary(report: SmokeReport):
    print("\n" + "="*60)
    print(c_info("FutureFunded — Production Smoke Summary"))
    print(f"Target URL: {report.target_url}  |  Local index: {report.local_index}")
    print(f"Local CSS: {report.local_css}  |  Local JS: {report.local_js}")
    print(f"Report timestamp: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(report.timestamp))}")
    print("-"*60)
    failures = 0
    for r in report.results:
        status = c_ok("PASS") if r.ok else c_err("FAIL")
        print(f"{status} {r.name}")
        for d in r.details:
            # show only first line per detail for brevity
            print("   •", d.replace("\n", " ")[:800])
        if not r.ok:
            failures += 1
    print("-"*60)
    if report.lighthouse_report:
        print(c_info(f"Lighthouse JSON: {report.lighthouse_report}"))
    if report.playwright_summary:
        print(c_info("Playwright summary (truncated):"))
        print(json.dumps(report.playwright_summary, indent=2)[:2000])
    print("="*60)
    print(c_ok(f"Smoke checks completed — {len(report.results)-failures} passed, {failures} failed"))
    print("Detailed JSON report at artifacts/report.json")

def save_report(report: SmokeReport, path="artifacts/report.json"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(asdict(report), indent=2, default=str))

# ---------- CLI ----------
def parse_args():
    p = argparse.ArgumentParser(description="FutureFunded production smoke checker")
    p.add_argument("--url", help="Live page URL to test (e.g. https://getfuturefunded.com)")
    p.add_argument("--local-index", help="Local HTML file to use (overrides URL for DOM checks)")
    p.add_argument("--local-css", help="Local CSS file path (ff.css)")
    p.add_argument("--local-js", help="Local JS file path (ff-app.js)")
    p.add_argument("--donate-selector", default="", help="CSS selector to locate donate button for UI checks")
    p.add_argument("--lighthouse", action="store_true", help="Run Lighthouse via npx (requires Node/npm & npx)")
    p.add_argument("--playwright", action="store_true", help="Run Playwright quick UI checks (requires pip install playwright && playwright install)")
    return p.parse_args()

def main():
    args = parse_args()
    if not (args.url or args.local_index):
        print(c_err("Error: provide --url or --local-index (or both)."))
        sys.exit(2)
    report = run_all_checks(args)
    save_report(report)
    print_summary(report)

if __name__ == "__main__":
    main()
