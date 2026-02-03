{% endif %}
  (() => {
    const root = document.getElementById('impact-challenge-coaches'); if (!root || root.__init) return; root.__init = true;

    // Impact counters (animate once on visibility, reduced-motion aware)
    const counters = root.querySelectorAll('.count[data-target]');
    if (counters.length) {
      const reduced = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
                      (navigator.connection && navigator.connection.saveData === true);
      const io = new IntersectionObserver((entries, obs) => {
        if (!entries.some(en => en.isIntersecting)) return;
        counters.forEach(el => {
          const target = Math.max(0, parseInt(el.dataset.target || '0', 10));
          if (reduced) { el.textContent = String(target); return; }
          let n = 0, step = Math.max(1, Math.ceil(target / 80));
          const id = setInterval(() => {
            n += step;
            if (n >= target) { n = target; clearInterval(id); }
            el.textContent = String(n);
          }, 20);
        });
        obs.disconnect();
      }, { threshold: .35 });
      io.observe(root);
    }

    // Donation modal contract (no inline handlers)
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open-donate-modal]'); if (!btn) return;
      try {
        if (typeof window.openDonationModal === 'function') {
          e.preventDefault();
          window.openDonationModal();
          window.dispatchEvent(new CustomEvent('fc:donate:open'));
        }
      } catch(_) {}
    });
  })();
  {% if script_close is defined %}{{ script_close() }}{% else %}
