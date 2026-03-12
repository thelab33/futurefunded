from __future__ import annotations

import argparse
import sys
from pathlib import Path


REPL_BODY_TO_MAIN_OPEN = r'''<body class="ff-body"
      data-ff-body=""
      data-ff-data-mode="{{ ff_data_mode|e }}"
      data-ff-totals-verified="{{ 'true' if _totals_verified else 'false' }}">

  <!-- FF: Accessibility Skip Link -->
  <a href="#content" class="ff-skiplink">Skip to main content</a>

  <!-- Skip Links -->
  <nav aria-label="Skip links" class="ff-skiplinks">
    <a class="ff-skip" href="#content">Skip to content</a>
    <a class="ff-skip" href="#checkout">Skip to checkout</a>
    <a class="ff-skip" href="#faq">Skip to FAQ</a>
  </nav>

  <!-- Live Status Element -->
  <div id="ffLive"
       class="ff-sr"
       data-ff-live=""
       aria-live="polite"
       aria-atomic="true"></div>

  <!-- Toast Notifications -->
  <div class="ff-toasts"
       data-ff-toasts=""
       role="status"
       aria-live="polite"
       aria-atomic="true"
       aria-relevant="additions removals"></div>

  <!-- Shell Container -->
  <div class="ff-shell" data-ff-shell="">
    <div class="ff-shellBg" aria-hidden="true"></div>

    <!-- Header -->
    <header class="ff-chrome" data-ff-chrome="" role="banner">
      <div class="ff-chrome__stack ff-stack" data-ff-chrome-stack="">

        {% if announcement_text %}
          <section class="ff-announce ff-announce--flagship"
                   data-ff-announce=""
                   role="region"
                   aria-label="Announcement">
            <div class="ff-container">
              <div class="ff-announce__inner ff-glass ff-surface">
                <div class="ff-announce__row">
                  <span class="ff-announce__badge" aria-hidden="true">Update</span>
                  <p class="ff-announce__text">{{ announcement_text|e }}</p>
                  <button type="button"
                          class="ff-btn ff-btn--sm ff-btn--ghost"
                          data-ff-share=""
                          aria-label="Share this fundraiser">
                    <span aria-hidden="true">↗</span>
                    <span class="ff-sr">Share</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        {% endif %}

        <!-- Top Navigation Bar -->
        <nav class="ff-topbar"
             data-ff-topbar=""
             id="ffTopbar"
             aria-label="Top navigation">
          <div class="ff-container">
            <div class="ff-topbar__capsule ff-glass ff-surface ff-topbar__capsule--flagship">
              <div class="ff-topbar__capsuleInner ff-stack ff-gap-2">

                <div class="ff-row ff-row--between ff-ais ff-wrap ff-topbar__mainRow">
                  <!-- Brand cluster -->
                  <div class="ff-row ff-ais ff-gap-2 ff-minw-0 ff-topbar__brandCluster">
                    {% if not _whitelabel %}
                      <a class="ff-platformBrand ff-platformBrand--mark ff-nounderline"
                         href="{{ _ff_home|e }}"
                         target="_blank"
                         rel="noopener noreferrer"
                         aria-label="FutureFunded platform (opens in new tab)">
                        <span class="ff-platformBrand__disc" aria-hidden="true">
                          <img class="ff-platformBrand__logo"
                               src="{{ _platform_logo|e }}"
                               width="22"
                               height="22"
                               alt=""
                               decoding="async" />
                        </span>
                        <span class="ff-sr">FutureFunded</span>
                      </a>
                      <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>
                    {% endif %}

                    <a class="ff-topbarBrand ff-topbarBrand--flagship ff-nounderline"
                       href="#home"
                       data-ff-home=""
                       aria-label="Jump to top">
                      <img src="{{ _org_logo|e }}"
                           width="34"
                           height="34"
                           fetchpriority="high"
                           loading="eager"
                           decoding="async"
                           alt="{{ _org_name|e }} logo" />
                      <span class="ff-topbarBrand__text">{{ _org_name }}</span>
                      {% if ff_data_mode == 'live' %}
                        <span class="ff-pill ff-pill--accent ff-topbarBrand__pill">Live</span>
                      {% else %}
                        <span class="ff-pill ff-pill--ghost ff-topbarBrand__pill">Preview</span>
                      {% endif %}
                    </a>
                  </div>

                  <!-- Right cluster -->
                  <div class="ff-row ff-ais ff-gap-2 ff-topbar__rightCluster">

                    <!-- Desktop -->
                    <div class="ff-topbar__desktop-only">
                      <div class="ff-row ff-ais ff-gap-2 ff-wrap">

                        <!-- IMPORTANT: scrollspy hook lives here -->
                        <nav class="ff-navPill ff-glass ff-surface ff-nav ff-nav--pill"
                             aria-label="Primary navigation"
                             data-ff-scrollspy="">
                          <a class="ff-nav__link" href="#progress">Progress</a>
                          <a class="ff-nav__link" href="#impact">Impact</a>
                          <a class="ff-nav__link" href="#teams">Teams</a>
                          <a class="ff-nav__link" href="#sponsors">Sponsors</a>
                          <a class="ff-nav__link" href="#faq">Help</a>
                        </nav>

                        <a class="ff-btn ff-btn--sm ff-btn--primary ff-btn--pill"
                           data-ff-open-checkout=""
                           href="#checkout"
                           aria-controls="checkout">Donate</a>

                        <button type="button"
                                class="ff-iconbtn ff-themeToggle"
                                data-ff-theme-toggle=""
                                aria-label="Toggle theme"
                                aria-pressed="false">
                          <span aria-hidden="true">◐</span>
                          <span class="ff-sr">Toggle theme</span>
                        </button>

                        <button type="button"
                                class="ff-iconbtn"
                                data-ff-share=""
                                aria-label="Share this fundraiser">
                          <span aria-hidden="true">↗</span>
                          <span class="ff-sr">Share</span>
                        </button>
                      </div>
                    </div>

                    <!-- Mobile -->
                    <div class="ff-row ff-ais ff-gap-2 ff-topbar__mobile-only">
                      <a class="ff-btn ff-btn--sm ff-btn--primary ff-btn--pill"
                         data-ff-open-checkout=""
                         href="#checkout"
                         aria-controls="checkout">Donate</a>

                      <button type="button"
                              class="ff-iconbtn ff-themeToggle"
                              data-ff-theme-toggle=""
                              aria-label="Toggle theme"
                              aria-pressed="false">
                        <span aria-hidden="true">◐</span>
                        <span class="ff-sr">Toggle theme</span>
                      </button>

                      <button type="button"
                              class="ff-iconbtn"
                              data-ff-share=""
                              aria-label="Share this fundraiser">
                        <span aria-hidden="true">↗</span>
                        <span class="ff-sr">Share</span>
                      </button>

                      <button type="button"
                              class="ff-iconbtn"
                              data-ff-open-drawer=""
                              aria-controls="ffDrawerPanel"
                              aria-label="Open menu">
                        <span aria-hidden="true">☰</span>
                        <span class="ff-sr">Menu</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Scroll Indicator -->
                <div class="ff-scroll" data-ff-scrollbar="" aria-hidden="true">
                  <span></span>
                </div>

              </div>
            </div>
          </div>
        </nav>

      </div>
    </header>

    <!-- Drawer Menu -->
    <aside id="drawer"
           class="ff-drawer"
           data-ff-drawer=""
           data-open="false"
           aria-hidden="true"
           hidden>
      <button type="button"
              class="ff-drawer__backdrop"
              data-ff-close-drawer=""
              aria-label="Close menu"></button>

      <div id="ffDrawerPanel"
           class="ff-drawer__panel"
           role="dialog"
           aria-modal="true"
           aria-labelledby="ffDrawerTitle"
           tabindex="-1">
        <header class="ff-drawer__head">
          <div class="ff-brand">
            <img alt=""
                 class="ff-drawer__orgLogo"
                 width="40"
                 height="40"
                 src="{{ _org_logo|e }}"
                 decoding="async" />
            <div class="ff-minw-0">
              <div class="ff-brand__title" id="ffDrawerTitle">{{ _campaign_name }}</div>
              <div class="ff-brand__sub">{{ _location }}</div>
            </div>
          </div>

          <button type="button"
                  class="ff-iconbtn"
                  data-ff-close-drawer=""
                  aria-label="Close">✕</button>
        </header>

        <div class="ff-drawer__body">
          <nav class="ff-drawer__block" aria-label="Drawer navigation">
            <ul class="ff-drawer__grid" role="list">
              <li><a class="ff-drawer__link" data-ff-close-drawer="" href="#progress">Progress →</a></li>
              <li><a class="ff-drawer__link" data-ff-close-drawer="" href="#impact">Impact →</a></li>
              <li><a class="ff-drawer__link" data-ff-close-drawer="" href="#teams">Teams →</a></li>
              <li><a class="ff-drawer__link" data-ff-close-drawer="" href="#sponsors">Sponsors →</a></li>
              <li><a class="ff-drawer__link" data-ff-close-drawer="" href="#faq">Help →</a></li>
              <li><a class="ff-drawer__link" data-ff-close-drawer="" href="#footer">Contact →</a></li>
            </ul>
          </nav>

          <div class="ff-stack ff-mt-3">
            <a class="ff-btn ff-btn--secondary ff-btn--pill"
               data-ff-open-sponsor=""
               href="#sponsor-interest">Become a sponsor</a>

            <a class="ff-btn ff-btn--primary ff-btn--pill"
               data-ff-open-checkout=""
               href="#checkout"
               aria-controls="checkout">Donate</a>
          </div>
        </div>
      </div>
    </aside>

    <main id="content" class="ff-main" data-ff-main="" tabindex="-1">
'''


