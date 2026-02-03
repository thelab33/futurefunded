(() => {
    const root = document.getElementById('impact'); if (!root) return;
    const fill = root.querySelector('.meter .fill');
    const rungs = Array.from(root.querySelectorAll('.rung'));
    const raisedEl = root.querySelector('[data-raised]');
    const goalEl = root.querySelector('[data-goal]');

    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

    function animateWhenVisible(target, run){
      const go = () => run();
      if (!('IntersectionObserver' in window)) return go();
      const io = new IntersectionObserver((ents) => {
        ents.forEach(e => { if (e.isIntersecting) { run(); io.disconnect(); } });
      }, {threshold: .35});
      io.observe(target);
    }

    function paintMeter(pct){
      if (!fill) return;
      fill.style.setProperty('--p', clamp(pct, 0, 100) + '%');
    }

    function lightRungs(raised){
      rungs.forEach(r => {
        const th = Number(r.dataset.th) || 0;
        const hit = th ? clamp(raised / th, 0, 1) : 0;
        r.style.setProperty('--hit', hit);
      });
    }

    // Initial animation from server-side numbers
    const svrRaised = Number({{ RAISED|int }});
    const svrGoal   = Math.max(1, Number({{ GOAL|int }}));
    const svrPct    = clamp((svrRaised / svrGoal) * 100, 0, 100);

    animateWhenVisible(fill || root, () => {
      paintMeter(svrPct);
      lightRungs(svrRaised);
    });

    // Optional hydration from /api/totals (safe no-op if missing)
    (async () => {
      try{
        const r = await fetch('/api/totals', {headers:{Accept:'application/json'}});
        if (!r.ok) return;
        const j = await r.json();
        const raised = Number(j.raised || 0);
        const goal   = Math.max(1, Number(j.goal || 0));
        const pct    = clamp((raised / goal) * 100, 0, 100);

        const fmtUSD = (n) => new Intl.NumberFormat(undefined, {style:'currency', currency:'USD', maximumFractionDigits:0}).format(n);
        if (raisedEl) raisedEl.textContent = fmtUSD(raised);
        if (goalEl)   goalEl.textContent   = fmtUSD(goal);

        paintMeter(pct);
        lightRungs(raised);
      }catch{/* ignore */ }
    })();
  })();
