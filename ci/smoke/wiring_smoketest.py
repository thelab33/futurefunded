#!/usr/bin/env python3
"""
FutureFunded Smoke+ (Payments-Strict)
------------------------------------
- Groups (core/public/embeds/api/payments/sms)
- Warmup /healthz wait for tunnels
- Optional IPv4 forcing
- Strict schema validation for /payments/stripe/intent
- Uses canonical cents contract only: amount_cents
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
from typing import Iterable, Literal
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

OK = {200, 201, 202, 204, 301, 302, 307, 308}

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
DIM = "\033[2m"
RESET = "\033[0m"


@dataclass(frozen=True)
class Check:
    method: Literal["GET", "POST", "HEAD"]
    path: str
    group: str
    kind: Literal["page", "json", "form", "text"] = "page"
    required: bool = True
    data: dict | None = None
    headers: dict | None = None


def _force_ipv4() -> None:
    # Requests -> urllib3 uses allowed_gai_family(). Monkeypatch to AF_INET.
    import urllib3.util.connection as urllib3_cn  # type: ignore

    urllib3_cn.allowed_gai_family = lambda: socket.AF_INET  # type: ignore


def make_session(retries: int, timeout: float) -> requests.Session:
    sess = requests.Session()
    retry = Retry(
        total=retries,
        connect=retries,
        read=retries,
        backoff_factor=0.4,
        status_forcelist=[429, 500, 502, 503, 504, 521, 522, 530],
        allowed_methods=["GET", "POST", "HEAD"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=60)
    sess.mount("http://", adapter)
    sess.mount("https://", adapter)
    sess.headers.update({"User-Agent": "FutureFundedSmoke+/PaymentsStrict"})
    sess.request_timeout = timeout  # type: ignore[attr-defined]
    return sess


def fmt(ms: float) -> str:
    return f"{ms:.0f}ms" if ms < 1000 else f"{ms/1000:.2f}s"


def normalize_base(args_base: str | None) -> str:
    base = (args_base or "").strip() or os.getenv("BASE", "").strip() or os.getenv("PUBLIC_BASE_URL", "").strip()
    if not base:
        base = "http://127.0.0.1:5000"
    base = base.rstrip("/")

    if "<" in base or ">" in base:
        raise SystemExit(f"{RED}BASE looks like a placeholder: {base}{RESET}")

    return base


def dns_preflight(base: str) -> tuple[bool, bool]:
    host = urlparse(base).hostname
    if not host:
        return False, False
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
        has_v4 = any(i[0] == socket.AF_INET for i in infos)
        has_v6 = any(i[0] == socket.AF_INET6 for i in infos)
        return has_v4, has_v6
    except Exception:
        return False, False


def wait_for_healthz(sess: requests.Session, base: str, seconds: float) -> None:
    deadline = time.time() + seconds
    last = ""

    while time.time() < deadline:
        try:
            r = sess.get(base + "/healthz", timeout=sess.request_timeout)
            code = r.status_code
            server = (r.headers.get("server") or "").lower()

            if code == 200:
                return

            # Tunnel warmup patterns
            if "cloudflare" in server and code in {404, 530}:
                last = f"cloudflare:{code}"
                time.sleep(0.5)
                continue

            last = f"{code}"
            time.sleep(0.5)

        except Exception as e:
            last = f"exc:{type(e).__name__}"
            time.sleep(0.5)

    print(f"{YELLOW}⚠ /healthz not ready after {seconds:.0f}s (last={last}){RESET}")


def _looks_like_html(body: str) -> bool:
    b = (body or "").lstrip().lower()
    return b.startswith("<!doctype") or b.startswith("<html") or ("<body" in b[:500])


def validate_stripe_intent_response(body: str) -> str | None:
    """
    Hard contract validation for POST /payments/stripe/intent
    - Ensures cents contract
    - Ensures Stripe test mode
    - Ensures required keys + types
    """
    if _looks_like_html(body):
        return "got HTML (likely server error page)"

    try:
        j = json.loads(body)
    except Exception:
        return "invalid JSON"

    # Required response keys (matches your backend response)
    required_keys = {
        "ok",
        "donation_id",
        "id",
        "status",
        "client_secret",
        "publishable_key",
        "mode",
        "amount_cents",
        "fee_cents",
        "round_up_add_cents",
    }

    missing = required_keys - set(j.keys())
    if missing:
        return f"missing keys: {sorted(missing)}"

    if j.get("ok") is not True:
        return "ok != true"

    if not isinstance(j.get("donation_id"), int) or j["donation_id"] <= 0:
        return "donation_id invalid"

    pi_id = str(j.get("id") or "")
    if not pi_id.startswith("pi_"):
        return f"invalid PaymentIntent id: {pi_id}"

    cs = str(j.get("client_secret") or "")
    if not cs.startswith("pi_") or "_secret_" not in cs:
        return "invalid client_secret"

    pk = str(j.get("publishable_key") or "")
    if not (pk.startswith("pk_test_") or pk.startswith("pk_live_")):
        return "publishable_key malformed"

    mode = str(j.get("mode") or "")
    if mode != "test":
        return f"Stripe mode is not test (got {mode})"

    # cents integrity
    for k in ("amount_cents", "fee_cents", "round_up_add_cents"):
        if not isinstance(j.get(k), int):
            return f"{k} not int"
        if j[k] < 0:
            return f"{k} negative"

    # Optional back-compat keys (if present, ensure they match)
    if "clientSecret" in j and j["clientSecret"] != j["client_secret"]:
        return "clientSecret mismatch"
    if "publishableKey" in j and j["publishableKey"] != j["publishable_key"]:
        return "publishableKey mismatch"

    return None


def run_check(sess: requests.Session, base: str, check: Check, auth_header: dict, host_header: str | None):
    url = base + (check.path if check.path.startswith("/") else "/" + check.path)

    headers = {}
    headers.update(auth_header)
    if host_header:
        headers["Host"] = host_header
    if check.headers:
        headers.update(check.headers)

    body_kwargs = {}
    if check.method == "POST":
        if check.kind == "json":
            body_kwargs["json"] = check.data or {}
        elif check.kind == "form":
            body_kwargs["data"] = check.data or {}
        else:
            body_kwargs["data"] = check.data or {}

    try:
        t0 = time.perf_counter()
        r = sess.request(
            check.method,
            url,
            timeout=sess.request_timeout,
            allow_redirects=False,
            headers=headers,
            **body_kwargs,
        )
        dt = time.perf_counter() - t0

        ok_basic = r.status_code in OK
        msg = f"{check.method:<4} {check.path:<35} → {r.status_code:>3} {DIM}{fmt(dt)}{RESET}"

        warn = ""

        # JSON validation for json kind
        if ok_basic and check.kind == "json":
            ct = (r.headers.get("content-type") or "").lower()
            if "json" not in ct:
                warn = f"{YELLOW}(warn: content-type){RESET}"
            else:
                try:
                    json.loads(r.text or "{}")
                except Exception:
                    warn = f"{YELLOW}(warn: invalid JSON){RESET}"

        # 🔒 Payments strict: Stripe intent schema validation
        if ok_basic and check.path == "/payments/stripe/intent":
            err = validate_stripe_intent_response(r.text or "")
            if err:
                print(f"{RED}{msg}{RESET} {RED}(stripe invalid: {err}){RESET}")
                return check, "FAIL", err

        color = GREEN if ok_basic else (YELLOW if not check.required else RED)
        print(f"{color}{msg}{RESET} {warn}")

        status = "OK" if ok_basic else ("WARN" if not check.required else "FAIL")
        return check, status, (r.text or "")[:500]

    except Exception as e:
        hint = ""
        if "Network is unreachable" in str(e):
            hint = " [hint: IPv6 route issue? try --ipv4]"
        color = YELLOW if not check.required else RED
        print(f"{color}{check.method:<4} {check.path:<35} → ERR {e}{RESET}{hint}")
        return check, ("WARN" if not check.required else "FAIL"), str(e)


def build_checks() -> list[Check]:
    return [
        # CORE
        Check("GET", "/", "core", "page", True),
        Check("GET", "/healthz", "core", "json", True),
        Check("GET", "/version", "core", "page", True),
        Check("GET", "/stats", "core", "json", True),
        Check("GET", "/donate", "core", "page", True),
        Check("GET", "/donate?prefill_name=Test&prefill_amount=25", "core", "page", True),
        Check("GET", "/admin", "core", "page", True),

        # PUBLIC (optional)
        Check("GET", "/tiers", "public", "page", False),
        Check("GET", "/sponsors", "public", "page", False),
        Check("GET", "/about", "public", "page", False),
        Check("GET", "/calendar", "public", "page", False),
        Check("GET", "/player-handbook", "public", "page", False),
        Check("GET", "/contact", "public", "page", False),
        Check("GET", "/thank-you?org=default&amount=50", "public", "page", False),

        # EMBEDS (optional)
        Check("GET", "/embed/about", "embeds", "page", False),
        Check("GET", "/embed/impact", "embeds", "page", False),
        Check("GET", "/tiers?mode=inline", "embeds", "page", False),

        # API
        Check("GET", "/api/status", "api", "json", True),
        Check("GET", "/api/stats", "api", "json", True),
        Check("GET", "/api/donors", "api", "json", True),
        Check("GET", "/api/totals", "api", "json", False),

        # PAYMENTS
        Check("GET", "/payments/health", "payments", "json", True),
        Check(
            "POST",
            "/payments/stripe/intent",
            "payments",
            "json",
            True,
            data={
                "amount_cents": 2500,  # $25.00 canonical
                "currency": "usd",
                "email": "smoke-test@futurefunded.dev",
                "cover_fees": False,
                "round_up": False,
            },
            headers={"Content-Type": "application/json"},
        ),

        # SMS
        Check("GET", "/sms/health", "sms", "json", True),
        Check(
            "POST",
            "/sms/webhook",
            "sms",
            "form",
            True,
            data={"Body": "Donate", "From": "+15551112222", "To": "+15553334444"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description="FutureFunded Smoke+ (Payments-Strict)")
    ap.add_argument("--base", default=None)
    ap.add_argument("--timeout", type=float, default=6)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--token", default="")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--groups", default="")  # e.g. core,api,payments
    ap.add_argument("--only", default="")    # exact paths list
    ap.add_argument("--wait-seconds", type=float, default=20)
    ap.add_argument("--ipv4", action="store_true")
    ap.add_argument("--host-header", default="")  # simulate Host while hitting localhost
    args = ap.parse_args()

    if args.ipv4:
        _force_ipv4()

    base = normalize_base(args.base)
    src = "env(BASE|PUBLIC_BASE_URL)" if (os.getenv("BASE") or os.getenv("PUBLIC_BASE_URL")) else "default"
    print(f"↪ Base: {base} ({src})")

    has_v4, has_v6 = dns_preflight(base)
    if base.startswith("https://") and not (has_v4 or has_v6):
        print(f"{YELLOW}⚠ DNS lookup failed for {urlparse(base).hostname}{RESET}")
    elif args.ipv4 and base.startswith("https://") and not has_v4 and has_v6:
        print(f"{YELLOW}⚠ Host resolves IPv6-only; --ipv4 may fail unless an A record exists{RESET}")

    sess = make_session(args.retries, args.timeout)

    if base.startswith("https://"):
        print(f"{DIM}…waiting for /healthz to become reachable (up to {args.wait_seconds:.0f}s){RESET}")
        wait_for_healthz(sess, base, args.wait_seconds)

    auth_header = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    host_header = args.host_header.strip() or None

    checks = build_checks()

    if args.groups:
        wanted = {g.strip() for g in args.groups.split(",") if g.strip()}
        checks = [c for c in checks if c.group in wanted]

    if args.only:
        wanted_paths = {p.strip() for p in args.only.split(",") if p.strip()}
        checks = [c for c in checks if c.path in wanted_paths]

    results = []
    with cf.ThreadPoolExecutor(max_workers=args.concurrency) as ex:
        futs = [ex.submit(run_check, sess, base, c, auth_header, host_header) for c in checks]
        for f in cf.as_completed(futs):
            results.append(f.result())

    passed = sum(1 for _, s, _ in results if s == "OK")
    soft = sum(1 for _, s, _ in results if s == "WARN")
    fails = sum(1 for _, s, _ in results if s == "FAIL")

    print("\n────────────────────────────────────────────")
    print(f"{GREEN}OK={passed}{RESET}  {YELLOW}WARN={soft}{RESET}  {RED}FAIL={fails}{RESET}")

    if fails or (args.strict and soft):
        print(f"{RED}❌ Smoke+ FAILED{RESET}")
        for c, s, details in results:
            if s == "FAIL" or (args.strict and s == "WARN"):
                print(f"- {c.method} {c.path} → {s} ({details})")
        sys.exit(1)

    print(f"{GREEN}✅ Smoke+ PASSED{RESET}")


if __name__ == "__main__":
    main()
