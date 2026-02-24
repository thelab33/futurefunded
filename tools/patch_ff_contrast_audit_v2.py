#!/usr/bin/env python3
"""
patch_ff_contrast_audit_v2.py

Safe patcher: replaces ONLY the `run_lighthouse()` function in tools/ff_contrast_audit.py
with a known-good, X11-forced, timeout-hardened implementation.

- Makes a timestamped backup
- Finds def run_lighthouse at top-level and replaces its entire block
- Leaves all other code untouched (contrast + smoke etc.)
- Avoids risky "remove duplicates" surgery that can break parentheses

Usage:
  python3 tools/patch_ff_contrast_audit_v2.py tools/ff_contrast_audit.py
"""

from __future__ import annotations

import os
import re
import sys
import time


def die(msg: str, code: int = 2) -> None:
    print(f"❌ {msg}", file=sys.stderr)
    raise SystemExit(code)


def backup_path(path: str) -> str:
    ts = time.strftime("%Y%m%d-%H%M%S")
    return f"{path}.bak.{ts}"


def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def find_top_level_def_span(src: str, def_name: str) -> tuple[int, int]:
    """
    Find span of a top-level function def `def <def_name>(...):`
    Ends at the next top-level `def ...` or EOF.
    """
    m = re.search(rf"^def\s+{re.escape(def_name)}\s*\(", src, flags=re.M)
    if not m:
        die(f"Could not find top-level `def {def_name}(`")

    start = m.start()
    # find next top-level def after this one
    m2 = re.search(r"^def\s+\w+\s*\(", src[m.end() :], flags=re.M)
    end = len(src) if not m2 else (m.end() + m2.start())
    return start, end


