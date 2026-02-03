(function() {
  const sec = document.getElementById('impact');
  if (!sec) return;

  const fill = sec.querySelector('.meter-fill');
  const raised = +sec.querySelector('[data-raised]')?.textContent.replace(/[$,]/g, '') || 0;
  const goal = +sec.querySelector('[data-goal]')?.textContent.replace(/[$,]/g, '') || 1;
  const pctVal = Math.min(100, Math.round(raised / goal * 100));

  // Fill progress bar
  if (fill) { setTimeout(() => fill.style.width = pctVal + '%', 300); }
  const pctEl = sec.querySelector('.pct');
  if (pctEl) pctEl.textContent = '• ' + pctVal + '%';

  // Animate KPI counters
  const nums = sec.querySelectorAll('.num[data-num]');
  const animate = (el, to, dur) => {
    const d = +el.dataset.decimals || 0;
    const fmt = v => v.toLocaleString(undefined, { minFractionDigits: d, maxFractionDigits: d });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now();
    const step = ts => {
      const p = Math.min(1, (ts - t0) / dur);
      const val = to * p;
      el.textContent = fmt(val) + (el.dataset.suffix || '');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  let done = false;
  const trigger = () => {
    if (done) return;
    done = true;
    nums.forEach((el, i) => animate(el, +el.dataset.num || 0, 900 + i * 110));
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(e => e.some(v => v.isIntersecting) && trigger(), { threshold: 0.3 }).observe(sec);
  } else {
    trigger();
  }
})();
