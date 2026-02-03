(() => {
  if (window.__tiersBound) return; window.__tiersBound = true;

  const root = document.getElementById('tiers');
  const grid = document.getElementById('tiers-grid');
  if (!root || !grid) return;

  const donateUrl   = grid.dataset.donateUrl || '/donate';
  const statsUrl    = grid.dataset.statsUrl  || '/stats';
  const HAS_STRIPE  = (grid.dataset.hasStripe === '1');
  const SPL         = grid.dataset.spl || '';
  const CURRENCY    = grid.dataset.currency || 'USD';
  const TEAM_NAME   = grid.dataset.team || 'FundChamps';
  const prefersReduced = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const nfmt = (v) => new Intl.NumberFormat(navigator.language || 'en-US', { style:'currency', currency: CURRENCY, maximumFractionDigits:0 }).format(v);

  const parseAmt = (raw) => {
    if (raw == null) return null;
    const s = String(raw);
    if (/custom/i.test(s)) return null;
    const n = parseFloat(s.replace(/[^0-9.]/g,'')); return Number.isFinite(n) ? n : null;
  };

  /* ---------- Spotlight follow (motion-safe) ---------- */
  if (!prefersReduced){
    root.addEventListener('pointermove', (e)=>{
      const card = e.target.closest?.('.glassy-card'); if(!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--fc-spot-x', (((e.clientX - r.left)/Math.max(1,r.width))*100)+'%');
      card.style.setProperty('--fc-spot-y', (((e.clientY - r.top)/Math.max(1,r.height))*100)+'%');
    }, {passive:true});
  }

  /* ---------- Flip behavior + ARIA ---------- */
  function toggleCard(card){
    card.classList.toggle('card-flipped');
    card.setAttribute('aria-expanded', String(card.classList.contains('card-flipped')));
  }
  document.addEventListener('click', (e) => {
    const card = e.target.closest?.('.flip-card'); if (!card) return;
    if (e.target.closest('[data-tier-cta],[data-share],button')) return;
    toggleCard(card);
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.flip-card'); if (!card) return;
    if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement?.hasAttribute('data-tier-cta')) return; e.preventDefault(); toggleCard(card); }
  });

  /* ---------- UTM + Checkout ---------- */
  function withUtm(u, tier){
    try{
      const url = new URL(u, location.origin);
      url.searchParams.set('utm_source','tiers');
      url.searchParams.set('utm_medium','web');
      url.searchParams.set('utm_campaign','sponsorship');
      url.searchParams.set('utm_content', String(tier||'').toLowerCase());
      return url.toString();
    }catch{ return u; }
  }
  function vipMaybe({ tier, amount }) {
    const high = (amount && amount >= 2500) || /platinum|gold|vip/i.test(String(tier));
    if (!high) return;
    try {
      window.dispatchEvent(new CustomEvent('fc:vip:hit', { detail: { threshold: amount || tier, source: 'tiers' }}));
      window.dispatchEvent(new CustomEvent('fc:funds:update', { detail: { sponsorName: `VIP ${tier} Sponsor` }}));
    } catch {}
  }
  async function startCheckout({ tier, amount, card }) {
    const priceId = card?.dataset?.priceId || null;
    const checkoutUrl = card?.dataset?.checkoutUrl || null;
    try { window.dispatchEvent(new CustomEvent('fundchamps:tiers:cta', { detail: { tier, amount, priceId } })); } catch {}

    if (checkoutUrl) { try { location.assign(withUtm(checkoutUrl, tier)); } catch {} vipMaybe({ tier, amount }); return; }
    if (HAS_STRIPE && SPL) { try { location.assign(withUtm(SPL, tier)); } catch {} vipMaybe({ tier, amount }); return; }
    if (typeof window.openDonationModal === 'function') { window.openDonationModal({ tier, amount, priceId }); vipMaybe({ tier, amount }); return; }

    try {
      const resp = await fetch(donateUrl, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ tier, amount, price_id: priceId }) });
      if (resp.ok) { const data = await resp.json().catch(()=>({})); if (data?.url) { location.assign(withUtm(data.url, tier)); return; } }
    } catch {}
    const qs = new URLSearchParams({ tier, amount: amount ?? 'custom' }).toString(); location.assign('/donate?' + qs);
  }

  /* ---------- Monthly toggle + localization ---------- */
  const monthlyToggle = document.getElementById('tiers-monthly');
  const PRICE_MODE_KEY = 'fc_tiers_price_mode';
  try { monthlyToggle.checked = (localStorage.getItem(PRICE_MODE_KEY) === 'monthly'); } catch {}
  function renderPrices(){
    const monthly = !!monthlyToggle?.checked;
    document.querySelectorAll('#tiers-grid .flip-card .price').forEach(el=>{
      const rawAmt = el.getAttribute('data-amt');
      const base = parseAmt(rawAmt);
      if (!base){
        el.textContent = monthly ? 'Custom / mo' : (el.getAttribute('data-original') || 'Custom package');
        return;
      }
      if (monthly){
        const per = Math.max(1, Math.round(base/12));
        el.textContent = nfmt(per).replace(/\s/g,'') + '/mo';
      } else {
        el.textContent = nfmt(base).replace(/\s/g,'');
      }
    });
    try { localStorage.setItem(PRICE_MODE_KEY, monthly ? 'monthly' : 'once'); } catch {}
  }
  monthlyToggle?.addEventListener('change', renderPrices);
  renderPrices();

  /* ---------- Scarcity meter + labels ---------- */
  function updateSlotsUI(card){
    const slotsLeft = Math.max(0, parseInt(card.dataset.slots||'0',10));
    const cap = Math.max(1, parseInt(card.dataset.cap||'1',10));
    const filled = Math.max(0, cap - slotsLeft);
    const pct = Math.min(100, Math.round((filled/cap)*100));
    const bar = card.querySelector('.slots > i'); if (bar){ bar.style.width = pct + '%'; }
    const flag = card.querySelector('[data-slots-left]');
    const btn  = card.querySelector('[data-tier-cta]');
    if (flag){
      if (slotsLeft <= 0){
        flag.textContent = 'Sold out'; flag.classList.add('text-red-300'); card.classList.add('soldout'); btn && (btn.disabled = true);
        card.querySelector('[itemprop="availability"]')?.setAttribute('content','https://schema.org/SoldOut');
      } else if (slotsLeft <= Math.ceil(cap*0.25)){
        flag.textContent = `Going fast — ${slotsLeft} left`; flag.classList.remove('text-red-300'); card.classList.remove('soldout'); btn && (btn.disabled = false);
        card.querySelector('[itemprop="availability"]')?.setAttribute('content','https://schema.org/InStock');
      }
    }
  }
  document.querySelectorAll('#tiers-grid .flip-card').forEach(updateSlotsUI);

  /* ---------- CTA handler + optimistic slot decrement ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-tier-cta]'); if (!btn) return;
    const card = btn.closest('.flip-card'); if (btn.disabled || card.classList.contains('soldout')) return;
    const title  = card?.dataset?.tier || 'Custom';
    const amount = parseAmt(card?.dataset?.amount);

    const slotEl = card.querySelector('[data-slots-left]');
    let slots = parseInt(card.dataset.slots || '0', 10);
    if (slotEl && slots > 0) {
      const next = Math.max(0, slots - 1);
      card.dataset.slots = String(next);
      slotEl.textContent = next > 0 ? `Only ${next} left` : 'Sold out';
      if (next === 0) {
        slotEl.classList.add('text-red-300'); card.classList.add('soldout'); btn.disabled = true;
        card.querySelector('[itemprop="availability"]')?.setAttribute('content','https://schema.org/SoldOut');
      }
      updateSlotsUI(card);
    }
    startCheckout({ tier: title, amount, card });
  });

  /* ---------- Share deep link per tier ---------- */
  async function shareTier(card){
    const tier = card.dataset.tier || 'Sponsor';
    const url = new URL(location.href); url.hash = 'sponsor=' + encodeURIComponent(tier);
    const shareData = { title: `${tier} Sponsor — ${TEAM_NAME}`, text: `Join as a ${tier} Sponsor for ${TEAM_NAME}!`, url: url.toString() };
    try{ if (navigator.share){ await navigator.share(shareData); return; } }catch{}
    try{
      await navigator.clipboard.writeText(url.toString());
      const msg = Object.assign(document.createElement('div'), { textContent:'Link copied!' });
      Object.assign(msg.style,{position:'fixed',bottom:'14px',left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.8)',color:'#fff',padding:'.4rem .6rem',borderRadius:'.5rem',zIndex:'9999'});
      document.body.appendChild(msg); setTimeout(()=>msg.remove(), 1400);
    }catch{}
  }
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest?.('[data-share]'); if (!btn) return;
    const card = btn.closest('.flip-card'); if (!card) return;
    shareTier(card);
  });

  /* ---------- Smart sorting control ---------- */
  const sortSel = document.getElementById('tiers-sort');
  function sortCards(mode){
    const cards = Array.from(grid.querySelectorAll('.flip-card'));
    const score = (c)=>{
      const amt = parseAmt(c.dataset.amount) || 0;
      const slots = parseInt(c.dataset.slots||'0',10);
      const cap = Math.max(1, parseInt(c.dataset.cap||'1',10));
      const availPct = slots/cap;
      const popular = c.querySelector('.ribbon') ? 1 : 0;
      return (popular*3) + (amt/5000) + (availPct*0.5);
    };
    cards.sort((a,b)=>{
      if (mode==='price-desc') return (parseAmt(b.dataset.amount)||0) - (parseAmt(a.dataset.amount)||0);
      if (mode==='price-asc')  return (parseAmt(a.dataset.amount)||0) - (parseAmt(b.dataset.amount)||0);
      if (mode==='availability'){
        const aAvail = (parseInt(a.dataset.slots||'0',10))/Math.max(1,parseInt(a.dataset.cap||'1',10));
        const bAvail = (parseInt(b.dataset.slots||'0',10))/Math.max(1,parseInt(b.dataset.cap||'1',10));
        return bAvail - aAvail;
      }
      return score(b) - score(a);
    });
    cards.forEach(c=>grid.appendChild(c));
  }
  sortSel?.addEventListener('change', ()=>sortCards(sortSel.value));
  sortCards('rec');

  /* ---------- In-view analytics beacons ---------- */
  try {
    const seen = new WeakSet();
    const io = new IntersectionObserver((ents)=>{
      ents.forEach(ent=>{
        if (ent.isIntersecting && !seen.has(ent.target)){
          seen.add(ent.target);
          const tier = ent.target.dataset.tier || 'Unknown';
          const detail = { tier, source:'tiers', time: Date.now() };
          window.dataLayer?.push({ event:'tiers_impression', ...detail });
          window.dispatchEvent(new CustomEvent('fundchamps:tiers:impression', { detail }));
        }
      });
    }, { rootMargin:'-10% 0px', threshold:.5 });
    document.querySelectorAll('#tiers-grid .flip-card').forEach(el=>io.observe(el));
  } catch {}

  /* ---------- Live slot polling ---------- */
  setTimeout(() => {
    const poll = async () => {
      try {
        const res = await fetch(statsUrl || '', { headers: { 'Accept': 'application/json' }});
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            data.forEach(row => {
              const title = (row?.title || '').toString();
              const slots = parseInt(row?.slots_left ?? 0, 10);
              const card = Array.from(root.querySelectorAll('.flip-card')).find(el => (el.dataset.tier||'').toLowerCase() === title.toLowerCase());
              if (!card) return;
              card.dataset.slots = String(Math.max(0, slots));
              const slotEl = card.querySelector('[data-slots-left]'); const btn = card.querySelector('[data-tier-cta]');
              if (slotEl) {
                if (slots <= 0) { slotEl.textContent = 'Sold out'; slotEl.classList.add('text-red-300'); card.classList.add('soldout'); btn && (btn.disabled = true);
                  card.querySelector('[itemprop="availability"]')?.setAttribute('content','https://schema.org/SoldOut'); }
                else { slotEl.textContent = slots <= 4 ? `Only ${slots} left` : `${slots} available`; slotEl.classList.remove('text-red-300'); card.classList.remove('soldout'); btn && (btn.disabled = false);
                  card.querySelector('[itemprop="availability"]')?.setAttribute('content','https://schema.org/InStock'); }
              }
              updateSlotsUI(card);
            });
          }
        }
      } catch {}
      setTimeout(poll, prefersReduced ? 45000 : 20000);
    };
    if (statsUrl) poll();
  }, 800);
})();
