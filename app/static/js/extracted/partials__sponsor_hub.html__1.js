(() => {
      const root = document.getElementById('{{ sponsors_hub_id }}');
      if (!root || root.__init) return; root.__init = true;

      // ---------- Elements ----------
      const spotlight = root.querySelector('[data-spotlight]');
      const ribbon = root.querySelector('[data-ribbon]');
      const wallGrid = root.querySelector('[data-grid]');
      const wallEmpty = root.querySelector('[data-empty]');
      const chipsWrap = root.querySelector('[data-chips]');
      const search = document.getElementById('{{ sponsors_hub_id }}-search');
      const countEls = root.querySelectorAll('#{{ sponsors_hub_id }}-count, [data-count]');
      const totalEls = root.querySelectorAll('#{{ sponsors_hub_id }}-total, [data-total]');

      // Drawer & focus
      const sw = document.getElementById('{{ sponsors_hub_id }}-sw');
      const swGrid = root.querySelector('[data-sw-grid]');
      const toggle = document.getElementById('{{ sponsors_hub_id }}-toggle');
      const nudge = document.getElementById('{{ sponsors_hub_id }}-nudge');
      const closeBtn = sw?.querySelector('[data-close]');
      let lastFocus = null;

      // ---------- State ----------
      let allSponsors = [];
      try { allSponsors = JSON.parse(root.dataset.initialSponsors || '[]') || []; } catch(_) {}
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

      // ---------- Helpers ----------
      const money = (n)=> (Math.round(Number(n)||0)).toLocaleString();
      const esc = (t)=> String(t||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
      function logoSrc(raw){ if (!raw) return {{ default_logo|tojson }}; return /^https?:\/\//i.test(raw) ? raw : (raw.startsWith('/') ? raw : ('/' + raw)); }

      function updateTotals(){
        const total = allSponsors.reduce((a,b)=> a + (+b.amount||0), 0);
        const count = allSponsors.length;
        countEls.forEach(el => el.textContent = String(count));
        totalEls.forEach(el => el.textContent = money(total));
      }

      // Deduplicate by name (case-insensitive)
      function upsertSponsor(s){
        const name = (s?.name||'').trim();
        if (!name) return;
        const idx = allSponsors.findIndex(x => (x.name||'').toLowerCase() === name.toLowerCase());
        if (idx >= 0) { allSponsors[idx] = { ...allSponsors[idx], ...s }; }
        else { allSponsors.unshift(s); }
        render();
      }

      // ---------- Rendering ----------
      function renderSpotlight(){
        if (!spotlight) return;
        const slots = {{ spotlight_slots }};
        const sorted = allSponsors.slice().sort((a,b)=>(+b.amount||0)-(+a.amount||0));
        const top = sorted.slice(0, slots);

        spotlight.innerHTML = '';
        top.forEach(s=>{
          const tier = String(s.tier||'default').toLowerCase();
          const cls = tier==='platinum' ? 'bg-yellow-300 text-yellow-900 ring-2 ring-yellow-400'
                    : tier==='gold'     ? 'bg-yellow-200 text-yellow-800 ring-1 ring-yellow-300'
                    : tier==='silver'   ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200'
                    : tier==='bronze'   ? 'bg-orange-200 text-orange-900 ring-1 ring-orange-300'
                    : 'bg-indigo-900 text-yellow-300 ring-1 ring-indigo-600';
          const a1 = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener sponsored" tabindex="-1" aria-label="Visit ${esc(s.name)}">` : '';
          const a2 = s.url ? `</a>` : '';
          spotlight.insertAdjacentHTML('beforeend', `
            <article class="card flex min-h-[200px] flex-col items-center gap-2 px-6 py-5 ${cls}" role="listitem" data-name="${esc(s.name||'')}" data-tier="${esc(s.tier||'')}">
              ${a1}<img src="${logoSrc(s.logo)}" alt="${esc(s.name||'Sponsor')} logo" width="96" height="96" class="h-16 w-16 rounded-xl border border-yellow-400/40 bg-white/90 object-contain shadow-inner sm:h-20 sm:w-20" />${a2}
              <h4 class="mt-2 line-clamp-2 text-center text-lg font-bold">${esc(s.name||'Sponsor')}</h4>
              <span class="text-base font-extrabold text-yellow-800">$ ${money(s.amount)}</span>
              ${s.tier ? `<span class="badge">${esc(s.tier)}</span>` : ''}
            </article>
          `);
        });

        // Fill CTAs
        for (let i=top.length; i<slots; i++){
          spotlight.insertAdjacentHTML('beforeend', `
            <div role="listitem" class="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-yellow-400/40 bg-black/60 px-6 py-5 shadow-xl" data-empty tabindex="0" aria-label="Available sponsorship spot">
              <span class="text-3xl" aria-hidden="true">✨</span>
              <span class="text-center text-sm font-semibold text-yellow-300">This spot is waiting for you!</span>
              <div class="flex gap-2">
                <button type="button" class="mt-2 rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold text-black shadow" data-open-sponsor>🌟 Become a Sponsor</button>
                <button type="button" class="mt-2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-yellow-200 ring-1 ring-yellow-400/40" data-open-donation>💳 Quick Donate</button>
              </div>
            </div>
          `);
        }

        // Rebuild ribbon (first 12)
        if (ribbon){
          ribbon.innerHTML = allSponsors.slice(0,12).map(s => `<img src="${logoSrc(s.logo)}" alt="${esc(s.name||'Sponsor')} logo" title="${esc(s.name||'Sponsor')}" class="mx-2 h-8 w-auto rounded shadow" />`).join('') + `<span class="ml-2 whitespace-nowrap text-sm font-bold text-yellow-400">+ Your Brand Here</span>`;
        }
      }

      function renderWall(){
        if (!wallGrid) return;
        const topNames = new Set(allSponsors.slice(0, {{ spotlight_slots }}).map(s => (s.name||'').toLowerCase()));
        const list = allSponsors.filter(s => !topNames.has((s.name||'').toLowerCase()));

        // Filters
        const tier = (wallGrid.dataset.filterTier || 'all');
        const q = (wallGrid.dataset.filterQuery || '').toLowerCase();
        const filtered = list.filter(s => (tier==='all' || String(s.tier||'').toLowerCase()===tier) && (!q || String(s.name||'').toLowerCase().includes(q)));

        wallGrid.innerHTML = filtered.map(s=>{
          const t = String(s.tier||'Community'); const tl = t.toLowerCase();
          return `
            <li class="card flex flex-col gap-3 p-4" data-tier="${tl}" data-name="${esc(s.name||'').toLowerCase()}" data-amount="${s.amount||0}">
              <div class="flex items-center gap-3">
                <img class="logo" src="${logoSrc(s.logo)}" alt="${esc(s.name||'Sponsor')} logo" />
                <div class="min-w-0">
                  <div class="truncate leading-tight font-extrabold text-yellow-200">${esc(s.name||'Sponsor')}</div>
                  <div class="inline-flex items-center gap-2 text-[11px] text-yellow-100/80">
                    <span class="badge">${esc(t)}</span>${s.amount?`<span>$ ${money(s.amount)}</span>`:''}
                  </div>
                </div>
              </div>
              <div class="mt-auto flex items-center gap-2">
                ${s.url?`<a href="${esc(s.url)}" rel="noopener sponsored" target="_blank" class="inline-flex items-center justify-center rounded-lg bg-yellow-300 px-3 py-1.5 text-sm font-black text-black">Visit</a>`:''}
                <button type="button" class="inline-flex items-center justify-center rounded-lg border border-yellow-400/60 bg-yellow-300/10 px-3 py-1.5 text-sm font-bold text-yellow-200" data-open-donate-modal data-amount="${(s.amount && Math.max(10, Math.round(s.amount/10))) || 100}">Match</button>
              </div>
            </li>`;
        }).join('');

        wallEmpty?.classList.toggle('hidden', filtered.length > 0);

        // Update chip counts
        const counts = { all: filtered.length };
        filtered.forEach(s => { const tl = String(s.tier||'community').toLowerCase(); counts[tl] = (counts[tl]||0)+1; });
        chipsWrap?.querySelectorAll('.chip').forEach(btn => {
          const t = btn.dataset.tier;
          btn.querySelector('.count').textContent = String(counts[t] || 0);
        });
      }

      function renderSW(){
        if (!swGrid) return;
        const html = allSponsors.map(s=>{
          const tier = String(s.tier||'default').toLowerCase();
          const base = tier==='platinum' ? 'bg-yellow-300 text-yellow-900 ring-1 ring-yellow-400'
                    : tier==='gold'     ? 'bg-yellow-200 text-yellow-800 ring ring-yellow-300'
                    : tier==='silver'   ? 'bg-yellow-100 text-yellow-700 ring ring-yellow-200'
                    : tier==='bronze'   ? 'bg-orange-200 text-orange-900 ring ring-orange-300'
                    : 'bg-indigo-900 text-yellow-300 ring ring-indigo-600';
          return `
            <article class="card flex flex-col items-center gap-2 rounded-2xl border ${base} px-4 py-3" role="listitem" data-sw-card>
              ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener sponsored" tabindex="-1" aria-label="Visit ${esc(s.name||'Sponsor')}">` : ``}
              <img src="${logoSrc(s.logo)}" alt="${esc(s.name||'Sponsor')} logo" width="72" height="72" class="h-12 w-12 rounded-lg border border-yellow-400/40 bg-white/90 object-contain shadow-inner" />
              ${s.url ? `</a>` : ``}
              <div class="text-center">
                <div class="text-sm font-bold leading-tight">${esc(s.name||'Sponsor')}</div>
                <div class="text-xs text-yellow-800">$ ${money(s.amount)}</div>
              </div>
            </article>`;
        }).join('');
        swGrid.innerHTML = html;
      }

      function render(){
        updateTotals();
        renderSpotlight();
        renderWall();
        renderSW();
      }

      // ---------- Filters ----------
      chipsWrap?.addEventListener('click', (e)=>{
        const btn = e.target.closest('.chip'); if (!btn) return;
        chipsWrap.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed','false'));
        btn.setAttribute('aria-pressed','true');
        wallGrid.dataset.filterTier = btn.dataset.tier || 'all';
        renderWall();
      });
      search?.addEventListener('input', (e)=>{ wallGrid.dataset.filterQuery = (e.target.value || ''); renderWall(); });

      // ---------- CTA & Donate ----------
      root.addEventListener('click', (e)=>{
        const openSponsor = e.target.closest('[data-open-sponsor]');
        if (openSponsor){
          e.preventDefault();
          if (typeof window.openDonationModal === 'function') window.openDonationModal({ source: 'sponsors_hub' });
          else window.dispatchEvent(new CustomEvent('fc:donate:open'));
        }
        const donate = e.target.closest('[data-open-donate-modal],[data-open-donation]');
        if (donate){
          e.preventDefault();
          const amt = parseInt(donate.getAttribute('data-amount') || '0', 10) || undefined;
          if (typeof window.openDonationModal === 'function') window.openDonationModal({ amount: amt });
          else window.dispatchEvent(new CustomEvent('fc:donate:open', { detail:{ amount: amt }}));
          if (typeof window.confetti === 'function' && !reduceMotion) window.confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 } });
        }
      });

      // ---------- Drawer: open/close + focus trap + Esc ----------
      function trapFocus(e){
        if (!sw?.classList.contains('is-open')) return;
        const focusables = sw.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.key === 'Tab'){
          if (e.shiftKey && document.activeElement === first){ last.focus(); e.preventDefault(); }
          else if (!e.shiftKey && document.activeElement === last){ first.focus(); e.preventDefault(); }
        }
        if (e.key === 'Escape'){ closeSW(); }
      }
      function openSW(){
        if (!sw) return;
        lastFocus = document.activeElement;
        sw.classList.add('is-open');
        sw.setAttribute('aria-hidden','false');
        toggle?.setAttribute('aria-expanded','true');
        document.body.style.overflow='hidden';
        nudge?.classList.add('hidden');
        sw.focus();
        document.addEventListener('keydown', trapFocus);
      }
      function closeSW(){
        if (!sw) return;
        sw.classList.remove('is-open');
        sw.setAttribute('aria-hidden','true');
        toggle?.setAttribute('aria-expanded','false');
        document.body.style.overflow='';
        document.removeEventListener('keydown', trapFocus);
        (lastFocus || toggle)?.focus();
      }
      toggle?.addEventListener('click', ()=> (sw?.classList.contains('is-open') ? closeSW() : openSW()));
      closeBtn?.addEventListener('click', closeSW);
      document.addEventListener('click', (e)=>{ if (!sw || !sw.classList.contains('is-open')) return; if (!sw.contains(e.target) && !toggle.contains(e.target)) closeSW(); });
      setTimeout(()=>{ if (toggle && sw && !sw.classList.contains('is-open')) nudge?.classList.remove('hidden'); }, 180000);

      // ---------- Live: custom events + sockets ----------
      window.addEventListener('fc:vip', (ev)=> upsertSponsor(ev.detail || {}));
      if (typeof window.io === 'function'){
        try{
          const ss = window.io('/sponsors', { transports:['websocket','polling'] });
          ss.on('sponsor', (s)=> upsertSponsor(s));
          const ds = window.io('/donations', { transports:['websocket','polling'] });
          const rails = root.querySelectorAll('.ticker-rail .inline-flex');
          ds.on('donation', (d)=>{
            rails.forEach(rail => {
              const span = document.createElement('span');
              span.className = 'inline-block';
              span.textContent = `💸 ${(d.sponsor_name||d.name||'Someone')} just donated $${(Math.round(+d.amount||0)).toLocaleString()}`;
              rail.prepend(span);
            });
          });
        }catch(_){}
      }

      // ---------- Public API ----------
      window.fcSponsorsHub = {
        add: upsertSponsor,
        render,
        open: () => openSW(),
        close: () => closeSW(),
        toggle: () => (sw?.classList.contains('is-open') ? closeSW() : openSW())
      };

      render();
    })();
