#!/usr/bin/env python3
"""
FutureFunded Smoke+ (2025-ready)
--------------------------------
Checks core pages + API + payments + sms with:
- groups (--groups core,api,payments,public,embeds,sms)
- concurrency
- retry/backoff
- JSON validation
- tunnel-aware preflight (DNS + /healthz warmup)
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import socket
import sys
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

OK_CODES = {200, 201, 202, 204, 301, 302, 307, 308}

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
DIM = "\033[2m"
RESET = "\033[0m"

Method = Literal["GET", "POST", "HEAD"]
Kind = Literal["page", "json", "form"]
Group = Literal["core", "public", "embeds", "api", "payments", "sms"]


@dataclass(frozen=True)
class Check:
    method: Method
    path: str
    kind: Kind = "page"
    required: bool = True
    group: Group = "core"
    data: dict | None = None
    headers: dict | None = None


def checks() -> list[Check]:
    return [
        # core
        Check("GET", "/", "page", True, "core"),
        Check("GET", "/healthz", "json", True, "core"),
        Check("GET", "/version", "page", True, "core"),
        Check("GET", "/stats", "json", True, "core"),
        Check("GET", "/donate", "page", True, "core"),
        Check("GET", "/donate?prefill_name=Test&prefill_amount=25", "page", True, "core"),
        Check("GET", "/admin", "page", True, "core"),

        # public (optional)
        Check("GET", "/tiers", "page", False, "public"),
        Check("GET", "/sponsors", "page", False, "public"),
        Check("GET", "/about", "page", False, "public"),
        Check("GET", "/calendar", "page", False, "public"),
        Check("GET", "/player-handbook", "page", False, "public"),
        Check("GET", "/contact", "page", False, "public"),
        Check("GET", "/thank-you?org=default&amount=50", "page", False, "public"),

        # embeds (optional)
        Check("GET", "/embed/about", "page", False, "embeds"),
        Check("GET", "/embed/impact", "page", False, "embeds"),
        Check("GET", "/tiers?mode=inline", "page", False, "embeds"),

        # api
        Check("GET", "/api/status", "json", True, "api"),
        Check("GET", "/api/stats", "json", True, "api"),
        Check("GET", "/api/donors", "json", True, "api"),
        Check("GET", "/api/totals", "json", False, "api"),

        # payments
        Check("GET", "/payments/health", "json", True, "payments"),
        Check(
            "POST",
            "/payments/stripe/intent",
            "json",
            True,
            "payments",
            data={"amount": 5000, "currency": "usd", "method": "stripe"},
            headers={"Content-Type": "application/json"},
        ),

        # sms
        Check("GET", "/sms/health", "json", True, "sms"),
        Check(
            "POST",
            "/sms/webhook",
            "form",
            True,
            "sms",
            data={"Body": "Donate", "From": "+15551112222", "To": "+15553334444"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    ]


def make_session(retries: int, timeout: float) -> requests.Session:
    sess = requests.Session()
    retry = Retry(
        total=retries,
        connect=retries,
        read=retries,
        backoff_factor=0.4,
        status_forcelist=[429, 500, 502, 503, 504, 521, 522],
        allowed_methods=["GET", "POST", "HEAD"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=60)
    sess.mount("http://", adapter)
    sess.mount("https://", adapter)
    sess.headers.update({"User-Agent": "FutureFundedSmoke+/2025"})
    sess._timeout = timeout  # type: ignore[attr-defined]
    return sess


def fmt(dt: float) -> str:
    ms = dt * 1000
    return f"{ms:.0f}ms" if ms < 1000 else f"{ms/1000:.2f}s"


def dns_ok(host: str) -> bool:
    try:
        socket.getaddrinfo(host, None)
        return True
    except Exception:
        return False


def is_cloudflare_tunnel_error(resp: requests.Response) -> bool:
    # Heuristic: error pages often have server=cloudflare and empty/no app headers
    server = (resp.headers.get("server") or "").lower()
    if "cloudflare" not in server:
        return False
    body = (resp.text or "")[:4000]
    return (
        "cloudflare tunnel error" in body.lower()
        or "error 1033" in body.lower()
        or "argo tunnel" in body.lower()
        or resp.status_code in {530, 1033}
    )


def wait_for_healthz(sess: requests.Session, base: str, seconds: float) -> None:
    url = base.rstrip("/") + "/healthz"
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            r = sess.get(url, timeout=sess._timeout)  # type: ignore[attr-defined]
            if r.status_code == 200:
                return
            # If we're seeing CF tunnel errors, keep waiting (routing/connector not ready)
            if is_cloudflare_tunnel_error(r) or r.status_code in {404, 530}:
                time.sleep(0.5)
                continue
        except Exception:
            time.sleep(0.5)
    # not fatal by itself; checks will report failures
    print(f"{YELLOW}⚠ /healthz not reachable yet via {base}{RESET}")


def run_check(sess: requests.Session, base: str, check: Check, auth_header: dict):
    url = base.rstrip("/") + (check.path if check.path.startswith("/") else "/" + check.path)
    headers = {**auth_header, **(check.headers or {})}

    body_kwargs = {}
    if check.method == "POST":
        if check.kind == "json":
            body_kwargs["json"] = check.data or {}
        else:
            body_kwargs["data"] = check.data or {}

    try:
        t0 = time.perf_counter()
        r = sess.request(
            check.method,
            url,
            timeout=sess._timeout,  # type: ignore[attr-defined]
            allow_redirects=False,
            headers=headers,
            **body_kwargs,
        )
        dt = time.perf_counter() - t0

        ok = r.status_code in OK_CODES
        status = "OK" if ok else ("WARN" if not check.required else "FAIL")

        warns: list[str] = []

        if ok and check.kind == "json":
            ct = (r.headers.get("content-type") or "").lower()
            if "json" not in ct:
                warns.append("content-type")
            try:
                r.json()
            except Exception:
                warns.append("invalid-json")

        color = GREEN if status == "OK" else (YELLOW if status == "WARN" else RED)
        warn_txt = f" {YELLOW}(warn: {','.join(warns)}){RESET}" if warns else ""
        print(f"{color}{check.method:<4} {check.path:<35} → {r.status_code:>3} {DIM}{fmt(dt)}{RESET}{warn_txt}")

        # If we got a CF tunnel error page, attach a hint
        if not ok and is_cloudflare_tunnel_error(r):
            print(f"{YELLOW}{DIM}      hint: looks like a Cloudflare tunnel/routing error (not your Flask route){RESET}")

        return check, status, (r.text or "")[:250]

    except Exception as e:
        status = "WARN" if not check.required else "FAIL"
        color = YELLOW if status == "WARN" else RED
        print(f"{color}{check.method:<4} {check.path:<35} → ERR {e}{RESET}")
        return check, status, str(e)


def main() -> None:
    ap = argparse.ArgumentParser(description="FutureFunded Smoke+ 2025")
    ap.add_argument("--base", default=None)
    ap.add_argument("--timeout", type=float, default=6)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--token", default="")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--groups", default="")  # e.g. core,api,payments
    ap.add_argument("--wait", type=float, default=30, help="Seconds to wait for /healthz (useful for tunnels)")
    args = ap.parse_args()

    env_base = os.getenv("BASE") or os.getenv("PUBLIC_BASE_URL")
    base = (args.base or env_base or "http://127.0.0.1:5000").rstrip("/")
    src = "arg(--base)" if args.base else ("env(BASE|PUBLIC_BASE_URL)" if env_base else "default")
    print(f"↪ Base: {base} ({src})")

    parsed = urlparse(base)
    if parsed.hostname and not dns_ok(parsed.hostname):
        print(f"{YELLOW}⚠ DNS lookup failed for {parsed.hostname}. (Tunnel URL expired or not propagated yet?){RESET}")

    sess = make_session(args.retries, args.timeout)

    # Warmup helps a lot for trycloudflare.com
    if args.wait > 0 and parsed.scheme == "https":
        wait_for_healthz(sess, base, args.wait)

    auth_header = {"Authorization": f"Bearer {args.token}"} if args.token else {}

    selected = checks()

    if args.groups:
        wanted = {g.strip() for g in args.groups.split(",") if g.strip()}
        selected = [c for c in selected if c.group in wanted]  # type: ignore[comparison-overlap]

    if args.only:
        wanted = {p.strip() for p in args.only.split(",") if p.strip()}
        selected = [c for c in selected if c.path in wanted]

    results = []
    with cf.ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = [ex.submit(run_check, sess, base, c, auth_header) for c in selected]
        for f in cf.as_completed(futs):
            results.append(f.result())

    passed = sum(1 for _, s, _ in results if s == "OK")
    warns = sum(1 for _, s, _ in results if s == "WARN")
    fails = sum(1 for _, s, _ in results if s == "FAIL")

    print("\n────────────────────────────────────────────")
    print(f"{GREEN}OK={passed}{RESET}  {YELLOW}WARN={warns}{RESET}  {RED}FAIL={fails}{RESET}")

    if fails or (args.strict and warns):
        print(f"{RED}❌ Smoke+ FAILED{RESET}")
        for c, s, _ in results:
            if s == "FAIL" or (args.strict and s == "WARN"):
                print(f"- [{c.group}] {c.method} {c.path} → {s}")
        sys.exit(1)

    print(f"{GREEN}✅ Smoke+ PASSED{RESET}")


if __name__ == "__main__":
    main()

