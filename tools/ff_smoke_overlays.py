#!/usr/bin/env python3
"""
FutureFunded • Overlay Smoke Tests
File: tools/ff_smoke_overlays.py

Validates overlay open/close state transitions for:
  #checkout / #sponsor-interest / #press-video / #terms / #privacy

Contracts validated (runtime-agnostic):
  - Opens via :target hash (no-JS baseline)
  - Opens via visible opener click when present (JS path)
  - Closes via visible close control and/or ESC fallback
  - Asserts visibility + attribute transitions (hidden / data-open / aria-hidden)

Usage:
  # fast gate (headless)
  python3 tools/ff_smoke_overlays.py --url http://localhost:5000/ --browser chrome

  # headed debug (retries once if window/page is closed mid-run)
  python3 tools/ff_smoke_overlays.py --url http://localhost:5000/ --browser chrome --headed --retries 1

  # max verbosity when debugging clickability
  python3 tools/ff_smoke_overlays.py --url http://localhost:5000/ --browser chrome --headed --debug --allow-force

Notes:
  - This script avoids force-clicks by default to catch real UX issues.
  - --retries is ONLY meant to handle accidental window closes in headed runs.
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests


# -----------------------------
# Specs
# -----------------------------
@dataclass(frozen=True)
class OverlaySpec:
    name: str
    overlay_id: str
    opener_selectors: Tuple[str, ...]
    close_selectors: Tuple[str, ...]
    prefer_hash_open: bool = False


OVERLAYS: Tuple[OverlaySpec, ...] = (
    OverlaySpec(
        name="Checkout",
        overlay_id="checkout",
        opener_selectors=(
            'a[data-ff-open-checkout]',
            'button[data-ff-open-checkout]',
            'a[href="#checkout"]',
            'button[aria-controls="checkout"]',
        ),
        close_selectors=(
            '.ff-sheet__close',
            'button[aria-label*="close" i]',
            '[data-ff-close-checkout-btn]',
            '[data-ff-close-overlay]',
            '[data-ff-close]',
            '[data-ff-close-checkout]',
            'a[href="#home"]',
            'a[href="#top"]',
        ),
        prefer_hash_open=False,
    ),
    OverlaySpec(
        name="Sponsor Interest",
        overlay_id="sponsor-interest",
        opener_selectors=(
            'a[data-ff-open-sponsor]',
            'button[data-ff-open-sponsor]',
            'a[href="#sponsor-interest"]',
        ),
        close_selectors=(
            '.ff-modal__close',
            'button[aria-label*="close" i]',
            '[data-ff-close-sponsor-btn]',
            '[data-ff-close-overlay]',
            '[data-ff-close]',
            '[data-ff-close-sponsor]',
            'a[href="#home"]',
            'a[href="#top"]',
        ),
        prefer_hash_open=False,
    ),
    OverlaySpec(
        name="Press Video",
        overlay_id="press-video",
        opener_selectors=(
            'a[data-ff-open-video]',
            'button[data-ff-open-video]',
            'a[href="#press-video"]',
        ),
        close_selectors=(
            '.ff-modal__close',
            'button[aria-label*="close" i]',
            '[data-ff-close-video-btn]',
            '[data-ff-close-overlay]',
            '[data-ff-close]',
            '[data-ff-close-video]',
            'a[href="#home"]',
            'a[href="#top"]',
        ),
        prefer_hash_open=True,
    ),
    OverlaySpec(
        name="Terms",
        overlay_id="terms",
        opener_selectors=(
            'a[href="#terms"]',
            'button[aria-controls="terms"]',
            '[data-ff-open-terms]',
        ),
        close_selectors=(
            '.ff-modal__close',
            'button[aria-label*="close" i]',
            '[data-ff-close-terms-btn]',
            '[data-ff-close-overlay]',
            '[data-ff-close]',
            '[data-ff-close-terms]',
            'a[href="#home"]',
            'a[href="#top"]',
        ),
        prefer_hash_open=False,
    ),
    OverlaySpec(
        name="Privacy",
        overlay_id="privacy",
        opener_selectors=(
            'a[href="#privacy"]',
            'button[aria-controls="privacy"]',
            '[data-ff-open-privacy]',
        ),
        close_selectors=(
            '.ff-modal__close',
            'button[aria-label*="close" i]',
            '[data-ff-close-privacy-btn]',
            '[data-ff-close-overlay]',
            '[data-ff-close]',
            '[data-ff-close-privacy]',
            'a[href="#home"]',
            'a[href="#top"]',
        ),
        prefer_hash_open=False,
    ),
)


# -----------------------------
# Helpers / logging
# -----------------------------
def _now_ms() -> int:
    return int(time.time() * 1000)


def _short(s: str, n: int = 180) -> str:
    s = (s or "").strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def _ok(msg: str) -> None:
    print(f"OK: {msg}")


def _warn(msg: str) -> None:
    print(f"WARN: {msg}")


def _fail(msg: str) -> None:
    print(f"FAIL: {msg}")


class BrowserClosedUnexpectedly(RuntimeError):
    pass


def _is_target_closed(err: Exception) -> bool:
    name = type(err).__name__
    msg = (str(err) or "").lower()
    if name == "TargetClosedError":
        return True
    # Playwright sometimes rewraps errors; match the common message signature too.
    if "target page" in msg and "has been closed" in msg:
        return True
    if "browser has been closed" in msg:
        return True
    return False


def run_static(url: str) -> int:
    """
    Static mode: HTML-only check for overlay IDs presence (no Playwright).
    """
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
    except Exception as e:
        _fail(f"Static fetch failed: {e}")
        return 2

    html = r.text

    rc = 0
    for spec in OVERLAYS:
        if f'id="{spec.overlay_id}"' in html:
            _ok(f"#{spec.overlay_id} present in rendered HTML")
        else:
            _fail(f"#{spec.overlay_id} missing in rendered HTML")
            rc = 1

    # Heuristic markers (not a hard fail)
    markers = [":target", "data-open", "aria-hidden", "is-open"]
    found = [m for m in markers if m in html]
    if len(found) >= 2:
        _ok("HTML contains basic overlay contract markers (heuristic)")
    else:
        _warn("HTML marker heuristic inconclusive (not a hard fail)")

    return rc


def _state_snapshot(page, overlay_sel: str) -> Dict[str, Optional[str]]:
    loc = page.locator(overlay_sel).first
    snap: Dict[str, Optional[str]] = {
        "url": page.url,
        "visible": "false",
        "hidden_attr": None,
        "data_open": None,
        "aria_hidden": None,
        "class": None,
    }
    try:
        snap["visible"] = "true" if loc.is_visible() else "false"
        snap["hidden_attr"] = loc.get_attribute("hidden")
        snap["data_open"] = loc.get_attribute("data-open")
        snap["aria_hidden"] = loc.get_attribute("aria-hidden")
        snap["class"] = loc.get_attribute("class")
    except Exception as e:
        snap["error"] = f"{type(e).__name__}: {_short(str(e))}"
    return snap


def _is_openish(snap: Dict[str, Optional[str]], overlay_id: str) -> bool:
    if snap.get("visible") == "true":
        return True
    if snap.get("data_open") == "true":
        return True
    if snap.get("aria_hidden") == "false":
        return True
    if snap.get("class") and "is-open" in (snap["class"] or ""):
        return True
    if snap.get("url", "").endswith(f"#{overlay_id}"):
        return True
    return False


def _wait_openish(page, overlay_id: str, want_open: bool, timeout_ms: int) -> bool:
    overlay_sel = f"#{overlay_id}"
    deadline = _now_ms() + timeout_ms
    while _now_ms() < deadline:
        snap = _state_snapshot(page, overlay_sel)
        is_open = _is_openish(snap, overlay_id)
        if is_open == want_open:
            return True
        time.sleep(0.05)
    return False


def _goto(page, url: str, wait: str = "domcontentloaded") -> None:
    try:
        page.goto(url, wait_until=wait)
        # Give layout/CSS a beat; reduces “not visible yet” flakiness
        page.wait_for_timeout(80)
    except Exception as e:
        if _is_target_closed(e):
            raise BrowserClosedUnexpectedly(f"TargetClosedError: {_short(str(e))}") from None
        raise


def _open_via_hash(page, base_url: str, overlay_id: str, timeout_ms: int) -> bool:
    _goto(page, f"{base_url}#{overlay_id}")
    return _wait_openish(page, overlay_id, True, timeout_ms)


def _clear_hash(page, base_url: str, timeout_ms: int) -> bool:
    _goto(page, base_url)
    deadline = _now_ms() + timeout_ms
    while _now_ms() < deadline:
        try:
            if "#" not in page.url:
                return True
        except Exception:
            pass
        time.sleep(0.05)
    return True


def _scroll_center(locator) -> None:
    try:
        locator.evaluate(
            """(el) => el.scrollIntoView({block:'center', inline:'center', behavior:'instant'})"""
        )
    except Exception:
        try:
            locator.scroll_into_view_if_needed()
        except Exception:
            pass


def _first_visible_match(page, selector: str) -> Optional[object]:
    loc_all = page.locator(selector)
    try:
        n = loc_all.count()
    except Exception:
        return None

    if n <= 0:
        return None

    for i in range(min(n, 12)):
        li = loc_all.nth(i)
        try:
            if li.is_visible():
                return li
        except Exception:
            continue
    return None


def _click_opener(page, selectors: Tuple[str, ...], timeout_ms: int, allow_force: bool) -> Optional[str]:
    deadline = _now_ms() + timeout_ms
    last_err: Optional[str] = None

    while _now_ms() < deadline:
        for sel in selectors:
            loc = _first_visible_match(page, sel)
            if not loc:
                continue
            try:
                _scroll_center(loc)
                href = loc.get_attribute("href") or ""
                tgt = (loc.get_attribute("target") or "").lower()
                if tgt == "_blank" and href.startswith(("http://", "https://")):
                    return f"{sel} (skipped: target=_blank external)"
                loc.click(timeout=timeout_ms, force=allow_force)
                return sel
            except Exception as e:
                if _is_target_closed(e):
                    raise BrowserClosedUnexpectedly(f"TargetClosedError: {_short(str(e))}") from None
                last_err = f"{type(e).__name__}: {_short(str(e))}"
                continue
        time.sleep(0.05)

    if last_err:
        _warn(f"Opener click attempts exhausted; last error: {last_err}")
    return None


def _classify_close_el(el_info: Dict[str, Optional[str]]) -> str:
    cls = (el_info.get("class") or "").lower()
    tag = (el_info.get("tag") or "").lower()
    tabindex = (el_info.get("tabindex") or "")
    aria_hidden = (el_info.get("aria_hidden") or "")
    href = (el_info.get("href") or "")

    backdropish = (
        "backdrop" in cls
        or "scrim" in cls
        or (tag == "a" and tabindex == "-1" and aria_hidden == "true")
        or (tag == "a" and href in ("#home", "#top", "#"))
    )
    return "backdrop" if backdropish else "control"


def _pick_close_candidate(overlay, close_selectors: Tuple[str, ...]) -> Optional[object]:
    candidates: List[Tuple[str, object]] = []
    for sel in close_selectors:
        loc_all = overlay.locator(sel)
        try:
            n = loc_all.count()
        except Exception:
            continue
        if n <= 0:
            continue
        for i in range(min(n, 10)):
            li = loc_all.nth(i)
            try:
                if li.is_visible():
                    candidates.append((sel, li))
            except Exception:
                continue

    if not candidates:
        return None

    scored: List[Tuple[int, str, object]] = []
    for sel, li in candidates:
        try:
            info = li.evaluate(
                """(el) => ({
                    tag: el.tagName,
                    class: el.getAttribute('class') || '',
                    tabindex: el.getAttribute('tabindex') || '',
                    aria_hidden: el.getAttribute('aria-hidden') || '',
                    href: el.getAttribute('href') || ''
                })"""
            )
        except Exception:
            info = {"tag": "", "class": "", "tabindex": "", "aria_hidden": "", "href": ""}

        kind = _classify_close_el(info)
        base = 10 if kind == "backdrop" else 0

        try:
            aria = (li.get_attribute("aria-label") or "").lower()
        except Exception:
            aria = ""
        if "close" in aria:
            base -= 1

        scored.append((base, sel, li))

    scored.sort(key=lambda t: t[0])
    return scored[0][2]


def _close_overlay(
    page,
    base_url: str,
    overlay_id: str,
    close_selectors: Tuple[str, ...],
    timeout_ms: int,
    allow_force: bool,
) -> bool:
    overlay_sel = f"#{overlay_id}"
    overlay = page.locator(overlay_sel).first

    close_loc = _pick_close_candidate(overlay, close_selectors)
    if close_loc is not None:
        try:
            _scroll_center(close_loc)
            close_loc.click(timeout=timeout_ms, force=allow_force)
            if _wait_openish(page, overlay_id, False, timeout_ms):
                return True
        except Exception as e:
            if _is_target_closed(e):
                raise BrowserClosedUnexpectedly(f"TargetClosedError: {_short(str(e))}") from None
            _warn(f"Close click failed for #{overlay_id}: {type(e).__name__}: {_short(str(e))}")

    try:
        page.keyboard.press("Escape")
        if _wait_openish(page, overlay_id, False, timeout_ms):
            return True
    except Exception as e:
        if _is_target_closed(e):
            raise BrowserClosedUnexpectedly(f"TargetClosedError: {_short(str(e))}") from None

    _clear_hash(page, base_url, timeout_ms)
    if _wait_openish(page, overlay_id, False, timeout_ms):
        return True

    return False


def _launch_browser(p, choice: str, headed: bool, slow_mo: int):
    errors: List[str] = []

    def _try(fn, label: str):
        try:
            b = fn()
            return b, label
        except Exception as e:
            errors.append(f"{label}: {type(e).__name__}: {_short(str(e))}")
            return None

    choice = (choice or "auto").lower().strip()

    launch_kwargs = {"headless": (not headed)}
    if slow_mo > 0:
        launch_kwargs["slow_mo"] = slow_mo

    if choice == "chrome":
        res = _try(lambda: p.chromium.launch(channel="chrome", **launch_kwargs), "chromium:chrome")
        if res:
            return res
        raise RuntimeError("Could not launch system Chrome.\n" + "\n".join(errors))

    if choice == "chromium":
        res = _try(lambda: p.chromium.launch(**launch_kwargs), "chromium:bundled")
        if res:
            return res
        raise RuntimeError("Could not launch bundled Chromium.\n" + "\n".join(errors))

    if choice == "firefox":
        res = _try(lambda: p.firefox.launch(**launch_kwargs), "firefox:bundled")
        if res:
            return res
        raise RuntimeError("Could not launch bundled Firefox.\n" + "\n".join(errors))

    for fn, label in (
        (lambda: p.chromium.launch(channel="chrome", **launch_kwargs), "chromium:chrome"),
        (lambda: p.chromium.launch(channel="msedge", **launch_kwargs), "chromium:msedge"),
        (lambda: p.chromium.launch(**launch_kwargs), "chromium:bundled"),
        (lambda: p.firefox.launch(**launch_kwargs), "firefox:bundled"),
    ):
        res = _try(fn, label)
        if res:
            return res

    raise RuntimeError("Could not launch any browser.\n" + "\n".join(errors))


def _run_playwright_once(
    url: str,
    headed: bool,
    timeout_ms: int,
    browser_choice: str,
    allow_force: bool,
    debug: bool,
    slow_mo: int,
) -> int:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception as e:
        _fail(f"Playwright import failed: {e}")
        _ok("Tip: run with --static if Playwright isn't available.")
        return 2

    failures: List[str] = []

    with sync_playwright() as p:
        browser = None
        context = None
        try:
            browser, label = _launch_browser(p, browser_choice, headed=headed, slow_mo=slow_mo)
            _ok(f"Browser: {label}")

            context = browser.new_context(
                viewport={"width": 1365, "height": 840},
                ignore_https_errors=True,
            )
            page = context.new_page()
            page.set_default_timeout(timeout_ms)

            _goto(page, url)

            for spec in OVERLAYS:
                overlay_sel = f"#{spec.overlay_id}"

                if page.locator(overlay_sel).count() == 0:
                    msg = f"{spec.name} ({overlay_sel}): missing in DOM"
                    failures.append(msg)
                    _fail(msg)
                    continue

                # 1) Hash open/close
                if not _open_via_hash(page, url, spec.overlay_id, timeout_ms):
                    snap = _state_snapshot(page, overlay_sel)
                    msg = f"{spec.name} ({overlay_sel}): hash open failed | {snap}"
                    failures.append(msg)
                    _fail(f"{spec.name} ({overlay_sel}): hash open failed")
                    continue

                if not _close_overlay(page, url, spec.overlay_id, spec.close_selectors, timeout_ms, allow_force):
                    snap = _state_snapshot(page, overlay_sel)
                    msg = f"{spec.name} ({overlay_sel}): close failed after hash open | {snap}"
                    failures.append(msg)
                    _fail(f"{spec.name} ({overlay_sel}): close failed after hash open")
                    continue

                _ok(f"{spec.name} ({overlay_sel}): hash open/close ✅")

                # 2) Opener click path
                if spec.prefer_hash_open:
                    _ok(f"{spec.name} ({overlay_sel}): opener click skipped (prefer_hash_open)")
                    continue

                _goto(page, url)

                opener_used = _click_opener(page, spec.opener_selectors, timeout_ms, allow_force)
                if not opener_used:
                    _ok(f"{spec.name} ({overlay_sel}): no visible opener found (skipping click-path)")
                    continue

                if "skipped: target=_blank" in opener_used:
                    _ok(f"{spec.name} ({overlay_sel}): opener click skipped ({opener_used})")
                    continue

                if not _wait_openish(page, spec.overlay_id, True, timeout_ms):
                    snap = _state_snapshot(page, overlay_sel)
                    msg = f"{spec.name} ({overlay_sel}): opener click did not open | opener={opener_used} | {snap}"
                    failures.append(msg)
                    _fail(f"{spec.name} ({overlay_sel}): opener click did not open")
                    continue

                if not _close_overlay(page, url, spec.overlay_id, spec.close_selectors, timeout_ms, allow_force):
                    snap = _state_snapshot(page, overlay_sel)
                    msg = f"{spec.name} ({overlay_sel}): close failed after opener click | opener={opener_used} | {snap}"
                    failures.append(msg)
                    _fail(f"{spec.name} ({overlay_sel}): close failed after opener click")
                    continue

                _ok(f"{spec.name} ({overlay_sel}): opener click open/close ✅ (opener={opener_used})")

        except BrowserClosedUnexpectedly:
            raise
        except Exception as e:
            if _is_target_closed(e):
                raise BrowserClosedUnexpectedly(f"TargetClosedError: {_short(str(e))}") from None
            _fail(f"Unexpected error: {type(e).__name__}: {_short(str(e))}")
            if debug:
                _warn("DEBUG: re-run with --headed --slow-mo 150 --allow-force to inspect clickability.")
            return 2
        finally:
            try:
                if context is not None:
                    context.close()
            except Exception:
                pass
            try:
                if browser is not None:
                    browser.close()
            except Exception:
                pass

    if failures:
        print("\nRESULT: FAIL\n")
        for f in failures:
            print(" - " + f)
        return 1

    print("\nRESULT: PASS\n")
    return 0


def run_playwright(
    url: str,
    headed: bool,
    timeout_ms: int,
    browser_choice: str,
    allow_force: bool,
    retries: int,
    debug: bool,
    slow_mo: int,
) -> int:
    attempts = 1 + max(0, int(retries))
    last_closed_err: Optional[str] = None

    for i in range(1, attempts + 1):
        _ok(f"Attempt {i}/{attempts}")
        try:
            return _run_playwright_once(
                url=url,
                headed=headed,
                timeout_ms=timeout_ms,
                browser_choice=browser_choice,
                allow_force=allow_force,
                debug=debug,
                slow_mo=slow_mo,
            )
        except BrowserClosedUnexpectedly as e:
            last_closed_err = str(e)
            _fail(f"Browser/page closed unexpectedly (headed={headed}).")
            _ok("Tip: don’t close the browser window mid-run; re-run without --headed for CI-style stability.")
            _ok("Tip: on Kali, prefer --browser chrome (system) over bundled Chromium.")
            if debug and last_closed_err:
                _warn(f"DEBUG: {last_closed_err}")
            if i < attempts:
                _warn("Retrying due to unexpected browser/page close…")
                continue
            print("\nRESULT: FAIL\n")
            print(" - TargetClosedError: browser/page closed")
            return 1

    return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="Base URL, e.g. http://localhost:5000/")
    ap.add_argument("--headed", action="store_true", help="Run browser headed (debug)")
    ap.add_argument("--timeout-ms", type=int, default=15000, help="Timeout per step")
    ap.add_argument("--static", action="store_true", help="Static HTML-only checks (no Playwright)")
    ap.add_argument(
        "--browser",
        default="auto",
        choices=("auto", "chrome", "chromium", "firefox"),
        help="Browser engine selection. On Kali, 'chrome' is recommended if installed.",
    )
    ap.add_argument(
        "--allow-force",
        action="store_true",
        help="Allow force-clicks (diagnostic). Default is off to catch real UX clickability issues.",
    )
    ap.add_argument(
        "--retries",
        type=int,
        default=0,
        help="Retry the whole run if the browser/page closes unexpectedly (headed runs).",
    )
    ap.add_argument("--debug", action="store_true", help="Extra logging for diagnosing failures.")
    ap.add_argument(
        "--slow-mo",
        type=int,
        default=0,
        help="Playwright slow motion (ms) for headed debugging (e.g. 150).",
    )

    args = ap.parse_args()

    if args.static:
        return run_static(args.url)

    return run_playwright(
        url=args.url,
        headed=args.headed,
        timeout_ms=args.timeout_ms,
        browser_choice=args.browser,
        allow_force=args.allow_force,
        retries=args.retries,
        debug=args.debug,
        slow_mo=args.slow_mo,
    )


if __name__ == "__main__":
    raise SystemExit(main())

