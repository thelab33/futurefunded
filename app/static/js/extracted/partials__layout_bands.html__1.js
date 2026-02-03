{% endif %}
      (() => {
        if (window.__fcBandsBound) return; window.__fcBandsBound = true;

        const d = document, r = d.documentElement;

        /* ---------------- Anchor offset (sticky header + sticky CTA) ------------ */
        const prefersReduce =
          !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        const cssNumber = name => {
          const v = getComputedStyle(r).getPropertyValue(name).trim();
          const n = parseFloat(v); return Number.isFinite(n) ? n : 0;
        };

        const headerEl = () =>
          d.querySelector('[data-sticky-header], header[role="banner"], #site-header');

        // Reserved height for sticky CTA managed elsewhere (e.g., Sticky CTA Manager)
        const stickyCTAHeight = () => cssNumber('--fc-sticky-h');

        function computeOffset(explicit){
          const h = (typeof explicit === 'number')
            ? explicit
            : (() => { const el = headerEl(); return el ? Math.ceil(el.getBoundingClientRect().height) : 0; })();
          const offset = Math.max(0, h + stickyCTAHeight());
          r.style.setProperty('--fc-anchor-offset', offset + 'px');
        }
        computeOffset();

        // Track header size changes
        try{
          const hdr = headerEl();
          if (hdr && 'ResizeObserver' in window){
            const ro = new ResizeObserver(() => computeOffset());
            ro.observe(hdr);
            addEventListener('beforeunload', () => ro.disconnect(), { once:true });
          }else{
            addEventListener('resize', () => computeOffset(), { passive:true });
            addEventListener('orientationchange', () => computeOffset());
          }
        }catch{}

        // External components can inform height or state
        addEventListener('fc:header:height', ev => {
          const n = ev?.detail?.height; computeOffset(typeof n === 'number' ? n : undefined);
        });
        // Sticky CTA open/close hooks
        ['fc:donate:open','fc:donate:close','fc:sticky:update'].forEach(ev =>
          addEventListener(ev, () => computeOffset()));

        /* ---------------- Auto-inject heading anchors --------------------------- */
        function injectAnchors(scope = d){
          if (scope.querySelector?.('[data-no-anchors]')) return;
          scope.querySelectorAll('.fc-band :is(h2,h3)[id]').forEach(h => {
            if (h.querySelector('.fc-heading-anchor')) return;
            const a = d.createElement('a');
            a.className = 'fc-heading-anchor';
            a.href = '#' + h.id;
            a.setAttribute('aria-label', 'Link to section ' + (h.textContent || '').trim());
            a.textContent = '🔗';
            h.appendChild(a);
          });
        }
        injectAnchors();
        addEventListener('htmx:afterSwap', e => injectAnchors(e.target || d));
        addEventListener('htmx:afterSettle', e => injectAnchors(e.target || d));

        /* ---------------- Optional: label bands as regions for SR ---------------- */
        // If a band contains a heading with id, set role="region" aria-labelledby=that id
        d.querySelectorAll('.fc-band').forEach(band => {
          if (band.hasAttribute('role')) return;
          const h = band.querySelector(':is(h2,h3)[id]');
          if (h && h.id){
            band.setAttribute('role','region');
            band.setAttribute('aria-labelledby', h.id);
          }
        });

        /* ---------------- In-page anchor smoothing with offset ------------------ */
        function scrollToEl(el){
          const offset = parseFloat(getComputedStyle(r).getPropertyValue('--fc-anchor-offset')) || 0;
          const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
          if (prefersReduce) { window.scrollTo(0, Math.max(0, top)); return; }
          try{ window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); }
          catch{ window.scrollTo(0, Math.max(0, top)); }
        }

        d.addEventListener('click', e => {
          const a = e.target.closest?.('a[href^="#"]');
          if (!a) return;
          const href = a.getAttribute('href') || '';
          if (href === '#' || href.length < 2) return;
          const el = d.getElementById(href.slice(1)); if (!el) return;
          e.preventDefault();
          if (history && history.pushState) history.pushState(null, '', href);
          scrollToEl(el);
        }, { passive:false });

        // On load with a hash, nudge into view with correct offset
        if (location.hash){
          const el = d.getElementById(location.hash.slice(1));
          if (el) requestAnimationFrame(() => scrollToEl(el));
        }
        // On hash changes (back/forward)
        addEventListener('hashchange', () => {
          const el = d.getElementById(location.hash.slice(1)); if (el) scrollToEl(el);
        });
      })();
      {% if script_close is defined %}{{ script_close() }}{% else %}
