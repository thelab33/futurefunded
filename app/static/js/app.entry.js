/*  =========================================================================
    app.entry.js · FundChamps elite bundle (ESM, ready for esbuild)
    =========================================================================
    ▸ Hero 3-D tilt                        (neo hero image)
    ▸ Header UX                            (smart-hide, nav-active, mobile menu)
    ▸ Share / donate helpers + live total
    ▸ Sponsor shoutout dispatcher
    ========================================================================= */
'use strict';

/* --------------------------------------------------  Helpers */
const RMO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ready = (fn) =>
  document.readyState === 'loading'
    ? addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

/* ============================================================ 1. Hero tilt */
export function initHeroTilt () {
  const img = document.querySelector('.neo-product img');
  if (!img || RMO) return;

  const baseY = 10;                          // float offset
  img.style.transform = `translateY(${baseY}px)`;

  img.addEventListener('mousemove', (e) => {
    const { left, top, width, height } = img.getBoundingClientRect();
    const x = (e.clientX - left) / width  - .5;
    const y = (e.clientY - top)  / height - .5;
    img.style.transform =
      `perspective(800px) rotateX(${clamp(-y*6,-6,6)}deg) rotateY(${clamp(x*6,-6,6)}deg) translateY(${baseY}px)`;
  }, { passive: true });

  img.addEventListener('mouseleave', () => {
    img.style.transform = `translateY(${baseY}px)`;
  }, { passive: true });
}

/* ============================================================ 2. Header UX */
export function initHeader () {
  const hdr      = document.getElementById('site-header');
  if (!hdr) return;

  /* ╭─ 2-a Smart hide / reveal ─────────────────────────────── */
  let last = scrollY, ticking = false;
  const HIDE_AT = 120, THRESH = 25;

  const handleScroll = () => {
    const cur = scrollY;
    hdr.classList.toggle('hide', cur > last + THRESH && cur > HIDE_AT);
    hdr.classList.toggle('hide', !(cur < last - THRESH));
    last = cur; ticking = false;
  };
  addEventListener('scroll', () => !ticking && (ticking = !requestAnimationFrame(handleScroll)),
                   { passive: true });

  /* ╭─ 2-b Mobile slide-in menu  +  focus trap  ────────────── */
  const toggle = document.getElementById('menu-toggle');
  const tpl    = document.getElementById('mobile-nav-tpl');
  let   menu;

  function trapFocus (e) { if (menu && !menu.contains(e.target)) menu.focus(); }

  function openMenu () {
    if (!menu) {
      menu = tpl.content.firstElementChild.cloneNode(true);
      menu.querySelector('.close').onclick = closeMenu;
      document.body.append(menu);
    }
    toggle.setAttribute('aria-expanded', 'true');
    menu.classList.add('open');
    document.body.style.overflow = 'hidden';
    toggle.querySelector('.ham').style.opacity = 0;
    toggle.querySelector('.x').style.opacity   = 1;
    menu.tabIndex = -1; menu.focus();
    addEventListener('focusin', trapFocus);
  }
  function closeMenu () {
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    document.body.style.overflow = '';
    toggle.querySelector('.ham').style.opacity = 1;
    toggle.querySelector('.x').style.opacity   = 0;
    removeEventListener('focusin', trapFocus);
    toggle.focus();
  }
  toggle?.addEventListener('click', () =>
    toggle.getAttribute('aria-expanded') === 'true' ? closeMenu() : openMenu()
  , { passive: true });

  /* ╭─ 2-c Share button ------------------------------------- */
  const shareBtn = document.getElementById('hdr-share');
  const live     = shareBtn?.nextElementSibling;           // sr-only span
  if (shareBtn) {
    const data = JSON.parse(shareBtn.dataset.share || '{}');
    shareBtn.addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share(data);
        else {
          await navigator.clipboard.writeText(data.url || location.href);
          announce('Link copied ✔');
        }
      } catch {/* cancelled */}
    }, { passive:true });
  }
  function announce (msg) {
    if (!live) return;
    live.textContent = msg;
    setTimeout(() => (live.textContent = ''), 2000);
  }

  /* ╭─ 2-d Live total pill ----------------------------------- */
  const pill = document.getElementById('hdr-total-pill');
  if (pill) {
    const nf = new Intl.NumberFormat('en-US',{
      style:'currency', currency:'USD', maximumFractionDigits:0 });
    const set = v => pill.textContent = nf.format(v ?? 0);
    set(0);
    addEventListener('fc:update', e => {
      if (e.detail?.raised != null) set(e.detail.raised);
    });
  }

  /* ╭─ 2-e Active-section nav highlight (desktop) ------------ */
  const navLinks = [...hdr.querySelectorAll('.nav a[data-link]')];
  if (navLinks.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) =>
      entries.forEach(e => {
        const link = navLinks.find(a => a.dataset.link === e.target.id);
        link?.classList.toggle('is-active', e.isIntersecting);
      }), { threshold:.4 });
    navLinks.forEach(a => {
      const sec = document.getElementById(a.dataset.link);
      sec && io.observe(sec);
    });
  }
}

/* ============================================================ 3. Shoutout  */
export function addSponsorShoutout (detail) {
  window.dispatchEvent(new CustomEvent('fc:shoutout', { detail }));
}

/* ============================================================ 4. Boot strap */
ready(() => {
  initHeroTilt();
  initHeader();
  window.FC = { initHeroTilt, initHeader, addSponsorShoutout };
});

/* ============================================================ 5. HMR dev   */
if (import.meta.hot) {
  import.meta.hot.accept(() => console.info('[HMR] app.entry.js updated'));
}

