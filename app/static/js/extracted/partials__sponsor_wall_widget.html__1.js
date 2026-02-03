(() => {
    if (window.__fcSponsorWallInit) return; window.__fcSponsorWallInit = true;

    const widget   = document.getElementById('sponsor-wall-widget');
    const toggle   = document.getElementById('sponsor-wall-toggle');
    const closeBtn = widget?.querySelector('[data-widget-close]');
    const list     = document.getElementById('sponsor-wall-list');
    const nudgeDot = document.getElementById('sponsor-nudge-dot');
    const tickerEl = widget?.querySelector('[data-ticker]');
    const sr       = document.getElementById('sponsor-sr');
    if (!widget || !toggle) return;

    // ---------- State & helpers ----------
    const TEAM = widget.getAttribute('data-team') || 'default';
    const KEY_OPENED = `fc_sw_opened:${TEAM}`;
    const bc = (function(){ try { return new BroadcastChannel('fc_ui'); } catch { return null; }})();

    const reduced = (matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) || (navigator.connection?.saveData === true);
    const fmtMoney = (n)=> (Number.isFinite(+n) ? Math.round(+n) : 0).toLocaleString();
    const esc = (t)=> String(t||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const getInitial = (key, fallback) => { try { const v = widget.dataset[key]; return (v==null||v==='')?fallback:(JSON.parse(v)); } catch { return fallback; } };

    const nameKey = (v)=> String((v?.name||'').toLowerCase().trim());
    const idKey   = (v)=> v?.id!=null ? String(v.id).toLowerCase() : '';
    const sponsorKey = (v)=> idKey(v) || nameKey(v);

    let allSponsors = Array.isArray(getInitial('initialSponsors', [])) ? getInitial('initialSponsors', []) : [];
    let totalRaised = Number(widget.dataset.initialTotal || 0) || allSponsors.reduce((a,b)=>a+(+b.amount||0),0);
    let openedOnce  = localStorage.getItem(KEY_OPENED) === '1';

    const countEls = widget.querySelectorAll('[data-count]');
    const totalEls = widget.querySelectorAll('[data-total]');

    function announce(txt){ try { if (sr) sr.textContent = txt; } catch {} }
    function shadowCue(){ if (!list) return; list.classList.toggle('fc-scroll-shadow', (list.scrollTop||0) > 5); }
    function updateNumbers(){
      countEls.forEach(el => el.textContent = String(allSponsors.length));
      totalEls.forEach(el => el.textContent = fmtMoney(totalRaised));
    }

    // Deduplicate via stable key (id or lowercased name)
    function upsertSponsor(s){
      if (!s) return;
      const key = sponsorKey(s); if (!key) return;
      const idx = allSponsors.findIndex(x => sponsorKey(x) === key);
      if (idx >= 0) allSponsors[idx] = { ...allSponsors[idx], ...s };
      else allSponsors.unshift(s);
      totalRaised = allSponsors.reduce((a,b)=> a + (+b.amount||0), 0);
      paintGridIncremental({ ...s, _key: key });
      updateNumbers();
      window.dispatchEvent(new CustomEvent('fc:sponsorwall:added', { detail: { sponsor: s } }));
    }

    // ---------- Focus trap & keyboard ----------
    let escBound = false;
    function onKeydown(e){
      if (e.key === 'Escape') { e.preventDefault(); closeWidget(); return; }
      if (e.key !== 'Tab') return;
      const focusables = widget.querySelectorAll('a,button,input,textarea,select,[tabindex]:not([tabindex="-1"])');
      const first = focusables[0], last = focusables[focusables.length-1];
      if (!first) return;
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }

    // ---------- Open/close ----------
    let opened = false;
    function openWidget(){
      if (opened) return;
      opened = true;
      widget.classList.add('is-open');
      widget.setAttribute('aria-hidden','false');
      toggle.setAttribute('aria-expanded','true');
      document.body.style.overflow = 'hidden';
      nudgeDot?.classList.add('hidden');
      try { widget.focus({ preventScroll: true }); } catch {}
      if (!escBound) { document.addEventListener('keydown', onKeydown, { passive:false }); escBound = true; }
      try { localStorage.setItem(KEY_OPENED,'1'); } catch {}
      openedOnce = true;
      shadowCue();
      bc?.postMessage({ type:'fc:sponsorwall:open', detail:{ team: TEAM } });
      window.dispatchEvent(new CustomEvent('fc:sponsorwall:open', { detail:{ team: TEAM } }));
    }
    function closeWidget(){
      if (!opened) return;
      opened = false;
      widget.classList.remove('is-open');
      widget.setAttribute('aria-hidden','true');
      toggle.setAttribute('aria-expanded','false');
      document.body.style.overflow = '';
      try { toggle.focus({ preventScroll: true }); } catch {}
      if (escBound) { document.removeEventListener('keydown', onKeydown); escBound = false; }
      bc?.postMessage({ type:'fc:sponsorwall:close', detail:{ team: TEAM } });
      window.dispatchEvent(new CustomEvent('fc:sponsorwall:close', { detail:{ team: TEAM } }));
    }
    const toggleWidget = () => (opened ? closeWidget() : openWidget());

    // Mouse + keyboard open/close on toggle
    toggle.addEventListener('click', () => { toggleWidget(); bc?.postMessage({type:'fc:sponsorwall:toggle'}); }, { passive:true });
    toggle.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); toggleWidget(); } }, { passive:false });

    closeBtn?.addEventListener('click', closeWidget, { passive:true });
    list?.addEventListener('scroll', shadowCue, { passive:true });

    // Close on outside click
    document.addEventListener('click', (e)=>{
      if (!opened) return;
      if (!widget.contains(e.target) && !toggle.contains(e.target)) closeWidget();
    }, { passive:true });

    // Keyboard shortcut: "S" (skip inputs)
    document.addEventListener('keydown', (e)=>{
      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
      if ((e.key||'').toLowerCase() === 's'){ e.preventDefault(); toggleWidget(); }
    }, { passive:false });

    // Deep link open (?open=sponsors or #sponsors)
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('open') === 'sponsors' || location.hash.replace('#','') === 'sponsors') {
        setTimeout(openWidget, 250);
      }
    } catch {}

    // Gentle nudge if never opened
    if (!openedOnce) {
      setTimeout(()=>{ if (!opened) nudgeDot?.classList.remove('hidden'); }, 180000);
    }

    // Sponsor CTA → open tiers modal if present, else emit hook
    document.addEventListener('click', (e)=>{
      const openSponsor = e.target.closest?.('[data-open-sponsor]'); if (!openSponsor) return;
      e.preventDefault();
      const tiersModal = document.getElementById('tiers-modal');
      if (tiersModal?.showModal) { tiersModal.showModal(); }
      else {
        const mount = document.getElementById('sponsor-modal-root');
        window.dispatchEvent(new CustomEvent('fc:sponsorwall:cta', { detail:{ team: TEAM, mount } }));
      }
    }, { passive:false });

    // Leaderboard toggle UI hook
    document.querySelectorAll('.leaderboard-toggle').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.leaderboard-toggle').forEach(b=>{
          b.classList.remove('bg-yellow-400/40','text-black'); b.setAttribute('aria-pressed','false');
        });
        btn.classList.add('bg-yellow-400/40','text-black'); btn.setAttribute('aria-pressed','true');
        const range = btn.dataset.leaderboard || 'all';
        window.dispatchEvent(new CustomEvent('fc:sponsorwall:range', { detail:{ range } }));
      }, { passive:true });
    });

    // Social share (Web Share API fallback)
    document.addEventListener('click', (e)=>{
      const share = e.target.closest?.('[data-share]'); if (!share) return;
      const net = share.getAttribute('data-share'); const url = location.href;
      const text = 'Support our team — sponsor or donate!';
      if (navigator.share) { navigator.share({ title: document.title, text, url }).catch(()=>{}); return; }
      const map = {
        x:  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        ln: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
      };
      window.open(map[net] || url, '_blank', 'noopener,noreferrer,width=600,height=600');
      window.dispatchEvent(new CustomEvent('fc:sponsorwall:share', { detail:{ net } }));
    }, { passive:true });

    /* ---------- Renderers ---------- */
    function findCardByKey(key){
      return key ? list.querySelector(`[data-key="${CSS.escape(key)}"]`) : null;
    }

    function ensureLogoSrc(raw){
      if (!raw) return {{ default_logo|tojson }};
      return /^https?:\/\//i.test(raw) ? raw : (raw.startsWith('/') ? raw : '/' + raw);
    }

    function paintGridIncremental(s){
      if (!list || !s) return;
      const key = s._key || sponsorKey(s);
      const amt = Number.isFinite(+s.amount) ? +s.amount : 0;
      const html = `
        <article data-key="${esc(key)}" class="vip-card group flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl border bg-indigo-900 text-yellow-300 ring ring-indigo-600" role="listitem">
          ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener sponsored" tabindex="-1" aria-label="Visit ${esc(s.name||'Sponsor')}">` : ``}
          <img src="${ensureLogoSrc(s.logo)}" alt="${esc(s.name||'Sponsor')} logo" width="64" height="64" class="h-10 w-10 rounded-md border border-yellow-400/40 bg-white/90 object-contain shadow-inner" loading="lazy" decoding="async" />
          ${s.url ? `</a>` : ``}
          <div class="text-center leading-tight">
            <div class="text-[12px] font-bold">${esc(s.name||'Sponsor')}</div>
            <div class="text-[11px] text-yellow-800">$ ${fmtMoney(amt)}</div>
          </div>
        </article>`;
      const existing = findCardByKey(key);
      if (existing) existing.outerHTML = html;
      else list.insertAdjacentHTML('afterbegin', html);
      shadowCue();
    }

    /* ---------- Ticker animation (pause offscreen / reduced-motion) ---------- */
    (function(){
      const container = tickerEl;
      if (!container) return;
      let raf=null, x=0, running=false;
      const track = container.querySelector('[data-ticker-track]');
      if (!track) return;
      const step = () => {
        if (!running) return;
        x -= 0.6;
        const max = track.scrollWidth + 40;
        if (Math.abs(x) > max) x = container.clientWidth;
        track.style.transform = `translateX(${x}px)`;
        raf = requestAnimationFrame(step);
      };
      const io = ('IntersectionObserver' in window) ? new IntersectionObserver(([en])=>{
        const vis = !!(en && en.isIntersecting);
        if (reduced || !vis) { running=false; if (raf) cancelAnimationFrame(raf), raf=null; }
        else if (!running) { running=true; raf=requestAnimationFrame(step); }
      }, { threshold: 0.01 }) : null;
      if (io) io.observe(container);
      else if (!reduced) { running=true; raf=requestAnimationFrame(step); }
      addEventListener('beforeunload', ()=>{ if (raf) cancelAnimationFrame(raf); }, { passive:true });
    })();

    /* ---------- Live events ---------- */
    function pushDonation(d){
      const wrap = document.querySelector('#donation-ticker [data-ticker]'); if (!wrap) return;
      let track = wrap.querySelector('[data-ticker-track]');
      if (!track){
        wrap.innerHTML = '<div data-ticker-track class="inline-flex gap-6 pr-6"></div>';
        track = wrap.querySelector('[data-ticker-track]');
      }
      const who = (d.sponsor_name || d.name || 'Someone');
      const amt = fmtMoney(d.amount);
      const span = document.createElement('span');
      span.className = 'inline-block';
      span.innerHTML = `💸 <strong>${esc(who)}</strong> just donated $${amt}`;
      track.prepend(span);
      announce(`${who} just donated ${amt} dollars`);
    }

    // Meter/sponsor events harmony
    addEventListener('fc:vip',        (ev)=> { const d=ev.detail||{}; pushDonation(d); upsertSponsor(d); nudgeDot?.classList.toggle('hidden', opened); }, { passive:true });
    addEventListener('fc:sponsor:vip',(ev)=> { const d=ev.detail||{}; pushDonation(d); upsertSponsor(d); nudgeDot?.classList.toggle('hidden', opened); }, { passive:true });
    addEventListener('fc:vip:hit',    (ev)=> { const d=ev.detail||{}; pushDonation(d); upsertSponsor(d); nudgeDot?.classList.toggle('hidden', opened); }, { passive:true });
    addEventListener('fc:funds:update',(ev)=>{ /* number ribbon already handled elsewhere; keep for future */ }, { passive:true });

    // (Optional) Socket namespaces — guarded
    (function(){
      const hasIO = typeof window.io === 'function';
      if (!hasIO) return;
      try{
        const ds = window.io('/donations', { transports:['websocket','polling'] });
        ds.on?.('donation', (d)=> { pushDonation(d); if (!opened) nudgeDot?.classList.remove('hidden'); });
        const ss = window.io('/sponsors', { transports:['websocket','polling'] });
        ss.on?.('sponsor', (s)=> upsertSponsor(s));
      }catch(_){}
    })();

    // Cross-tab nudges
    bc?.addEventListener?.('message', (ev)=>{
      if (!ev?.data) return;
      if (ev.data.type === 'fc:sponsorwall:open' && !opened) nudgeDot?.classList.add('hidden');
    });

    // Public API
    window.fcSponsorWall = Object.assign({}, window.fcSponsorWall, {
      open: openWidget,
      close: closeWidget,
      toggle: toggleWidget,
      addSponsor: upsertSponsor,
      pushDonation
    });

    // First paint
    updateNumbers();
    shadowCue();
  })();
