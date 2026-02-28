#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from datetime import datetime
import re
import shutil
import sys

p = Path("app/static/js/ff-app.js")
if not p.exists():
    print("[ff-api] ❌ missing app/static/js/ff-app.js", file=sys.stderr)
    raise SystemExit(2)

src = p.read_text(encoding="utf-8", errors="replace")
MARK = "/* [ff-api] PUBLIC_API_V1 */"
if MARK in src:
    print("[ff-api] ✅ already patched")
    raise SystemExit(0)

# Insert after the ENSURE_WINDOW_FF_EARLY marker if present; else after "use strict";
insert_at = None
m = re.search(r"/\*\s*\[ff-js\]\s*ENSURE_WINDOW_FF_EARLY v1\s*\*/\s*\n", src)
if m:
    insert_at = m.end()
else:
    m2 = re.search(r'("use strict";\s*\n)', src)
    if m2:
        insert_at = m2.end()

if insert_at is None:
    print('[ff-api] ❌ could not find insertion point ("use strict" or ENSURE marker)', file=sys.stderr)
    raise SystemExit(2)

snippet = f"""
{MARK}
  // Public API exports (deterministic + hook-safe)
  // These are required by tests/contracts: ff.injectScript + ff.closeAllOverlays.

  function ffGetNonce() {{
    try {{
      var s = document.querySelector("script[nonce]");
      if (s && s.nonce) return s.nonce;
      // Some browsers expose nonce as attribute
      if (s) {{
        var n = s.getAttribute("nonce");
        if (n) return n;
      }}
    }} catch (_) {{}}
    return "";
  }}

  function ffInjectScript(src, opts) {{
    try {{
      var url = String(src || "").trim();
      if (!url) return Promise.reject(new Error("injectScript: missing src"));

      // Deduplicate by exact src
      var existing = document.querySelector('script[src="' + url.replace(/"/g, '\\"') + '"]');
      if (existing) return Promise.resolve(existing);

      return new Promise(function (resolve, reject) {{
        var s = document.createElement("script");
        s.src = url;
        s.async = true;

        // CSP nonce: prefer explicit opts.nonce; fallback to first script[nonce]
        var nonce = (opts && opts.nonce) ? String(opts.nonce) : ffGetNonce();
        if (nonce) s.setAttribute("nonce", nonce);

        s.onload = function () {{ resolve(s); }};
        s.onerror = function () {{ reject(new Error("injectScript: failed to load " + url)); }};

        (document.head || document.documentElement || document.body).appendChild(s);
      }});
    }} catch (e) {{
      return Promise.reject(e);
    }}
  }}

  function ffCloseAllOverlays() {{
    try {{
      // Close anything that looks open by contract:
      // open: :target OR .is-open OR [data-open="true"] OR [aria-hidden="false"]
      // close: [hidden] OR [data-open="false"] OR [aria-hidden="true"]
      var nodes = document.querySelectorAll(".is-open, [data-open='true'], [aria-hidden='false']");
      nodes.forEach(function (el) {{
        try {{
          el.classList && el.classList.remove("is-open");
          if (el.setAttribute) {{
            el.setAttribute("data-open", "false");
            el.setAttribute("aria-hidden", "true");
          }}
          // prefer hidden for dialogs/sheets
          try {{ el.hidden = true; }} catch (_) {{}}
          if (el.setAttribute) el.setAttribute("hidden", "");
        }} catch (_) {{}}
      }});

      // Clear hash target if any (best effort)
      try {{
        if (location && location.hash && history && history.replaceState) {{
          history.replaceState(null, "", location.pathname + location.search);
        }}
      }} catch (_) {{}}
    }} catch (_) {{}}
  }}

  // Export onto window.ff deterministically (do not clobber existing)
  try {{
    if (!window.ff || typeof window.ff !== "object") window.ff = {{}};
    if (typeof window.ff.injectScript !== "function") window.ff.injectScript = ffInjectScript;
    if (typeof window.ff.closeAllOverlays !== "function") window.ff.closeAllOverlays = ffCloseAllOverlays;
  }} catch (_) {{}}

""".lstrip("\n")

bak = p.with_suffix(f".js.bak_api_{datetime.now().strftime('%Y%m%d-%H%M%S')}")
shutil.copyfile(p, bak)
out = src[:insert_at] + snippet + src[insert_at:]
p.write_text(out, encoding="utf-8")
print(f"[ff-api] ✅ patched {p} (backup -> {bak})")
