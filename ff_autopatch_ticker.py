#!/usr/bin/env python3
"""
FutureFunded • Ticker Bridge Auto-Patch (v3)
- index.html: bridges data-ff-donor-ticker -> data-ff-ticker + inserts data-ff-ticker-track
- ff-app.js: replaces initTicker() with dual-hook bridge (supports donor ticker OR ticker)
- ff.css: injects ticker styling into @layer ff.pages

Improvements vs v2:
- Path-smart: if you pass templates/index.html, it will also try app/templates/index.html
- No hard abort: patches what exists, warns on missing, exits nonzero if any missing
- Minimal HTML edit: does not rewrite the whole donor ticker block

Usage:
  python3 ff_autopatch_ticker.py \
    --index app/templates/index.html \
    --js app/static/js/ff-app.js \
    --css app/static/css/ff.css
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
from dataclasses import dataclass
from typing import Callable, Tuple


# -----------------------------
# Patch payloads
# -----------------------------

TRACK_MARKUP = """<div
  class="ff-ticker__track"
  data-ff-ticker-track=""
  role="list"
  aria-label="Recent supporters"
></div>
"""

JS_INIT_TICKER_REPLACEMENT = r"""function initTicker() {
    // Bridge: support either the original JS hooks OR your current markup
    var wrap = qs("[data-ff-ticker]") || qs("[data-ff-donor-ticker]");
    if (!wrap) return;

    // Placeholder: if present, we hide it when items render
    var placeholder = qs("[data-ff-ticker-placeholder]", wrap) || qs("p", wrap);
    if (placeholder && !placeholder.hasAttribute("data-ff-ticker-placeholder")) {
      placeholder.setAttribute("data-ff-ticker-placeholder", "");
    }

    // Track: prefer in-wrap; fall back to any global; else create inside wrap
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
      // Only for non-prod / non-live. Keeps production clean.
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

CSS_TICKER_SNIPPET = """  /* Donor ticker (JS bridge: data-ff-donor-ticker -> data-ff-ticker) */
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
# Models
# -----------------------------

@dataclass
class PatchResult:
    requested_path: str
    resolved_path: str
    changed: bool
    message: str


# -----------------------------
# File I/O
# -----------------------------

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


# -----------------------------
# Path resolving (run from anywhere)
# -----------------------------

def _candidate_paths(requested: str) -> list[str]:
    req = requested.strip().lstrip("./")
    cands = [req]

    # Common repo layout: index at app/templates/index.html
    if req.startswith("templates/") and not req.startswith("app/"):
        cands.append("app/" + req)

    if not req.startswith("app/"):
        cands.append("app/" + req)

    # If user passes app/templates, also try without app/
    if req.startswith("app/"):
        cands.append(req[len("app/"):])

    # De-dupe while preserving order
    out = []
    seen = set()
    for p in cands:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def resolve_path(requested: str, max_up: int = 10) -> str:
    """
    Tries:
    - requested as-is (and with app/ heuristics)
    - walking upward from cwd, joining each candidate to parent dirs
    """
    for cand in _candidate_paths(requested):
        if os.path.exists(cand):
            return os.path.abspath(cand)

    cwd = os.getcwd()
    cur = cwd
    for _ in range(max_up):
        for cand in _candidate_paths(requested):
            candidate = os.path.join(cur, cand)
            if os.path.exists(candidate):
                return os.path.abspath(candidate)
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent

    return os.path.abspath(os.path.join(cwd, requested))


# -----------------------------
# Parsing helpers
# -----------------------------

def find_matching_brace(text: str, open_brace_index: int, *, mode: str) -> int:
    assert text[open_brace_index] == "{"
    depth = 0
    i = open_brace_index
    n = len(text)

    in_squote = False
    in_dquote = False
    in_tmpl = False
    in_line_comment = False
    in_block_comment = False
    escape = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if mode == "js" and in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if not (in_squote or in_dquote or in_tmpl):
            if mode == "js" and ch == "/" and nxt == "/":
                in_line_comment = True
                i += 2
                continue
            if ch == "/" and nxt == "*":
                in_block_comment = True
                i += 2
                continue

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

def patch_index_html(_: str, text: str) -> Tuple[str, bool, str]:
    if "data-ff-ticker-track" in text and "data-ff-ticker" in text:
        return text, False, "index: ticker bridge already present (skipped)."

    # Find donor ticker div block (best-effort)
    block_re = re.compile(
        r'(?is)(<div\b[^>]*\bdata-ff-donor-ticker\b[^>]*>)(.*?)(</div>)'
    )

    m = block_re.search(text)
    if not m:
        return text, False, "index: could not find a data-ff-donor-ticker block."

    open_tag, inner, close_tag = m.group(1), m.group(2), m.group(3)

    changed = False

    # Add data-ff-ticker="" to the opening div if missing
    if "data-ff-ticker" not in open_tag:
        # Insert right after data-ff-donor-ticker="" if possible
        open_tag2 = re.sub(
            r'(\bdata-ff-donor-ticker\b\s*=\s*""\s*)',
            r'\1 data-ff-ticker="" ',
            open_tag,
            count=1,
            flags=re.I
        )
        if open_tag2 == open_tag:
            # fallback: before closing >
            open_tag2 = open_tag[:-1] + ' data-ff-ticker=""' + open_tag[-1]
        open_tag = open_tag2
        changed = True

    # Insert track if missing
    if "data-ff-ticker-track" not in inner:
        # Place after placeholder paragraph end if present, else prepend
        if re.search(r'</p\s*>', inner, flags=re.I):
            inner2 = re.sub(r'(</p\s*>)', r'\1\n\n' + TRACK_MARKUP, inner, count=1, flags=re.I)
        else:
            inner2 = TRACK_MARKUP + "\n" + inner
        inner = inner2
        changed = True

    if not changed:
        return text, False, "index: no changes needed."
    new_text = text[:m.start()] + open_tag + inner + close_tag + text[m.end():]
    return new_text, True, "index: added data-ff-ticker + inserted data-ff-ticker-track."


def patch_ff_app_js(_: str, text: str) -> Tuple[str, bool, str]:
    if 'qs("[data-ff-ticker]") || qs("[data-ff-donor-ticker]")' in text:
        return text, False, "js: ticker bridge initTicker() already present (skipped)."

    m = re.search(r"\bfunction\s+initTicker\s*\(\s*\)\s*\{", text)
    if not m:
        return text, False, "js: could not find function initTicker()."

    start = m.start()
    brace_open = text.find("{", m.end() - 1)
    if brace_open < 0:
        return text, False, "js: initTicker() brace not found."

    try:
        brace_close = find_matching_brace(text, brace_open, mode="js")
    except Exception as e:
        return text, False, f"js: failed to match initTicker() braces: {e}"

    # Preserve indentation of the original function
    line_start = text.rfind("\n", 0, start) + 1
    indent = re.match(r"[ \t]*", text[line_start:start]).group(0)

    def indent_block(block: str, ind: str) -> str:
        lines = block.splitlines(True)
        out = []
        for ln in lines:
            out.append(ind + ln if ln.strip() else ln)
        return "".join(out)

    replacement = indent_block(JS_INIT_TICKER_REPLACEMENT.rstrip("\n") + "\n", indent)
    new_text = text[:start] + replacement + text[brace_close + 1 :]
    return new_text, True, "js: initTicker() replaced with donor-ticker bridge + optional demo fallback."


def patch_ff_css(_: str, text: str) -> Tuple[str, bool, str]:
    if ".ff-ticker__track" in text or ".ff-ticker__item" in text:
        return text, False, "css: ticker styles already present (skipped)."

    lm = re.search(r"@layer\s+ff\.pages\s*\{", text)
    if not lm:
        return text, False, "css: could not find '@layer ff.pages {' block."

    brace_open = text.find("{", lm.end() - 1)
    if brace_open < 0:
        return text, False, "css: ff.pages layer brace not found."

    try:
        brace_close = find_matching_brace(text, brace_open, mode="css")
    except Exception as e:
        return text, False, f"css: failed to match ff.pages braces: {e}"

    insertion = "\n" + CSS_TICKER_SNIPPET.rstrip("\n") + "\n"
    new_text = text[:brace_close] + insertion + text[brace_close:]
    return new_text, True, "css: ticker styles inserted into @layer ff.pages."


# -----------------------------
# Engine
# -----------------------------

Patcher = Callable[[str, str], Tuple[str, bool, str]]


def run_patch(requested_path: str, patcher: Patcher) -> Tuple[PatchResult, str, str]:
    resolved = resolve_path(requested_path)
    if not os.path.exists(resolved):
        pr = PatchResult(
            requested_path=requested_path,
            resolved_path=resolved,
            changed=False,
            message="MISSING: file not found (try app/ prefix or run from repo root).",
        )
        return pr, "", ""

    original = read_text(resolved)
    updated, changed, msg = patcher(resolved, original)

    pr = PatchResult(
        requested_path=requested_path,
        resolved_path=resolved,
        changed=changed,
        message=msg,
    )
    return pr, original, updated


def main() -> int:
    ap = argparse.ArgumentParser(description="Auto-patch FutureFunded ticker bridge (HTML+JS+CSS).")
    ap.add_argument("--index", default="templates/index.html", help="Path to index.html (tries app/ prefix too)")
    ap.add_argument("--js", default="app/static/js/ff-app.js", help="Path to ff-app.js")
    ap.add_argument("--css", default="app/static/css/ff.css", help="Path to ff.css")
    ap.add_argument("--dry-run", action="store_true", help="Do not write; just report.")
    ap.add_argument("--no-backup", action="store_true", help="Do not create backups.")
    args = ap.parse_args()

    results = []
    for label, path, patcher in (
        ("index", args.index, patch_index_html),
        ("js", args.js, patch_ff_app_js),
        ("css", args.css, patch_ff_css),
    ):
        pr, old, new = run_patch(path, patcher)
        results.append((label, pr, old, new))

    any_missing = any(pr.message.startswith("MISSING") for _, pr, _, _ in results)
    any_change = any(pr.changed for _, pr, _, _ in results)

    for label, pr, _, _ in results:
        flag = "CHANGED" if pr.changed else ("MISSING" if pr.message.startswith("MISSING") else "OK")
        print(f"[{flag}] {label}: {pr.requested_path}")
        print(f"       ↳ resolved: {pr.resolved_path}")
        print(f"       ↳ {pr.message}")

    if args.dry_run:
        print("\n[dry-run] No files written.")
        return 2 if any_missing else 0

    # Write whatever changed, even if some targets are missing
    for _, pr, old, new in results:
        if not pr.changed:
            continue
        if not args.no_backup:
            bak = backup_file(pr.resolved_path)
            print(f"  ↳ backup: {bak}")
        write_text(pr.resolved_path, new)

    if any_missing:
        print("\nDone (PARTIAL): one or more files were missing. Fix paths and re-run if needed.")
        return 2

    print("\nDone.")
    return 0 if any_change else 0


if __name__ == "__main__":
    raise SystemExit(main())
