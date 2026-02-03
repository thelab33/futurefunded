// app/static/js/tiles-io.js
(() => {
  document.documentElement.classList.add('js-tiles');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const reveal = el => el.classList.add('visible');

  const setup = root => {
    const tiles = (root || document).querySelectorAll('.feature-tile:not(.visible)');
    if (!tiles.length) return;

    if (reduced.matches || !('IntersectionObserver' in window)) {
      tiles.forEach(reveal);
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          reveal(e.target);
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -15% 0px' });

    tiles.forEach(t => io.observe(t));
  };

  // Initial pass
  setup();

  // If content injects later (htmx/alpine/turbo), watch for new tiles
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && (n.matches?.('.feature-tile') || n.querySelector?.('.feature-tile'))) {
          setup(n);
        }
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // If user reloads mid-scroll, reveal tiles already in view
  window.addEventListener('load', () => {
    setup();
  });
})();

