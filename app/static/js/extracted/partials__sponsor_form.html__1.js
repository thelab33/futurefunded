{% endif %}
      (() => {
        const form   = document.getElementById('sponsor-donation-form');
        if (!form || form.__init) return; form.__init = true;

        // Fields
        const nameEl  = document.getElementById('donor-name');
        const emailEl = document.getElementById('donor-email');
        const amtEl   = document.getElementById('donation-amount');
        const msg     = document.getElementById('impact-message');

        // Errors
        const errName  = document.getElementById('err-name');
        const errEmail = document.getElementById('err-email');
        const errAmt   = document.getElementById('err-amount');
        const serverErr= document.getElementById('server-errors');

        // Payment containers
        const wrapStripe = document.getElementById('stripe-elements-wrap');
        const wrapPayPal = document.getElementById('paypal-buttons-wrap');

        // Frequency toggle
        const freqOnce    = document.getElementById('freq-once');
        const freqMonthly = document.getElementById('freq-monthly');

        // URL params → hidden fields
        try {
          const params = new URLSearchParams(location.search);
          (document.getElementById('utm_source')||{}).value   = params.get('utm_source') || '';
          (document.getElementById('utm_medium')||{}).value   = params.get('utm_medium') || '';
          (document.getElementById('utm_campaign')||{}).value = params.get('utm_campaign') || '';
          (document.getElementById('ref')||{}).value          = params.get('ref') || params.get('r') || '';
        } catch(_) {}

        // Helpers
        const fmt0 = (n)=> (Math.round(+n||0)).toLocaleString();
        const isEmail = (s)=> /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').trim());

        // Payment method reveal
        function revealPayment(method){
          if (!wrapStripe || !wrapPayPal) return;
          wrapStripe.classList.toggle('hidden', method!=='stripe');
          wrapPayPal.classList.toggle('hidden', method!=='paypal');
          // Lazy init Stripe PRB if available
          if (method==='stripe' && window.Stripe && window.__STRIPE_PK && !wrapStripe.__mounted) {
            try {
              const stripe = Stripe(window.__STRIPE_PK);
              const elements = stripe.elements({ appearance: { theme: 'night' }});
              // (Optional) Payment Element if you run Payment Intents on server
              const pe = elements.create('payment', { fields: { billingDetails: 'never' }});
              pe.mount('#stripe-payment-element');
              // (Optional) Apple/Google Pay PRB
              const pr = stripe.paymentRequest({
                country: 'US', currency: 'usd',
                total: { label: 'FundChamps Sponsorship', amount: 0 }, // server will set final
                requestPayerName: true, requestPayerEmail: true
              });
              pr.canMakePayment().then((res) => {
                if (res) {
                  const prb = elements.create('paymentRequestButton', { paymentRequest: pr });
                  prb.mount('#stripe-prb');
                }
              });
              wrapStripe.__mounted = true;
            } catch(e) { /* no-op */ }
          }
          // PayPal buttons mounting left to your global init if using JS SDK.
        }

        document.getElementById('pay-stripe')?.addEventListener('change', ()=> revealPayment('stripe'));
        document.getElementById('pay-paypal')?.addEventListener('change', ()=> revealPayment('paypal'));
        // Initial:
        revealPayment(document.querySelector('input[name="payment_method"]:checked')?.value || 'stripe');

        // Quick-picks
        form.querySelectorAll('[data-amt]').forEach(btn=>{
          btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-amt');
            if (val === 'custom') { amtEl?.focus(); return; }
            if (amtEl) { amtEl.value = String(val); amtEl.focus(); showImpact(+val || 0); }
          });
        });

        // Impact messaging
        amtEl?.addEventListener('input', () => {
          const v = parseFloat(amtEl.value || '0') || 0;
          if (v > 0) showImpact(v);
          clearError(errAmt, amtEl);
        });

        function showImpact(amount){
          if (!msg) return;
          const monthly = freqMonthly?.checked;
          let text = '👏 Every dollar counts. Thank you!';
          if (amount >= 500) text = monthly
            ? `🚌 Your $${fmt0(amount)}/mo = travel support each month!`
            : `🚌 Your $${fmt0(amount)} = travel support for the team!`;
          else if (amount >= 150) text = monthly
            ? `🏟️ $${fmt0(amount)}/mo = weekly gym time!`
            : `🏟️ $${fmt0(amount)} = a week of gym time!`;
          else if (amount >= 100) text = `🏀 $${fmt0(amount)}${monthly?'/mo':''} = a full scholarship for a player!`;
          else if (amount >= 50)  text = `👕 $${fmt0(amount)}${monthly?'/mo':''} = a new team jersey.`;
          msg.textContent = text;
          msg.classList.remove('hidden');
          pulse(msg);
        }

        function pulse(el){
          el.style.animation = 'fc-pulse 0.9s ease-out 1';
          el.addEventListener('animationend', () => el.style.animation = '', { once:true });
        }

        // Validation
        form.addEventListener('submit', (e) => {
          let ok = true;

          if (!nameEl || !nameEl.value.trim()) { setError(errName, nameEl, 'Please enter your name or company.'); ok = false; }
          else clearError(errName, nameEl);

          if (!emailEl || !isEmail(emailEl.value)) { setError(errEmail, emailEl, 'Please enter a valid email.'); ok = false; }
          else clearError(errEmail, emailEl);

          const amount = parseFloat(amtEl?.value || '0') || 0;
          if (!amtEl || amount <= 0) { setError(errAmt, amtEl, 'Please enter a valid donation amount.'); ok = false; }
          else clearError(errAmt, amtEl);

          if (amount > 0) showImpact(amount);

          if (!ok) {
            e.preventDefault();
            serverErr?.classList.add('hidden');
            return;
          }

          // Analytics (optional)
          try {
            window.dataLayer = window.dataLayer || [];
            const pm = (document.querySelector('input[name="payment_method"]:checked')||{}).value || 'stripe';
            const fq = (document.querySelector('input[name="frequency"]:checked')||{}).value || 'once';
            window.dataLayer.push({ event: 'donation_intent', amount, payment_method: pm, frequency: fq });
          } catch(_) {}
        });

        // UX niceties
        window.addEventListener('DOMContentLoaded', () => { setTimeout(() => nameEl?.focus(), 250); });

        // Helpers for error UI
        function setError(out, input, text){
          if (out) out.textContent = text || 'This field is required.';
          if (input){ input.setAttribute('aria-invalid','true'); input.classList.add('ring-2','ring-red-400'); }
        }
        function clearError(out, input){
          if (out) out.textContent = '';
          if (input){ input.setAttribute('aria-invalid','false'); input.classList.remove('ring-2','ring-red-400'); }
        }
      })();
      {% if script_close is defined %}{{ script_close() }}{% else %}
