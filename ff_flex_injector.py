#!/usr/bin/env python3
"""
FutureFunded Flex Injector — Jinja-safe (NO DOM parsers)
- Patches a single template file in-place (index.html)
- Adds "flex upgrades" via stable string anchors + idempotent markers.
- Avoids BeautifulSoup/lxml corruption of Jinja expressions.

Usage:
  python ff_flex_injector.py app/templates/index.html [--backup] [--no-inline-css] [--no-inline-js]
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Tuple


@dataclass
class Change:
    key: str
    detail: str


# ----------------------------
# Helpers
# ----------------------------

def backup_file(path: Path) -> Path:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = path.with_suffix(path.suffix + f".bak.{ts}")
    bak.write_text(path.read_text("utf-8"), encoding="utf-8", newline="\n")
    return bak

def ensure_once(html: str, marker: str, injector_fn) -> Tuple[str, bool]:
    if marker in html:
        return html, False
    return injector_fn(html), True

def insert_after_first(html: str, pattern: str, insertion: str, flags=re.IGNORECASE | re.DOTALL) -> Tuple[str, bool]:
    m = re.search(pattern, html, flags)
    if not m:
        return html, False
    idx = m.end()
    return html[:idx] + insertion + html[idx:], True

def insert_before_first(html: str, pattern: str, insertion: str, flags=re.IGNORECASE | re.DOTALL) -> Tuple[str, bool]:
    m = re.search(pattern, html, flags)
    if not m:
        return html, False
    idx = m.start()
    return html[:idx] + insertion + html[idx:], True

def replace_first(html: str, pattern: str, repl: str, flags=re.IGNORECASE | re.DOTALL) -> Tuple[str, bool]:
    s2, n = re.subn(pattern, repl, html, count=1, flags=flags)
    return s2, (n == 1)

def find_any(html: str, patterns: List[str]) -> bool:
    return any(re.search(p, html, re.IGNORECASE | re.DOTALL) for p in patterns)


# ----------------------------
# Flex upgrades (Jinja-safe)
# ----------------------------

def add_hero_cta_reassurance(html: str) -> str:
    marker = 'data-ff-flex="hero-cta-reassure"'
    micro = (
        '\n  <p class="ff-micro ff-muted" data-ff-flex="hero-cta-reassure">'
        'Takes ~30 seconds • Secure checkout • Instant receipt'
        '</p>\n'
    )

    # Anchor: first primary donate CTA button/link (very forgiving).
    # We inject AFTER the first occurrence of "Donate now" OR "Open secure checkout"
    # inside a button or link.
    pat = r'(<a\b[^>]*>|<button\b[^>]*>)(?:(?!</a>|</button>).)*?(Donate now|Open secure checkout)(?:(?!</a>|</button>).)*?(</a>|</button>)'
    def inj(h: str) -> str:
        h2, _ = insert_after_first(h, pat, micro)
        return h2
    return ensure_once(html, marker, inj)[0]

def add_donation_panel_aov_nudge(html: str) -> str:
    marker = 'data-ff-flex="aov-nudge"'
    nudge = (
        '\n  <p class="ff-micro ff-muted" data-ff-flex="aov-nudge" data-ff-aov-nudge>'
        'Most donors choose $100 to cover practice time for one athlete.'
        '</p>\n'
    )

    # Anchor: quick-amount chip grid container (try a few likely hooks)
    anchors = [
        r'(<div\b[^>]*data-ff-quick-amounts[^>]*>)',
        r'(<div\b[^>]*class="[^"]*ff-amounts[^"]*"[^>]*>)',
        r'(<div\b[^>]*class="[^"]*ff-chip-grid[^"]*"[^>]*>)',
    ]

    def inj(h: str) -> str:
        for a in anchors:
            # Insert AFTER the opening tag of grid container
            h2, ok = insert_after_first(h, a, nudge)
            if ok:
                return h2
        # fallback: after the first occurrence of "$25" chip text area
        h2, _ = insert_after_first(h, r'(\$25)', '\n<!-- ' + marker + ' -->' + nudge)
        return h2

    return ensure_once(html, marker, inj)[0]

def add_sponsor_intimidation_reducer(html: str) -> str:
    marker = 'data-ff-flex="sponsor-softener"'
    line = (
        '\n  <p class="ff-micro ff-muted" data-ff-flex="sponsor-softener">'
        'You don’t need a big company — local businesses and families sponsor too.'
        '</p>\n'
    )

    # Anchor: Sponsors section heading or section id
    anchors = [
        r'(<section\b[^>]*id="sponsors"[^>]*>)',
        r'(<h2\b[^>]*>[^<]*Sponsors[^<]*</h2>)',
        r'(<h2\b[^>]*>[^<]*Sponsorship[^<]*</h2>)',
    ]

    def inj(h: str) -> str:
        for a in anchors:
            # If section opening tag: insert right after it
            if a.startswith("(<section"):
                h2, ok = insert_after_first(h, a, line)
            else:
                h2, ok = insert_after_first(h, a, "\n" + line)
            if ok:
                return h2
        return h

    return ensure_once(html, marker, inj)[0]

def add_checkout_trust_line(html: str) -> str:
    marker = 'data-ff-flex="checkout-trust"'
    line = (
        '\n  <p class="ff-micro ff-muted" data-ff-flex="checkout-trust">'
        '<span aria-hidden="true">🔒</span> Powered by Stripe • PayPal supported'
        '</p>\n'
    )

    # Anchor: checkout header area (try id="checkout" or data-ff-checkout)
    anchors = [
        r'(<header\b[^>]*data-ff-checkout-header[^>]*>)',
        r'(<div\b[^>]*data-ff-checkout-header[^>]*>)',
        r'(<section\b[^>]*id="checkout"[^>]*>)',
    ]

    def inj(h: str) -> str:
        for a in anchors:
            h2, ok = insert_after_first(h, a, line)
            if ok:
                return h2
        # fallback: after the first "Secure checkout" text
        h2, _ = insert_after_first(h, r'(Secure checkout)', r'\1' + line)
        return h2

    return ensure_once(html, marker, inj)[0]

def add_checkout_share_prime(html: str) -> str:
    marker = 'data-ff-flex="share-prime"'
    line = (
        '\n  <p class="ff-micro ff-muted" data-ff-flex="share-prime" data-ff-share-prime>'
        'After donating, you’ll be able to share this fundraiser instantly.'
        '</p>\n'
    )

    # Anchor: submit button area in checkout sheet/modal
    anchors = [
        r'(<button\b[^>]*data-ff-submit[^>]*>.*?</button>)',
        r'(<button\b[^>]*type="submit"[^>]*>.*?</button>)',
    ]

    def inj(h: str) -> str:
        for a in anchors:
            h2, ok = insert_before_first(h, a, line)
            if ok:
                return h2
        return h

    return ensure_once(html, marker, inj)[0]

def add_footer_response_time(html: str) -> str:
    marker = 'data-ff-flex="footer-response"'
    line = (
        '\n  <p class="ff-micro ff-muted" data-ff-flex="footer-response">'
        'Replies typically within 24–48 hours.'
        '</p>\n'
    )

    anchors = [
        r'(<footer\b[^>]*>)',
        r'(<section\b[^>]*id="footer"[^>]*>)',
    ]

    def inj(h: str) -> str:
        for a in anchors:
            h2, ok = insert_after_first(h, a, line)
            if ok:
                return h2
        return h

    return ensure_once(html, marker, inj)[0]

def add_impact_identity_lines(html: str) -> str:
    marker = 'data-ff-flex="impact-identity"'

    # We add a small line inside cards by looking for tier labels.
    # This is conservative: only adds if it finds a card with these names.
    map_lines = {
        "Supporter": "You’re helping keep the team on the court.",
        "Starter Pack": "You’re covering real season costs.",
        "Community Sponsor": "You’re funding real practice time.",
        "VIP Sponsor": "You’re powering the whole program.",
    }

    def inj(h: str) -> str:
        out = h
        added_any = False

        for label, line in map_lines.items():
            # Find a card block containing the label, then inject after the first price/range line or after the label line.
            # Heuristic: within same card div, inject after first <p> following label.
            pat = rf'(<div\b[^>]*class="[^"]*(ff-tier|ff-card|ff-impact)[^"]*"[^>]*>.*?)(>{re.escape(label)}<)(.*?</div>)'
            m = re.search(pat, out, re.IGNORECASE | re.DOTALL)
            if not m:
                continue

            block_start = m.group(1)
            label_tag = m.group(2)  # contains >Label<
            rest = m.group(3)

            # inject after first </p> after label, else after label itself
            inject = f'\n    <p class="ff-micro ff-muted" data-ff-flex="impact-identity">{line}</p>\n'
            # try inject after first </p> in the remainder
            r2, ok = insert_after_first(rest, r'(</p>)', inject)
            if not ok:
                rest = rest.replace(label_tag, label_tag + inject, 1)
            else:
                rest = r2

            out = block_start + label_tag + rest
            added_any = True

        # If none added, leave untouched.
        return out

    return ensure_once(html, marker, inj)[0]

def add_most_popular_motion_hook(html: str) -> str:
    marker = 'data-ff-flex="popular-motion"'

    # Add a data attribute to the "Most popular" badge/card so ff-app.js can pulse once.
    # We'll tag the first occurrence of "Most popular" text.
    def inj(h: str) -> str:
        # If the element already has a data hook, no-op
        if 'data-ff-popular' in h:
            return h

        # Insert data-ff-popular="true" into the nearest tag containing the phrase.
        # This is best-effort but safe: if it misses, no break.
        pat = r'(<[^>]+)(>[^<]*Most popular[^<]*</[^>]+>)'
        def sub(m):
            open_tag = m.group(1)
            tail = m.group(2)
            if 'data-ff-popular' in open_tag:
                return m.group(0)
            return open_tag + ' data-ff-popular="true" data-ff-flex="popular-motion"' + tail

        return re.sub(pat, sub, h, count=1, flags=re.IGNORECASE | re.DOTALL)

    return ensure_once(html, marker, inj)[0]


# ----------------------------
# Optional inline CSS/JS (kept tiny)
# ----------------------------

INLINE_CSS_MARK = "data-ff-flex-inline-css"
INLINE_JS_MARK = "data-ff-flex-inline-js"

def inject_inline_css(html: str) -> str:
    css = f"""