REPL_HERO_BLOCK = r'''      <!-- ===================== HERO ===================== -->
      <section id="home"
               class="ff-section ff-section--hero ff-hero"
               data-ff-section="hero"
               aria-labelledby="heroTitle"
               aria-describedby="heroLead">

        <div class="ff-hero__bg" aria-hidden="true">
          <div class="ff-hero__orb ff-hero__orb--a"></div>
          <div class="ff-hero__orb ff-hero__orb--b"></div>
          <div class="ff-hero__gridlines"></div>
        </div>

        <div class="ff-container ff-hero__shell">
          <div class="ff-hero__grid">

            <div class="ff-minw-0">
              <article class="ff-hero__capsule ff-glass ff-surface" data-ff-hero-capsule="">
                <div class="ff-hero__capsuleInner">

                  <ul class="ff-heroContext" aria-label="Fundraiser context">
                    <li class="ff-pill ff-pill--live">
                      <span class="ff-dot" aria-hidden="true"></span>
                      <span>
                        {% if ff_data_mode == 'live' %}
                          Live fundraiser
                        {% else %}
                          Preview mode
                        {% endif %}
                      </span>
                    </li>
                    <li class="ff-pill ff-pill--verified">Secure checkout</li>
                    <li class="ff-pill ff-pill--ghost">Email receipt</li>
                  </ul>

                  <p class="ff-help ff-muted ff-mt-2 ff-mb-0" aria-label="Organizer and platform">
                    Organized by <span class="ff-num">{{ _organizer_label|e }}</span>
                    {% if not _whitelabel %}
                      • Powered by <span class="ff-num">FutureFunded</span>
                    {% endif %}
                    .
                  </p>

                  <header class="ff-heroHeader">
                    <h1 class="ff-display ff-heroTitle" id="heroTitle">
                      <span class="ff-heroLine">{{ _campaign_headline|e }}</span>
                      <span class="ff-heroAccent ff-heroLine" id="heroAccentLine">
                        {{ _campaign_subhead|e }} <span class="ff-heroName">{{ _campaign_name|e }}</span>.
                      </span>
                    </h1>

                    <p class="ff-lead ff-heroLead" id="heroLead">{{ _campaign_tagline|e }}</p>

                    <p class="ff-help ff-muted ff-mt-2 ff-mb-0">
                      Contact:
                      <a class="ff-link" href="mailto:{{ _organizer_email|e }}">{{ _organizer_email|e }}</a>
                    </p>

                    {% if ff_data_mode != 'live' and ff_env != 'production' %}
                      <div class="ff-alert ff-alert--info ff-mt-3" role="status">
                        <strong>Preview totals:</strong> amounts may be sample data for demo/testing.
                      </div>
                    {% elif (ff_data_mode == 'live') and (not _totals_verified) and (_raised_effective == 0 and _goal_effective == 0) %}
                      <div class="ff-alert ff-alert--info ff-mt-3" role="status">
                        Totals show <strong>$0</strong> until verified totals are provided by the organizer.
                      </div>
                    {% endif %}
                  </header>

                  <dl class="ff-hero__kpis ff-hero__kpis--flagship" aria-label="Key fundraising stats">
                    <div class="ff-kpi ff-kpiCard">
                      <dt class="ff-kpi__label ff-help ff-muted">Raised</dt>
                      <dd class="ff-kpi__value ff-big ff-num" data-ff-raised="">{{ money(_raised_effective) }}</dd>
                    </div>

                    <div class="ff-kpi ff-kpiCard">
                      <dt class="ff-kpi__label ff-help ff-muted">Season goal</dt>
                      <dd class="ff-kpi__value ff-big ff-num" data-ff-goal="">
                        {{ money(_goal_effective) }}
                        <span class="ff-help ff-muted ff-mt-1 ff-mb-0">Set by organizer</span>
                      </dd>
                    </div>

                    <div class="ff-kpi ff-kpiCard">
                      <dt class="ff-kpi__label ff-help ff-muted">Progress</dt>
                      <dd class="ff-kpi__value ff-big ff-num" data-ff-pct="">{{ _pct_i }}%</dd>
                    </div>
                  </dl>

                  {% if _smoke %}
                    <div class="ff-alert ff-alert--info ff-mt-3" role="status">
                      <strong>SMOKE:</strong>
                      mode={{ ff_data_mode|e }},
                      totalsVerified={{ 'true' if _totals_verified else 'false' }},
                      totalsSource={{ _totals_source_effective|e }},
                      backendRaised={{ money(_raised_backend) }},
                      teamSumRaised={{ money(_teams_sum_raised) }}.
                    </div>
                  {% endif %}

                  <nav class="ff-heroCtas ff-heroCtas--flagship" aria-label="Primary actions">
                    <a class="ff-btn ff-btn--primary ff-btn--lg ff-btn--pill"
                       data-ff-open-checkout=""
                       href="#checkout"
                       aria-controls="checkout">
                      <span class="ff-btn__label">Donate</span>
                      <span class="ff-btn__sub ff-help ff-muted">Secure checkout • Email receipt</span>
                    </a>

                    <p class="ff-help ff-muted ff-mt-1 ff-mb-0">No account • Works on phones • One link to share</p>

                    <div class="ff-row ff-wrap ff-gap-2" role="group" aria-label="Secondary actions">
                      <button type="button"
                              class="ff-btn ff-btn--ghost ff-btn--lg ff-btn--pill"
                              data-ff-share="">Share</button>
                      <a class="ff-btn ff-btn--secondary ff-btn--lg ff-btn--pill" href="#sponsors">Sponsor</a>
                    </div>
                  </nav>

                  <section class="ff-card ff-glass ff-pad ff-mt-3" aria-label="Recent support (privacy-safe)">
                    <div class="ff-row ff-row--between ff-ais ff-wrap ff-gap-2">
                      <p class="ff-kicker ff-m-0">Recent support</p>
                      <span class="ff-pill ff-pill--soft" aria-label="Privacy safe">Privacy-safe</span>
                    </div>

                    <div class="ff-donorTicker ff-mt-2"
                         data-ff-donor-ticker=""
                         data-ff-ticker=""
                         aria-live="polite"
                         aria-atomic="true">
                      <div class="ff-ticker__track"
                           data-ff-ticker-track=""
                           role="list"
                           aria-label="Recent supporters">
                        <p class="ff-help ff-muted ff-m-0">Supporter names are not displayed publicly.</p>
                      </div>
                    </div>
                  </section>

                </div>
              </article>

              <section class="ff-heroMedia ff-heroMedia--flagship" aria-label="Team highlights">
                <div class="ff-row ff-row--between ff-ais ff-wrap">
                  <div class="ff-minw-0">
                    <h2 class="ff-kicker ff-m-0" id="heroRailTitle">Meet the squad</h2>
                    <p class="ff-help ff-muted ff-mt-1" id="heroRailDesc">Tap a photo to preload checkout.</p>
                  </div>
                </div>

                {% set _max_rail = 8 %}
                {% set nsRail = namespace(items=[], used=[]) %}

                {% for t in FF_TEAMS|default([], true) if nsRail.items|length < _max_rail %}
                  {% set _tid = (t.id|default('default', true))|string|trim %}
                  {% if (t.photo|default('', true)) and (_tid not in nsRail.used) %}
                    {% set nsRail.items = nsRail.items + [{"team_id": _tid, "name": (t.name|default('Team', true)), "img": (t.photo|default('', true))}] %}
                    {% set nsRail.used = nsRail.used + [_tid] %}
                  {% endif %}
                {% endfor %}

                {% for g in (FF_GALLERY['items']|default([], true)) if nsRail.items|length < _max_rail %}
                  {% set _img = (g.src|default('', true))|string|trim %}
                  {% if _img %}
                    {% set nsRail.items = nsRail.items + [{"team_id": "default", "name": (g.caption|default('Team', true)), "img": _img}] %}
                  {% endif %}
                {% endfor %}

                {% if nsRail.items|length < 3 %}
                  {% for _i in range(3 - (nsRail.items|length)) %}
                    {% set nsRail.items = nsRail.items + [{"team_id": "default", "name": _campaign_name, "img": _org_logo}] %}
                  {% endfor %}
                {% endif %}

                <div class="ff-rail__track ff-rail__track--flagship"
                     data-ff-hero-rail=""
                     data-ff-rail-cols="3"
                     role="list"
                     aria-labelledby="heroRailTitle"
                     aria-describedby="heroRailDesc">
                  {% for it in nsRail.items[:_max_rail] %}
                    <a class="ff-railcard ff-rail__item"
                       data-ff-open-checkout=""
                       data-ff-team-id="{{ it.team_id|e }}"
                       href="#checkout"
                       role="listitem"
                       aria-controls="checkout"
                       aria-label="Donate to support {{ it.name|e }}">
                      <img class="ff-railcard__img"
                           src="{{ it.img|e }}"
                           width="320"
                           height="200"
                           loading="lazy"
                           decoding="async"
                           alt="{{ it.name|e }}" />
                      <div class="ff-railcard__meta">
                        <span class="ff-railcard__chip">Support</span>
                        <div class="ff-railcard__name">{{ it.name|e }}</div>
                      </div>
                    </a>
                  {% endfor %}
                </div>
              </section>
            </div>

            <aside class="ff-heroPanel ff-heroPanel--flagship" aria-label="Donation panel">
              <article class="ff-card ff-card--premium ff-card--lift ff-glass ff-pad"
                       data-ff-hero-panel=""
                       aria-labelledby="heroPanelTitle">
                <header class="ff-heroPanelHead">
                  <p class="ff-kicker ff-m-0">Donate</p>
                  <h2 class="ff-h2" id="heroPanelTitle">Support the season with care.</h2>
                  <p class="ff-help">
                    Organized by {{ _organizer_label|e }} •
                    <a class="ff-link" href="mailto:{{ _organizer_email|e }}">{{ _organizer_email|e }}</a>
                  </p>

                  <div class="ff-row ff-row--between ff-ais ff-wrap ff-gap-2 ff-mt-2" aria-label="Deadline">
                    <p class="ff-help ff-muted ff-m-0">Deadline</p>
                    <p class="ff-help ff-m-0">
                      <time datetime="{{ _deadline_iso|e }}" data-ff-deadline="">{{ _deadline_fallback|e }}</time>
                    </p>
                  </div>
                </header>

                <div class="ff-stack ff-mt-3">
                  <div class="ff-row ff-row--between ff-ais">
                    <span class="ff-help ff-muted">Progress</span>
                    <strong class="ff-num" id="heroPanelProgressText">
                      {{ money(_raised_effective) }} / {{ money(_goal_effective) }}
                    </strong>
                  </div>

                  <div class="ff-meter is-live" data-ff-meter="" role="group" aria-label="Fundraising progress">
                    <progress class="ff-meter__progress"
                              max="100"
                              value="{{ _pct_i }}"
                              aria-label="Fundraising progress">{{ _pct_i }}%</progress>
                  </div>

                  <div class="ff-grid ff-grid--2" aria-label="Quick donation amounts">
                    <button type="button" class="ff-chip" data-ff-amount="25">$25</button>
                    <button type="button" class="ff-chip" data-ff-amount="50">$50</button>
                    <button type="button" class="ff-chip" data-ff-amount="100">$100</button>
                    <button type="button" class="ff-chip" data-ff-amount="250">$250</button>
                  </div>

                  <hr aria-hidden="true" class="ff-divider ff-mt-3" />

                  <section class="ff-mt-3" data-ff-qr="" aria-label="Donate via QR code">
                    <figure class="ff-qr">
                      <img class="ff-qr__img"
                           src="{{ _qr_code|default('', true) |e }}"
                           width="140"
                           height="140"
                           loading="lazy"
                           decoding="async"
                           alt="Scan this QR code to open secure checkout" />
                      <figcaption class="ff-help ff-muted ff-mt-1 ff-mb-0">Scan to donate instantly</figcaption>
                    </figure>
                  </section>

                  <a class="ff-btn ff-btn--primary ff-btn--pill ff-w-100 ff-mt-2"
                     data-ff-open-checkout=""
                     href="#checkout"
                     aria-controls="checkout">Donate</a>

                  <p class="ff-help ff-muted ff-m-0">Secure checkout • Email receipt • No account</p>

                  <hr aria-hidden="true" class="ff-divider ff-mt-3" />

                  <section class="ff-mt-3" aria-label="VIP sponsor spotlight">
                    <div class="ff-row ff-row--between ff-ais ff-wrap ff-gap-2">
                      <p class="ff-kicker ff-m-0">VIP spotlight</p>
                      <span class="ff-pill ff-pill--soft">Rotation</span>
                    </div>

                    <div class="ff-vipSpotlight ff-mt-2"
                         data-ff-vip-spotlight=""
                         aria-live="polite"
                         aria-atomic="true">
                      <p class="ff-help ff-m-0">Sponsors may rotate here during high-traffic periods.</p>
                      <p class="ff-help ff-muted ff-mt-1 ff-mb-0">Choose VIP in the sponsor flow to be considered.</p>
                    </div>

                    <a class="ff-btn ff-btn--sm ff-btn--secondary ff-btn--pill ff-mt-2"
                       data-ff-open-sponsor=""
                       href="#sponsor-interest"
                       aria-controls="sponsor-interest">Become a sponsor</a>
                  </section>
                </div>
              </article>
            </aside>

          </div>
        </div>
      </section>
'''


