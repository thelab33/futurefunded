(() => {
    if (window.__fpPanel) return; window.__fpPanel = true;
    const $ = (s, r=document) => r.querySelector(s);

    // Countdown (defaults: if no deadline, we leave zeros or derive from page if you prefer)
    (function(){
      const rootDeadline = document.getElementById('fc-hero')?.dataset?.deadline || '';
      const ddl = {{ deadline_dt|tojson }} || rootDeadline || '';
      if (!ddl) return; // keep the cells if not configured
      const target = new Date(ddl); if (isNaN(target)) return;
      const pad = v => String(v).padStart(2,'0');
      const set = (id,val) => { const el = $('#'+id); if (el) el.textContent = val; };
      const tick = () => {
        const t = Math.max(0, target.getTime() - Date.now());
        const dd = Math.floor(t/86400000),
              hh = Math.floor((t%86400000)/3600000),
              mm = Math.floor((t%3600000)/60000),
              ss = Math.floor((t%60000)/1000);
        set('fp-ct-days', String(dd));
        set('fp-ct-hrs',  pad(hh));
        set('fp-ct-min',  pad(mm));
        set('fp-ct-sec',  pad(ss));
      };
      tick(); setInterval(tick, 1000);
      const dl = $('#fp-deadline');
      if (dl && !{{ (deadline_dt|default('')) and 'true' or 'false' }}){
        try{ dl.dateTime = target.toISOString(); dl.textContent = target.toISOString().slice(0,19).replace('T',' '); }catch{}
      }
    })();

    // Meter updater (listens to global fc:meter:update as well)
    (function(){
      const nf = new Intl.NumberFormat(undefined,{ maximumFractionDigits:0 });
      const fmt$ = n => '$' + nf.format(Math.round(+n||0));
      const bar   = $('#fp-bar');
      const pctEl = $('#fp-pct');
      const raisedEl = $('#fp-raised');
      const goalEl   = $('#fp-goal');
      const nextEl   = $('#fp-next');

      function nextText(r,g){
        if(!g) return 'Great momentum — keep it rolling!';
        const T=[.25,.5,.75,1], p=g?(r/g):0;
        for(const t of T){ if(p<t) return `Only ${fmt$((g*t)-r)} to reach ${Math.round(t*100)}%`; }
        return 'Great momentum — keep it rolling!';
      }

      function setMeter(r,g){
        const R=+r||0, G=Math.max(0,+g||0), P=Math.max(0,Math.min(100,G?(R/G*100):0));
        if (bar)     bar.style.width = P.toFixed(1) + '%';
        if (pctEl)   pctEl.textContent = P.toFixed(1);
        if (raisedEl)raisedEl.textContent = fmt$(R);
        if (goalEl)  goalEl.textContent   = fmt$(G);
        document.querySelectorAll('.chip').forEach(c=>{
          const m=+c.dataset.m||0, hit=P>=m;
          c.style.background = hit ? 'rgba(250,204,21,.9)' : 'rgba(255,255,255,.06)';
          c.style.color      = hit ? '#111827' : '';
          c.style.boxShadow  = hit ? '0 0 0 3px rgba(250,204,21,.25)' : '';
        });
        nextEl && (nextEl.textContent = nextText(R,G));
        const sr = document.getElementById('sr-live');
        if (sr) sr.textContent = `Progress: ${P.toFixed(1)}% funded — ${fmt$(R)} raised of ${fmt$(G)}.`;
      }

      setMeter({{ _fr|round(0) }}, {{ _goal|round(0) }});
      addEventListener('fc:meter:update', ev => { const d=ev.detail||{}; setMeter(d.raised,d.goal); }, {passive:true});
    })();

    // Payment link aware quick-donate
    async function getCfg(){
      try{
        const r = await fetch('/api/payments/config', { headers: { accept: 'application/json' } });
        if (!r.ok) throw 0; return await r.json();
      }catch{ return {}; }
    }
    async function pay(amount){
      const c = await getCfg(); const link = c.payment_link_url || c.link || {{ stripe_payment_link|tojson }};
      const cents = Math.max(0, Math.round((Number(amount)||0)*100));
      if (link){
        const sep = link.includes('?') ? '&' : '?';
        location.assign(`${link}${sep}client_reference_id=${encodeURIComponent(String(cents||0))}&utm_source=site&utm_medium=panel&utm_campaign=fundraiser`);
      }else{
        location.assign('/donate?amount=' + encodeURIComponent(String(amount||0)));
      }
    }
    document.querySelectorAll('#fundraiser-panel [data-amount]').forEach(b=>{
      b.addEventListener('click',()=>pay(+b.getAttribute('data-amount')||0),{passive:true});
    });
  })();