<style {INLINE_CSS_MARK}>
/* Flex injector additions (tiny + hook-safe) */
.ff-micro{{font-size:0.875rem;line-height:1.25rem}}
.ff-muted{{opacity:.82}}
[data-ff-aov-nudge]{{transition:opacity .22s ease}}
[data-ff-aov-nudge][data-hidden="true"]{{opacity:0;pointer-events:none}}
/* One-time popular pulse class (ff-app.js toggles) */
.ff-popular-pulse{{animation:ffPopularPulse 1.35s ease-out 1}}
@keyframes ffPopularPulse{{0%{{filter:brightness(1)}} 45%{{filter:brightness(1.12)}} 100%{{filter:brightness(1)}}}}
@media (prefers-reduced-motion: reduce){{.ff-popular-pulse{{animation:none}}}}
</style>
"""
    # place before </head>
    h2, _ = insert_before_first(html, r'(</head>)', css + r'\1')
    return h2

def inject_inline_js(html: str) -> str:
    js = f"""
<script {INLINE_JS_MARK}>
(function(){{
  try {{
    // AOV nudge: hide when any quick amount chip is selected
    var nudge = document.querySelector('[data-ff-aov-nudge]');
    if(nudge){{
      var chips = document.querySelectorAll('[data-ff-quick-amount],[data-ff-amount-chip],button[data-amount],a[data-amount]');
      var hide = function(){{ nudge.setAttribute('data-hidden','true'); }};
      chips.forEach(function(c){{ c.addEventListener('click', hide, {{passive:true}}); }});
    }}

    // Most popular: pulse once when it enters viewport
    var el = document.querySelector('[data-ff-popular="true"]');
    if(el && 'IntersectionObserver' in window){{
      var once = false;
      var io = new IntersectionObserver(function(entries){{
        entries.forEach(function(e){{
          if(!once && e.isIntersecting){{
            once = true;
            el.classList.add('ff-popular-pulse');
            io.disconnect();
          }}
        }});
      }}, {{threshold:0.35}});
      io.observe(el);
    }}
  }} catch(e){{ /* no-op */ }}
}})();
</script>
"""
    # place before </body>
    h2, _ = insert_before_first(html, r'(</body>)', js + r'\1')
    return h2


# ----------------------------
# Main patch pipeline
# ----------------------------

def patch(html: str, no_inline_css: bool, no_inline_js: bool) -> Tuple[str, List[Change]]:
    changes: List[Change] = []
    out = html

    def apply(fn, key, detail):
        nonlocal out
        before = out
        out = fn(out)
        if out != before:
            changes.append(Change(key, detail))

    apply(add_hero_cta_reassurance, "hero-cta-reassure", "Add micro reassurance under primary CTA")
    apply(add_donation_panel_aov_nudge, "aov-nudge", "Add observational AOV nudge under quick amounts (hide on select)")
    apply(add_impact_identity_lines, "impact-identity", "Add identity reinforcement lines inside impact tiers")
    apply(add_most_popular_motion_hook, "popular-motion", "Add hook for one-time Most Popular pulse")
    apply(add_sponsor_intimidation_reducer, "sponsor-softener", "Add sponsor approachability line above tiers")
    apply(add_checkout_trust_line, "checkout-trust", "Add small trust line inside checkout header")
    apply(add_checkout_share_prime, "share-prime", "Prime sharing before submit")
    apply(add_footer_response_time, "footer-response", "Add footer response-time expectation")

    if not no_inline_css:
        if INLINE_CSS_MARK not in out:
            out = inject_inline_css(out)
            changes.append(Change("inline-css", "Inject tiny flex CSS helpers (micro text, fade, one-time pulse)"))

    if not no_inline_js:
        if INLINE_JS_MARK not in out:
            out = inject_inline_js(out)
            changes.append(Change("inline-js", "Inject tiny flex JS (AOV hide + one-time pulse via IO)"))

    return out, changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file", help="HTML file to patch in-place (e.g., app/templates/index.html)")
    ap.add_argument("--backup", action="store_true", help="Write a timestamped .bak copy before patching")
    ap.add_argument("--no-inline-css", action="store_true", help="Do not inject the tiny inline <style> block")
    ap.add_argument("--no-inline-js", action="store_true", help="Do not inject the tiny inline <script> block")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"✗ File not found: {path}", file=sys.stderr)
        sys.exit(2)

    if args.backup:
        bak = backup_file(path)
        print(f"✓ Backup: {bak}")

    html = path.read_text("utf-8")
    patched, changes = patch(html, no_inline_css=args.no_inline_css, no_inline_js=args.no_inline_js)

    if patched == html:
        print("ℹ️ No changes applied (already up-to-date).")
        return

    path.write_text(patched, encoding="utf-8", newline="\n")

    print("✓ Flex upgrades applied:")
    for c in changes:
        print(f"  - {c.detail}")


if __name__ == "__main__":
    main()

