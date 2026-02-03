// Staggered tile reveal + a11y focus support + late-insert resilience
(function () {
  const GRID_SEL = '.agency-tiles';
  const TILE_SEL = '.feature-tile';
  const DELAY_MS = 90; // base stagger

  function reveal(t) {
    if (!t || t.dataset.revealed === '1') return;
    t.dataset.revealed = '1';
    const i = Number(t.getAttribute('data-delay') || 0);
    t.style.setProperty('--delay', `${i * DELAY_MS}ms`);
    t.classList.add('visible');
  }

  function revealAll(tiles) {
    tiles.forEach(reveal);
    // remove the JS gate; we’re done animating
    const grid = tiles[0]?.closest(GRID_SEL);
    grid && grid.classList.remove('js-tiles');
  }

  function enhanceGrid(grid) {
    if (!grid || grid.dataset.enhanced === '1') return;
    grid.dataset.enhanced = '1';
    grid.classList.add('js-tiles');

    const tiles = Array.from(grid.querySelectorAll(TILE_SEL));
    if (!tiles.length) return;

    // A11Y: keyboard focus should reveal immediately
    tiles.forEach(t => {
      t.addEventListener('focusin', () => reveal(t), { passive: true });
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') reveal(t);
      }, { passive: true });
    });

    const prefersReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasIO = 'IntersectionObserver' in window;

    if (prefersReduce || !hasIO) {
      // No motion or no IO -> show everything
      revealAll(tiles);
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          reveal(e.target);
          io.unobserve(e.target);
        }
      }
    }, { root: null, threshold: 0.2, rootMargin: '0px 0px -15% 0px' });

    tiles.forEach(t => io.observe(t));

    // Clean up if the page is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) io.disconnect();
    }, { once: true });
  }

  function init() {
    document.querySelectorAll(GRID_SEL).forEach(enhanceGrid);
  }

  // SSR DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(init), { once: true });
  } else {
    requestAnimationFrame(init);
  }

  // Late inserts (htmx/turbo/alpine/etc.)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'childList') continue;
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(GRID_SEL)) enhanceGrid(node);
        node.querySelectorAll?.(GRID_SEL).forEach(enhanceGrid);
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();

