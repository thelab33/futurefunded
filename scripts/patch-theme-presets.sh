#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

TIMESTAMP=$(date +%Y%m%d%H%M%S)
BRANCH="feat/theme-presets"

# checkout or create branch safely
if git rev-parse --verify "${BRANCH}" >/dev/null 2>&1; then
  echo "→ branch ${BRANCH} exists — checking out"
  git checkout "${BRANCH}"
else
  echo "→ creating branch ${BRANCH}"
  git checkout -b "${BRANCH}"
fi

JS_PATH="app/static/js/ff-theme.js"
CSS_PATH="app/static/css/ff-themes.css"
TEMPLATE_PATH="app/templates/index.html"
BP_DIR="app/blueprints"
BP_PATH="${BP_DIR}/team_api.py"
CTX_PATH="app/context_processors.py"

backup() {
  local f="$1"
  if [ -f "$f" ]; then
    cp -v "$f" "${f}.bak-${TIMESTAMP}"
  fi
}

mkdir -p "$(dirname "${JS_PATH}")"
mkdir -p "$(dirname "${CSS_PATH}")"
mkdir -p "${BP_DIR}"

echo "→ backing up files (if present)"
backup "${JS_PATH}"
backup "${CSS_PATH}"
backup "${TEMPLATE_PATH}"
backup "${BP_PATH}"
backup "${CTX_PATH}"

# write ff-theme.js
cat > "${JS_PATH}" <<'JS'
/* app/static/js/ff-theme.js
   Minimal, guard-checked, production-ish theme preset manager
*/
(function (window, document) {
  "use strict";

  const LS_THEME = "ff:theme";
  const LS_BRAND = "ff:brand";
  const root = document.documentElement;

  function setTheme(theme, brand = null, opts = { persist: true, saveServer: true, teamId: null }) {
    if (!theme) return;
    root.dataset.ffTheme = theme;
    if (brand) root.dataset.ffBrand = brand;
    if (opts.persist) {
      try { localStorage.setItem(LS_THEME, theme); } catch (e) {}
      if (brand) try { localStorage.setItem(LS_BRAND, brand); } catch (e) {}
    }
    if (opts.saveServer && opts.teamId) {
      saveThemeToServer(opts.teamId, theme, brand).catch(e => {
        console.warn("ff-theme: server save failed", e);
      });
    }
    document.dispatchEvent(new CustomEvent("ff:theme.changed", { detail: { theme, brand } }));
  }

  async function saveThemeToServer(teamId, theme, brand=null) {
    if (!teamId) throw new Error("teamId required to persist backend theme");
    const url = `/api/team/${teamId}/theme`;
    const body = { theme, brand };
    const headers = {
      "Content-Type": "application/json",
      "X-CSRFToken": (document.querySelector('meta[name="csrf-token"]') || {}).content || ""
    };
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), credentials: "same-origin" });
    if (!res.ok) throw new Error(`saveTheme failed (${res.status})`);
    return res.json();
  }

  (function hydrate() {
    try {
      const t = localStorage.getItem(LS_THEME);
      const b = localStorage.getItem(LS_BRAND);
      if (t) root.dataset.ffTheme = t;
      if (b) root.dataset.ffBrand = b;
    } catch (e) { /* ignore storage errors */ }
  })();

  function previewTheme(theme, duration = 2500) {
    const prev = root.dataset.ffTheme;
    root.dataset.ffTheme = theme;
    setTimeout(() => {
      root.dataset.ffTheme = prev || "";
    }, duration);
  }

  window.FFTheme = {
    setTheme,
    previewTheme,
    saveThemeToServer,
  };

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-ff-theme-btn]");
    if (!el) return;
    const theme = el.getAttribute("data-ff-theme-btn");
    const brand = el.getAttribute("data-ff-brand") || null;
    const teamId = el.getAttribute("data-ff-team-id") || null;
    setTheme(theme, brand, { persist: true, saveServer: Boolean(teamId), teamId });
  });

})(window, document);
JS

chmod 644 "${JS_PATH}"
echo "→ wrote ${JS_PATH}"

# write ff-themes.css
cat > "${CSS_PATH}" <<'CSS'
/* app/static/css/ff-themes.css
   Theme presets for FutureFunded. Override tokens here.
*/

/* core = default/base */
:root[data-ff-theme="core"] {
  --ff-bg:  #ffffff;
  --ff-surface: #ffffff;
  --ff-foreground: #0b1220;
  --ff-accent: #06b6d4;
  --ff-accent-2: #0ea5a4;
  --ff-glass: rgba(255,255,255,0.55);
  --ff-muted: #6b7280;
  --ff-success: #16a34a;
  --ff-danger: #ef4444;
  --ff-card-shadow: 0 6px 18px rgba(11,18,32,0.08);
}

