/*! FundChamps Final UX v1.0 — per-tenant toggle, no deps, CSP-safe (nonce ok)
   Features (all optional via config):
   - Live region updates (donation totals)
   - Analytics event bridge (data-cta / data-analytics)
   - A11y: on-demand axe-core (Alt+Shift+A) for dev
   - Perf: Stripe preconnect, hero fallback
   - Safe external rel="noopener" pass
   Public API: window.FCUX.enable(), .disable(), .setTenant(), .report
*/
(function () {
  const D = document, W = window;
  const cfg = Object.assign({
    // Global defaults (can be overridden per tenant)
    features: {
      classToggle: true,          // adds html.fcux-on to enable CSS polish
      analyticsBridge: true,
      liveRegion: true,
      devAxeHotkey: false,        // enable in staging/dev only
      preconnectStripe: true,
      heroFallback: true,
      enforceNoopener: true
    },
    tenants: {
      // Example:
      // "connect-atx-elite": { features: { devAxeHotkey: true } }
    },
    // Read brand from <html data-brand="...">
    brandAttr: "data-brand",
    heroSelector: ".fcx-hero__img",
    liveRegionId: "donation-updates"
  }, W.FC_UX_CFG || {});

  const brand = D.documentElement.getAttribute(cfg.brandAttr) || "default";
  const tenantCfg = (cfg.tenants && cfg.tenants[brand]) ? deepMerge(cfg, cfg.tenants[brand]) : cfg;

  function deepMerge(base, ext) {
    const out = JSON.parse(JSON.stringify(base));
    if (!ext) return out;
    for (const k of Object.keys(ext)) {
      if (ext[k] && typeof ext[k] === "object" && !Array.isArray(ext[k])) {
        out[k] = deepMerge(out[k] || {}, ext[k]);
      } else out[k] = ext[k];
    }
    return out;
  }

  const report = { brand, enabled: false, fixes: [], info: [], warnings: [] };
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const q  = (s, r=D) => r.querySelector(s);
  const qq = (s, r=D) => Array.from(r.querySelectorAll(s));
  const addHtmlClass = (c) => D.documentElement.classList.add(c);
  const rmHtmlClass  = (c) => D.documentElement.classList.remove(c);

  function noopenerPass() {
    if (!tenantCfg.features.enforceNoopener) return;
    qq('a[target="_blank"]').forEach(a => {
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      if (!/\bnoopener\b/.test(rel)) {
        a.setAttribute('rel', (rel ? rel + ' ' : '') + 'noopener');
        report.fixes.push({ kind: 'rel_noopener', href: a.href || null });
      }
    });
  }

  function liveRegionInit() {
    if (!tenantCfg.features.liveRegion) return;
    let live = q('#' + cfg.liveRegionId);
    if (!live) {
      live = D.createElement('div');
      live.id = cfg.liveRegionId;
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      (q('.fcx-score') || q('main') || D.body).appendChild(live);
    }
    // Optional hook: you can call window.fcAfterDonationUpdate(raised)
    W.fcAfterDonationUpdate = (raised) => {
      live.textContent = `Updated total raised: $${Number(raised||0).toLocaleString()}.`;
    };
    // Listen for custom events (emitted by your runtime/autoEnhance if present)
    on(D, 'fc:donation:set', e => W.fcAfterDonationUpdate?.(e.detail?.raised || 0));
    report.info.push({ liveRegion: 'ready', id: cfg.liveRegionId });
  }

  function analyticsBridge() {
    if (!tenantCfg.features.analyticsBridge) return;
    const emit = (name, detail = {}) =>
      W.dispatchEvent(new CustomEvent('fc:analytics', { detail: { name, ...detail } }));
    on(D, 'click', (e) => {
      const el = e.target.closest('[data-cta],[data-analytics]');
      if (!el) return;
      const name = el.getAttribute('data-analytics') || `cta:${el.getAttribute('data-cta')}`;
      emit(name, { href: el.href || null, text: (el.textContent || '').trim().slice(0, 120) });
    }, { passive: true });
    // Dev-friendly logger (replace with vendor binding)
    on(W, 'fc:analytics', (e) => console.debug('[analytics]', e.detail));
    report.info.push({ analytics: 'bridge-online' });
  }

  function devAxeHotkey() {
    if (!tenantCfg.features.devAxeHotkey) return;
    on(D, 'keydown', async (e) => {
      if (!(e.altKey && e.shiftKey && (e.key || '').toLowerCase() === 'a')) return;
      try {
        const s = D.createElement('script');
        s.src = 'https://unpkg.com/axe-core@4.9.0/axe.min.js';
        s.onload = async () => {
          const r = await window.axe.run(D, { resultTypes: ['violations'] });
          console.group('%cA11y violations', 'background:#111;color:#facc15;padding:2px 6px;border-radius:4px');
          console.table(r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help })));
          console.log(r); console.groupEnd();
        };
        D.head.appendChild(s);
      } catch (err) { console.warn('axe load failed', err); }
    });
    report.info.push({ devAxeHotkey: 'Alt+Shift+A' });
  }

  function preconnectStripe() {
    if (!tenantCfg.features.preconnectStripe) return;
    const link = D.createElement('link');
    link.rel = 'preconnect'; link.href = 'https://js.stripe.com'; link.crossOrigin = 'anonymous';
    D.head.appendChild(link);
    report.info.push({ preconnect: 'stripe' });
  }

  function heroFallback() {
    if (!tenantCfg.features.heroFallback) return;
    on(W, 'error', (e) => {
      const img = e.target;
      if (img && img.tagName === 'IMG' && img.matches(cfg.heroSelector)) {
        const fallback = img.getAttribute('data-fallback') || '/static/images/team-default.jpg';
        if (img.src !== fallback) { img.src = fallback; report.fixes.push({ kind: 'hero_fallback', to: fallback }); }
      }
    }, true);
  }

  function enable() {
    if (report.enabled) return;
    if (tenantCfg.features.classToggle) addHtmlClass('fcux-on');
    noopenerPass();
    liveRegionInit();
    analyticsBridge();
    devAxeHotkey();
    preconnectStripe();
    heroFallback();
    report.enabled = true;
    console.info('[FCUX] enabled for tenant:', brand, tenantCfg);
  }
  function disable() {
    rmHtmlClass('fcux-on'); report.enabled = false;
    console.info('[FCUX] disabled for tenant:', brand);
  }

  function setTenant(nextBrand, overrides) {
    if (typeof nextBrand === 'string') D.documentElement.setAttribute(cfg.brandAttr, nextBrand);
    if (overrides && typeof overrides === 'object') W.FC_UX_CFG = deepMerge(W.FC_UX_CFG || {}, { tenants: { [nextBrand]: overrides } });
    // Hard-refresh features with new config
    disable(); enable();
  }

  // Auto-boot
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', enable, { once: true });
  else enable();

  // Expose API
  W.FCUX = { enable, disable, setTenant, report };
})();

