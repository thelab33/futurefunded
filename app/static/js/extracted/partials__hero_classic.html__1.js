<script type="module">
/**
 * FundChamps • Scoreboard Hero Ultra v6.1
 * Adds: periodic polling (jitter/backoff) + optional Socket.IO live updates.
 */
(() => {
  const ROOT_ID = '{{ IDP }}';
  const root = document.getElementById(ROOT_ID);
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  const $  = (sel, r = root) => r.querySelector(sel);
  const $$ = (sel, r = root) => Array.from(r.querySelectorAll(sel));
  const on = (el, evt, cb, opts) => el && el.addEventListener(evt, cb, opts);
  const raf = (fn) => requestAnimationFrame(fn);
  const toNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const hidden = () => document.visibilityState !== 'visible';
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- DOM + DATA (already in your v6 script) ---------- */
  const raisedEl     = $('[data-role="raised"]');
  const goalEl       = $('[data-role="goal"]');
  const pctEl        = $('[data-role="pct"]');
  const trackEl      = $('.track');
  const nativeMeter  = $('meter.meter');
  const chipBtns     = $$('.chip-btn[data-amt]');
  const donateBtn    = $('#' + ROOT_ID + '-donate');
  const donateAmtEl  = donateBtn?.querySelector('.amt');
  const monthlyTgl   = $('#' + ROOT_ID + '-monthly');
  const shareBtn     = $('#' + ROOT_ID + '-share');
  const shareLive    = $('#' + ROOT_ID + '-share-live');
  const deadlineOut  = $('#' + ROOT_ID + '-deadline');
  const qrImg        = $('#' + ROOT_ID + '-qr');
  const bannerDonate = document.querySelector('[data-cta="donate-banner"]');

  const RAISED   = toNum(root.dataset.raised, 0);
  const GOAL     = Math.max(1, toNum(root.dataset.goal, 1));
  const DEADLINE = root.dataset.deadline || '';
  const CURRENCY = root.dataset.currency || 'USD';
  const LOCALE   = navigator.language || 'en-US';

  const moneyFmt = new Intl.NumberFormat(LOCALE, { style:'currency', currency:CURRENCY, maximumFractionDigits:0 });
  const fmtMoney = (n) => moneyFmt.format(Math.max(0, toNum(n, 0)));
  const clampPct = (n) => Math.max(0, Math.min(100, n));

  function renderStats(raised = RAISED, goal = GOAL) {
    const pct = clampPct((raised / Math.max(1, goal)) * 100);
    if (raisedEl) raisedEl.textContent = fmtMoney(raised);
    if (goalEl)   goalEl.textContent   = fmtMoney(goal);
    if (pctEl)    pctEl.textContent    = `• ${Math.round(pct)}%`;
    if (trackEl)  trackEl.style.setProperty('--p', String(pct));
    if (nativeMeter) {
      nativeMeter.min = 0; nativeMeter.max = Math.max(1, goal); nativeMeter.value = Math.max(0, raised);
      nativeMeter.setAttribute('aria-valuemin','0');
      nativeMeter.setAttribute('aria-valuemax', String(Math.max(1, goal)));
      nativeMeter.setAttribute('aria-valuenow', String(Math.max(0, raised)));
    }
  }
  function updateLadder(raised = RAISED) {
    $$('.ladder .rung').forEach(r => {
      const threshold = toNum(r.dataset.threshold, 0);
      const frac = threshold > 0 ? Math.min(1, raised / threshold) : 1;
      const bar = r.querySelector('.bar');
      if (bar) bar.style.setProperty('--fill', (frac * 100) + '%');
      r.classList.toggle('reached', raised >= threshold && threshold > 0);
    });
  }
  function decorateUrl(url, { amount = 0, freq = 'one_time', content = 'cta' } = {}) {
    try {
      const u   = new URL(url, location.href);
      const cur = new URL(location.href);
      for (const k of ['utm_source','utm_medium','utm_campaign','utm_content']) {
        if (cur.searchParams.has(k) && !u.searchParams.has(k)) u.searchParams.set(k, cur.searchParams.get(k));
      }
      u.searchParams.set('utm_source',  u.searchParams.get('utm_source')  || 'hero');
      u.searchParams.set('utm_content', u.searchParams.get('utm_content') || content);
      if (amount) u.searchParams.set('amount', String(amount));
      if (freq)   u.searchParams.set('interval', freq);
      return u.toString();
    } catch { return url; }
  }
  const currentFreq = () => (monthlyTgl?.checked ? 'month' : 'one_time');
  function syncDonateUrl(amt = 0) {
    const freq = currentFreq();
    [donateBtn, bannerDonate].filter(Boolean).forEach(btn => { try { btn.href = decorateUrl(btn.href, { amount: amt, freq }); } catch {} });
    if (donateAmtEl) donateAmtEl.textContent = amt ? `+${fmtMoney(amt)}` : '';
    if (qrImg && donateBtn) {
      try {
        const qr = new URL('https://api.qrserver.com/v1/create-qr-code/');
        qr.searchParams.set('size','264x264'); qr.searchParams.set('margin','0'); qr.searchParams.set('data', donateBtn.href);
        qrImg.src = qr.toString();
      } catch {}
    }
  }

  /* ---------- Init base view ---------- */
  renderStats(); updateLadder(); syncDonateUrl(0);

  /* ---------- Deadline (unchanged) ---------- */
  let deadlineTimer = null;
  function tickDeadline(){
    if (!DEADLINE || !deadlineOut) return;
    const ms = Math.max(0, Date.parse(DEADLINE) - Date.now());
    const s = (ms/1000)|0, d=(s/86400)|0, h=((s%86400)/3600)|0, m=((s%3600)/60)|0;
    deadlineOut.textContent = ms<=0 ? 'Ended' : d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
    deadlineOut.dateTime = new Date(Date.parse(DEADLINE)).toISOString();
  }
  const startDeadline = () => { if (!DEADLINE || prefersReducedMotion) return; tickDeadline(); stopDeadline(); deadlineTimer = setInterval(() => !hidden() && tickDeadline(), 30_000); };
  const stopDeadline  = () => { if (deadlineTimer) clearInterval(deadlineTimer), (deadlineTimer=null); };

  /* ───────────────────── Live totals: polling + Socket.IO ───────────────────── */

  // Config via data-* (optional). Examples:
  // <div id="{{IDP}}" data-poll="1" data-poll-ms="90000" data-socket="1"></div>
  const POLL_ENABLED = (root.dataset.poll ?? '1') === '1';
  const POLL_MS_BASE = Math.max(15_000, toNum(root.dataset.pollMs, 75_000));  // default 75s
  const SOCKET_ENABLED = (root.dataset.socket ?? '1') === '1';

  let pollAbort = null;
  let pollTimer = null;
  let failures = 0;

  const jitter = (ms) => {
    const spread = Math.min(10_000, Math.max(2_000, Math.round(ms * 0.15)));
    return ms + (Math.random() * spread - spread/2);
  };
  const backoff = () => Math.min(5 * 60_000, (2 ** Math.min(failures, 6)) * 1000); // cap at 5min

  async function fetchTotalsOnce() {
    try {
      pollAbort?.abort();
      pollAbort = new AbortController();
      const res = await fetch('/api/totals', {
        headers: { 'Accept':'application/json' },
        cache: 'no-store',
        signal: pollAbort.signal,
      });
      if (!res.ok) throw new Error('bad status');
      const { raised, goal } = await res.json();
      failures = 0;
      raf(() => { renderStats(toNum(raised, RAISED), toNum(goal, GOAL)); updateLadder(toNum(raised, RAISED)); });
    } catch {
      failures++;
    }
  }

  function scheduleNextPoll() {
    if (!POLL_ENABLED) return;
    clearTimeout(pollTimer);
    if (hidden()) return; // pause in background
    const base = failures ? backoff() : POLL_MS_BASE;
    pollTimer = setTimeout(async () => {
      await fetchTotalsOnce();
      scheduleNextPoll();
    }, jitter(base));
  }

  function startPolling() {
    if (!POLL_ENABLED) return;
    if (hidden()) return;
    clearTimeout(pollTimer);
    // First run after a small idle to avoid competing with critical path
    const idle = 'requestIdleCallback' in window ? window.requestIdleCallback : (fn)=>setTimeout(fn, 600);
    idle(async () => { await fetchTotalsOnce(); scheduleNextPoll(); });
  }
  function stopPolling() { clearTimeout(pollTimer); pollTimer = null; pollAbort?.abort(); }

  // Socket.IO (optional and auto-safe: will no-op if not present)
  let socket = null;
  function startSocket() {
    if (!SOCKET_ENABLED) return;
    if (typeof window.io !== 'function') return; // socket.io not loaded
    try {
      socket = window.io('/', { transports: ['websocket', 'polling'], autoConnect: true, withCredentials: true });
      socket.on('connect', () => { /* Optionally: console.debug('socket connected') */ });
      // Expecting server to emit { raised, goal } on 'totals' or 'fundTotals'
      const handler = (payload = {}) => {
        raf(() => {
          renderStats(toNum(payload.raised, RAISED), toNum(payload.goal, GOAL));
          updateLadder(toNum(payload.raised, RAISED));
        });
      };
      socket.on('totals', handler);
      socket.on('fundTotals', handler);  // alternate event name
      socket.on('disconnect', () => { /* Optionally: console.debug('socket disconnected') */ });
    } catch {/* ignore */}
  }
  function stopSocket() {
    try { socket?.off?.('totals'); socket?.off?.('fundTotals'); socket?.close?.(); } catch {}
    socket = null;
  }

  /* ---------- Wire base UI events from earlier script (abridged) ---------- */
  chipBtns.forEach(btn => on(btn, 'click', () => {
    const toggled = btn.getAttribute('aria-pressed') === 'true';
    chipBtns.forEach(b => b.setAttribute('aria-pressed','false'));
    if (!toggled) btn.setAttribute('aria-pressed','true');
    const amt = toggled ? 0 : toNum(btn.dataset.amt, 0);
    syncDonateUrl(amt);
  }, { passive:true }));
  on(monthlyTgl, 'change', () => {
    const active = chipBtns.find(b => b.getAttribute('aria-pressed') === 'true');
    syncDonateUrl(active ? toNum(active.dataset.amt, 0) : 0);
  });
  on(shareBtn, 'click', async () => {
    try {
      if (navigator.share) { await navigator.share({ title: document.title, text: 'Support our season!', url: location.href }); if (shareLive) shareLive.textContent='Shared.'; }
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(location.href); if (shareLive) shareLive.textContent='Link copied.'; }
    } catch {}
    if (shareLive) setTimeout(() => (shareLive.textContent=''), 1500);
  });
  on(window, 'keydown', (e) => {
    const a = document.activeElement, typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    if (typing) return;
    if ((e.key === 'd' || e.key === 'D') && donateBtn) donateBtn.click();
    if (e.key === 'Escape') { chipBtns.forEach(b => b.setAttribute('aria-pressed','false')); syncDonateUrl(0); }
  });

  /* ---------- Start/stop lifecycles ---------- */
  startDeadline();
  startPolling();
  startSocket();

  on(document, 'visibilitychange', () => {
    if (hidden()) { stopPolling(); }
    else { startPolling(); }
  });

  on(window, 'pagehide', () => { stopDeadline(); stopPolling(); stopSocket(); }, { once:true });
})();
</script>

