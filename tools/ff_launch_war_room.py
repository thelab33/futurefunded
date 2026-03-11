#!/usr/bin/env python3
"""
FutureFunded Launch War Room Checklist
--------------------------------------

Standard-library only. No third-party dependencies.

Features:
- Seeds a robust go-live checklist with current known blockers
- Tracks PASS / FAIL / BLOCKED / N/A / PENDING per item
- Tracks owner, notes, evidence, timestamps
- Computes RED / YELLOW / GREEN launch verdict
- Interactive review mode
- Markdown export with exact PASS / FAIL boxes
- CSV export for ops / PM handoff

Usage:
    python tools/ff_launch_war_room.py init
    python tools/ff_launch_war_room.py status
    python tools/ff_launch_war_room.py next
    python tools/ff_launch_war_room.py review --open-only
    python tools/ff_launch_war_room.py set CB-01 --state pass --owner Angel --note "Cloudflare fixed"
    python tools/ff_launch_war_room.py markdown --output LAUNCH_WAR_ROOM.md
    python tools/ff_launch_war_room.py csv --output LAUNCH_WAR_ROOM.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

DEFAULT_DB_PATH = Path(".futurefunded_launch_war_room.json")
VALID_STATES = {"pending", "pass", "fail", "blocked", "na"}
SEVERITY_ORDER = {"critical": 0, "important": 1, "normal": 2}
STATE_ORDER = {"fail": 0, "blocked": 1, "pending": 2, "pass": 3, "na": 4}


@dataclass(frozen=True)
class ItemTemplate:
    item_id: str
    section_code: str
    section_title: str
    title: str
    severity: str


SECTION_DEFS: List[Tuple[str, str, List[Tuple[str, str]]]] = [
    (
        "CB",
        "0) Current blockers",
        [
            ("critical", "Production root domain serves successfully (no Cloudflare 530)"),
            ("critical", "Production static CSS and JS assets serve successfully"),
            ("critical", "Production Socket.IO / WebSocket behavior is non-fatal or correctly configured"),
            ("critical", "UI/UX gate has no missing CSS id selector for ffLiveFeedTitle"),
            ("critical", "Smoke test has no fatal console errors"),
        ],
    ),
    (
        "RC",
        "1) Revenue-critical launch blockers",
        [
            ("critical", "Stripe is using live publishable key"),
            ("critical", "Stripe is using live secret key"),
            ("critical", "PayPal is using live client credentials"),
            ("critical", "Production webhook endpoints are configured correctly"),
            ("critical", "Stripe webhook events are received successfully"),
            ("critical", "PayPal callback / approval / cancel flows return correctly"),
            ("critical", "Custom donation amount works"),
            ("critical", "Preset donation buttons preload the amount correctly"),
            ("critical", "Team-specific donation buttons pass the correct team id"),
            ("critical", "Player-specific donation buttons pass the correct player id"),
            ("critical", "Successful payment updates totals correctly"),
            ("critical", "Failed payment shows a clean error state"),
            ("critical", "Cancelled payment returns the user safely"),
            ("critical", "Receipt / confirmation email sends after successful payment"),
            ("important", "Currency is correct everywhere"),
            ("important", "Apple Pay / Google Pay behavior is acceptable on supported devices"),
            ("important", "Refund / dispute support path is real and tested"),
            ("critical", "QR code opens the production donation URL"),
            ("important", "Share button uses the correct title, text, and canonical URL"),
            ("important", "Shared link preview looks correct in iMessage / SMS / Facebook / X"),
        ],
    ),
    (
        "DI",
        "2) Data integrity checklist",
        [
            ("important", "Organization name is final everywhere"),
            ("important", "Campaign name is final everywhere"),
            ("important", "Logo is correct and crisp"),
            ("critical", "Goal amount is correct"),
            ("critical", "Raised amount source is correct"),
            ("critical", "Progress percentage is correct"),
            ("important", "Deadline is correct"),
            ("important", "Location is correct"),
            ("important", "Team list is accurate"),
            ("important", "Team photos are correct and not broken"),
            ("important", "Sponsor tiers and copy are accurate"),
            ("important", "Contact email is correct"),
            ("important", "Terms URL is real"),
            ("important", "Privacy URL is real"),
            ("important", "Refund / policy copy is real"),
            ("important", "No lorem ipsum, fake names, placeholder copy, or preview-only language"),
            ("normal", "No stale preview / demo badges visible unless intentional"),
        ],
    ),
    (
        "FI",
        "3) Form and interaction checklist",
        [
            ("important", "Click donate from hero"),
            ("important", "Click donate from sticky nav"),
            ("important", "Click donate from team cards"),
            ("important", "Click donate from player sponsor cards"),
            ("important", "Click donate from footer"),
            ("important", "Open checkout, close checkout, reopen checkout"),
            ("important", "Checkout traps focus correctly"),
            ("normal", "ESC closes overlays if JS supports it"),
            ("important", "Backdrop click closes overlays correctly"),
            ("important", "No body scroll-lock bugs"),
            ("important", "No double-scroll inside modal / sheet on mobile"),
            ("important", "Sponsor modal opens and closes correctly"),
            ("important", "Sponsor required validation works"),
            ("important", "Sponsor success state works"),
            ("important", "Sponsor error state works"),
            ("critical", "Sponsor email lands where expected"),
            ("important", "Sponsor tier selection is passed correctly"),
            ("important", "Spam protection / rate limiting exists"),
            ("important", "Video opens only on demand"),
            ("important", "Video closes cleanly"),
            ("important", "Video does not continue playing after close"),
            ("important", "Focus returns correctly after video close"),
            ("normal", "Onboarding wizard opens and closes correctly if public"),
            ("normal", "Onboarding step navigation works if public"),
            ("normal", "Onboarding copy brief works if public"),
            ("normal", "Onboarding create draft works if public"),
            ("normal", "Onboarding endpoint is production-safe if public"),
            ("normal", "You actually want onboarding visible on a public fundraiser launch"),
            ("important", "Hide or disable onboarding for launch if it is not public"),
        ],
    ),
    (
        "MO",
        "4) Mobile-first launch checklist",
        [
            ("important", "Test completed on iPhone Safari"),
            ("important", "Test completed on Android Chrome"),
            ("normal", "Test completed on one small / older phone viewport"),
            ("normal", "Test completed on one large modern phone viewport"),
            ("important", "No horizontal scrolling anywhere"),
            ("important", "Hero headline wraps cleanly"),
            ("important", "Buttons do not overflow cards"),
            ("important", "Sticky bottom tabs do not block primary content"),
            ("important", "Back-to-top button does not collide with sticky nav"),
            ("critical", "Checkout sheet is fully usable on mobile"),
            ("important", "Keyboard opening does not break input fields"),
            ("important", "Safe-area spacing works near the bottom on iPhone"),
            ("normal", "QR code is readable on mobile"),
            ("important", "Team cards remain legible and not cramped"),
            ("important", "Contrast remains strong outdoors / high brightness"),
        ],
    ),
    (
        "AX",
        "5) Accessibility checklist",
        [
            ("important", "Keyboard-only navigation works across the page"),
            ("important", "Skip links work"),
            ("important", "Focus states are visible"),
            ("important", "Focus trap works inside drawer / modal / checkout"),
            ("important", "Screen-reader labels make sense"),
            ("important", "Buttons vs links are used appropriately"),
            ("important", "Progress bars have meaningful labels"),
            ("important", "Form inputs have labels and helpful error text"),
            ("important", "Color contrast passes for body text, pills, buttons, and muted copy"),
            ("important", "Images have appropriate alt text"),
            ("important", "Decorative images have empty alt where correct"),
            ("normal", "No autoplay audio / video surprises"),
            ("normal", "Reduced motion behavior is acceptable"),
        ],
    ),
    (
        "PF",
        "6) Performance checklist",
        [
            ("important", "First load feels fast on mobile"),
            ("important", "Hero image is optimized"),
            ("important", "Team images are optimized"),
            ("important", "Video is lazy-loaded"),
            ("important", "Stripe / PayPal are lazy-loaded as intended"),
            ("important", "No giant uncompressed assets"),
            ("important", "No layout shift when payment widgets load"),
            ("normal", "Fonts are not blocking rendering badly"),
            ("normal", "Lighthouse mobile score is acceptable"),
            ("important", "No obvious jank when opening checkout / drawer / modals"),
        ],
    ),
    (
        "SE",
        "7) Security and production hygiene checklist",
        [
            ("critical", "HTTPS is active everywhere"),
            ("critical", "Production environment variables are correct"),
            ("critical", "No test keys in source or rendered HTML"),
            ("important", "CSRF protection is active where needed"),
            ("important", "Forms have spam protection or rate limiting"),
            ("critical", "Error pages do not leak stack traces"),
            ("important", "Console has no secrets or debug dumps"),
            ("important", "Cookies / settings are production-safe"),
            ("important", "CSP behavior is stable in production"),
            ("critical", "Domain, DNS, SSL, and redirects are correct"),
            ("normal", "www vs non-www canonical behavior is intentional"),
            ("normal", "noindex is removed if public discovery is desired"),
            ("important", "Backup / rollback path exists"),
        ],
    ),
    (
        "AN",
        "8) Analytics and business visibility checklist",
        [
            ("important", "Analytics is installed"),
            ("important", "Page view tracking works"),
            ("important", "Donate CTA clicks are tracked"),
            ("important", "Checkout open is tracked"),
            ("critical", "Successful donation event is tracked"),
            ("important", "Sponsor inquiry submit is tracked"),
            ("important", "Share click is tracked"),
            ("normal", "QR usage has a measurable destination URL"),
            ("important", "Error logging is installed"),
            ("important", "Production failures are visible quickly"),
        ],
    ),
    (
        "TC",
        "9) Trust and conversion checklist",
        [
            ("important", "The first screen explains what the money is for"),
            ("important", "The first donate CTA is visible immediately"),
            ("important", "Donation presets feel practical and believable"),
            ("important", "Trust signals are present near checkout"),
            ("important", "Sponsor value is clear"),
            ("important", "The page feels credible to families and sponsors"),
            ("important", "Refund / support path is easy to find"),
            ("important", "Footer contact path is real"),
            ("important", "No section feels like internal demoware"),
            ("important", "No overly dense copy blocks create scroll fatigue"),
            ("normal", "The page holds up visually in grayscale"),
            ("critical", "The page feels safe enough for a first-time donor to complete payment"),
        ],
    ),
]

CURRENT_FINDINGS: Dict[str, Dict[str, str]] = {
    "CB-01": {
        "status": "fail",
        "owner": "Angel",
        "note": "Cloudflare 530 returned for https://getfuturefunded.com",
        "evidence": "curl -s / curl -I returned HTTP/2 530",
    },
    "CB-02": {
        "status": "fail",
        "owner": "Angel",
        "note": "Static assets returned Cloudflare 530 for ff.css and ff-app.js",
        "evidence": 'curl -I "https://getfuturefunded.com/static/css/ff.css?v=15.0.0" and ff-app.js returned 530',
    },
    "CB-03": {
        "status": "fail",
        "owner": "Angel",
        "note": "Production / smoke path still attempts ws://127.0.0.1:5000/socket.io/",
        "evidence": "Playwright smoke captured WebSocket handshake 400 against localhost",
    },
    "CB-04": {
        "status": "fail",
        "owner": "Angel",
        "note": "UI/UX gate reports missing CSS id selector for #ffLiveFeedTitle",
        "evidence": "pw:ux failed in both light and dark theme",
    },
    "CB-05": {
        "status": "fail",
        "owner": "Angel",
        "note": "Smoke test failed due to fatal console error",
        "evidence": "pw:smoke failed on WebSocket console error",
    },
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def color_enabled() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def c(text: str, fg: str) -> str:
    if not color_enabled():
        return text
    colors = {
        "red": "\033[31m",
        "green": "\033[32m",
        "yellow": "\033[33m",
        "blue": "\033[34m",
        "magenta": "\033[35m",
        "cyan": "\033[36m",
        "dim": "\033[2m",
        "bold": "\033[1m",
        "reset": "\033[0m",
    }
    return f"{colors.get(fg, '')}{text}{colors['reset']}"


def normalize_state(value: str) -> str:
    v = value.strip().lower()
    aliases = {
        "p": "pass",
        "pass": "pass",
        "ok": "pass",
        "good": "pass",
        "f": "fail",
        "fail": "fail",
        "failed": "fail",
        "b": "blocked",
        "block": "blocked",
        "blocked": "blocked",
        "n": "na",
        "na": "na",
        "n/a": "na",
        "not-applicable": "na",
        "pending": "pending",
        "todo": "pending",
        "t": "pending",
        "skip": "pending",
        "s": "pending",
    }
    if v not in aliases:
        raise ValueError(f"Invalid state: {value!r}. Valid: {', '.join(sorted(VALID_STATES))}")
    return aliases[v]


def state_badge(state: str) -> str:
    badges = {
        "pass": c("PASS", "green"),
        "fail": c("FAIL", "red"),
        "blocked": c("BLOCKED", "magenta"),
        "na": c("N/A", "cyan"),
        "pending": c("PENDING", "yellow"),
    }
    return badges.get(state, state.upper())


def severity_badge(severity: str) -> str:
    badges = {
        "critical": c("CRITICAL", "red"),
        "important": c("IMPORTANT", "yellow"),
        "normal": c("NORMAL", "blue"),
    }
    return badges.get(severity, severity.upper())


def build_templates() -> List[ItemTemplate]:
    templates: List[ItemTemplate] = []
    for section_code, section_title, items in SECTION_DEFS:
        for idx, (severity, title) in enumerate(items, start=1):
            templates.append(
                ItemTemplate(
                    item_id=f"{section_code}-{idx:02d}",
                    section_code=section_code,
                    section_title=section_title,
                    title=title,
                    severity=severity,
                )
            )
    return templates


def build_default_db() -> Dict[str, Any]:
    ts = now_iso()
    db: Dict[str, Any] = {
        "project": "FutureFunded",
        "version": 1,
        "created_at": ts,
        "updated_at": ts,
        "items": [],
        "signoff": {
            "engineering": "",
            "product": "",
            "payments": "",
            "qa": "",
            "ops": "",
            "final_go_decision": "",
            "final_go_note": "",
            "final_go_at": "",
        },
    }

    for tpl in build_templates():
        item = {
            "id": tpl.item_id,
            "section_code": tpl.section_code,
            "section_title": tpl.section_title,
            "title": tpl.title,
            "severity": tpl.severity,
            "status": "pending",
            "owner": "",
            "note": "",
            "evidence": "",
            "updated_at": ts,
        }
        if tpl.item_id in CURRENT_FINDINGS:
            seeded = CURRENT_FINDINGS[tpl.item_id]
            item["status"] = seeded["status"]
            item["owner"] = seeded["owner"]
            item["note"] = seeded["note"]
            item["evidence"] = seeded["evidence"]
        db["items"].append(item)

    return db


def save_db(path: Path, db: Dict[str, Any]) -> None:
    db["updated_at"] = now_iso()
    path.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_db(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Checklist DB not found at {path}. Run:\n  python {Path(sys.argv[0]).name} init"
        )
    return json.loads(path.read_text(encoding="utf-8"))


def find_item(db: Dict[str, Any], item_ref: str) -> Dict[str, Any]:
    item_ref = item_ref.strip().upper()
    exact = [i for i in db["items"] if i["id"].upper() == item_ref]
    if exact:
        return exact[0]

    starts = [i for i in db["items"] if i["id"].upper().startswith(item_ref)]
    if len(starts) == 1:
        return starts[0]
    if len(starts) > 1:
        matches = ", ".join(i["id"] for i in starts[:10])
        raise KeyError(f"Ambiguous item ref {item_ref!r}. Matches: {matches}")
    raise KeyError(f"No checklist item found for {item_ref!r}")


def grouped_items(db: Dict[str, Any]) -> List[Tuple[str, str, List[Dict[str, Any]]]]:
    section_order = {code: idx for idx, (code, _title, _items) in enumerate(SECTION_DEFS)}
    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    titles: Dict[str, str] = {}

    for item in db["items"]:
        buckets[item["section_code"]].append(item)
        titles[item["section_code"]] = item["section_title"]

    output = []
    for code in sorted(buckets.keys(), key=lambda k: section_order.get(k, 999)):
        items = sorted(
            buckets[code],
            key=lambda i: (
                STATE_ORDER.get(i["status"], 99),
                SEVERITY_ORDER.get(i["severity"], 99),
                i["id"],
            ),
        )
        output.append((code, titles[code], items))
    return output


def counts(db: Dict[str, Any]) -> Counter:
    return Counter(item["status"] for item in db["items"])


def compute_verdict(db: Dict[str, Any]) -> Tuple[str, str]:
    items = db["items"]
    critical_open = [i for i in items if i["severity"] == "critical" and i["status"] not in {"pass", "na"}]
    any_noncritical_bad = [i for i in items if i["severity"] != "critical" and i["status"] in {"fail", "blocked"}]
    any_pending = [i for i in items if i["status"] == "pending"]

    if critical_open:
        return "RED", "Critical blockers still open. Do not launch publicly."
    if any_noncritical_bad or any_pending:
        return "YELLOW", "Critical blockers are clear, but checklist is not fully closed."
    return "GREEN", "All checklist items are closed or marked N/A."


def open_items(db: Dict[str, Any], critical_only: bool = False) -> List[Dict[str, Any]]:
    items = [
        i
        for i in db["items"]
        if i["status"] not in {"pass", "na"} and (not critical_only or i["severity"] == "critical")
    ]
    return sorted(items, key=lambda i: (SEVERITY_ORDER[i["severity"]], STATE_ORDER[i["status"]], i["id"]))


def mark_columns(status: str) -> Tuple[str, str, str, str]:
    return (
        "X" if status == "pass" else "",
        "X" if status == "fail" else "",
        "X" if status == "blocked" else "",
        "X" if status == "na" else "",
    )


def truncate(text: str, width: int = 56) -> str:
    text = " ".join(str(text).split())
    if len(text) <= width:
        return text
    return text[: width - 1] + "…"


def print_header(db: Dict[str, Any]) -> None:
    verdict, reason = compute_verdict(db)
    verdict_color = {"RED": "red", "YELLOW": "yellow", "GREEN": "green"}[verdict]
    print(c(f"\nFutureFunded Launch War Room — {verdict}", verdict_color))
    print(reason)
    print(f"DB updated: {db.get('updated_at', '')}")
    cts = counts(db)
    print(
        "Counts:"
        f" pass={cts.get('pass', 0)}"
        f" fail={cts.get('fail', 0)}"
        f" blocked={cts.get('blocked', 0)}"
        f" pending={cts.get('pending', 0)}"
        f" na={cts.get('na', 0)}"
    )


def cmd_init(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if path.exists() and not args.force:
        print(f"Refusing to overwrite existing file: {path}")
        print("Use --force to replace it.")
        return 1

    db = build_default_db()
    save_db(path, db)
    print(f"Initialized launch war-room DB at {path}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    db = load_db(Path(args.file))
    print_header(db)

    critical = open_items(db, critical_only=True)
    if critical:
        print(c("\nCritical open items", "red"))
        for item in critical:
            print(f"  {item['id']:>5}  {state_badge(item['status']):<10}  {item['title']}")
            if item["owner"] or item["note"]:
                owner = f"owner={item['owner']}" if item["owner"] else "owner=—"
                note = truncate(item["note"], 90) if item["note"] else "—"
                print(f"         {owner} | note={note}")

    print(c("\nSection summary", "bold"))
    for code, title, items in grouped_items(db):
        cts = Counter(i["status"] for i in items)
        print(
            f"  {code}  {title} | "
            f"pass={cts.get('pass', 0)} "
            f"fail={cts.get('fail', 0)} "
            f"blocked={cts.get('blocked', 0)} "
            f"pending={cts.get('pending', 0)} "
            f"na={cts.get('na', 0)}"
        )

    if args.verbose:
        print(c("\nOpen items", "bold"))
        for item in open_items(db):
            print(
                f"  {item['id']:>5}  {severity_badge(item['severity']):<12}  "
                f"{state_badge(item['status']):<10}  {item['title']}"
            )
            if item["owner"] or item["note"] or item["evidence"]:
                print(f"         owner={item['owner'] or '—'}")
                if item["note"]:
                    print(f"         note={item['note']}")
                if item["evidence"]:
                    print(f"         evidence={item['evidence']}")
    return 0


def cmd_next(args: argparse.Namespace) -> int:
    db = load_db(Path(args.file))
    items = open_items(db, critical_only=args.critical_only)
    limit = args.limit

    print_header(db)
    print(c("\nNext actions", "bold"))

    if not items:
        print("  No open items. Tiny miracle.")
        return 0

    for item in items[:limit]:
        print(
            f"  {item['id']:>5}  {severity_badge(item['severity']):<12}  "
            f"{state_badge(item['status']):<10}  {item['title']}"
        )
        print(f"         owner={item['owner'] or '—'}")
        print(f"         note={item['note'] or '—'}")
        print(f"         evidence={item['evidence'] or '—'}")
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    path = Path(args.file)
    db = load_db(path)
    item = find_item(db, args.item_id)

    if args.state:
        item["status"] = normalize_state(args.state)
    if args.owner is not None:
        item["owner"] = args.owner
    if args.note is not None:
        item["note"] = args.note
    if args.evidence is not None:
        item["evidence"] = args.evidence

    item["updated_at"] = now_iso()
    save_db(path, db)

    print(f"Updated {item['id']}: {item['title']}")
    print(f"  status={item['status']}")
    print(f"  owner={item['owner'] or '—'}")
    print(f"  note={item['note'] or '—'}")
    print(f"  evidence={item['evidence'] or '—'}")
    return 0


def prompt(prompt_text: str, default: str = "") -> str:
    if default:
        raw = input(f"{prompt_text} [{default}]: ").strip()
        return raw if raw else default
    return input(f"{prompt_text}: ").strip()


def cmd_review(args: argparse.Namespace) -> int:
    path = Path(args.file)
    db = load_db(path)

    targets = open_items(db) if args.open_only else db["items"]
    targets = sorted(targets, key=lambda i: (SEVERITY_ORDER[i["severity"]], STATE_ORDER[i["status"]], i["id"]))

    print_header(db)
    print(c("\nInteractive review", "bold"))
    print("Enter status as: pass / fail / blocked / na / pending")
    print("Press Enter to keep existing values.\n")

    for item in targets:
        print("-" * 100)
        print(f"{item['id']} | {item['section_title']}")
        print(f"Severity : {item['severity']}")
        print(f"Status   : {item['status']}")
        print(f"Check    : {item['title']}")
        if item["owner"]:
            print(f"Owner    : {item['owner']}")
        if item["note"]:
            print(f"Note     : {item['note']}")
        if item["evidence"]:
            print(f"Evidence : {item['evidence']}")

        state_raw = prompt("State", item["status"])
        try:
            state = normalize_state(state_raw)
        except ValueError as exc:
            print(c(str(exc), "red"))
            print(c("Skipping item due to invalid state input.\n", "red"))
            continue

        owner = prompt("Owner", item["owner"])
        note = prompt("Note", item["note"])
        evidence = prompt("Evidence", item["evidence"])

        item["status"] = state
        item["owner"] = owner
        item["note"] = note
        item["evidence"] = evidence
        item["updated_at"] = now_iso()
        save_db(path, db)
        print(c("Saved.\n", "green"))

    verdict, reason = compute_verdict(db)
    print(c(f"\nReview complete — {verdict}", {"RED": "red", "YELLOW": "yellow", "GREEN": "green"}[verdict]))
    print(reason)
    return 0


def markdown_report(db: Dict[str, Any]) -> str:
    verdict, reason = compute_verdict(db)
    cts = counts(db)

    lines: List[str] = []
    lines.append("# FutureFunded Launch War Room")
    lines.append("")
    lines.append(f"**Verdict:** {verdict}")
    lines.append("")
    lines.append(f"**Reason:** {reason}")
    lines.append("")
    lines.append(f"**Updated at:** {db.get('updated_at', '')}")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- PASS: {cts.get('pass', 0)}")
    lines.append(f"- FAIL: {cts.get('fail', 0)}")
    lines.append(f"- BLOCKED: {cts.get('blocked', 0)}")
    lines.append(f"- PENDING: {cts.get('pending', 0)}")
    lines.append(f"- N/A: {cts.get('na', 0)}")
    lines.append("")

    critical = open_items(db, critical_only=True)
    lines.append("## Critical open items")
    lines.append("")
    if not critical:
        lines.append("- None")
    else:
        for item in critical:
            lines.append(f"- **{item['id']}** — {item['title']}")
            lines.append(f"  - Status: {item['status'].upper()}")
            lines.append(f"  - Owner: {item['owner'] or '—'}")
            lines.append(f"  - Note: {item['note'] or '—'}")
            lines.append(f"  - Evidence: {item['evidence'] or '—'}")
    lines.append("")

    for _code, title, items in grouped_items(db):
        lines.append(f"## {title}")
        lines.append("")
        lines.append("| ID | Severity | Check | PASS | FAIL | BLOCKED | N/A | Status | Owner | Notes | Evidence |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for item in items:
            p, f, b, n = mark_columns(item["status"])
            note = str(item["note"] or "—").replace("|", "\\|")
            evidence = str(item["evidence"] or "—").replace("|", "\\|")
            owner = str(item["owner"] or "—").replace("|", "\\|")
            title_text = str(item["title"]).replace("|", "\\|")
            lines.append(
                f"| {item['id']} | {item['severity']} | {title_text} | {p} | {f} | {b} | {n} | "
                f"{item['status']} | {owner} | {note} | {evidence} |"
            )
        lines.append("")

    lines.append("## Final signoff")
    lines.append("")
    lines.append("| Function | Owner |")
    lines.append("| --- | --- |")
    signoff = db.get("signoff", {})
    for key in ("engineering", "product", "payments", "qa", "ops"):
        lines.append(f"| {key} | {signoff.get(key, '') or '—'} |")
    lines.append("")
    lines.append(f"**Final go decision:** {signoff.get('final_go_decision', '') or '—'}")
    lines.append("")
    lines.append(f"**Final go note:** {signoff.get('final_go_note', '') or '—'}")
    lines.append("")
    lines.append(f"**Final go at:** {signoff.get('final_go_at', '') or '—'}")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def cmd_markdown(args: argparse.Namespace) -> int:
    db = load_db(Path(args.file))
    report = markdown_report(db)
    if args.output:
        Path(args.output).write_text(report, encoding="utf-8")
        print(f"Wrote markdown report to {args.output}")
    else:
        sys.stdout.write(report)
    return 0


def cmd_csv(args: argparse.Namespace) -> int:
    db = load_db(Path(args.file))
    out_path = Path(args.output)

    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "id",
                "section_code",
                "section_title",
                "severity",
                "title",
                "status",
                "owner",
                "note",
                "evidence",
                "updated_at",
            ]
        )
        for item in db["items"]:
            writer.writerow(
                [
                    item["id"],
                    item["section_code"],
                    item["section_title"],
                    item["severity"],
                    item["title"],
                    item["status"],
                    item["owner"],
                    item["note"],
                    item["evidence"],
                    item["updated_at"],
                ]
            )

    print(f"Wrote CSV report to {out_path}")
    return 0


def cmd_signoff(args: argparse.Namespace) -> int:
    path = Path(args.file)
    db = load_db(path)
    signoff = db.setdefault("signoff", {})

    if args.engineering is not None:
        signoff["engineering"] = args.engineering
    if args.product is not None:
        signoff["product"] = args.product
    if args.payments is not None:
        signoff["payments"] = args.payments
    if args.qa is not None:
        signoff["qa"] = args.qa
    if args.ops is not None:
        signoff["ops"] = args.ops
    if args.final_go_decision is not None:
        signoff["final_go_decision"] = args.final_go_decision
    if args.final_go_note is not None:
        signoff["final_go_note"] = args.final_go_note
    if args.final_go_at is not None:
        signoff["final_go_at"] = args.final_go_at

    save_db(path, db)
    print("Updated signoff.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ff_launch_war_room.py",
        description="FutureFunded launch war-room checklist manager.",
    )
    parser.add_argument(
        "--file",
        default=str(DEFAULT_DB_PATH),
        help=f"Path to checklist DB (default: {DEFAULT_DB_PATH})",
    )

    subs = parser.add_subparsers(dest="command", required=True)

    p_init = subs.add_parser("init", help="Initialize a new checklist DB")
    p_init.add_argument("--force", action="store_true", help="Overwrite existing file")
    p_init.set_defaults(func=cmd_init)

    p_status = subs.add_parser("status", help="Show launch verdict and section summary")
    p_status.add_argument("--verbose", action="store_true", help="Show all open items")
    p_status.set_defaults(func=cmd_status)

    p_next = subs.add_parser("next", help="Show next open actions")
    p_next.add_argument("--limit", type=int, default=20, help="Max number of items to show")
    p_next.add_argument("--critical-only", action="store_true", help="Only show critical open items")
    p_next.set_defaults(func=cmd_next)

    p_set = subs.add_parser("set", help="Update one checklist item")
    p_set.add_argument("item_id", help="Checklist item id, e.g. CB-01 or RC-04")
    p_set.add_argument("--state", help="pass|fail|blocked|na|pending")
    p_set.add_argument("--owner", help="Owner name")
    p_set.add_argument("--note", help="Short note")
    p_set.add_argument("--evidence", help="Evidence / link / command output summary")
    p_set.set_defaults(func=cmd_set)

    p_review = subs.add_parser("review", help="Interactive checklist review")
    p_review.add_argument("--open-only", action="store_true", help="Review only non-closed items")
    p_review.set_defaults(func=cmd_review)

    p_md = subs.add_parser("markdown", help="Export markdown report")
    p_md.add_argument("--output", help="Write markdown to file instead of stdout")
    p_md.set_defaults(func=cmd_markdown)

    p_csv = subs.add_parser("csv", help="Export CSV report")
    p_csv.add_argument("--output", required=True, help="CSV output path")
    p_csv.set_defaults(func=cmd_csv)

    p_sign = subs.add_parser("signoff", help="Update signoff fields")
    p_sign.add_argument("--engineering")
    p_sign.add_argument("--product")
    p_sign.add_argument("--payments")
    p_sign.add_argument("--qa")
    p_sign.add_argument("--ops")
    p_sign.add_argument("--final-go-decision", choices=["RED", "YELLOW", "GREEN"])
    p_sign.add_argument("--final-go-note")
    p_sign.add_argument("--final-go-at")
    p_sign.set_defaults(func=cmd_signoff)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except FileNotFoundError as exc:
        print(c(str(exc), "red"))
        return 1
    except KeyError as exc:
        print(c(str(exc), "red"))
        return 1
    except KeyboardInterrupt:
        print("\nAborted.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
