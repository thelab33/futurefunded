# tools/stripe_smoke_backend.py
import os, sys, json
import requests

BASE = os.getenv("FF_BASE_URL", "http://127.0.0.1:5000").rstrip("/")

def die(msg):
  print("❌", msg)
  sys.exit(1)

def ok(msg):
  print("✅", msg)

def main():
  # hits your Flask endpoint which uses STRIPE_SECRET_KEY
  url = f"{BASE}/__smoketest/stripe?amount=500&currency=usd"
  try:
    r = requests.get(url, timeout=15)
  except Exception as e:
    die(f"Cannot reach {url}: {e}")

  try:
    data = r.json()
  except Exception:
    die(f"Non-JSON response from {url}. Status={r.status_code}. Body={r.text[:200]}")

  if not r.ok or not data.get("ok"):
    die(f"Stripe backend smoke failed: {json.dumps(data, indent=2)}")

  ok("PaymentIntent created + confirmed (server-side truth check)")
  print(json.dumps(data, indent=2))
  ok("BACKEND STRIPE SMOKE TEST: PASS")

if __name__ == "__main__":
  main()

