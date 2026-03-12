#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(".").resolve()

SCAN_DIRS = [
    ROOT / "app",
    ROOT / "tools",
    ROOT / "tests"
]

INCLUDE_EXTS = {
    ".py", ".js", ".ts", ".json", ".html", ".jinja", ".j2", ".env", ".example", ".sample", ".cfg", ".ini", ".toml", ".yaml", ".yml"
}

PATTERNS = {
    "stripe_general": [
        r"\bstripe\b",
        r"@stripe/stripe-js",
        r"@stripe/react-stripe-js"
    ],
    "stripe_webhooks": [
        r"checkout\.session\.completed",
        r"payment_intent\.succeeded",
        r"charge\.succeeded",
        r"invoice\.paid",
        r"Stripe-Signature",
        r"whsec_",
        r"webhook"
    ],
    "paypal_general": [
        r"\bpaypal\b",
        r"client[_-]?id",
        r"client[_-]?secret"
    ],
    "paypal_webhooks": [
        r"PAYMENT\.CAPTURE\.COMPLETED",
        r"CHECKOUT\.ORDER\.APPROVED",
        r"webhook",
        r"capture"
    ],
    "email_receipts": [
        r"\breceipt\b",
        r"\bemail\b",
        r"send_mail",
        r"mail\.send",
        r"Flask-Mail",
        r"Message\(",
        r"\bSMTP\b"
    ],
    "donation_state": [
        r"\bdonation\b",
        r"\bteam_id\b",
        r"\bplayer_id\b",
        r"\bamount\b",
        r"\bstatus\b",
        r"\bsucceeded\b",
        r"\bcompleted\b"
    ],
    "config_keys": [
        r"STRIPE",
        r"PAYPAL",
        r"WEBHOOK",
        r"MAIL_",
        r"SMTP",
        r"RECEIPT"
    ]
}

ROUTE_HINTS = [
    r"@.*route\(",
    r"Blueprint\(",
    r"def .*webhook",
    r"def .*checkout",
    r"def .*donation",
    r"def .*paypal",
    r"def .*stripe"
]

def should_scan(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in INCLUDE_EXTS

def iter_files():
    for base in SCAN_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if should_scan(path):
                yield path

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

def find_matches(text: str, patterns: list[str]) -> list[str]:
    hits = []
    for pat in patterns:
        if re.search(pat, text, flags=re.IGNORECASE | re.MULTILINE):
            hits.append(pat)
    return hits

def extract_lines(text: str, pats: list[str], max_lines: int = 12) -> list[str]:
    out = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        for pat in pats:
            if re.search(pat, line, flags=re.IGNORECASE):
                out.append(f"L{i}: {line.strip()}")
                break
        if len(out) >= max_lines:
            break
    return out

def main():
    report = {
        "summary": {},
        "files": []
    }

    totals = {k: 0 for k in PATTERNS.keys()}
    interesting_files = []

    for path in iter_files():
        text = read_text(path)
        if not text.strip():
            continue

        file_entry = {
            "path": str(path.relative_to(ROOT)),
            "categories": {},
            "route_hints": extract_lines(text, ROUTE_HINTS, max_lines=8)
        }

        matched_any = False

        for category, pats in PATTERNS.items():
            hits = find_matches(text, pats)
            if hits:
                matched_any = True
                totals[category] += 1
                file_entry["categories"][category] = {
                    "matched_patterns": hits,
                    "sample_lines": extract_lines(text, hits, max_lines=10)
                }

        if matched_any:
            interesting_files.append(file_entry)

    report["summary"] = totals
    report["files"] = interesting_files

    out_dir = ROOT / "tools" / ".artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "ff_payment_wiring_audit.json"
    txt_path = out_dir / "ff_payment_wiring_audit.txt"

    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = []
    lines.append("FutureFunded Payment Wiring Audit")
    lines.append("=" * 36)
    lines.append("")
    lines.append("Summary")
    lines.append("-" * 7)
    for k, v in totals.items():
        lines.append(f"{k}: {v}")
    lines.append("")

    if not interesting_files:
        lines.append("No payment-related signals found.")
    else:
        for item in interesting_files:
            lines.append(item["path"])
            lines.append("-" * len(item["path"]))
            for category, payload in item["categories"].items():
                lines.append(f"[{category}]")
                for sample in payload["sample_lines"]:
                    lines.append(f"  {sample}")
            if item["route_hints"]:
                lines.append("[route_hints]")
                for sample in item["route_hints"]:
                    lines.append(f"  {sample}")
            lines.append("")

    txt_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    print(f"Wrote {json_path}")
    print(f"Wrote {txt_path}")

if __name__ == "__main__":
    main()
