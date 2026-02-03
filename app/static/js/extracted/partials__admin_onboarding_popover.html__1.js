(() => {
    const root = document.getElementById('admin-onboarding');
    const tip  = document.getElementById('ai-concierge-tip');
    if (!root || root.__init) return; root.__init = true;

    // ===== Utils
    const reduce = (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.connection?.saveData === true);
    const $  = (sel, el = document) => el.querySelector(sel);
    const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
    const ns = root.dataset.storageNs || 'adminOnboard:global:anon';
    const K_STEPS  = ns + ':steps';
    const K_SNOOZE = ns + ':snoozeUntil';
    const K_DISMIS = ns + ':dismissed';
    const syncUrl  = root.dataset.syncUrl || '';
    const dismissUrl = root.dataset.dimissUrl || root.dataset.dismissUrl || '';
    const csrf     = root.dataset.csrf || (document.cookie.match(/(?:^|;\\s*)csrf_token=([^;]+)/)?.[1] || '');
    const now = () => Date.now();

    // Confetti hook (optional)
    function confettiLite(){ try { window.launchConfetti?.({ particleCount: 60, spread: 80, origin: { y: .6 } }); } catch(_){} }

    // Focus trap
    function trapFocus(container){
      function onKey(e){
        if (e.key === 'Escape'){ close(true); return; }
        if (e.key !== 'Tab') return;
        const list = $$('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])', container).filter(el => !el.disabled);
        if (!list.length) return;
        const first = list[0], last = list[list.length-1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
      container.addEventListener('keydown', onKey);
      return () => container.removeEventListener('keydown', onKey);
    }

    // Snooze gate (24h)
    try {
      const until = parseInt(localStorage.getItem(K_SNOOZE) || '0', 10);
      if (until && now() < until) { root.remove(); return; }
    } catch {}

    // Steps state
    const labels = (function(){ try { return JSON.parse({{ step_labels|tojson if tojson is defined else '[]' }}); } catch { return []; } })();
    let steps = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(K_STEPS) || 'null');
        return (Array.isArray(saved) && saved.length === labels.length) ? saved.map(Boolean) : new Array(labels.length).fill(false);
      } catch { return new Array(labels.length).fill(false); }
    })();

    // Cross-tab sync
    let bc = null;
    try { bc = new BroadcastChannel(ns); } catch {}
    bc && (bc.onmessage = (ev) => {
      const d = ev.data || {};
      if (Array.isArray(d.steps)) { steps = d.steps.map(Boolean); paint(false); }
      if (typeof d.snoozeUntil === 'number') {
        try { localStorage.setItem(K_SNOOZE, String(d.snoozeUntil)); } catch {}
        if (now() < d.snoozeUntil) { root.remove(); }
      }
      if (d.dismissed) { try { localStorage.setItem(K_DISMIS, '1'); } catch {} root.remove(); }
    });
    addEventListener('storage', (ev) => {
      if (ev.key === K_STEPS) {
        try { const v = JSON.parse(ev.newValue || 'null'); if (Array.isArray(v) && v.length === labels.length){ steps = v.map(Boolean); paint(false); } } catch {}
      } else if (ev.key === K_SNOOZE) {
        const until = parseInt(ev.newValue || '0', 10); if (until && now() < until) root.remove();
      } else if (ev.key === K_DISMIS) {
        if (ev.newValue === '1') root.remove();
      }
    });

    // Server helpers
    function syncServer(){
      if (!syncUrl) return;
      const payload = { steps };
      if (window.htmx) {
        try { htmx.ajax('POST', syncUrl, { values: payload, headers: { 'X-CSRFToken': csrf }, swap: 'none' }); } catch {}
      } else {
        try { fetch(syncUrl, { method:'POST', headers:{ 'Content-Type':'application/json','X-CSRFToken': csrf }, credentials:'same-origin', body: JSON.stringify(payload) }); } catch {}
      }
    }
    function dismissServer(){
      if (!dismissUrl) return;
      if (window.htmx) {
        try { htmx.ajax('POST', dismissUrl, { headers:{'X-CSRFToken': csrf}, swap:'none' }); } catch {}
      } else {
        try { fetch(dismissUrl, { method:'POST', headers:{'X-CSRFToken': csrf}, credentials:'same-origin' }); } catch {}
      }
    }

    // Paint UI
    function paint(announce=true){
      $$('#ob-steps [data-step]').forEach(li => {
        const i = +li.dataset.step;
        const on = !!steps[i];
        const btn = $('[data-toggle]', li);
        const tic = btn?.firstElementChild;
        const lbl = $('[data-label]', li);
        if (btn) {
          btn.setAttribute('aria-checked', String(on));
          btn.classList.toggle('bg-yellow-400', on);
          btn.classList.toggle('text-black', on);
        }
        if (tic) tic.classList.toggle('hidden', !on);
        if (lbl) {
          lbl.classList.toggle('text-yellow-200', on);
          lbl.classList.toggle('font-semibold', on);
          lbl.classList.toggle('text-zinc-300', !on);
        }
      });
      const done = steps.reduce((a,b)=>a+(b?1:0),0), total = labels.length, pct = total ? Math.round(done/total*100) : 0;
      const bar = document.getElementById('ob-bar'); const txt = document.getElementById('ob-progress');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = `${done} / ${total} complete`;
      if (announce) $('#admin-ob-sr')?.append?.(document.createTextNode(`Progress ${done} of ${total}. `));
      try { window.fcTrack && window.fcTrack('onboarding_progress', { done, total, pct }); } catch {}
      dispatchEvent(new CustomEvent('fc:onboarding:progress', { detail: { done, total, pct } }));
    }

    // Persist + broadcast + optional server
    function persist(){
      try { localStorage.setItem(K_STEPS, JSON.stringify(steps)); } catch {}
      try { bc?.postMessage({ steps }); } catch {}
      syncServer();
    }

    function toggle(i){
      const was = !!steps[i];
      steps[i] = !was;
      paint();
      persist();
      if (!was) confettiLite();
      if (steps.every(Boolean)) setTimeout(()=> close(true), 350);
    }
    function quick(i){
      if (!steps[i]) { steps[i] = true; paint(); persist(); confettiLite(); }
    }

    // Open/close + trap
    let untrap = null;
    function open(){
      root.style.opacity = '1';
      root.style.transform = 'translateY(0)';
      try { root.focus({preventScroll:true}); } catch {}
      untrap = trapFocus(root);
      try { window.fcTrack && window.fcTrack('onboarding_open', { ns }); } catch {}
    }
    function close(persistFlag){
      root.style.opacity = '0';
      root.style.transform = 'translateY(6px)';
      setTimeout(()=> root.remove(), reduce ? 0 : 220);
      untrap?.(); untrap = null;
      if (persistFlag) {
        try { localStorage.setItem(K_DISMIS, '1'); } catch {}
        try { bc?.postMessage({ dismissed: true }); } catch {}
        dismissServer();
        try { window.fcTrack && window.fcTrack('onboarding_dismiss', { ns }); } catch {}
      }
    }

    // Bindings
    $('#ob-dismiss')?.addEventListener('click', () => close(true));
    $('#ob-reset')?.addEventListener('click', () => {
      steps = new Array(labels.length).fill(false);
      paint();
      try{ localStorage.removeItem(K_STEPS); }catch{}
      persist();
    });
    $('#ob-complete-all')?.addEventListener('click', () => {
      steps = new Array(labels.length).fill(true);
      paint();
      persist();
      confettiLite();
    });
    $('#ob-snooze')?.addEventListener('click', () => {
      const until = now() + 24*60*60*1000; // 24h
      try { localStorage.setItem(K_SNOOZE, String(until)); } catch {}
      try { bc?.postMessage({ snoozeUntil: until }); } catch {}
      try { window.fcTrack && window.fcTrack('onboarding_snooze', { ns, hours: 24 }); } catch {}
      root.remove();
    });

    $$('#ob-steps [data-toggle]').forEach(btn => {
      const idx = +btn.closest('[data-step]').dataset.step;
      btn.addEventListener('click', () => toggle(idx));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(idx); }
      });
    });
    $$('[data-quick]').forEach(a => a.addEventListener('click', () => {
      const i = +a.dataset.quick; quick(i);
      try { window.fcTrack && window.fcTrack('onboarding_quick', { step: i }); } catch {}
    }));

    // Show after tiny delay (respect motion prefs)
    setTimeout(open, reduce ? 0 : 120);

    // Global ESC to close
    document.addEventListener('keydown', (e)=> { if (e.key === 'Escape') close(true); }, { passive:true });

    // Concierge tip (rate-limited)
    try {
      const K_TIP = 'ai_tip_last';
      const last = parseInt(localStorage.getItem(K_TIP) || '0', 10);
      const t = now();
      if (t - last > 6*60*60*1000) {
        setTimeout(()=> {
          tip.classList.remove('opacity-0','translate-y-2');
          setTimeout(()=> tip.classList.add('opacity-0','translate-y-2'), 4000);
        }, 1500);
        localStorage.setItem(K_TIP, String(t));
      }
    } catch {}

    // Initial paint
    paint();

    // Alpine adapter (optional)
    window.AdminOnboarding = {
      toggle: (i)=> toggle(i),
      quick:  (i)=> quick(i),
      reset:  ()=> $('#ob-reset')?.click(),
      close:  (persist=true)=> close(persist),
      get steps(){ return steps.slice(); },
      set steps(v){ if (Array.isArray(v) && v.length===labels.length){ steps = v.map(Boolean); paint(); persist(); } }
    };
  })();
