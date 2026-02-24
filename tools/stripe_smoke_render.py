import json, re, sys, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000/?smoke=1"
html = urllib.request.urlopen(BASE).read().decode("utf-8", "replace")

m = re.search(r'<script[^>]+id="ffConfig"[^>]*>(.*?)</script>', html, re.S)
if not m:
    raise SystemExit("FAIL: #ffConfig not found")

cfg = json.loads(m.group(1).strip() or "{}")
pk = (cfg.get("payments", {}) or {}).get("stripePk") or ""
if not pk:
    raise SystemExit("FAIL: cfg.payments.stripePk missing/empty")
if not pk.startswith("pk_"):
    raise SystemExit(f"FAIL: stripePk doesn't look like a Stripe pk_: {pk[:8]}...")

print("OK: ffConfig contains stripePk")

