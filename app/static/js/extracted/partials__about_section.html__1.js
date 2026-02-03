document.querySelectorAll('.animate-count').forEach(el => {
  const to = +el.dataset.countTo || 0;
  const suffix = el.dataset.suffix || '';
  let started = false;
  const start = () => {
    if (started) return; started = true;
    let c = 0, step = Math.max(1, to / 50), decimals = +(el.dataset.decimals || 0);
    const run = () => {
      c += step;
      if (c >= to) { el.textContent = to.toFixed(decimals) + suffix; return; }
      el.textContent = (decimals ? c.toFixed(decimals) : Math.round(c)) + suffix;
      requestAnimationFrame(run);
    };
    run();
  };
  // Only animate when visible
  new IntersectionObserver(([e]) => e.isIntersecting && start(), { threshold: .5 }).observe(el);
});
