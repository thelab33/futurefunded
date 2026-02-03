// dev__stripe_smoke_refactor.js
// Drop-in replacement for dev__stripe_smoke.html__2.js
// Goals:
// - Convert dollars -> cents before POST
// - Robust fetch/JSON helpers w/ error surfaces
// - Clean DOM cache & small state machine
// - Elements + Headless confirmation paths
// - Accessible log toggle (uses `hidden` instead of inline display)
// - Tiny DX niceties: presets, idempotency generator, bearer persistence

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  /** Set status text + class */
  const setStatus = (msg, cls = 'muted') => {
    const el = $('status');
    if (!el) return;
    el.className = `status ${cls}`;
    el.textContent = msg;
  };

  /** Show structured/dev logs */
  const showLog = (payload) => {
    const logEl = $('log');
    const toggle = $('toggle-log');
    if (!logEl || !toggle) return;
    logEl.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = 'Hide raw log';
    logEl.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  };

  /** Floating nonce-safe fetch JSON */
  async function fetchJSON(url, init) {
    const res = await fetch(url, init);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const body = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok || (body && body.error)) {
      const message = (body && body.error && body.error.message) || (typeof body === 'string' ? body.slice(0, 240) : 'Request failed');
      const err = new Error(message);
      /** @type {any} */ (err).response = { status: res.status, body };
      throw err;
    }
    return body;
  }

  // ---------- Utilities ----------
  const msSince = (t0) => `${Math.round(performance.now() - t0)}ms`;
  const toCents = (usd) => Math.max(1, Math.round(Number(usd || 0) * 100));
  const clampInt = (n, min = 1) => Math.max(min, parseInt(String(n || 0), 10) || min);

  // ---------- Cached nodes ----------
  const amtIn = /** @type {HTMLInputElement} */ ($('amount'));
  const amtLabel = $('amt-label');
  const modeSel = /** @type {HTMLSelectElement} */ ($('mode'));
  const cardWrap = $('card-wrap');
  const threeDS = /** @type {HTMLInputElement} */ ($('threeDS'));
  const noteIn = /** @type {HTMLInputElement} */ ($('note'));
  const tokenIn = /** @type {HTMLInputElement} */ ($('token'));
  const saveTokenBtn = $('save-token');
  const idemIn = /** @type {HTMLInputElement} */ ($('idem'));
  const genIdemBtn = $('gen-idem');
  const pubkeyEl = $('pubkey');
  const readyEl = $('ready');
  const payBtn = $('pay');
  const toggleLogBtn = $('toggle-log');

  // ---------- Amount sync + presets ----------
  function syncAmount() {
    const v = clampInt(amtIn?.value || 1, 1);
    if (amtIn) amtIn.value = String(v);
    if (amtLabel) amtLabel.textContent = String(v);
  }
  on(amtIn, 'input', syncAmount);
  syncAmount();
  document.querySelectorAll('.preset').forEach((btn) => {
    on(btn, 'click', () => {
      const v = btn.getAttribute('data-amt');
      if (amtIn && v) amtIn.value = v;
      syncAmount();
    });
  });

  // ---------- Token + Idempotency ----------
  if (tokenIn) tokenIn.value = localStorage.getItem('dev_api_token') || '';
  on(saveTokenBtn, 'click', () => {
    if (!tokenIn) return;
    localStorage.setItem('dev_api_token', tokenIn.value.trim());
    setStatus('Saved bearer token', 'ok');
  });
  on(genIdemBtn, 'click', () => {
    if (!idemIn) return;
    idemIn.value = `smoke-${Math.random().toString(36).slice(2, 10)}`;
  });

  // ---------- Log toggle ----------
  on(toggleLogBtn, 'click', () => {
    const logEl = $('log');
    if (!logEl || !toggleLogBtn) return;
    const expanded = toggleLogBtn.getAttribute('aria-expanded') === 'true';
    toggleLogBtn.setAttribute('aria-expanded', String(!expanded));
    toggleLogBtn.textContent = expanded ? 'Show raw log' : 'Hide raw log';
    logEl.hidden = expanded;
  });

  // ---------- Readiness ping (optional) ----------
  (async () => {
    try {
      const r = await fetchJSON('/api/payments/readiness').catch(() => null);
      if (readyEl) {
        if (r && typeof r.stripe_ready === 'boolean') {
          readyEl.textContent = r.stripe_ready ? 'stripe: ready' : 'stripe: not-configured';
          readyEl.style.borderColor = r.stripe_ready ? 'rgba(16,185,129,.5)' : 'rgba(239,68,68,.5)';
        } else {
          readyEl.textContent = 'stripe: unknown';
        }
      }
    } catch (_) {}
  })();

  // ---------- Config -> Stripe init ----------
  let stripe; let elements; let cardElement; let stripePk = '';

  async function boot() {
    setStatus('Booting…');
    try {
      const t0 = performance.now();
      const cfg = await fetchJSON('/api/payments/config');
      stripePk = cfg?.stripe_public_key || cfg?.stripe_public || cfg?.publishable_key || '';
      if (pubkeyEl)
        pubkeyEl.textContent = `pk: ${stripePk ? stripePk.replace(/(.{10}).+/, '$1…') : '—'}`;
      if (!stripePk) throw new Error('No publishable key from /api/payments/config');
      setStatus(`Loaded config in ${msSince(t0)}`);
    } catch (e) {
      setStatus(e.message || String(e), 'err');
      throw e;
    }

    // Initialize Stripe/Elements lazily when needed
    stripe = window.Stripe(stripePk);
    elements = stripe.elements({ appearance: { theme: 'night' } });

    // Use the classic Card Element for widest compatibility
    cardElement = elements.create('card', { hidePostalCode: false });

    const ensureMounted = () => {
      const useElements = modeSel && modeSel.value === 'elements';
      if (!cardWrap) return;
      cardWrap.hidden = !useElements;
      if (useElements && !cardElement._mounted) {
        cardElement.mount('#card-element');
        cardElement._mounted = true;
      }
    };
    on(modeSel, 'change', ensureMounted);
    ensureMounted();
  }

  // ---------- Create PI ----------
  async function createIntent() {
    const headers = { 'Content-Type': 'application/json' };
    const bearer = (localStorage.getItem('dev_api_token') || '').trim();
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    const idem = (idemIn?.value || '').trim();
    if (idem) headers['Idempotency-Key'] = idem;

    const payload = {
      amount: toCents(amtIn?.value), // cents!
      currency: 'usd',
      source: 'web_smoke',
      description: 'Stripe smoke test',
      metadata: { note: (noteIn?.value || '').slice(0, 120) },
    };

    const body = await fetchJSON('/payments/stripe/intent', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    // Surface request/response in the raw log for dev visibility
    showLog({ request: '/payments/stripe/intent', headers, payload, response: body });

    const clientSecret = body.client_secret || body.clientSecret;
    if (!clientSecret) throw new Error('Missing client_secret');
    return clientSecret;
  }

  // ---------- Confirm PI ----------
  async function confirm(clientSecret) {
    if (!stripe) throw new Error('Stripe not initialized');

    const headless = modeSel && modeSel.value === 'headless';
    if (headless) {
      const pm = threeDS && threeDS.checked ? 'pm_card_threeDSecure2Required' : 'pm_card_visa';
      return stripe.confirmCardPayment(clientSecret, { payment_method: pm }, { handleActions: true });
    }
    return stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement } }, { handleActions: true });
  }

  // ---------- Pay click ----------
  on(payBtn, 'click', async () => {
    try {
      const t0 = performance.now();
      setStatus('Creating PaymentIntent…');
      const clientSecret = await createIntent();

      // Optional: peek PaymentIntent state
      try {
        const peek = await stripe.retrievePaymentIntent(clientSecret);
        if (peek?.paymentIntent) {
          showLog({
            ...JSON.parse($('log')?.textContent || '{}'),
            peek: {
              id: peek.paymentIntent.id,
              amount: peek.paymentIntent.amount,
              status: peek.paymentIntent.status,
              pm_types: peek.paymentIntent.payment_method_types,
            },
          });
        }
      } catch {}

      setStatus(`PI created in ${msSince(t0)} — confirming…`);

      const { error, paymentIntent } = await confirm(clientSecret);
      if (error) {
        setStatus(`Declined: ${error.message}`, 'err');
        showLog({ error });
        return;
      }

      if (!paymentIntent) {
        setStatus('No paymentIntent in response', 'warn');
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        setStatus(`✅ Success! ${paymentIntent.id} — $${(paymentIntent.amount / 100).toFixed(2)}`, 'ok');
      } else if (paymentIntent.status === 'requires_action') {
        setStatus(`Action required — handled by Stripe.js. Status: ${paymentIntent.status}`, 'warn');
      } else {
        setStatus(`PI status: ${paymentIntent.status}`, 'warn');
      }
      showLog({ paymentIntent });
    } catch (e) {
      setStatus(`Unexpected: ${e?.message || e}`, 'err');
      showLog(e?.stack || String(e));
    }
  });

  // ---------- Motion preference ----------
  try {
    if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.style.scrollBehavior = 'auto';
    }
  } catch {}

  // ---------- Boot ----------
  boot().catch(() => {});
})();

