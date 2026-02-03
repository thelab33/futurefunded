(() => {
  if (window.__LB_V61__) return; window.__LB_V61__ = true;
  const root    = document.getElementById('sponsor-leaderboard');
  const rail    = document.getElementById('ticker-rail');
  if (!root || !rail) return;
  const ctrl    = document.getElementById('ticker-ctrl');
  const speedC  = document.getElementById('speed-ctrl');
  const srLive  = document.getElementById('sr-shout');
  const srVIP   = document.getElementById('sr-vip');
  const offline = document.getElementById('offline-pill');
  const cfg = {
    reduced   : matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData,
    autoscroll: root.dataset.autoscroll !== '0',
    vipTiers  : (root.dataset.vipTiers || 'Platinum,Gold').split(',').map(x => x.trim().toLowerCase()),
    ttl       : (+root.dataset.ttlSeconds || 86400) * 1000,
    maxStore  : +root.dataset.maxStore || 48,
    dedupeWin : (+root.dataset.dedupeWindowSeconds || 600) * 1000,
    teamKey   : root.dataset.teamKey || 'global',
    api       : root.dataset.api   || '/api/shoutouts',
    spdMap    : { slow:48, normal:36, fast:24 },  // Slowing down the speed (in seconds)
    defaultSpd: (root.dataset.defaultSpeed || 'normal').toLowerCase()
  };
  const storeKey = `fc_lb_6.1:${cfg.teamKey}`;
  const esc     = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtKey  = (who, msg) => `${who.toLowerCase().trim()}|${msg.toLowerCase().trim()}`;
  const recent  = new Map();
  const debounce = (fn, ms=100) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
  const pillTpl = ({tier='General', sponsor, msg}) => {
    const badge =
      /platinum/i.test(tier) ? '✨' : /gold/i.test(tier) ? '🏅' :
      /silver/i.test(tier)   ? '🎉' : /bronze/i.test(tier) ? '🥉' : '🔥';
    return `${badge}<span class="txt"><span class="who">${esc(sponsor)}</span> <span class="msg">${esc(msg)}</span></span>`;
  };
  
  // Set the scroll speed based on the mode (slow, normal, fast)
  function setSpeed(mode) {
    const m = cfg.spdMap[mode] ? mode : 'normal';
    rail.style.setProperty('--speed-s', cfg.spdMap[m] + 's');
    if (speedC) {
      speedC.dataset.speed = m;
      speedC.setAttribute('aria-label', `Speed: ${m[0].toUpperCase()+m.slice(1)}`);
    }
  }
  setSpeed(cfg.reduced ? 'slow' : cfg.defaultSpd); // Apply the default or slow speed
  
  speedC?.addEventListener('click', () => {
    const order = ['slow','normal','fast'];
    setSpeed(order[(order.indexOf(speedC.dataset.speed)+1)%order.length]);
    tuneSpeed();
  }, { passive:true });
  
  // Pause the scrolling when necessary
  function pause(on) {
    ctrl?.setAttribute('aria-pressed', on);
    rail.style.animationPlayState = on ? 'paused' : 'running';
    if (ctrl) ctrl.textContent = on ? '▶ Play' : '⏸ Pause';
  }
  
  ctrl?.addEventListener('click', () => pause(ctrl.getAttribute('aria-pressed') !== 'true'), { passive:true });
  if (cfg.reduced || !cfg.autoscroll) pause(true);  // Pause if reduced motion or autoscroll is disabled
  
  try {
    const vp = root.querySelector('.lb__viewport');
    new IntersectionObserver(([e]) =>
      pause(!e.isIntersecting || cfg.reduced || !cfg.autoscroll), { threshold:.02 }
    ).observe(vp);
  } catch {}

  // Add shoutout items to the leaderboard
  function addItem({ tier='General', sponsor='Anonymous', msg='supported the team!' }) {
    const key = fmtKey(sponsor, msg);
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key).ts < cfg.dedupeWin) {
      const rec = recent.get(key); rec.ts = now; rec.count++;
      let bump = rec.el.querySelector('.x-times');
      if (!bump) bump = Object.assign(document.createElement('b'), { className:'x-times' });
      bump.textContent = ` ×${rec.count}`;
      rec.el.appendChild(bump);
      rail.prepend(rec.el);
      return;
    }
    const el = document.createElement('span');
    const vip = cfg.vipTiers.includes(tier.toLowerCase());
    el.className = 'pill' + (vip ? ' vip':'');
    el.role = 'listitem';
    el.dataset.tier = tier;
    el.innerHTML = pillTpl({tier, sponsor, msg});
    rail.prepend(el);
    recent.set(key, { ts:now, el, count:1 });
    srLive.textContent = `${sponsor} ${msg}`;
    if (vip) srVIP.textContent = `${sponsor} made a VIP ${tier} gift!`;
    try {
      const cached = JSON.parse(localStorage.getItem(storeKey) || '[]').filter(x => now - x.ts < cfg.ttl);
      cached.unshift({ tier, sponsor, msg, ts:now });
      localStorage.setItem(storeKey, JSON.stringify(cached.slice(0, cfg.maxStore)));
    } catch {}
    tuneSpeed(); cloneLoop();
  }

  function ensurePlaceholder() {
    if (rail.querySelector('.pill:not(.placeholder):not(.headline)')) {
      document.getElementById('shoutouts-empty')?.remove(); return;
    }
    if (document.getElementById('shoutouts-empty')) return;
    const p = document.createElement('span');
    p.id = 'shoutouts-empty'; p.className = 'pill placeholder'; p.role = 'listitem';
    p.innerHTML = 'No shoutouts yet — <button type="button" class="link-btn" id="share-cta">be the first 🎉</button>';
    rail.insertBefore(p, rail.querySelector('.headline')?.nextSibling || rail.firstChild);
    p.querySelector('#share-cta').onclick = async () => {
      try {
        await (navigator.share
          ? navigator.share({ title:document.title, url:location.href })
          : navigator.clipboard.writeText(location.href));
      } catch {}
    };
  }

  const tuneSpeed = debounce(() => {
    const viewport = root.querySelector('.lb__viewport'); if (!viewport) return;
    const ratio = (rail.scrollWidth / (viewport.clientWidth||1)) / 2;
    const base = cfg.spdMap[speedC?.dataset.speed || 'normal'] || 36;
    rail.style.setProperty('--speed-s', (Math.max(.93, Math.min(2.5, ratio))*base)+'s');
  }, 120);

  new ResizeObserver(tuneSpeed).observe(rail);
  addEventListener('resize', tuneSpeed, { passive:true });

  function cloneLoop() {
    if (rail.__cloned) return; rail.__cloned = true;
    rail.querySelectorAll('.pill:not(.placeholder):not(.headline)').forEach(n => {
      const c = n.cloneNode(true); c.setAttribute('aria-hidden','true'); c.tabIndex = -1;
      rail.appendChild(c);
    });
  }

  const queue = [];
  function setOffline(on) { offline?.classList.toggle('show', on); }
  addEventListener('offline', () => setOffline(true));
  addEventListener('online', () => { setOffline(false); while (queue.length) addItem(queue.shift()); });
  
  // Fetch data for shoutouts
  (async () => {
    try { (JSON.parse(localStorage.getItem(storeKey) || '[]')).reverse().forEach(addItem); } catch {}
    try {
      const u = new URL(cfg.api, location.origin); u.searchParams.set('team', cfg.teamKey);
      const list = await fetch(u).then(r => r.ok ? r.json() : []);
      if (Array.isArray(list)) list.reverse().forEach(addItem);
    } catch {}
    ensurePlaceholder(); rail.removeAttribute('aria-busy'); cloneLoop(); tuneSpeed();
  })();

  // Handle custom shoutout events
  addEventListener('fc:shoutout', e =>
    (navigator.onLine ? addItem : queue.push.bind(queue))(e.detail||{})
  );
})();
