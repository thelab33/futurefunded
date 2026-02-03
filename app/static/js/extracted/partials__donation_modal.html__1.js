(() => {
    const dlg = document.getElementById('donation-modal');
    if (!dlg || dlg.__init) return; dlg.__init = true;

    // --------------- Utilities ---------------
    const sr = document.getElementById('sr-live');
    const announce = (t)=>{ try{ if(sr){ sr.textContent=t } }catch(_){} };
    const reduceMotion = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Robust scroll lock (no layout jump, restores position)
    const ScrollGuard = (() => {
      let y = 0, pr = 0, hadLock = false;
      const barW = () => Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      return {
        lock(){
          if (hadLock) return;
          y = window.scrollY || document.documentElement.scrollTop || 0;
          pr = barW();
          document.documentElement.classList.add('overflow-hidden');
          document.body.classList.add('overflow-hidden');
          document.body.style.top = `-${y}px`;
          document.body.style.position = 'fixed';
          if (pr) document.body.style.paddingRight = pr + 'px';
          hadLock = true;
        },
        unlock(){
          if (!hadLock) return;
          document.documentElement.classList.remove('overflow-hidden');
          document.body.classList.remove('overflow-hidden');
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.paddingRight = '';
          window.scrollTo(0, y);
          hadLock = false;
        }
      };
    })();

    const getCSRF = () =>
      (document.cookie.match(/(?:^|;\\s*)csrf_token=([^;]+)/)?.[1] ||
       document.querySelector('meta[name="csrf-token"]')?.content ||
       {{ csrf|tojson if tojson is defined else '"' ~ csrf ~ '"' }});

    // ---- Elements
    const box   = document.getElementById('donate-box');
    const err   = document.getElementById('donate-err');
    const feeCb = document.getElementById('donate-fee');
    const nameI = document.getElementById('donor-name');
    const mailI = document.getElementById('donor-email');
    const noteI = document.getElementById('donor-note');
    const custom= document.getElementById('donate-custom');
    const payCardBtn = document.getElementById('pay-card');
    const payPPBtn   = document.getElementById('pay-paypal');
    const totalCard  = document.getElementById('pay-total-card');
    const totalPP    = document.getElementById('pay-total-pp');
    const sumBase    = document.getElementById('sum-base');
    const sumFee     = document.getElementById('sum-fee');
    const sumTotal   = document.getElementById('sum-total');
    const vipBadge   = document.getElementById('vip-badge');
    const successBox = document.getElementById('success-box');
    const amountBtns = Array.from(dlg.querySelectorAll('.fc-amt'));
    const prbTab     = document.getElementById('tab-payreq');

    // ---- Config (from server)
    const VIP   = {{ vip_threshold|int }};
    const MIN   = {{ min_amount|int }};
    const DEF   = {{ default_amount|int }};
    const CURRENCY = {{ currency|lower|tojson }};
    const ENDPOINTS = {
      stripeIntent: {{ stripe_intent_url|tojson if tojson is defined else '"' ~ stripe_intent_url ~ '"' }},
      paypalOrder : {{ paypal_order_url|tojson  if tojson  is defined else '"' ~ paypal_order_url  ~ '"' }},
      paypalCapture: {{ paypal_capture_url|tojson if tojson is defined else '"' ~ paypal_capture_url ~ '"' }}
    };

    // ---- Helpers
    const fmt = (n)=> new Intl.NumberFormat(undefined,{ style:'currency', currency: CURRENCY.toUpperCase(), minimumFractionDigits:2 }).format(+n||0);
    const cents = (n)=> Math.round((+n||0)*100);
    const feeFor = (n)=> { const pct=0.029, fix=0.30; return +(n*pct + fix).toFixed(2); }; // Stripe-like default
    const setBusy = (on)=> [payCardBtn, payPPBtn].forEach(b => b && (b.disabled = on, b.classList.toggle('opacity-60', on)));
    const showErr = (m='Something went wrong.')=> { err.textContent = m; };
    const clearErr= ()=> { err.textContent = ''; };

    function sanitizeAmountInput(){
      const raw = (custom.value||'').replace(/[^\d.]/g,'');
      const parts = raw.split('.');
      custom.value = parts.length > 1 ? parts[0] + '.' + parts.slice(1).join('').replace(/\./g,'') : parts[0];
    }

    function getAmount(){
      const btn = amountBtns.find(b => b.classList.contains('is-on'));
      const base = btn ? parseFloat(btn.dataset.amount) : parseFloat(custom.value || custom.placeholder || DEF);
      const valid = isFinite(base) ? Math.max(MIN, Math.floor(base)) : MIN;
      const fee = feeCb.checked ? feeFor(valid) : 0;
      const total = +(valid + fee).toFixed(2);
      return { base: valid, fee, total };
    }
    function paint(){
      const { base, fee, total } = getAmount();
      sumBase.textContent = fmt(base);
      sumFee.textContent  = fmt(fee);
      sumTotal.textContent= fmt(total);
      totalCard.textContent = fmt(total);
      totalPP.textContent   = fmt(total);
      vipBadge.classList.toggle('hidden', base < VIP);
    }

    // Amount interactions (added aria-pressed toggling)
    amountBtns.forEach(b => b.addEventListener('click', () => {
      amountBtns.forEach(x => { x.classList.remove('is-on'); x.setAttribute('aria-pressed','false'); });
      b.classList.add('is-on'); b.setAttribute('aria-pressed','true');
      custom.value = '';
      clearErr(); paint();
    }));
    custom.addEventListener('input', () => { sanitizeAmountInput(); amountBtns.forEach(x => { x.classList.remove('is-on'); x.setAttribute('aria-pressed','false'); }); paint(); });
    feeCb.addEventListener('change', paint);

    // Default selected button
    (function initDefault(){
      const match = amountBtns.find(b => +b.dataset.amount === DEF) || amountBtns[1] || amountBtns[0];
      if (match){ match.classList.add('is-on'); match.setAttribute('aria-pressed','true'); }
      custom.placeholder = String(DEF);
      paint();
    })();

    // Tabs
    const tabs = Array.from(dlg.querySelectorAll('.pm-tab'));
    function setTab(k){
      tabs.forEach(t => {
        const on = t.dataset.tab === k;
        t.dataset.active = on ? 'true' : 'false';
        t.setAttribute('aria-selected', String(on));
        document.getElementById('panel-'+t.dataset.tab)?.classList.toggle('hidden', !on);
      });
    }
    tabs.forEach(t => t.addEventListener('click', ()=> setTab(t.dataset.tab)));
    setTab('card');

    // Focus trap
    function trap(container){
      const sel = 'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
      function onKey(e){
        if (e.key !== 'Tab') return;
        const els = Array.from(container.querySelectorAll(sel)).filter(el=>!el.disabled && el.offsetParent !== null);
        if (!els.length) return;
        const [first,last] = [els[0], els[els.length-1]];
        if (e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
      }
      container.addEventListener('keydown', onKey);
      return () => container.removeEventListener('keydown', onKey);
    }
    let untrap = null;
    let lastFocus = null;

    // Open/Close
    function openModal(prefill){
      try { dlg.showModal?.(); } catch {}
      clearErr();
      if (prefill && typeof prefill === 'object'){
        if (prefill.amount){ amountBtns.forEach(x=>{x.classList.remove('is-on'); x.setAttribute('aria-pressed','false');}); custom.value = String(prefill.amount); }
        if (prefill.name)  nameI.value = prefill.name;
        if (prefill.email) mailI.value = prefill.email;
        paint();
      }
      dlg.classList.remove('closed');
      lastFocus = document.activeElement;
      ScrollGuard.lock();
      untrap = trap(box);
      if (!reduceMotion) setTimeout(()=> box.focus(), 0);
      announce('Donation dialog opened.');
      window.dispatchEvent(new CustomEvent('fc:donate:open'));
    }
    function closeModal(){
      dlg.classList.add('closed');
      try{ dlg.close?.(); }catch{}
      ScrollGuard.unlock();
      clearErr();
      untrap && untrap(); untrap = null;
      lastFocus?.focus?.();
      announce('Donation dialog closed.');
      window.dispatchEvent(new CustomEvent('fc:donate:close'));
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-open-donate-modal]')) { e.preventDefault(); openModal(); }
      if (e.target.closest?.('[data-close]'))            { e.preventDefault(); closeModal(); }
    });
    dlg.addEventListener('click', (e)=>{ if (e.target === dlg) closeModal(); });
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && dlg.open) closeModal(); });
    dlg.addEventListener('close', ScrollGuard.unlock);
    dlg.addEventListener('cancel', (e)=>{ e.preventDefault(); closeModal(); });

    // Observer failsafe (unlock if dialog toggled externally)
    new MutationObserver(() => { if (!dlg.open || dlg.classList.contains('closed')) ScrollGuard.unlock(); })
      .observe(dlg, { attributes: true, attributeFilter: ['open','class'] });

    // Public API
    window.openDonationModal = (opts)=> openModal(opts||{});

    // -------------- Stripe (Card + Payment Request) --------------
    let stripe, elements, card, pr, prButton, stripeReady = false;
    const CARD_EL   = document.getElementById('card-element');
    const PRB_MOUNT = document.getElementById('payment-request-button');

    async function ensureStripe(){
      if (!window.Stripe){
        showErr('Card payments are currently unavailable. Please try PayPal or later.');
        return null;
      }
      if (stripeReady) return stripe;

      // bootstrap with a lightweight PI to receive publishable key
      const { total } = getAmount();
      let res, data;
      try{
        res = await fetch(ENDPOINTS.stripeIntent, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'X-CSRFToken': getCSRF() },
          credentials: 'same-origin',
          body: JSON.stringify({ amount: total, currency: CURRENCY })
        });
        data = await res.json().catch(()=>({}));
        if (!res.ok || !data.client_secret || !data.publishable_key) throw 0;
      } catch {
        showErr('Unable to initialize card payments right now.');
        return null;
      }

      try{
        stripe = Stripe(data.publishable_key);
        elements = stripe.elements();
        if (!card){
          card = elements.create('card', { hidePostalCode: true });
          card.mount(CARD_EL);
        }
        await setupPaymentRequest(); // harmless if unavailable
        stripeReady = true;
        return stripe;
      }catch{
        showErr('Card entry failed to load.');
        return null;
      }
    }

    async function createPI(){
      const { base, fee, total } = getAmount();
      const payload = {
        amount: total, currency: CURRENCY,
        metadata: {
          donor_name: nameI.value || '',
          donor_email: mailI.value || '',
          note: noteI.value || '',
          base_amount: base,
          fee_amount: fee
        },
        receipt_email: mailI.value || undefined,
        description: `Donation to {{ team_name }}`
      };
      const res = await fetch(ENDPOINTS.stripeIntent, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-CSRFToken': getCSRF(), 'Idempotency-Key': cryptoRandom() },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data.client_secret) throw new Error(data.error?.message || 'Payment failed');
      if (!stripe && data.publishable_key) stripe = Stripe(data.publishable_key);
      return data.client_secret;
    }

    document.getElementById('pay-card').addEventListener('click', async () => {
      clearErr();
      const { base, total } = getAmount();
      if (!isFinite(total) || total < MIN) { showErr(`Minimum is ${fmt(MIN)}.`); return; }
      try {
        const s = await ensureStripe();
        if (!s) return;
        const clientSecret = await createPI();
        const billing_details = {
          name: nameI.value || undefined,
          email: mailI.value || undefined
        };
        setBusy(true);
        const { error: se } = await s.confirmCardPayment(clientSecret, {
          payment_method: { card, billing_details }
        });
        setBusy(false);
        if (se) { showErr(se.message || 'Card was not accepted.'); return; }
        handleSuccess({ amount: base, total });
      } catch (e){ setBusy(false); showErr(e.message || 'Something went wrong.'); }
    });

    async function setupPaymentRequest(){
      if (!stripe || !PRB_MOUNT || pr) return;
      const { total } = getAmount();
      try{
        pr = stripe.paymentRequest({
          country: 'US', currency: CURRENCY,
          total: { label: {{ team_name|tojson if tojson is defined else '"' ~ team_name ~ '"' }}, amount: cents(total) },
          requestPayerEmail: true, requestPayerName: true
        });
        const can = await pr.canMakePayment();
        if (can) {
          prbTab?.classList.remove('hidden');
          const els = elements || stripe.elements();
          prButton = els.create('paymentRequestButton', { paymentRequest: pr });
          PRB_MOUNT.innerHTML = '';
          prButton.mount('#payment-request-button');
          pr.on('paymentmethod', async (ev) => {
            try {
              const clientSecret = await createPI();
              const { error: se } = await stripe.confirmCardPayment(clientSecret, { payment_method: ev.paymentMethod.id }, { handleActions:false });
              if (se) { ev.complete('fail'); showErr(se.message || 'Payment failed.'); return; }
              ev.complete('success');
              const { error } = await stripe.confirmCardPayment(clientSecret);
              if (error) { showErr(error.message || 'Payment failed.'); return; }
              const { base, total } = getAmount();
              handleSuccess({ amount: base, total });
            } catch (e){ ev.complete('fail'); showErr(e.message || 'Payment failed.'); }
          });
        }
      }catch{ /* ignore */ }
    }

    // -------------- PayPal (Orders v2) --------------
    document.getElementById('pay-paypal').addEventListener('click', async () => {
      clearErr();
      const { base, total } = getAmount();
      if (!isFinite(total) || total < MIN) { showErr(`Minimum is ${fmt(MIN)}.`); return; }
      try {
        setBusy(true);
        const r1 = await fetch(ENDPOINTS.paypalOrder, {
          method:'POST',
          headers: { 'Content-Type':'application/json', 'X-CSRFToken': getCSRF() },
          credentials: 'same-origin',
          body: JSON.stringify({ amount: total, currency: CURRENCY, note: noteI.value||'', donor_email: mailI.value||'' })
        });
        const j1 = await r1.json().catch(()=>({}));
        if (!r1.ok || !j1.order_id) throw new Error(j1.error?.message || 'Unable to start PayPal');

        const r2 = await fetch(ENDPOINTS.paypalCapture, {
          method:'POST',
          headers: { 'Content-Type':'application/json', 'X-CSRFToken': getCSRF() },
          credentials: 'same-origin',
          body: JSON.stringify({ order_id: j1.order_id })
        });
        const j2 = await r2.json().catch(()=>({}));
        setBusy(false);
        if (!r2.ok || String(j2.status).toUpperCase() !== 'COMPLETED') {
          throw new Error(j2.error?.message || 'PayPal capture failed');
        }
        handleSuccess({ amount: base, total });
      } catch (e){ setBusy(false); showErr(e.message || 'PayPal error.'); }
    });

    // -------------- Success handling --------------
    function handleSuccess({ amount, total }){
      try {
        successBox.classList.remove('hidden');
        if (amount >= VIP && typeof window.launchConfetti === 'function') {
          window.launchConfetti({ particleCount: 180, spread: 80 });
        }
        window.dispatchEvent(new CustomEvent('fc:donation:success', { detail: { amount, total } }));
        window.dispatchEvent(new CustomEvent('fc:vip', { detail: { name: (nameI.value||'VIP Supporter'), amount } }));
        // Optimistic meter bump
        window.dispatchEvent(new CustomEvent('fc:meter:update', { detail: { raised: amount } }));
        noteI.value = '';
        setTimeout(() => {
          successBox.classList.add('hidden');
          closeModal();
        }, reduceMotion ? 200 : 1100);
      } catch {}
    }

    // Utility
    function cryptoRandom(len=12){
      const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const out=[]; const a=new Uint8Array(len); (window.crypto||window.msCrypto).getRandomValues(a);
      for (const n of a) out.push(chars[n%chars.length]); return out.join('');
    }

    // Prefill via event (optional)
    window.addEventListener('fc:donate:open', (ev)=>{
      const d = ev.detail || {};
      if (d.amount){ amountBtns.forEach(x=>{x.classList.remove('is-on'); x.setAttribute('aria-pressed','false');}); custom.value = String(d.amount); }
      if (d.name)  nameI.value = d.name;
      if (d.email) mailI.value = d.email;
      paint();
    });
  })();
