{% endif %}
  (() => {
    const root = document.getElementById('admin-onboarding');
    const tip  = document.getElementById('ai-concierge-tip');
    if (!root || root.__init) return; root.__init = true;

    // Utils
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection?.saveData === true);
    const $ = (sel, el = document) => el.querySelector(sel);
    const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
    const getKey  = () => root.dataset.key || 'adminOnboardSteps:global';
    const getSync = () => root.dataset.sync || '';
    const getCSRF = () => root.dataset.dc || (document.cookie.match(/(?:^|;\\s*)csrf_token=([^;]+)/)?.[1] || '');

    function confettiLite(){ try { window.launchConfetti?.({ particleCount: 60, spread: 80, origin: { y: .6 } }); } catch(_){} }

    // Focus trap
    function trapFocus(container){
      const onKey = (e) => {
        if (e.key !== 'Tab') return;
        const list = $$('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])', container).filter(el => !el.disabled);
        if (!list.length) return;
        const first = list[0], last = list[list.length-1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      };
      container.addEventListener('keydown', onKey);
      return () => container.removeEventListener('keydown', onKey);
    }

    // State
    const labels = {{ step_labels|tojson if tojson is defined else '["Visit Dashboard","Invite Sponsors","Import Contacts"]' }};
    let steps = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(getKey()) || 'null');
        return (Array.isArray(saved) && saved.length === labels.length) ? saved : new Array(labels.length).fill(false);
      } catch { return new Array(labels.length).fill(false); }
    })();

    // Cross-tab sync
    let bc = null;
    try { bc = new BroadcastChannel(getKey()); bc.onmessage = (ev) => { if (Array.isArray(ev.data)) { steps = ev.data; paint(); } }; } catch {}

    // Paint UI
    function paint(){
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
      if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(done)); }
      if (txt) txt.textContent = `${done} / ${total} complete`;
      window.dispatchEvent(new CustomEvent('fc:onboarding:progress', { detail: { done, total, pct } }));
    }

    function persist(){
      try { localStorage.setItem(getKey(), JSON.stringify(steps)); } catch {}
      try { bc?.postMessage(steps); } catch {}
      const syncUrl = getSync();
      if (syncUrl) {
        const payload = { steps };
        if (window.htmx) {
          try { htmx.ajax('POST', syncUrl, { values: payload, headers: { 'X-CSRFToken': getCSRF() }, swap: 'none' }); } catch {}
        } else {
          try { fetch(syncUrl, { method:'POST', headers:{ 'Content-Type':'application/json','X-CSRFToken': getCSRF() }, credentials:'same-origin', body: JSON.stringify(payload) }); } catch {}
        }
      }
    }

    function toggle(i){
      const was = !!steps[i];
      steps[i] = !was;
      paint(); persist();
      if (!was) confettiLite();
      if (steps.every(Boolean)) { setTimeout(()=> close(true), 350); }
    }
    function quick(i){
      if (!steps[i]) { steps[i] = true; paint(); persist(); confettiLite(); }
    }

    // Bindings
    const dismissBtn = $('#ob-dismiss');
    dismissBtn?.addEventListener('click', (e) => {
      // If HTMX is present and hx-post is configured, let HTMX perform the POST to avoid double-submit.
      const hasHX = !!window.htmx && dismissBtn.hasAttribute('hx-post');
      if (hasHX) {
        e.preventDefault();
        try {
          htmx.ajax('POST', dismissBtn.getAttribute('hx-post'), {
            headers: { 'X-CSRFToken': getCSRF() },
            swap: 'none'
          });
        } catch {}
        close(true, /*skipServer*/ true);
      } else {
        e.preventDefault();
        close(true); // will call our fetch fallback
      }
    });

    $('#ob-reset')?.addEventListener('click', () => {
      steps = new Array(labels.length).fill(false);
      paint();
      try{ localStorage.removeItem(getKey()); }catch{}
      persist();
    });

    $$('#ob-steps [data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => toggle(+btn.closest('[data-step]').dataset.step));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(+btn.closest('[data-step]').dataset.step); }
      });
    });

    $$('[data-quick]').forEach(a => a.addEventListener('click', () => quick(+a.dataset.quick)));

    // Dismiss server call (fallback when HTMX not used)
    function dismissServer(){
      const url = {{ href_dismiss|tojson if tojson is defined else '"' ~ href_dismiss ~ '"' }};
      const csrf = getCSRF();
      if (window.htmx) {
        try { htmx.ajax('POST', url, { headers:{'X-CSRFToken': csrf}, swap:'none' }); } catch {}
      } else {
        try { fetch(url, { method:'POST', headers:{'X-CSRFToken': csrf}, credentials:'same-origin' }); } catch {}
      }
    }

    // Open/close + trap
    let untrap = null;
    function open(){
      root.style.opacity = '1';
      root.style.transform = 'translateY(0)';
      root.focus();
      untrap = trapFocus(root);
    }
    function close(persistFlag, skipServer = false){
      root.style.opacity = '0';
      root.style.transform = 'translateY(6px)';
      setTimeout(()=> root.remove(), reduce ? 0 : 220);
      untrap?.(); untrap = null;
      if (persistFlag) {
        try { localStorage.removeItem(getKey()); } catch {}
        if (!skipServer) dismissServer();
      }
    }

    // Show after tiny delay
    setTimeout(open, reduce ? 0 : 120);

    // Esc to close
    document.addEventListener('keydown', (e)=> { if (e.key === 'Escape') close(true); }, { passive:true });

    // Concierge tip (rate-limited)
    try {
      const last = parseInt(localStorage.getItem('ai_tip_last') || '0', 10);
      const now = Date.now();
      if (now - last > 6*60*60*1000) {
        setTimeout(()=> {
          tip.classList.remove('opacity-0','translate-y-2');
          setTimeout(()=> tip.classList.add('opacity-0','translate-y-2'), 4000);
        }, 1500);
        localStorage.setItem('ai_tip_last', String(now));
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
  {% if script_close is defined %}{{ script_close() }}{% else %}
