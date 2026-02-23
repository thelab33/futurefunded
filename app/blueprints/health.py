from __future__ import annotations

import os
import time
from flask import Blueprint, jsonify, current_app

bp = Blueprint("health", __name__)

START_TS = time.time()

def _safe_check(name: str, fn):
    try:
        fn()
        return {"name": name, "ok": True}
    except Exception as e:
        current_app.logger.warning("health_check_failed", extra={"check": name, "err": str(e)})
        return {"name": name, "ok": False, "error": str(e)[:200]}

@bp.get("/healthz")
def healthz():
    # Liveness: NEVER throw.
    return jsonify({
        "ok": True,
        "service": "futurefunded",
        "uptime_s": int(time.time() - START_TS),
        "env": os.getenv("FLASK_ENV", "unknown"),
    }), 200

@bp.get("/readyz")
def readyz():
    # Readiness: may be 503, but should NEVER 500.
    checks = []

    def check_db():
        db = current_app.extensions["sqlalchemy"]
        with db.engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")

    def check_cache():
        r = current_app.extensions.get("redis")
        if r:
            r.ping()

    checks.append(_safe_check("db", check_db))
    checks.append(_safe_check("redis", check_cache))

    ok = all(c["ok"] for c in checks)
    code = 200 if ok else 503
    return jsonify({"ok": ok, "checks": checks}), code