/* signal-glass */
:root[data-ff-theme="signal-glass"] {
  --ff-bg: linear-gradient(180deg,#f6fbff 0%, #ffffff 100%);
  --ff-surface: rgba(255,255,255,0.72);
  --ff-foreground: #051025;
  --ff-accent: #0ea5ff;
  --ff-accent-2: #6366f1;
  --ff-glass: rgba(14,165,255,0.08);
  --ff-muted: #475569;
  --ff-card-shadow: 0 14px 40px rgba(8,18,40,0.06);
}

/* school-spirit */
:root[data-ff-theme="school-spirit"] {
  --ff-bg: #fffaf0;
  --ff-surface: #fff7ed;
  --ff-foreground: #1f1147;
  --ff-accent: #f59e0b;
  --ff-accent-2: #7c3aed;
  --ff-glass: rgba(124,58,237,0.06);
  --ff-muted: #6b5b7b;
  --ff-card-shadow: 0 10px 34px rgba(31,17,71,0.06);
}

/* small utilities */
:root[data-ff-theme] .ff-btn--primary {
  background: linear-gradient(90deg, var(--ff-accent), var(--ff-accent-2));
  color: white;
  box-shadow: var(--ff-card-shadow);
}
:root[data-ff-theme] .ff-glass {
  background: var(--ff-surface);
  backdrop-filter: blur(8px) saturate(120%);
  border: 1px solid rgba(255,255,255,0.06);
}
CSS

chmod 644 "${CSS_PATH}"
echo "→ wrote ${CSS_PATH}"

# patch index.html using safe Python snippet
if [ -f "${TEMPLATE_PATH}" ]; then
  echo "→ patching ${TEMPLATE_PATH} (will write a backup)"
  python3 - <<'PY'
from pathlib import Path
import re, time
p = Path("app/templates/index.html")
s = p.read_text(encoding="utf-8")
m = re.search(r'(<html\b[^>]*>)', s, flags=re.IGNORECASE | re.DOTALL)
if not m:
    print("! could not find <html> tag. aborting.")
    raise SystemExit(1)
html_tag = m.group(1)

theme_attr = " data-ff-theme=\"{{ ff_theme|default(_org_theme|default('core'))|e }}\""
brand_attr = " data-ff-brand=\"{{ ff_brand|default(_org_brand|default(''))|e }}\""

new_tag = html_tag
if 'data-ff-theme' not in html_tag:
    new_tag = new_tag[:-1] + theme_attr + '>'
if 'data-ff-brand' not in new_tag and 'data-ff-brand' not in html_tag:
    new_tag = new_tag[:-1] + brand_attr + '>'

if new_tag == html_tag:
    print("→ html tag already contains required attributes; nothing to do.")
    raise SystemExit(0)

bak_path = p.parent / (p.name + ".bak-" + time.strftime("%Y%m%d%H%M%S"))
bak_path.write_text(html_tag + "\n", encoding="utf-8")
p.write_text(s.replace(html_tag, new_tag, 1), encoding="utf-8")
print(f"→ patched {p} (backup: {bak_path})")
PY
else
  echo "→ ${TEMPLATE_PATH} not found; skipping HTML patch."
fi

# add blueprint if missing
if [ ! -f "${BP_PATH}" ]; then
  cat > "${BP_PATH}" <<'PYBP'
# app/blueprints/team_api.py
from flask import Blueprint, request, jsonify, current_app, abort
from flask_login import login_required, current_user
from app.extensions import db
from app.models import Team

bp = Blueprint("team_api", __name__, url_prefix="/api")

@bp.route("/team/<int:team_id>/theme", methods=["POST"])
@login_required
def set_team_theme(team_id):
    team = Team.query.get_or_404(team_id)
    if not hasattr(current_user, "can_manage_team") or not current_user.can_manage_team(team):
        abort(403)
    data = request.get_json(force=True)
    theme = data.get("theme")
    brand = data.get("brand")
    allowed = current_app.config.get("FF_ALLOWED_THEMES", ["core", "signal-glass", "school-spirit"])
    if theme not in allowed:
        return jsonify({"ok": False, "error": "invalid_theme"}), 400
    team.theme = theme
    team.brand = brand
    db.session.add(team)
    db.session.commit()
    return jsonify({"ok": True, "theme": team.theme, "brand": team.brand})
PYBP
  chmod 644 "${BP_PATH}"
  echo "→ wrote ${BP_PATH}"
else
  echo "→ blueprint already exists; skipped"
fi

# add context processor if missing
if [ ! -f "${CTX_PATH}" ]; then
  cat > "${CTX_PATH}" <<'CTX'
# app/context_processors.py
from flask import g, current_app, session

def inject_theme():
    theme = getattr(g, "theme", None) or session.get("ff_theme") or current_app.config.get("FF_DEFAULT_THEME", "core")
    brand = getattr(g, "brand", None) or session.get("ff_brand") or ""
    return dict(ff_theme=theme, ff_brand=brand)
CTX
  chmod 644 "${CTX_PATH}"
  echo "→ wrote ${CTX_PATH}"
else
  echo "→ context_processors exists; skipped"
fi

git add -A
git commit -m "feat(theme): add ff-theme.js + ff-themes.css, patch html tag, add team_api blueprint & context processor" || {
  echo "→ commit failed or nothing to commit."
}

echo
echo "DONE. Next steps:"
echo "  1) Register blueprint/context processor in create_app() if not auto-registered."
echo "  2) Add assets to base template (after ff.css):"
echo "       <link rel='stylesheet' href=\"{{ url_for('static', filename='css/ff-themes.css') }}\">"
echo "       <script src=\"{{ url_for('static', filename='js/ff-theme.js') }}\" defer></script>"
echo "  3) Add DB columns (Team.theme, Team.brand) and run alembic migration."
echo "  4) Run your QA: lint, playwright, smoke tests."
echo
echo "To rollback the HTML change, restore the backup file matching app/templates/index.html.bak-*"
