#!/usr/bin/env python3
"""
FutureFunded — Ship Gate Bundle (Python)
File: tools/ff_ship_gate_bundle.py

Runs a deterministic go-live smoke gate:
  1) (Optional) Checkout sheet dedupe check/patch
  2) HTTP audit (no local 404s)
  3) Selector audit (missing selectors/ids/attrs thresholds)
  4) Checkout close diagnose (backdrop click closes + state flips)

Exit codes:
  0 = pass
  2 = fail (one or more gates failed)
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# -----------------------------
# Helpers
# -----------------------------

def now_stamp() -> str:
    return _dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def project_root() -> Path:
    # tools/ff_ship_gate_bundle.py -> project root
    return Path(__file__).resolve().parents[1]


def run_cmd(
    cmd: List[str],
    cwd: Path,
    env: Optional[Dict[str, str]] = None,
    timeout: int = 180,
) -> Tuple[int, str]:
    merged = os.environ.copy()
    if env:
        merged.update(env)

    p = subprocess.run(
        cmd,
        cwd=str(cwd),
        env=merged,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
    )
    return p.returncode, p.stdout


def print_block(title: str, body: str) -> None:
    bar = "-" * 78
    print(f"\n{bar}\n{title}\n{bar}")
    print(body.rstrip())


def parse_selector_audit(output: str) -> Dict[str, int]:
    """
    Parses your ff_selector_audit output for counts like:
      [ff-audit] ❗ 3 missing class selectors detected:
      [ff-audit] ❗ 7 missing id selectors detected:
    """
    res = {"missing_classes": 0, "missing_ids": 0, "missing_attrs": 0}

    m1 = re.search(r"\[ff-audit\]\s*❗\s*(\d+)\s+missing class selectors", output)
    if m1:
        res["missing_classes"] = int(m1.group(1))

    m2 = re.search(r"\[ff-audit\]\s*❗\s*(\d+)\s+missing id selectors", output)
    if m2:
        res["missing_ids"] = int(m2.group(1))

    # Some versions report attrs similarly; if not present, stays 0
    m3 = re.search(r"\[ff-audit\]\s*❗\s*(\d+)\s+missing attr selectors", output)
    if m3:
        res["missing_attrs"] = int(m3.group(1))

    return res


def selector_audit_pass(counts: Dict[str, int], allow_classes: int, allow_ids: int, allow_attrs: int) -> bool:
    return (
        counts["missing_classes"] <= allow_classes
        and counts["missing_ids"] <= allow_ids
        and counts["missing_attrs"] <= allow_attrs
    )


def http_audit_pass(output: str, rc: int) -> bool:
    # Prefer tool exit code; fallback to string match
    if rc == 0 and "No local 404s detected" in output:
        return True
    if "404" in output and "No local 404s detected" not in output:
        return False
    return rc == 0


def checkout_close_pass(output: str, rc: int) -> bool:
    # Your diagnose tool prints "🚨 CHECKOUT DID NOT CLOSE" on failure
    if "CHECKOUT DID NOT CLOSE" in output:
        return False
    # If tool returned nonzero, treat as fail
    return rc == 0


def dedupe_check_pass(output: str, rc: int) -> bool:
    # Your patch tool prints a canonical success line
    if "✅ already correct: exactly one attribute and it's on #checkout" in output:
        return True
    # Some versions print "REAL DOM attribute hits ...: 1"
    if re.search(r"REAL DOM attribute hits.*:\s*1\b", output):
        return True
    return rc == 0 and "attribute hits" in output


# -----------------------------
# Main gate
# -----------------------------

def main() -> int:
    pr = project_root()
    tools_dir = pr / "tools"

    ap = argparse.ArgumentParser(
        prog="ff_ship_gate_bundle.py",
        description="FutureFunded ship gate bundle (HTTP audit + selector audit + checkout close diagnose).",
    )

    ap.add_argument("--base", default="http://127.0.0.1:5000/", help="Base URL for audits/diagnose.")
    ap.add_argument("--template", default="app/templates/index.html", help="Template file for selector audit.")
    ap.add_argument("--css", default="app/static/css/*.css", help="CSS glob for selector audit.")

    ap.add_argument("--apply-dedupe-fix", action="store_true", help="If duplicates detected, apply dedupe checkout patch.")
    ap.add_argument("--skip-dedupe", action="store_true", help="Skip checkout dedupe gate.")
    ap.add_argument("--skip-diagnose", action="store_true", help="Skip checkout close diagnose gate.")

    ap.add_argument("--allow-missing-classes", type=int, default=0, help="Allowed missing class selectors.")
    ap.add_argument("--allow-missing-ids", type=int, default=0, help="Allowed missing id selectors.")
    ap.add_argument("--allow-missing-attrs", type=int, default=0, help="Allowed missing attr selectors (if tool reports).")

    ap.add_argument("--timeout", type=int, default=240, help="Per-tool timeout seconds.")
    ap.add_argument("--report-dir", default="artifacts", help="Directory to write reports (relative to project root).")

    args = ap.parse_args()

    report_dir = (pr / args.report_dir).resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"ff_ship_gate_report_{now_stamp()}.json"

    results: Dict[str, Dict[str, object]] = {}
    ok_all = True

    # -----------------------------
    # Gate 0: Dedupe checkout sheet (optional)
    # -----------------------------
    if not args.skip_dedupe:
        tool = tools_dir / "ff_patch_dedupe_checkout_sheet.py"
        if not tool.exists():
            results["dedupe_checkout"] = {"ok": False, "error": f"Missing tool: {tool}"}
            ok_all = False
        else:
            cmd = [sys.executable, str(tool), "--file", args.template]
            rc, out = run_cmd(cmd, cwd=pr, timeout=args.timeout)
            ok = dedupe_check_pass(out, rc)

            # If not ok and apply requested, attempt patch and re-check
            patched = False
            if (not ok) and args.apply_dedupe_fix:
                cmd2 = [sys.executable, str(tool), "--file", args.template, "--apply"]
                rc2, out2 = run_cmd(cmd2, cwd=pr, timeout=args.timeout)
                patched = True
                # Re-check (tool often prints final state)
                ok = dedupe_check_pass(out2, rc2)
                out = out + "\n\n--- APPLY OUTPUT ---\n" + out2
                rc = rc2 if rc2 != 0 else rc

            results["dedupe_checkout"] = {
                "ok": ok,
                "patched": patched,
                "rc": rc,
                "cmd": " ".join(cmd),
                "output_tail": out[-4000:],
            }
            if not ok:
                ok_all = False

            print_block("Gate: Dedupe Checkout Sheet", out)

    # -----------------------------
    # Gate 1: HTTP audit
    # -----------------------------
    http_tool = tools_dir / "ff_http_audit.py"
    if not http_tool.exists():
        results["http_audit"] = {"ok": False, "error": f"Missing tool: {http_tool}"}
        ok_all = False
    else:
        cmd = [sys.executable, str(http_tool), "--base", args.base]
        rc, out = run_cmd(cmd, cwd=pr, timeout=args.timeout)
        ok = http_audit_pass(out, rc)

        results["http_audit"] = {
            "ok": ok,
            "rc": rc,
            "cmd": " ".join(cmd),
            "output_tail": out[-4000:],
        }
        if not ok:
            ok_all = False

        print_block("Gate: HTTP Audit (no local 404s)", out)

    # -----------------------------
    # Gate 2: Selector audit
    # -----------------------------
    sel_tool = tools_dir / "ff_selector_audit.py"
    if not sel_tool.exists():
        results["selector_audit"] = {"ok": False, "error": f"Missing tool: {sel_tool}"}
        ok_all = False
    else:
        cmd = [
            sys.executable,
            str(sel_tool),
            "--templates",
            args.template,
            "--css",
            args.css,
            "--check-ids",
            "--show-attrs",
        ]
        rc, out = run_cmd(cmd, cwd=pr, timeout=args.timeout)
        counts = parse_selector_audit(out)
        ok = selector_audit_pass(counts, args.allow_missing_classes, args.allow_missing_ids, args.allow_missing_attrs)

        results["selector_audit"] = {
            "ok": ok,
            "rc": rc,
            "counts": counts,
            "allow": {
                "classes": args.allow_missing_classes,
                "ids": args.allow_missing_ids,
                "attrs": args.allow_missing_attrs,
            },
            "cmd": " ".join(cmd),
            "output_tail": out[-5000:],
        }
        if not ok:
            ok_all = False

        print_block("Gate: Selector Audit (classes/ids/attrs)", out)

    # -----------------------------
    # Gate 3: Checkout close diagnose (optional)
    # -----------------------------
    if not args.skip_diagnose:
        diag_tool = tools_dir / "ff_diagnose_checkout_close.py"
        if not diag_tool.exists():
            results["checkout_close_diagnose"] = {"ok": False, "error": f"Missing tool: {diag_tool}"}
            ok_all = False
        else:
            # Your tool uses BASE_URL (based on your previous runs). We set it.
            env = {"BASE_URL": args.base.rstrip("/") + "/?smoke=1"}
            cmd = [sys.executable, str(diag_tool)]
            rc, out = run_cmd(cmd, cwd=pr, env=env, timeout=max(args.timeout, 300))
            ok = checkout_close_pass(out, rc)

            results["checkout_close_diagnose"] = {
                "ok": ok,
                "rc": rc,
                "env_BASE_URL": env["BASE_URL"],
                "cmd": " ".join(cmd),
                "output_tail": out[-6000:],
            }
            if not ok:
                ok_all = False

            print_block("Gate: Checkout Close Diagnose (backdrop click closes)", out)

    # -----------------------------
    # Summary + report
    # -----------------------------
    summary = {
        "ok": ok_all,
        "base": args.base,
        "template": args.template,
        "css": args.css,
        "ts": _dt.datetime.now().isoformat(timespec="seconds"),
        "results": results,
    }

    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n" + "=" * 78)
    print("FUTUREFUNDED SHIP GATE SUMMARY")
    print("=" * 78)
    for k, v in results.items():
        status = "✅ PASS" if v.get("ok") else "❌ FAIL"
        print(f"{status}  {k}")
    print("-" * 78)
    print(f"Report: {report_path}")
    print("=" * 78 + "\n")

    return 0 if ok_all else 2


if __name__ == "__main__":
    raise SystemExit(main())