RUN_LIGHTHOUSE_REPLACEMENT = r'''
def run_lighthouse(
    url: str,
    out_dir: str,
    preset: str,
    thresholds: Dict[str, float],
    chrome_bin: Optional[str],
    timeout_s: int,
    debug: bool,
) -> Dict[str, Any]:
    os.makedirs(out_dir, exist_ok=True)
    u = normalize_url(url)

    runner = find_lighthouse_runner()
    if not runner:
        return {
            "ok": False,
            "error": "lighthouse_not_found",
            "why": "Could not find `lighthouse` or `npx`. Install Lighthouse or Node.",
            "url": u,
        }

    chrome = chrome_bin or find_chrome_bin()

    # Environment hardening:
    # - Force X11 so headless Chrome doesn't trip over Wayland compositor protocol requirements
    env = dict(os.environ)
    env.setdefault("CI", "1")
    env["XDG_SESSION_TYPE"] = "x11"
    env.pop("WAYLAND_DISPLAY", None)
    env.pop("WAYLAND_SOCKET", None)

    # CI-safe Chrome flags (string passed to Lighthouse)
    # - remote-debugging-port=0 avoids port conflicts
    # - ozone-platform=x11 avoids Wayland issues
    chrome_flags = " ".join(
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--remote-debugging-port=0",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-extensions",
            "--disable-sync",
            "--disable-component-update",
            "--metrics-recording-only",
            "--mute-audio",
            "--hide-scrollbars",
            "--disable-features=UseOzonePlatform",
            "--ozone-platform=x11",
        ]
    )

    categories = ["performance", "accessibility", "best-practices", "seo"]
    stamp = int(time.time())
    base = os.path.join(out_dir, f"lighthouse_{preset}_{stamp}")
    json_path = f"{base}.report.json"
    html_path = f"{base}.report.html"
    summary_md = os.path.join(out_dir, f"lighthouse_{preset}.summary.md")
    stdout_path = os.path.join(out_dir, f"lighthouse_{preset}_{stamp}.stdout.txt")
    stderr_path = os.path.join(out_dir, f"lighthouse_{preset}_{stamp}.stderr.txt")

    # Build command AFTER chrome_flags is final (avoid “overwritten flags” bugs)
    common = (
        runner
        + [u]
        + ["--quiet"]
        + ["--port", "0"]  # avoid port conflicts
        + _lh_preset_flags(preset)
        + ["--only-categories", ",".join(categories)]
        + ["--chrome-flags", chrome_flags]
    )
    if chrome:
        common += ["--chrome-path", chrome]

    # 1) JSON run (authoritative)
    t0 = time.time()
    cmd_json = common + ["--output", "json", "--output-path", json_path]
    res_json = _run_cmd_pg(cmd_json, timeout_s=timeout_s, debug=debug, env=env)
    dt = time.time() - t0

    with open(stdout_path, "w", encoding="utf-8") as f:
        f.write(res_json.get("stdout", "") or "")
    with open(stderr_path, "w", encoding="utf-8") as f:
        f.write(res_json.get("stderr", "") or "")

    if res_json.get("timed_out"):
        return {
            "ok": False,
            "error": "lighthouse_timeout",
            "why": f"Lighthouse timed out after {timeout_s}s (process group killed).",
            "url": u,
            "stdout_path": stdout_path,
            "stderr_path": stderr_path,
        }

    if not os.path.exists(json_path):
        alt = _pick_latest(os.path.join(out_dir, "*.report.json"))
        if alt and os.path.exists(alt):
            json_path = alt
        else:
            err_txt = (res_json.get("stderr") or "").strip()
            why = "Lighthouse did not produce a JSON report (likely CLI args or Chrome connect failure)."
            hints: List[str] = []
            if "Unable to connect to Chrome" in err_txt:
                why = "Lighthouse could not connect to its Chrome instance."
                hints = [
                    "Pin Chrome explicitly: --chrome-bin /path/to/google-chrome (or export CHROME_BIN).",
                    "If Chrome is Snap/Flatpak, try a system-installed chrome/chromium instead.",
                    "Ensure headless deps exist (libnss3, fonts).",
                    "If running in a container, keep --no-sandbox and consider increasing /dev/shm (or keep --disable-dev-shm-usage).",
                ]
            return {
                "ok": False,
                "error": "lighthouse_no_report",
                "why": why,
                "hints": hints,
                "url": u,
                "returncode": res_json.get("returncode"),
                "stdout_path": stdout_path,
                "stderr_path": stderr_path,
                "stderr_tail": "\n".join(err_txt.splitlines()[-40:]),
            }

    # 2) Best-effort HTML run (non-gating)
    cmd_html = common + ["--output", "html", "--output-path", html_path]
    _run_cmd_pg(cmd_html, timeout_s=max(60, int(timeout_s * 0.75)), debug=debug, env=env)
    if not os.path.exists(html_path):
        alt_html = _pick_latest(os.path.join(out_dir, "*.report.html"))
        if alt_html and os.path.exists(alt_html):
            html_path = alt_html

    # Parse JSON report
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            rep = json.load(f)
    except Exception as e:
        return {
            "ok": False,
            "error": "lighthouse_bad_json",
            "why": f"{type(e).__name__}: {e}",
            "url": u,
            "report_json": json_path,
        }

    cats = rep.get("categories", {}) or {}
    scores: Dict[str, float] = {}
    for k in categories:
        sc = cats.get(k, {}).get("score")
        scores[k] = float(sc) if isinstance(sc, (int, float)) else -1.0

    failing = []
    for k, min_sc in thresholds.items():
        if k in scores and scores[k] >= 0 and scores[k] < min_sc:
            failing.append({"category": k, "score": scores[k], "threshold": min_sc})

    ok = (len(failing) == 0)

    audits = rep.get("audits", {}) or {}
    console = audits.get("errors-in-console", {}) or {}
    console_score = console.get("score")
    details = console.get("details", {}) if isinstance(console.get("details"), dict) else {}
    console_items = details.get("items", []) if isinstance(details.get("items"), list) else []
    console_count = len(console_items)

    # Summary markdown
    lines = []
    lines.append(f"# Lighthouse Summary ({preset})")
    lines.append("")
    lines.append(f"- URL: {u}")
    lines.append(f"- Duration: {dt:.1f}s")
    lines.append(f"- stdout: {stdout_path}")
    lines.append(f"- stderr: {stderr_path}")
    lines.append("")
    for k in categories:
        sc = scores.get(k, -1.0)
        thr = thresholds.get(k)
        if sc < 0:
            lines.append(f"- {k}: (missing)")
        else:
            pct = int(round(sc * 100))
            thr_pct = int(round((thr if thr is not None else 0.0) * 100))
            badge = "✅" if (thr is None or sc >= thr) else "❌"
            lines.append(f"- {k}: {pct}/100 (min {thr_pct}) {badge}")
    lines.append("")
    lines.append(f"- errors-in-console: score={console_score} items={console_count}")
    with open(summary_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return {
        "ok": ok,
        "url": u,
        "preset": preset,
        "thresholds": thresholds,
        "scores": scores,
        "failing": failing,
        "report_json": json_path,
        "report_html": html_path if os.path.exists(html_path) else None,
        "summary_md": summary_md,
        "duration_s": dt,
        "console_errors_count": console_count,
        "stdout_path": stdout_path,
        "stderr_path": stderr_path,
    }
'''.lstrip("\n")


def patch(path: str) -> None:
    src = read_file(path)

    # We need these names in scope of the file; verify they exist so replacement compiles.
    required_names = [
        "normalize_url",
        "find_lighthouse_runner",
        "find_chrome_bin",
        "_lh_preset_flags",
        "_run_cmd_pg",
        "_pick_latest",
    ]
    for name in required_names:
        if re.search(rf"\b{name}\b", src) is None:
            die(f"Refusing to patch: required helper `{name}` not found in file.")

    start, end = find_top_level_def_span(src, "run_lighthouse")

    patched = src[:start] + RUN_LIGHTHOUSE_REPLACEMENT + "\n\n" + src[end:]

    bak = backup_path(path)
    write_file(bak, src)
    write_file(path, patched)

    print("✅ Patched run_lighthouse() safely.")
    print(f"   - backup: {bak}")
    print(f"   - file:   {path}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 tools/patch_ff_contrast_audit_v2.py tools/ff_contrast_audit.py", file=sys.stderr)
        return 2
    path = sys.argv[1]
    if not os.path.exists(path):
        die(f"File not found: {path}")
    patch(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
