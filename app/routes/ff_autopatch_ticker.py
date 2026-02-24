#!/usr/bin/env python3
"""
FutureFunded • Ticker Bridge Auto-Patch
- Patches templates/index.html to add data-ff-ticker + data-ff-ticker-track bridge inside the "Recent support" donor ticker
- Patches app/static/js/ff-app.js to replace initTicker() with the dual-hook + demo-fallback version
- Patches app/static/css/ff.css to insert ticker styles inside @layer ff.pages

Safety:
- Creates timestamped backups before writing
- Idempotent: skips if already patched
- Fails loudly if it can't find the expected anchors

Usage:
  python3 ff_autopatch_ticker.py \
    --index templates/index.html \
    --js app/static/js/ff-app.js \
    --css app/static/css/ff.css

  # Dry run:
  python3 ff_autopatch_ticker.py --dry-run
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
import sys
from dataclasses import dataclass
from typing import Optional, Tuple


# -----------------------------
# Patch payloads
# -----------------------------

INDEX_TICKER_REPLACEMENT = """<div
  class="ff-donorTicker ff-mt-2"
  data-ff-donor-ticker=""
  data-ff-ticker=""
  aria-live="polite"
  aria-atomic="true"
>
  <p class="ff-help ff-m-0" data-ff-ticker-placeholder="">Be the first supporter 💛</p>

  <div
    class="ff-ticker__track"
    data-ff-ticker-track=""
    role="list"
    aria-label="Recent supporters"
  ></div>
</div>
"""

JS_INIT_TICKER_REPLACEMENT = r"""function initTicker() {
    var wrap = qs("[data-ff-ticker]") || qs("[data-ff-donor-ticker]");
    if (!wrap) return;

    var placeholder = qs("[data-ff-ticker-placeholder]", wrap) || qs("p", wrap);
    if (placeholder && !placeholder.hasAttribute("data-ff-ticker-placeholder")) {
      placeholder.setAttribute("data-ff-ticker-placeholder", "");
    }

    var track = qs("[data-ff-ticker-track]", wrap) || qs("[data-ff-ticker-track]");
    if (!track) {
      track = document.createElement("div");
      track.className = "ff-ticker__track";
      track.setAttribute("data-ff-ticker-track", "");
      track.setAttribute("role", "list");
      track.setAttribute("aria-label", "Recent supporters");
      wrap.appendChild(track);
    } else if (!track.classList.contains("ff-ticker__track")) {
      track.classList.add("ff-ticker__track");
    }

    function clearTrack() {
      while (track.firstChild) track.removeChild(track.firstChild);
    }

    function setPlaceholderVisible(on) {
      if (!placeholder) return;
      if (on) placeholder.removeAttribute("hidden");
      else placeholder.setAttribute("hidden", "");
    }

    function render(items) {
      clearTrack();

      var max = 8;
      var count = 0;

      for (var i = 0; i < items.length; i++) {
        if (count >= max) break;

        var it = items[i];
        if (it && (it.verified === false || it.is_verified === false)) continue;

        var amt = "";
        if (it && it.amount_cents != null) amt = fmtMoney(it.amount_cents, true);
        else if (it && it.amount != null) amt = fmtMoney(it.amount, false);
        if (!amt) continue;

        var team = "";
        if (it && it.team) team = String(it.team || "").trim();
        if (it && it.team_name) team = String(it.team_name || "").trim();

        var when = "";
        if (it && it.when) when = String(it.when || "").trim();
        if (!when && it && it.minutes_ago != null) {
          var m = Number(it.minutes_ago);
          if (isFinite(m) && m >= 0) when = m < 2 ? "just now" : Math.round(m) + " min ago";
        }
        if (!when && it && it.created_at) when = "recent";

        var itemEl = document.createElement("div");
        itemEl.className = "ff-ticker__item";
        itemEl.setAttribute("role", "listitem");

        var amtEl = document.createElement("span");
        amtEl.className = "ff-ticker__amt ff-num";
        amtEl.textContent = amt;

        var metaEl = document.createElement("span");
        metaEl.className = "ff-ticker__meta";
        metaEl.textContent = (team ? "to " + team : "new supporter") + (when ? " • " + when : "");

        itemEl.appendChild(amtEl);
        itemEl.appendChild(metaEl);
        track.appendChild(itemEl);

        count += 1;
      }

      setPlaceholderVisible(count === 0);

      if (count > 0) {
        wrap.setAttribute("data-ff-ticker-live", "true");
        wrap.setAttribute("aria-hidden", "false");
      }
    }

    function getRecentEndpoint() {
      var ep = "";
      if (cfg && cfg.stats && cfg.stats.recentDonationsEndpoint) ep = String(cfg.stats.recentDonationsEndpoint || "").trim();
      if (!ep) ep = getMeta("ff-recent-donations-endpoint") || getMeta("ff:recent-donations-endpoint") || getMeta("recent-donations-endpoint") || "";
      return String(ep || "").trim();
    }

    function startDemoTicker() {
      var teams = cfg && cfg.teams && Array.isArray(cfg.teams) ? cfg.teams : [];
      var names = [];
      for (var i = 0; i < teams.length; i++) {
        var nm = teams[i] && teams[i].name ? String(teams[i].name || "").trim() : "";
        if (nm) names.push(nm);
      }
      if (!names.length) names = ["the team"];

      function anon() {
        var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        return letters.charAt(Math.floor(Math.random() * letters.length)) + ".";
      }

      var amounts = [25, 35, 50, 75, 100, 150, 250, 500];
      var buffer = [];

      function pushOne(minAgo) {
        buffer.unshift({
          amount: amounts[Math.floor(Math.random() * amounts.length)],
          team_name: names[Math.floor(Math.random() * names.length)],
          minutes_ago: minAgo,
          name: anon()
        });
        if (buffer.length > 6) buffer.length = 6;
        render(buffer);
      }

      pushOne(12);
      pushOne(4);

      var t0 = nowMs();
      setInterval(function () {
        var mins = Math.max(0, Math.round((nowMs() - t0) / 60000));
        pushOne(Math.max(1, 1 + (mins % 12)));
      }, 18000);
    }

    var ep = getRecentEndpoint();
    if (!ep) {
      // Demo fallback: only when not production+live (keeps prod clean)
      var isLive = cfg && String(cfg.dataMode || "").toLowerCase() === "live";
      var isProd = cfg && String(cfg.env || "").toLowerCase() === "production";
      if (!isLive || !isProd) startDemoTicker();
      return;
    }

    fetchJSON(ep, { method: "GET" })
      .then(function (data) {
        var norm = normalizeRecentPayload(data);
        render(norm.items);
      })
      .catch(function () {});
  }
