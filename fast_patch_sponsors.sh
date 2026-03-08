#!/usr/bin/env bash
# ⚡ Fast patch — surgically replace the SPONSORS section in app/templates/index.html
# Creates a timestamped backup (no editor drama). Run from repo root.
set -euo pipefail

FILE="app/templates/index.html"
TS="$(date +%Y%m%d_%H%M%S)"
BAK="${FILE}.bak.sponsors.${TS}"
TMP="/tmp/ff_new_sponsors_${TS}.html"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run this from your repo root." >&2
  exit 2
fi

cp -- "$FILE" "$BAK"
echo "Backup created: $BAK"

cat > "$TMP" <<'HTML'
<!-- ===================== SPONSORS ===================== -->
<section id="sponsors"
         class="ff-section ff-sponsors"
         data-ff-section="sponsors"
         aria-labelledby="sponsorsTitle"
         aria-describedby="sponsorsLead sponsorsHint">
  <div class="ff-container">
    <header class="ff-sectionhead ff-sectionhead--flagship ff-sectionhead--compact">
      <div class="ff-sectionhead__text ff-minw-0">
        <p class="ff-kicker ff-m-0">Sponsors</p>
        <h2 class="ff-h2" id="sponsorsTitle">Sponsors and recognition.</h2>
        <p class="ff-lead ff-m-0" id="sponsorsLead">Support the season and be recognized with care.</p>
        <p class="ff-help ff-muted ff-mt-2 ff-mb-0" id="sponsorsHint">
          Name or logo options • Receipt and confirmation • Placement after review
        </p>
      </div>

      <div class="ff-sectionhead__actions">
        <a class="ff-btn ff-btn--outline" href="#sponsor-form" role="button">Become a sponsor</a>
      </div>
    </header>

    <!-- Sponsor wall: server-driven, graceful empty-state -->
    <div class="ff-sponsorWall ff-mt-4" aria-live="polite" aria-atomic="true">
      <div class="ff-grid ff-grid--cols-4 ff-gap-3">
        {% for sponsor in (sponsors | default([])) %}
          <article class="ff-card ff-card--sm" data-sponsor-id="{{ sponsor.id }}">
            <div class="ff-card__body ff-flex ff-items-center ff-justify-center">
              <img alt="{{ sponsor.name }} logo"
                   src="{{ sponsor.logo_url }}"
                   width="240" height="120"
                   loading="lazy"
                   decoding="async"
                   class="ff-img--contain" />
            </div>
            <div class="ff-card__footer ff-p-2 ff-text-sm ff-text-center">
              <strong class="ff-muted">{{ sponsor.name }}</strong>
            </div>
          </article>
        {% else %}
          <div class="ff-card ff-card--muted ff-p-6 ff-text-center" role="status">
            No sponsors yet — become the first to support the team.
          </div>
        {% endfor %}
      </div>
    </div>

    <!-- Sponsorship tiers -->
    <div class="ff-sponsorTiers ff-mt-6" aria-label="Sponsorship tiers">
      <div class="ff-grid ff-grid--cols-4 ff-gap-4">
        <div class="ff-tier-card" role="group" aria-label="Community tier">
          <h3 class="ff-tier-title">Community</h3>
          <p class="ff-tier-price">$100+</p>
          <p class="ff-tier-desc">Logo listing • Social shoutout</p>
          <button class="ff-btn" data-ff-choose-tier="community">Choose Community</button>
        </div>

        <div class="ff-tier-card ff-tier-card--recommended" role="group" aria-label="Partner tier">
          <span class="ff-badge ff-badge--small">Recommended</span>
          <h3 class="ff-tier-title">Partner</h3>
          <p class="ff-tier-price">$250</p>
          <p class="ff-tier-desc">Logo on sponsor wall • Mention in updates</p>
          <button class="ff-btn ff-btn--primary" data-ff-choose-tier="partner">Choose Partner</button>
        </div>

        <div class="ff-tier-card" role="group" aria-label="Champion tier">
          <h3 class="ff-tier-title">Champion</h3>
          <p class="ff-tier-price">$500</p>
          <p class="ff-tier-desc">Prime placement • Event shoutout</p>
          <button class="ff-btn" data-ff-choose-tier="champion">Choose Champion</button>
        </div>

        <div class="ff-tier-card ff-tier-card--vip" role="group" aria-label="VIP tier">
          <h3 class="ff-tier-title">VIP</h3>
          <p class="ff-tier-price">$1,000</p>
          <p class="ff-tier-desc">Top recognition • Custom benefits</p>
          <button class="ff-btn ff-btn--accent" data-ff-choose-tier="vip">Choose VIP</button>
        </div>
      </div>
    </div>

    <div class="ff-sponsorSpotlight ff-mt-6" aria-live="polite">
      <div class="ff-grid ff-grid--cols-2 ff-gap-4 ff-items-start">
        <div class="ff-spotlight-card ff-p-4">
          <h4 class="ff-h5 ff-mb-2">VIP Spotlight</h4>
          <p class="ff-muted ff-mb-4">Featured sponsors get a rotating spotlight on the fundraising page and during events.</p>
          <div class="ff-spotlight-controls">
            <button class="ff-btn" data-ff-spotlight-refresh>Refresh spotlight</button>
            <a class="ff-link ff-ml-3" href="#sponsor-form">Become a sponsor</a>
          </div>
        </div>

        <div class="ff-cta ff-p-4 ff-bg-glass ff-rounded">
          <p class="ff-m-0 ff-text-sm">Questions about sponsorships? Contact <a href="mailto:{{ _organizer_email }}">{{ _organizer_email }}</a></p>
        </div>
      </div>
    </div>

    <footer class="ff-sponsorFooter ff-mt-6 ff-text-muted">
      <p class="ff-m-0">Logos and placements may be reviewed before publishing. Sponsors will receive receipts and recognition as described.</p>
    </footer>
  </div>
</section>
<!-- /SPONSORS -->
HTML

# Use python for safer in-shell replacement
python3 - <<'PY'
import re, sys, pathlib

file = pathlib.Path("app/templates/index.html")
if not file.exists():
    print("ERROR: app/templates/index.html not found", file=sys.stderr)
    sys.exit(2)

txt = file.read_text(encoding="utf-8", errors="replace")

pattern = re.compile(r"<!--\s*={3,}\s*SPONSORS\s*={3,}\s*-->.*?</section>", re.DOTALL|re.IGNORECASE)
new = pathlib.Path("/tmp/ff_new_sponsors_%s.html" % ("""__TS__""")).read_text(encoding="utf-8", errors="replace")

new_txt, n = pattern.subn(new, txt, count=1)
if n == 0:
    print("No sponsors block matched — aborting (no changes applied).", file=sys.stderr)
    sys.exit(3)

file.write_text(new_txt, encoding="utf-8")
print("Patched sponsors block in: %s" % file)
PY

echo "Backup: $BAK"
echo "Done. To inspect changes, run:"
echo "  git --no-pager diff --no-color -- app/templates/index.html | sed -n '1,160p' || rg -n --context 3 \"<!-- ===================== SPONSORS\" app/templates/index.html"
