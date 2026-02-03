/*  ============================================================
    FundChamps · Header UX  (Elite v2.2)
    ------------------------------------------------------------
    - Smart hide/reveal on scroll
    - Mobile slide-in menu with focus trap
    - Share button with copy fallback + live region
    - Live-total pill listener
    ============================================================ */
(() => {
  const hdr      = document.getElementById('site-header');
  const toggle   = document.getElementById('menu-toggle');
  const shareBtn = document.getElementById('hdr-share');
  const pill     = document.getElementById('hdr-total-pill');

  /* ---------- smart hide ---------- */
  let last = scrollY, ticking = false;
  const HIDE_Y = 120, THRESH = 25;

  const handleScroll = () => {
    const cur = scrollY;
    if (cur > last + THRESH && cur > HIDE_Y)  hdr.classList.add('hide');
    else if (cur < last - THRESH)             hdr.classList.remove('hide');
    last = cur; ticking = false;
  };
  addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(handleScroll); ticking = true; }
  }, { passive: true });

  /* ---------- mobile menu ---------- */
  let menu;
  const tpl = document.getElementById('mobile-nav-tpl');

  function openMenu() {
    if (!menu) {
      menu = tpl.content.firstElementChild.cloneNode(true);
      menu.querySelector('.close').addEventListener('click', closeMenu);
      document.body.append(menu);
    }
    toggle.setAttribute('aria-expanded', 'true');
    menu.classList.add('open');
    document.body.style.overflow = 'hidden';
    toggle.querySelector('.ham').style.opacity = 0;
    toggle.querySelector('.x').style.opacity   = 1;

    /* focus-trap */
    menu.setAttribute('tabindex', '-1');
    menu.focus();
    document.addEventListener('focusin', trapFocus);
  }
  function closeMenu() {
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    document.body.style.overflow = '';
    toggle.querySelector('.ham').style.opacity = 1;
    toggle.querySelector('.x').style.opacity   = 0;
    document.removeEventListener('focusin', trapFocus);
    toggle.focus();
  }
  function trapFocus(e) {
    if (!menu.contains(e.target)) menu.focus();
  }
  toggle?.addEventListener('click', () =>
    toggle.getAttribute('aria-expanded') === 'true' ? closeMenu() : openMenu()
  );

  /* ---------- share ---------- */
  if (shareBtn) {
    const live = shareBtn.nextElementSibling;        // the sr-only span
    const shareData = JSON.parse(shareBtn.dataset.share || '{}');
    shareBtn.addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share(shareData);
        else {
          await navigator.clipboard.writeText(shareData.url || location.href);
          announce('Link copied ✔');
        }
      } catch { /* user cancelled */ }
    });
    function announce(msg) {
      if (!live) return;
      live.textContent = msg;
      setTimeout(() => (live.textContent = ''), 2000);
    }
  }

  /* ---------- live total pill ---------- */
  if (pill) {
    const nf = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    });
    const set = v => pill.textContent = nf.format(v ?? 0);
    set(0);
    addEventListener('fc:update', e => {
      if (e.detail?.raised != null) set(e.detail.raised);
    });
  }

  /* ---------- active-section nav highlight ---------- */
  const navLinks = [...document.querySelectorAll('.nav a[data-link]')];
  if (navLinks.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) =>
      entries.forEach(e => {
        const link = navLinks.find(a => a.dataset.link === e.target.id);
        if (link) link.classList.toggle('is-active', e.isIntersecting);
      }), { threshold: 0.4 });
    navLinks.forEach(a => {
      const sec = document.getElementById(a.dataset.link);
      if (sec) io.observe(sec);
    });
  }
})();