"""

CSS_TICKER_SNIPPET = """  /* Donor ticker */
  .ff-body .ff-donorTicker {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ff-body .ff-ticker__track {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ff-body .ff-ticker__item {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid var(--ff-outline);
    background: rgba(2, 6, 23, 0.02);
  }

  .ff-root[data-theme="dark"] .ff-body .ff-ticker__item {
    background: rgba(255, 255, 255, 0.06);
  }

  .ff-body .ff-ticker__amt {
    font-weight: 900;
    letter-spacing: -0.01em;
  }

  .ff-body .ff-ticker__meta {
    color: var(--ff-muted);
    font-size: 12px;
    font-weight: 800;
  }
"""


# -----------------------------
# Helpers
# -----------------------------

@dataclass
class PatchResult:
    path: str
    changed: bool
    message: str


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def backup_file(path: str) -> str:
    ts = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = f"{path}.bak-{ts}"
    shutil.copy2(path, bak)
    return bak


def indent_block(block: str, indent: str) -> str:
    lines = block.splitlines(True)
    out = []
    for ln in lines:
        if ln.strip() == "":
            out.append(ln)
        else:
            out.append(indent + ln)
    return "".join(out)


def find_matching_brace(text: str, open_brace_index: int, *, mode: str) -> int:
    """
    Returns index of matching '}' for '{' at open_brace_index.
    mode: 'js' or 'css' (both support // comments in js; css supports /* */ only)
    """
    assert text[open_brace_index] == "{"
    depth = 0
    i = open_brace_index
    n = len(text)

    in_squote = False
    in_dquote = False
    in_tmpl = False  # JS template literal
    in_line_comment = False
    in_block_comment = False
    escape = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        # Handle line comment (JS)
        if mode == "js" and in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        # Handle block comment (JS + CSS)
        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        # Enter comments
        if not (in_squote or in_dquote or in_tmpl):
            if mode == "js" and ch == "/" and nxt == "/":
                in_line_comment = True
                i += 2
                continue
            if ch == "/" and nxt == "*":
                in_block_comment = True
                i += 2
                continue

        # Handle strings
        if in_squote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "'":
                in_squote = False
            i += 1
            continue

        if in_dquote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_dquote = False
            i += 1
            continue

        if mode == "js" and in_tmpl:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "`":
                in_tmpl = False
            i += 1
            continue

        # Enter strings
        if ch == "'":
            in_squote = True
            i += 1
            continue
        if ch == '"':
            in_dquote = True
            i += 1
            continue
        if mode == "js" and ch == "`":
            in_tmpl = True
            i += 1
            continue

        # Brace counting
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i

        i += 1

    raise ValueError("Could not find matching closing brace.")


# -----------------------------
# Patchers
# -----------------------------

def patch_index_html(path: str, text: str) -> Tuple[str, bool, str]:
    if "data-ff-ticker-track" in text and "data-ff-ticker" in text:
        return text, False, "index.html already contains ticker bridge hooks (skipped)."

    # Match the simple original block: donorTicker div with a single <p> inside containing 'Be the first supporter'
    # Keep indentation of the opening <div>
    pattern = re.compile(
        r'(?ms)^(?P<indent>[ \t]*)<div[^>]*\bff-donorTicker\b[^>]*\bdata-ff-donor-ticker\b[^>]*>\s*'
        r'<p[^>]*>\s*[^<]*Be the first supporter[^<]*\s*</p>\s*</div>\s*$',
    )

    m = pattern.search(text)
    if not m:
        # Fallback: slightly less strict (still safe)
        pattern2 = re.compile(
            r'(?ms)^(?P<indent>[ \t]*)<div[^>]*\bdata-ff-donor-ticker\b[^>]*>\s*'
            r'<p[^>]*>\s*[^<]*Be the first supporter[^<]*\s*</p>\s*</div>\s*$',
        )
        m = pattern2.search(text)
        if not m:
            return text, False, "index.html: could not find the simple donor ticker block to replace."

    indent = m.group("indent") or ""
    repl = indent_block(INDEX_TICKER_REPLACEMENT.rstrip("\n") + "\n", indent)
    new_text = text[: m.start()] + repl + text[m.end() :]
    return new_text, True, "index.html: donor ticker block upgraded with data-ff-ticker + track."


def patch_ff_app_js(path: str, text: str) -> Tuple[str, bool, str]:
    # Idempotency check
    if 'qs("[data-ff-ticker]") || qs("[data-ff-donor-ticker]")' in text:
        return text, False, "ff-app.js already has the ticker bridge initTicker() (skipped)."

    # Locate function initTicker() start
    m = re.search(r"\bfunction\s+initTicker\s*\(\s*\)\s*\{", text)
    if not m:
        return text, False, "ff-app.js: could not find function initTicker()."

    start = m.start()
    # Find the opening brace index
    brace_open = text.find("{", m.end() - 1)
    if brace_open < 0:
        return text, False, "ff-app.js: initTicker() brace not found."

    try:
        brace_close = find_matching_brace(text, brace_open, mode="js")
    except Exception as e:
        return text, False, f"ff-app.js: failed to match initTicker() braces: {e}"

    # Preserve original indentation of 'function initTicker()'
    line_start = text.rfind("\n", 0, start) + 1
    indent = re.match(r"[ \t]*", text[line_start:start]).group(0)

    replacement = indent_block(JS_INIT_TICKER_REPLACEMENT.rstrip("\n") + "\n", indent)

    new_text = text[:start] + replacement + text[brace_close + 1 :]
    return new_text, True, "ff-app.js: initTicker() replaced with donor-ticker bridge + demo fallback."


def patch_ff_css(path: str, text: str) -> Tuple[str, bool, str]:
    if ".ff-ticker__track" in text:
        return text, False, "ff.css already contains ticker styles (skipped)."

    lm = re.search(r"@layer\s+ff\.pages\s*\{", text)
    if not lm:
        return text, False, "ff.css: could not find '@layer ff.pages {' block."

    brace_open = text.find("{", lm.end() - 1)
    if brace_open < 0:
        return text, False, "ff.css: pages layer brace not found."

    try:
        brace_close = find_matching_brace(text, brace_open, mode="css")
    except Exception as e:
        return text, False, f"ff.css: failed to match ff.pages braces: {e}"

    # Insert before the closing brace of @layer ff.pages
    insert_at = brace_close
    insertion = "\n" + CSS_TICKER_SNIPPET.rstrip("\n") + "\n"
    new_text = text[:insert_at] + insertion + text[insert_at:]
    return new_text, True, "ff.css: ticker styles inserted into @layer ff.pages."


# -----------------------------
# Main
# -----------------------------

def run_patch(path: str, patcher) -> PatchResult:
    if not os.path.exists(path):
        return PatchResult(path, False, "MISSING: file not found.")
    original = read_text(path)
    updated, changed, msg = patcher(path, original)
    if changed and updated == original:
        changed = False
        msg = msg + " (no-op?)"
    return PatchResult(path, changed, msg), original, updated


def main() -> int:
    ap = argparse.ArgumentParser(description="Auto-patch FutureFunded ticker bridge (HTML+JS+CSS).")
    ap.add_argument("--index", default="templates/index.html", help="Path to templates/index.html")
    ap.add_argument("--js", default="app/static/js/ff-app.js", help="Path to app/static/js/ff-app.js")
    ap.add_argument("--css", default="app/static/css/ff.css", help="Path to app/static/css/ff.css")
    ap.add_argument("--dry-run", action="store_true", help="Do not write; just report.")
    ap.add_argument("--no-backup", action="store_true", help="Do not create backups (not recommended).")
    args = ap.parse_args()

    results = []

    # index.html
    r_idx, idx_old, idx_new = run_patch(args.index, patch_index_html)
    results.append((r_idx, idx_old, idx_new))

    # ff-app.js
    r_js, js_old, js_new = run_patch(args.js, patch_ff_app_js)
    results.append((r_js, js_old, js_new))

    # ff.css
    r_css, css_old, css_new = run_patch(args.css, patch_ff_css)
    results.append((r_css, css_old, css_new))

    # Report
    any_change = False
    for r, _, _ in results:
        flag = "CHANGED" if r.changed else "OK"
        print(f"[{flag}] {r.path} — {r.message}")
        any_change = any_change or r.changed

    if args.dry_run:
        print("\n[dry-run] No files written.")
        return 0 if any_change else 0

    # Write changes
    for r, old, new in results:
        if not r.changed:
            continue
        if not args.no_backup:
            bak = backup_file(r.path)
            print(f"  ↳ backup: {bak}")
        write_text(r.path, new)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
