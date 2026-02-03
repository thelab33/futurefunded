/* ===== FundChamps v4 (external JS) ===== */
(() => {
  'use strict';
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const body=document.body;
  const CFG={
    donateURL: body.dataset.donateUrl,
    goal: Number(body.dataset.goal||0),
    raised: Number(body.dataset.raised||0),
    totalsSSE: body.dataset.totalsSse||'',
    leaderboardAPI: body.dataset.leaderboardApi||'',
    donorWallAPI: body.dataset.donorWallApi||'',
    nextEventAt: body.dataset.nextEventAt||''
  };
  const fmtCur=new Intl.NumberFormat(body.dataset.locale||undefined,{style:'currency',currency:body.dataset.currency||'USD',maximumFractionDigits:0});
  const clampPct=n=> Math.max(0, Math.min(100, Math.round(n)));

  // Prefetch checkout on hover
  const donateLink=qs('[data-donate-link]');
  donateLink?.addEventListener('mouseover',()=>{
    try{ const u=new URL(donateLink.href||CFG.donateURL, location.origin); const l=document.createElement('link'); l.rel='prefetch'; l.href=u.toString(); document.head.appendChild(l);}catch(_){ }
  },{once:true});

  // Theme toggle + meta color + View Transitions
  (function theme(){
    const root=document.documentElement, meta=qs('#meta-theme-color');
    const setMeta=(mode)=> meta && meta.setAttribute('content', mode==='dark' ? '#0b1f44' : '#ffffff');
    try{ const saved=localStorage.getItem('data-theme'); if(saved){ root.setAttribute('data-theme', saved); setMeta(saved);} }catch(_){ }
    qs('[data-theme-toggle]')?.addEventListener('click',()=>{
      const cur=root.getAttribute('data-theme')||'dark'; const next=cur==='dark'?'light':'dark';
      if(document.startViewTransition){ document.startViewTransition(()=> root.setAttribute('data-theme',next)); } else { root.setAttribute('data-theme',next);} setMeta(next);
      try{localStorage.setItem('data-theme',next);}catch(_){}
    });
  })();

  // Countdown
  (function countdown(){
    const el=qs('[data-countdown]'); if(!el||!CFG.nextEventAt) return; const dt=Date.parse(CFG.nextEventAt); if(!isFinite(dt)) return;
    const dd=el.querySelector('[data-dd]'),hh=el.querySelector('[data-hh]'),mm=el.querySelector('[data-mm]');
    const tick=()=>{ const ms=Math.max(0,dt-Date.now()); const d=Math.floor(ms/86400000); const h=Math.floor((ms%86400000)/3600000); const m=Math.floor((ms%3600000)/60000); if(dd) dd.textContent=String(d); if(hh) hh.textContent=String(h).padStart(2,'0'); if(mm) mm.textContent=String(m).padStart(2,'0'); };
    tick(); setInterval(tick,60000);
  })();

  // Share + copy fallback
  (function share(){
    const btn=qs('[data-share]');
    btn?.addEventListener('click',async()=>{
      const url=location.href; const payload={title:document.title,text:'Support our season!',url};
      try{ if(navigator.share){ await navigator.share(payload); toast('Link shared','success'); } else { await navigator.clipboard.writeText(url); toast('Link copied','success'); } }
      catch(_){ toast('Unable to share','danger'); }
    });
  })();

  // Donate modal
  (function donate(){
    const dlg=qs('#donate-modal'); if(!dlg) return; const link=qs('[data-donate-link]'); const input=qs('[data-donate-input]');
    const openers=qsa('[data-open-donate]'); const closers=[qs('.donate-modal__close')];
    let lastActive=null;

    const sanitize=(v)=> String(v||'').replace(/[^0-9]/g,'');
    const setAmt=(amt)=>{ const a=parseInt(sanitize(amt),10)||0; if(input) input.value = a ? String(a) : ''; updateLink(a); };
    const updateLink=(amt)=>{ if(!link) return; try{ const u=new URL(link.getAttribute('href')||CFG.donateURL, location.origin); if(amt>0) u.searchParams.set('amount', String(amt)); else u.searchParams.delete('amount'); link.href=u.toString(); }catch(_){ } };

    openers.forEach(btn=>btn.addEventListener('click',()=>{ lastActive=document.activeElement; dlg.showModal(); dlg.addEventListener('close',()=>{ lastActive?.focus(); },{once:true}); }));
    closers.filter(Boolean).forEach(btn=>btn.addEventListener('click',()=>dlg.close()));

    qsa('.donate-modal__presets [data-amount]')
      .forEach(btn=>btn.addEventListener('click',()=> setAmt(btn.dataset.amount)));

    input?.addEventListener('input',()=> setAmt(input.value));
    input?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); link?.click(); }});
  })();

  // Sticky donate reveal when hero leaves viewport
  (function sticky(){
    const bar=qs('[data-sticky]'); if(!bar) return; const hero=qs('#hero'); const close=qs('[data-sticky-close]');
    const hide=()=> bar.setAttribute('hidden',''); const show=()=> bar.removeAttribute('hidden');
    close?.addEventListener('click', hide);
    if(!hero || !('IntersectionObserver' in window)) { show(); return; }
    const io=new IntersectionObserver((entries)=>{
      entries.forEach(e=>{ if(e.isIntersecting) hide(); else show(); });
    },{threshold:0.25});
    io.observe(hero);
  })();

  // Membership interval switcher (monthly/yearly)
  (function plans(){
    const switcher=qs('[data-interval-switch]'); if(!switcher) return; const cards=qsa('[data-plan-card]');
    const setIntervalMode=(mode)=>{
      cards.forEach(card=>{
        const amt=Number(card.dataset[mode==='year'?'amountYear':'amountMonth']||0);
        const price=qs('[data-price]',card); const amtEl=price?.querySelector('.price-amount'); const cadEl=price?.querySelector('.plan__cadence');
        if(amtEl) amtEl.textContent=fmtCur.format(amt);
        if(cadEl) cadEl.textContent = mode==='year' ? '/year' : '/month';
        // Update join button deep data
        const btn=qs('[data-plan]',card); if(btn){ try{ const d=JSON.parse(btn.dataset.plan); d.amount=amt; btn.dataset.plan=JSON.stringify(d);}catch(_){}}
      });
    };
    switcher.addEventListener('click',(e)=>{
      const tab=e.target.closest('[data-interval]'); if(!tab) return; const mode=tab.dataset.interval; qsa('[data-interval]',switcher).forEach(b=>b.classList.toggle('is-active', b===tab)); setIntervalMode(mode);
    });
  })();

  // Leaderboard + Donor wall (progressive enhancement)
  (function dataBlocks(){
    const lb=qs('#lb'); const wall=qs('#donor-wall');
    const renderLB=(items=[])=>{
      if(!lb) return; lb.setAttribute('aria-busy','false'); lb.innerHTML='';
      items.slice(0,12).forEach(it=>{
        const el=document.createElement('div'); el.className='card'; el.style.minWidth='200px';
        el.innerHTML=`<b>${escapeHtml(it.name||'Anonymous')}</b><div class="sub muted">${fmtCur.format(it.amount||0)}</div>`;
        lb.appendChild(el);
      });
      if(!items.length){ lb.innerHTML='<div class="card">Be the first sponsor ✨</div>'; }
    };
    const renderWall=(items=[])=>{
      if(!wall) return; wall.setAttribute('aria-busy','false'); wall.innerHTML='';
      items.slice(0,18).forEach(it=>{
        const el=document.createElement('div'); el.className='card';
        el.innerHTML=`<b>${escapeHtml(it.name||'Anonymous')}</b><div class="sub muted">${it.note?escapeHtml(it.note):fmtCur.format(it.amount||0)}</div>`;
        wall.appendChild(el);
      });
      if(!items.length){ wall.innerHTML='<div class="card">No gifts yet — yours can be first!</div>'; }
    };
    const escapeHtml=(s)=> String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

    if(CFG.leaderboardAPI){ fetch(CFG.leaderboardAPI).then(r=>r.json()).then(renderLB).catch(()=>renderLB([])); } else { renderLB([]); }
    if(CFG.donorWallAPI){ fetch(CFG.donorWallAPI).then(r=>r.json()).then(renderWall).catch(()=>renderWall([])); } else { renderWall([]); }
  })();

  // Live totals via SSE (optional)
  (function liveTotals(){
    if(!CFG.totalsSSE || !('EventSource' in window)) return; const es=new EventSource(CFG.totalsSSE);
    es.addEventListener('message',(ev)=>{
      try{ const data=JSON.parse(ev.data||'{}'); const raised=Number(data.raised||CFG.raised); const goal=Number(data.goal||CFG.goal||1); const pct=clampPct((raised/goal)*100);
        qsa('[data-raised-live]').forEach(el=> el.textContent=fmtCur.format(raised));
        qsa('[data-pct-live]').forEach(el=> el.textContent=`${pct}%`);
        qsa('.mini-dock__fill').forEach(el=> el.style.setProperty('--pct', pct+'%'));
        qsa('.sticky-donate__fill').forEach(el=> el.style.setProperty('--pct', pct+'%'));
      }catch(_){ }
    });
  })();

  // Cookie banner
  (function cookies(){
    const key='cookie-ok-v1'; const banner=qs('[data-cookie]'); if(!banner) return;
    try{ if(localStorage.getItem(key)) return; }catch(_){ }
    banner.removeAttribute('hidden');
    qs('[data-cookie-accept]')?.addEventListener('click',()=>{ try{localStorage.setItem(key,'1');}catch(_){ } banner.setAttribute('hidden',''); });
  })();

  // Toaster
  function toast(msg,type='info'){
    const wrap=qs('#toaster'); if(!wrap) return; const el=document.createElement('div'); el.className=`card toast toast--${type}`; el.textContent=msg; wrap.appendChild(el); setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 1600);
  }
})();