def _find_section_block_by_depth(html: str, hero_comment: str) -> tuple[int, int]:
    start_comment = html.find(hero_comment)
    if start_comment < 0:
        raise ValueError("Could not find HERO comment marker to patch.")

    # Find the hero <section ... id="home"...> start after the comment
    after = start_comment + len(hero_comment)
    idx_section = html.find('<section', after)
    if idx_section < 0:
        raise ValueError("Could not find <section> following HERO comment marker.")

    # Tokenize <section and </section occurrences; maintain depth
    import re

    token_re = re.compile(r'(?i)</?section\b')
    depth = 0
    end_idx = -1

    for m in token_re.finditer(html, idx_section):
        tok = html[m.start():m.start() + 9].lower()  # "</section" or "<section"
        if tok.startswith("</"):
            depth -= 1
            if depth == 0:
                # find end of this closing tag
                gt = html.find(">", m.start())
                if gt < 0:
                    raise ValueError("Malformed </section> tag (missing '>').")
                end_idx = gt + 1
                break
        else:
            depth += 1

    if end_idx < 0:
        raise ValueError("Could not compute end of HERO <section> block (depth never returned to 0).")

    return start_comment, end_idx


def patch_index(path: Path, dry_run: bool = False) -> int:
    src = path.read_text(encoding="utf-8")
    original = src

    # 1) Replace body->main open scaffold
    body_start = src.find("<body class=\"ff-body\"")
    if body_start < 0:
        raise ValueError('Could not find <body class="ff-body"...> start.')

    main_open = src.find('<main id="content" class="ff-main" data-ff-main="" tabindex="-1">', body_start)
    if main_open < 0:
        raise ValueError('Could not find the <main id="content"...> opening tag.')

    # Replace from body_start up through the end of the main opening tag
    main_open_end = src.find(">", main_open)
    if main_open_end < 0:
        raise ValueError("Malformed <main> tag (missing '>').")
    main_open_end += 1

    src = src[:body_start] + REPL_BODY_TO_MAIN_OPEN + src[main_open_end:]

    # 2) Replace hero block by depth counting from HERO comment marker
    hero_marker = "<!-- ===================== HERO ===================== -->"
    hs, he = _find_section_block_by_depth(src, hero_marker)
    src = src[:hs] + REPL_HERO_BLOCK + src[he:]

    if src == original:
        print("No changes applied (already matches replacement?).")
        return 0

    if dry_run:
        print("Dry run complete — changes computed but not written.")
        return 0

    backup = path.with_suffix(path.suffix + ".bak_header_hero_v1")
    backup.write_text(original, encoding="utf-8")
    path.write_text(src, encoding="utf-8")

    print(f"✅ Patched: {path}")
    print(f"🧷 Backup: {backup}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Patch FutureFunded index header+drawer+hero (v1).")
    ap.add_argument("--path", default="app/templates/index.html", help="Path to index.html")
    ap.add_argument("--dry-run", action="store_true", help="Compute changes but do not write")
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        print(f"ERROR: file not found: {p}", file=sys.stderr)
        return 2

    try:
        return patch_index(p, dry_run=args.dry_run)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
