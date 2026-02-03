// diamond-campaign.js
(function () {
  const root = document.documentElement;
  const body = document.body || document.querySelector('body');

  const ORG_NAME   = (body && body.dataset.org) || 'Our team';
  const DONATE_URL = (body && body.dataset.donateUrl) || '/donate';
  const SHARE_URL  = (body && body.dataset.shareUrl) || window.location.href;

  function smoothScrollTo(selectorOrId) {
    if (!selectorOrId) return;
    const target = selectorOrId.startsWith('#')
      ? document.querySelector(selectorOrId)
      : document.getElementById(selectorOrId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Theme toggle
  const themeToggle = document.querySelector('[data-theme-toggle]');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('fc-theme', next);
      } catch (e) {}
    });
  }

  // Scroll target buttons
  document.querySelectorAll('[data-scroll-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-scroll-target');
      if (id) smoothScrollTo(id);
    });
  });

  // Bottom tabbar
  document.querySelectorAll('[data-tab-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const selector = btn.getAttribute('data-tab-target');
      if (selector) smoothScrollTo(selector);
      document.querySelectorAll('.tab-btn').forEach((other) => {
        other.classList.toggle('is-active', other === btn);
      });
    });
  });

  // Announcement dismiss
  const ann = document.querySelector('[data-announcement]');
  if (ann) {
    const id = ann.getAttribute('data-announcement-id');
    const key = id ? 'ff-ann-' + id : null;
    try {
      if (key && localStorage.getItem(key) === 'dismissed') {
        ann.hidden = true;
      }
    } catch (e) {}
    const close = ann.querySelector('[data-announcement-close]');
    if (close) {
      close.addEventListener('click', () => {
        ann.hidden = true;
        try {
          if (key) localStorage.setItem(key, 'dismissed');
        } catch (e) {}
      });
    }
  }

  // Ways tabs
  const waysTabs = document.querySelectorAll('[data-ways-tab]');
  const waysPanels = document.querySelectorAll('[data-ways-panel]');
  waysTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.getAttribute('data-ways-tab');
      waysTabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      waysPanels.forEach((panel) => {
        const match = panel.getAttribute('data-ways-panel') === key;
        panel.hidden = !match;
      });
    });
  });

  // Toast for share
  const toast = document.getElementById('share-toast');
  function showToast() {
    if (!toast) return;
    toast.hidden = false;
    toast.classList.add('is-visible');
    setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.hidden = true;
    }, 2200);
  }

  function handleShareClick() {
    const url = SHARE_URL || window.location.href;
    const payload = {
      title: ORG_NAME + ' · Season fundraiser',
      text: 'Chip in to support ' + ORG_NAME,
      url,
    };

    if (navigator.share) {
      navigator.share(payload).catch(() => {});
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(showToast).catch(showToast);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (e) {}
      document.body.removeChild(ta);
      showToast();
    }
  }

  document.querySelectorAll('[data-share-link]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleShareClick();
    });
  });

  // Amount buttons (quick + impact)
  const amountInput = document.getElementById('inline-amount');
  const noteInput = document.getElementById('inline-note');

  function handleAmountButton(btn) {
    const raw = btn.getAttribute('data-fill-amount');
    if (!raw || !amountInput) return;
    amountInput.value = raw;

    document.querySelectorAll('[data-fill-amount]').forEach((b) => {
      if (b.closest('#donation-form')) {
        b.classList.toggle('is-active', b === btn);
      }
    });

    const impactLabel = btn.getAttribute('data-impact-label');
    if (impactLabel && noteInput && !noteInput.value) {
      noteInput.value = impactLabel;
    }
  }

  document.querySelectorAll('[data-fill-amount]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleAmountButton(btn);
    });
  });

  // Frequency toggle
  const freqHidden = document.getElementById('inline-frequency');
  const freqHint = document.getElementById('freq-hint');

  document.querySelectorAll('.freq-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const value = pill.getAttribute('data-frequency') || 'once';
      if (freqHidden) freqHidden.value = value;
      document.querySelectorAll('.freq-pill').forEach((p) => {
        const active = p === pill;
        p.classList.toggle('is-active', active);
        p.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (freqHint) {
        freqHint.textContent =
          value === 'monthly'
            ? 'Monthly support keeps scholarships and access steady all year.'
            : 'One-time support is huge. Sharing keeps the momentum going.';
      }
    });
  });

  // Two-step flow: validate, then redirect to DONATE_URL with query params
  const form = document.getElementById('donation-form-inner');
  const nextBtn = document.getElementById('inline-next');
  const errorBox = document.getElementById('inline-error');
  const payStep = document.getElementById('inline-payment-step');
  const payBtn = document.getElementById('inline-pay');
  const steps = document.querySelectorAll('.step');

  function setStep(active) {
    steps.forEach((step) => {
      const isActive = step.getAttribute('data-step') === String(active);
      step.classList.toggle('is-active', isActive);
    });
  }

  if (form && nextBtn && payStep && errorBox) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('inline-name');
      const emailEl = document.getElementById('inline-email');

      const name = nameEl && nameEl.value ? nameEl.value : '';
      const email = emailEl && emailEl.value ? emailEl.value : '';
      const amt = parseFloat(amountInput && amountInput.value ? amountInput.value : '0');

      let err = '';
      if (!name.trim()) {
        err = 'Please add your name so the team can thank you.';
      } else if (!email.includes('@')) {
        err = 'Please add a valid email so we can send a receipt.';
      } else if (!(amt > 0)) {
        err = 'Please choose a gift amount greater than $0.';
      }

      if (err) {
        errorBox.textContent = err;
        errorBox.hidden = false;
        errorBox.focus();
        return;
      }

      errorBox.hidden = true;

      const freq = freqHidden && freqHidden.value === 'monthly' ? 'monthly' : 'one-time';
      const summary = document.getElementById('inline-summary-text');
      if (summary) {
        summary.innerHTML =
          'You’re supporting ' +
          ORG_NAME +
          ' with a <strong>$' +
          amt.toFixed(2) +
          '</strong> ' +
          freq +
          ' contribution.';
      }

      form.hidden = true;
      payStep.hidden = false;
      payStep.setAttribute('aria-hidden', 'false');
      setStep(2);
    });
  }

  if (payBtn) {
    payBtn.addEventListener('click', () => {
      if (!amountInput) return;
      const amt = parseFloat(amountInput.value || '0');
      if (!(amt > 0)) return;

      const params = new URLSearchParams();
      params.set('amount', amt.toFixed(2));

      const freq = freqHidden ? freqHidden.value : 'once';
      params.set('frequency', freq);

      const nameEl = document.getElementById('inline-name');
      const emailEl = document.getElementById('inline-email');
      const noteEl = document.getElementById('inline-note');

      const name = nameEl && nameEl.value ? nameEl.value : '';
      const email = emailEl && emailEl.value ? emailEl.value : '';
      const note = noteEl && noteEl.value ? noteEl.value : '';

      if (name) params.set('name', name);
      if (email) params.set('email', email);
      if (note) params.set('note', note);

      const base = DONATE_URL || window.location.href;
      const sep = base.includes('?') ? '&' : '?';
      window.location.href = base + sep + params.toString();
    });
  }

  // Countdown
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const iso = el.getAttribute('data-deadline');
    if (!iso) return;

    const end = new Date(iso);
    if (isNaN(end.getTime())) return;

    function update() {
      const now = new Date();
      let diff = end - now;
      if (diff <= 0) {
        el.textContent = 'Wrapping up soon';
        return;
      }

      const dayMs = 86400000;
      const hourMs = 3600000;
      const minMs = 60000;

      const days = Math.floor(diff / dayMs);
      diff -= days * dayMs;
      const hours = Math.floor(diff / hourMs);
      diff -= hours * hourMs;
      const mins = Math.floor(diff / minMs);

      if (days > 0) {
        el.textContent =
          days +
          ' day' +
          (days === 1 ? '' : 's') +
          (hours > 0 ? ' · ' + hours + ' hr' + (hours === 1 ? '' : 's') : '') +
          ' left';
      } else if (hours > 0) {
        el.textContent =
          hours +
          ' hr' +
          (hours === 1 ? '' : 's') +
          ' · ' +
          mins +
          ' min left';
      } else {
        el.textContent = mins + ' min left';
      }
    }

    update();
    setInterval(update, 60000);
  });
})();

