/*

⚠️ DO NOT MODIFY
Stripe live checkout logic.
Changes can cause double charges or failed payments.

*/

/* SINGLE FILE: v1 flagship (Stripe Elements safe lifecycle + conversion + PWA hooks) */

(() => {
  "use strict";

  /* ============================================================
  FutureFunded Flagship — v48 (SAFE DROP-IN)

  - Keeps Stripe flow + endpoints + IDs intact
  - Fixes double-prefill from stacked delegated handlers
  - Properly unmounts Stripe Payment Element before remount
  - Sponsor Kit tier-specific open + tier-aware copy buttons
  - QR endpoint support via meta[name="ff-qr-endpoint"]
  - Toast + Sticky aliases supported (#toastRegion, .sticky-donate, etc.)
  - Mobile bottom tabs (ff-mobile-tabs) click-to-scroll wiring
  - Announcement flag (announcement-flag) dismiss + optional autohide
  - Emits safe analytics events (optional)

  ============================================================ */

  if (window.__ff_flagship_initialized) return;
  window.__ff_flagship_initialized = true;
  // Back-compat guard (if older pages check this)
  window.__ff_flagship_v44_initialized = true;

  /* -------------------------
  Helpers
  ------------------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";

  const getCsrfToken = () => meta("csrf-token") || meta("csrf") || meta("x-csrf-token");
  const getCheckoutEndpoint = () => meta("ff-checkout-endpoint") || meta("ff-embedded-endpoint") || "/payments/stripe/intent";
  const getStatusEndpoint = () => meta("ff-status-endpoint") || "/api/status";
  const getStripePkFromMeta = () => meta("ff-stripe-pk") || meta("stripe-pk") || "";
  const getQrEndpoint = () => meta("ff-qr-endpoint") || "";

  const emit = (name, detail = {}) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  };

  const isPlainObject = (v) =>
    !!v && typeof v === "object" && Object.prototype.toString.call(v) === "[object Object]";

  const safeClone = (obj) => {
    try {
      return structuredClone(obj);
    } catch {
      return JSON.parse(JSON.stringify(obj));
    }
  };

  const deepMerge = (target, ...sources) => {
    for (const src of sources) {
      if (!isPlainObject(src)) continue;
      for (const [k, v] of Object.entries(src)) {
        if (isPlainObject(v) && isPlainObject(target[k])) target[k] = deepMerge(target[k], v);
        else target[k] = v;
      }
    }
    return target;
  };

  const readJsonScript = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    try {
      const txt = String(el.textContent || "").trim();
      if (!txt) return null;
      return JSON.parse(txt);
    } catch {
      return null;
    }
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

  const setShown = (el, show) => {
    if (!el) return;
    const on = !!show;
    el.hidden = !on;
    el.setAttribute("data-show", on ? "true" : "false");
    el.setAttribute("aria-hidden", on ? "false" : "true");
  };

  const setOpenHiddenA11y = (el, open) => {
    if (!el) return;
    const on = !!open;
    el.hidden = !on;
    el.setAttribute("aria-hidden", on ? "false" : "true");
  };

  const debounce = (fn, wait = 180) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const uuid = () => {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "ff_" + Date.now().toString(16) + "_" + Math.random().toString(16).slice(2);
  };

  async function fetchJson(url, { method = "GET", payload, headers = {}, timeoutMs = 15000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: ctrl.signal,
        redirect: "follow",
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        throw new Error("Expected JSON but received HTML. Check endpoint routing/redirects.");
      }

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) {
        const msg = data?.error?.message || data?.message || `Request failed (${res.status})`;
        throw new Error(msg);
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  /* -------------------------
  Focus trap (drawer + modals)
  ------------------------- */

  const FOCUSABLE_SEL = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  };

  const getFocusable = (container) => $$(FOCUSABLE_SEL, container).filter((el) => isVisible(el));

  const focusFirst = (container) => {
    const f = getFocusable(container);
    if (f.length) {
      f[0].focus();
      return true;
    }
    container?.focus?.();
    return false;
  };

  const trapFocus = (container) => {
    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      if (!container || container.hidden) return;
      const active = document.activeElement;
      if (!container.contains(active)) return;

      const items = getFocusable(container);
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  };

  /* -------------------------
  Scroll lock (refcounted)
  ------------------------- */

  let scrollLockCount = 0;
  let savedBodyPadRight = "";

  const lockScroll = (lock) => {
    const docEl = document.documentElement;
    const body = document.body;

    if (lock) {
      scrollLockCount += 1;
      if (scrollLockCount > 1) return;

      const scrollBarWidth = window.innerWidth - docEl.clientWidth;
      savedBodyPadRight = body.style.paddingRight || "";

      docEl.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (scrollBarWidth > 0) body.style.paddingRight = scrollBarWidth + "px";
      return;
    }

    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount !== 0) return;

    docEl.style.overflow = "";
    body.style.overflow = "";
    body.style.paddingRight = savedBodyPadRight;
  };

  /* -------------------------
  Default Config
  ------------------------- */

  const DEFAULT_CONFIG = {
    brand: { markText: "FF", logoUrl: "", primary: "#C2410C", primaryStrong: "#9A3412", accent: "#F97316" },
    org: { shortName: "Connect ATX Elite", metaLine: "Youth Basketball • Austin, TX", seasonLabel: "2025–2026", sportLabel: "Youth basketball" },
    fundraiser: {
      currency: "USD",
      goal: 25000,
      raised: 0,
      donors: 0,
      deadlineISO: "2026-02-28T23:59:59-06:00",
      match: { active: false, copy: "Match active: gifts are doubled up to $2,500." },
    },
    events: [{ title: "Next tournament weekend", startISO: "2026-01-17T09:00:00-06:00" }],
    allocation: [
      { label: "Travel + tournament fees", pct: 35 },
      { label: "Gym time", pct: 30 },
      { label: "Uniforms + gear", pct: 20 },
      { label: "Hydration + snacks", pct: 10 },
      { label: "Scholarships", pct: 5 },
    ],
    impact: [
      { amount: 25, tag: "Foundation", title: "Hydration & snacks", desc: "Covers drinks and light snacks for a practice or weekend run." },
      { amount: 75, tag: "Game Day", title: "Game day fuel", desc: "Supports a full day of hydration + snacks for a roster." },
      { amount: 150, tag: "Operations", title: "Gym time covered", desc: "Offsets gym rentals so practices stay consistent." },
      { amount: 300, tag: "Travel", title: "Travel + tournament boost", desc: "Helps reduce weekend spikes: travel, fees, and essentials." },
      { amount: 500, tag: "Gear", title: "Uniforms & player gear", desc: "Helps cover jerseys and gear so athletes aren’t paying out-of-pocket." },
      { amount: 1000, tag: "Scholarship", title: "Program anchor", desc: "Protects scholarships + stabilizes travel, gear, and tournament costs.", badge: "Best value" },
    ],
    recentGifts: [
      { who: "Anonymous", amount: 75, minutesAgo: 18 },
      { who: "J. Carter", amount: 25, minutesAgo: 44 },
      { who: "Local Business", amount: 250, minutesAgo: 120 },
      { who: "Anonymous", amount: 50, minutesAgo: 240 },
    ],
    teams: [
      { key: "6g", name: "6th Grade Gold", blurb: "First AAU reps — learning sets, defense, and communication.", goal: 5000, raised: 3420, image: "/static/images/connect-atx-team.jpg", tag: "Featured" },
      { key: "7g", name: "7th Grade Gold", blurb: "Speed + spacing — film, fundamentals, and pressure reps.", goal: 6000, raised: 4680, image: "/static/images/7thGold.jpg" },
      { key: "7b", name: "7th Grade Black", blurb: "Defense travels — effort and stops into transition.", goal: 5000, raised: 2210, image: "/static/images/7thBlack.webp" },
      { key: "8g", name: "8th Grade Gold", blurb: "Finish strong — high-intensity reps and leadership.", goal: 6000, raised: 4680, image: "/static/images/8thGold.jpg" },
      { key: "8b", name: "8th Grade Black", blurb: "Next gym ready — advanced reads and competitive weekends.", goal: 5000, raised: 2210, image: "/static/images/connect-atx-team_3.jpg" },
    ],
    sponsors: {
      wall: [
        { name: "River City Dental", meta: "Tournament Sponsor", amount: 1000 },
        { name: "ATX Alumni", meta: "Game Day Sponsor", amount: 500 },
        { name: "Carter Family", meta: "Community Sponsor", amount: 250 },
      ],
      tiers: [
        { name: "Community Sponsor", amount: 250, desc: "Great for families and small businesses.", badges: ["Receipt-ready", "Shareable"] },
        { name: "Game Day Sponsor", amount: 500, desc: "Visible support that families notice.", badges: ["Popular", "High visibility"] },
        { name: "Tournament Sponsor", amount: 1000, desc: "Top placement + sponsor spotlight.", badges: ["Top placement", "Best value"] },
      ],
      spotlight: {
        title: "Tournament Sponsor",
        copy: "Top sponsors get pride-of-place on the wall plus a shareable sponsor badge (easy marketing for local businesses).",
      },
    },
    supportEmail: "support@getfuturefunded.com",
    liveRefreshMs: 20000,
    payments: { stripe: true, paypal: false },
  };

  const jsonCfg = readJsonScript("ffConfig");
  const CONFIG = deepMerge(
    safeClone(DEFAULT_CONFIG),
    isPlainObject(window.FF_CONFIG) ? window.FF_CONFIG : {},
    isPlainObject(jsonCfg) ? jsonCfg : {}
  );

  const state = {
    goal: Number(CONFIG.fundraiser?.goal) || 0,
    raised: Number(CONFIG.fundraiser?.raised) || 0,
    donors: Number(CONFIG.fundraiser?.donors) || 0,
    teams: (CONFIG.teams || []).map((t) => ({ ...t })),
    teamFilter: "all",
    teamQuery: "",
    needsSet: new Set(),
    lastStatusOk: false,
    lastUpdatedAt: 0,
  };

  /* -------------------------
  Formatting
  ------------------------- */

  const currencyCode = () => String(CONFIG.fundraiser?.currency || "USD").toUpperCase();

  const fmtMoney = (n, maxDigits = 0) => {
    const v = Number(n) || 0;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode(),
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits,
      }).format(v);
    } catch {
      const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits });
      return "$" + nf.format(v);
    }
  };

  const money0 = (n) => fmtMoney(n, 0);
  const money2 = (n) => fmtMoney(n, 2);

  const pct = (raised, goal) => {
    const g = Number(goal) || 0;
    if (!g) return 0;
    return clamp(Math.round((Number(raised) / g) * 100), 0, 999);
  };

  const daysLeft = (deadlineISO) => {
    const d = new Date(deadlineISO);
    if (Number.isNaN(d.getTime())) return null;
    const ms = d.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.max(0, Math.ceil(ms / 86400000));
  };

  const formatAge = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 10) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  /* -------------------------
  DOM refs (IDs kept intact; alias support added)
  ------------------------- */

  const E = {
    orgName: $("#orgName"),
    orgMeta: $("#orgMeta"),
    orgPill: $("#orgPill"),
    seasonPill: $("#seasonPill"),
    sportPill: $("#sportPill"),
    heroOrgLine: $("#heroOrgLine"),

    raisedBig: $("#raisedBig"),
    raisedRow: $("#raisedRow"),
    goalRow: $("#goalRow"),
    goalPill: $("#goalPill"),
    remainingText: $("#remainingText"),
    deadlineText: $("#deadlineText"),
    lastUpdatedText: $("#lastUpdatedText"),
    pctText: $("#pctText"),
    overallBar: $("#overallBar"),
    donorsText: $("#donorsText"),
    avgGiftText: $("#avgGiftText"),
    daysLeftText: $("#daysLeftText"),
    nextMilestoneText: $("#nextMilestoneText"),
    matchPill: $("#matchPill"),
    lastUpdatedPill: $("#lastUpdatedPill"),
    countdownPill: $("#countdownPill"),

    donateQr: $("#donateQr"),
    qrCopyLink: $("#qrCopyLink"),

    textDonateCard: $("#textDonateCard"),
    textDonatePhone: $("#textDonatePhone"),
    textDonateKeyword: $("#textDonateKeyword"),
    textDonateHint: $("#textDonateHint"),
    textDonateSmsLink: $("#textDonateSmsLink"),
    textDonateCopy: $("#textDonateCopy"),

    giftsList: $("#giftsList"),
    allocationBars: $("#allocationBars"),
    impactGrid: $("#impactGrid"),
    teamsGrid: $("#teamsGrid"),

    sponsorWall: $("#sponsorWall"),
    sponsorTiers: $("#sponsorTiers"),
    spotlightTitle: $("#spotlightTitle"),
    spotlightCopy: $("#spotlightCopy"),

    teamSearch: $("#teamSearch"),
    teamSelect: $("#teamSelect"),

    eventTitle: $("#eventTitle"),
    eventCountdown: $("#eventCountdown"),

    form: $("#donationForm"),
    amountInput: $("#amountInput"),
    nameInput: $("#nameInput"),
    emailInput: $("#emailInput"),
    noteInput: $("#noteInput"),
    coverFees: $("#coverFees"),
    roundUp: $("#roundUp"),
    updatesOptIn: $("#updatesOptIn"),
    submitBtn: $("#submitBtn"),
    frequencyHidden: $("#frequencyHidden"),

    summaryAmount: $("#summaryAmount"),
    summaryFreq: $("#summaryFreq"),
    summaryFeeLine: $("#summaryFeeLine"),

    receiptBase: $("#receiptBase"),
    receiptRoundRow: $("#receiptRoundRow"),
    receiptRound: $("#receiptRound"),
    receiptFeeRow: $("#receiptFeeRow"),
    receiptFee: $("#receiptFee"),
    receiptTotal: $("#receiptTotal"),

    ffTotalHidden: $("#ffTotalHidden"),
    ffIdemHidden: $("#ffIdemHidden"),
    formError: $("#formError"),

    checkoutModal: $("#checkoutModal"),
    checkoutClose: $("#checkoutClose"),
    checkoutClose2: $("#checkoutClose2"),
    checkoutHelp: $("#checkoutHelp"),
    checkoutLoading: $("#checkoutLoading"),
    checkoutModalError: $("#checkoutModalError"),
    paymentElement: $("#paymentElement"),
    payNowBtn: $("#payNowBtn"),

    successModal: $("#successModal"),
    successClose: $("#successClose"),
    successBack: $("#successBack"),
    successEmail: $("#successEmail"),
    successAmount: $("#successAmount"),
    successFrequency: $("#successFrequency"),
    successTeam: $("#successTeam"),
    successShare: $("#successShare"),
    successCopy: $("#successCopy"),

    sponsorKitModal: $("#sponsorKitModal"),
    openSponsorKit: $("#openSponsorKit"),
    sponsorKitClose: $("#sponsorKitClose"),
    sponsorKitClose2: $("#sponsorKitClose2"),
    sponsorKitMessagePreview: $("#sponsorKitMessagePreview"),
    sponsorKitBadgePreview: $("#sponsorKitBadgePreview"),
    sponsorKitCopyMessage: $("#sponsorKitCopyMessage"),
    sponsorKitCopyBadge: $("#sponsorKitCopyBadge"),
    sponsorKitCopyLink: $("#sponsorKitCopyLink"),
    copySponsorBadgeBtn: $("#copySponsorBadgeBtn"),

    shareOptionsModal: $("#shareOptionsModal"),
    shareOptionsBtn: $("#shareOptionsBtn"),
    shareOptionsClose: $("#shareOptionsClose"),
    shareOptionsClose2: $("#shareOptionsClose2"),
    shareVariant: $("#shareVariant"),
    utmSource: $("#utmSource"),
    utmMedium: $("#utmMedium"),
    utmCampaign: $("#utmCampaign"),
    shareLinkPreview: $("#shareLinkPreview"),
    shareTextPreview: $("#shareTextPreview"),
    shareOptionsCopyLink: $("#shareOptionsCopyLink"),
    shareOptionsShare: $("#shareOptionsShare"),

    year: $("#year"),

    // Sticky alias support
    sticky:
      $("#sticky") ||
      $("#stickyDonate") ||
      $(".sticky") ||
      $(".sticky-donate") ||
      $('[data-sticky="donate"]'),

    stickyRaised: $("#stickyRaised"),
    stickyPct: $("#stickyPct"),
    stickyGoal: $("#stickyGoal"),

    backToTop: $("#backToTop"),

    // Optional elite add-ons
    announcementFlag: $("#announcementFlag") || $(".announcement-flag"),
    mobileTabs: $("#ffMobileTabs") || $(".ff-mobile-tabs"),
    confettiHost: $(".confetti-host") || $("#confettiHost"),
  };

  /* -------------------------
  Toast (supports #toastRegion/.toast-region + .toast-close)
  ------------------------- */

  const toastEls = (() => {
    const toastEl = $("#toast") || $(".toast");
    const region = $("#toastRegion") || $(".toast-region") || toastEl?.parentElement || null;
    const text =
      $("#toastText") ||
      toastEl?.querySelector("#toastText") ||
      toastEl?.querySelector(".toast-text") ||
      toastEl?.querySelector('[data-toast-text]') ||
      null;
    const close =
      $("#toastClose") ||
      toastEl?.querySelector("#toastClose") ||
      toastEl?.querySelector(".toast-close") ||
      null;

    return { region, toast: toastEl, text, close };
  })();

  let toastTimer = null;
  const safeVibrate = (ms = 12) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };

  const toast = (msg, { durationMs = 2600, haptic = false } = {}) => {
    if (!toastEls.toast || !toastEls.text) return;
    toastEls.text.textContent = String(msg || "");
    setShown(toastEls.toast, true);
    if (haptic) safeVibrate(12);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setShown(toastEls.toast, false), durationMs);
  };

  toastEls.close?.addEventListener("click", () => setShown(toastEls.toast, false));
  window.ffToast = (msg) => toast(msg);

  /* -------------------------
  Theme + Brand
  ------------------------- */

  const THEME_KEY = "ff_flagship_theme_v43";

  function applyBrand() {
    const r = document.documentElement;
    if (CONFIG.brand?.primary) r.style.setProperty("--primary", CONFIG.brand.primary);
    if (CONFIG.brand?.primaryStrong) r.style.setProperty("--primary-2", CONFIG.brand.primaryStrong);
    if (CONFIG.brand?.accent) r.style.setProperty("--accent", CONFIG.brand.accent);

    const mark = $("#brandMark");
    if (!mark) return;

    const logo = String(CONFIG.brand?.logoUrl || "").trim();
    if (logo) mark.innerHTML = `<img class="brand-logo" alt="" src="${escapeHtml(logo)}" decoding="async" loading="eager" />`;
    else mark.textContent = CONFIG.brand?.markText || "FF";
  }

  function applyTheme(theme) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);

    const btn = $("#themeToggle");
    if (btn) {
      btn.setAttribute("aria-pressed", String(t === "dark"));
      btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
      btn.textContent = t === "dark" ? "☀" : "☾";
    }
  }

  function initTheme() {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    let theme = prefersDark ? "dark" : "light";
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored) theme = stored;
    } catch {}

    applyTheme(theme);

    $("#themeToggle")?.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      const next = cur === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
    });
  }

  /* -------------------------
  Sticky offsets + header shadow + topbar dismiss
  ------------------------- */

  const TOPBAR_KEY = "ff_topbar_dismissed_v1";

  function measureStickyOffsets() {
    const topbar = $("#topbar");
    const header = $("#top");
    const topbarH = topbar && !topbar.hidden ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
    const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    const offset = topbarH + headerH + 14;

    const r = document.documentElement;
    r.style.setProperty("--topbar-h", topbarH + "px");
    r.style.setProperty("--header-h", headerH + "px");
    r.style.setProperty("--scroll-offset", offset + "px");

    try {
      window.dispatchEvent(new Event("ff:offsets"));
    } catch {}
  }

  function initTopbarDismiss() {
    const topbar = $("#topbar");
    const btn = $("#topbarDismiss");
    if (!topbar || !btn) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(TOPBAR_KEY) === "1";
    } catch {}

    if (dismissed) {
      topbar.hidden = true;
      measureStickyOffsets();
    }

    btn.addEventListener("click", () => {
      topbar.hidden = true;
      try {
        localStorage.setItem(TOPBAR_KEY, "1");
      } catch {}
      measureStickyOffsets();
    });
  }

  function initHeaderShadow() {
    const header = $("#top");
    if (!header) return;

    const onScroll = () => {
      const y = window.scrollY || 0;
      header.setAttribute("data-scrolled", y > 8 ? "true" : "false");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* -------------------------
  Drawer (Esc close, focus trap, restore focus)
  ------------------------- */

  const drawerApi = { isOpen: () => false, open: () => {}, close: () => {} };

  function initDrawer() {
    const drawer = $("#mobileDrawer");
    const openBtn = $("#menuOpen");
    if (!drawer || !openBtn) return;

    let lastFocus = null;
    let trapCleanup = null;

    const isOpen = () => drawer.getAttribute("data-open") === "true";

    const open = () => {
      if (isOpen()) return;
      lastFocus = document.activeElement;

      drawer.setAttribute("data-open", "true");
      openBtn.setAttribute("aria-expanded", "true");
      setOpenHiddenA11y(drawer, true);

      lockScroll(true);

      if (trapCleanup) {
        trapCleanup();
        trapCleanup = null;
      }
      trapCleanup = trapFocus(drawer);

      requestAnimationFrame(() => {
        focusFirst(drawer.querySelector(".drawer-panel") || drawer);
      });
    };

    const close = () => {
      if (!isOpen()) return;

      drawer.setAttribute("data-open", "false");
      openBtn.setAttribute("aria-expanded", "false");
      setOpenHiddenA11y(drawer, false);

      if (trapCleanup) {
        trapCleanup();
        trapCleanup = null;
      }

      lockScroll(false);

      const target = lastFocus || openBtn;
      if (target && typeof target.focus === "function") requestAnimationFrame(() => target.focus());
      lastFocus = null;
    };

    openBtn.addEventListener("click", open);

    drawer.addEventListener("click", (e) => {
      const closeBtn = e.target?.closest?.('[data-close="true"]');
      const clickedBackdrop = e.target?.classList?.contains("drawer-backdrop");
      if (closeBtn || clickedBackdrop || e.target === drawer) close();
    });

    $$('a[href^="#"]', drawer).forEach((a) => a.addEventListener("click", close));

    drawerApi.isOpen = isOpen;
    drawerApi.open = open;
    drawerApi.close = close;

    if (!isOpen()) setOpenHiddenA11y(drawer, false);
  }

  /* -------------------------
  Scroll spy
  ------------------------- */

  function getScrollOffsetPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--scroll-offset").trim();
    const n = Number(String(v).replace("px", "").trim());
    return Number.isFinite(n) ? n : 0;
  }

  function initScrollSpy() {
    const nav = $("#navLinks");
    if (!nav || !("IntersectionObserver" in window)) return;

    const links = $$("a[data-spy]", nav);
    const map = new Map();

    links.forEach((a) => {
      const id = a.getAttribute("href")?.replace("#", "");
      if (id) map.set(id, a);
    });

    const sections = ["progress", "impact", "teams", "sponsors", "donate"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const setActive = (id) => {
      links.forEach((a) => a.setAttribute("data-active", "false"));
      const a = map.get(id);
      if (a) a.setAttribute("data-active", "true");
    };

    let io = null;

    const buildObserver = () => {
      if (io) io.disconnect();
      const offset = getScrollOffsetPx();
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];
          if (visible?.target?.id) setActive(visible.target.id);
        },
        {
          rootMargin: `-${offset + 8}px 0px -62% 0px`,
          threshold: [0.08, 0.18, 0.28, 0.38],
        }
      );
      sections.forEach((s) => io.observe(s));
    };

    buildObserver();
    window.addEventListener("ff:offsets", debounce(buildObserver, 120));
    window.addEventListener("resize", debounce(buildObserver, 180), { passive: true });

    links.forEach((a) => {
      a.addEventListener("click", () => {
        const id = a.getAttribute("href")?.replace("#", "");
        if (id) setActive(id);
      });
    });

    setActive("progress");
  }

  /* -------------------------
  Canonical + Social + JSON-LD
  ------------------------- */

  const canonicalUrl = () => {
    const u = new URL(window.location.href);
    u.hash = "";
    return u.toString();
  };

  function ensureCanonicalAndOgUrl() {
    const url = canonicalUrl();
    const canon = $("#ffCanonical");
    if (canon) canon.setAttribute("href", url);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", url);
  }

  function svgOgPlaceholderDataUri(title, subtitle) {
    const t = String(title || "Fundraiser").slice(0, 64);
    const s = String(subtitle || "FutureFunded").slice(0, 64);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#0b1020"/>
<stop offset="1" stop-color="#c2410c"/>
</linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#g)"/>
<circle cx="220" cy="160" r="140" fill="rgba(249,115,22,.22)"/>
<circle cx="980" cy="520" r="220" fill="rgba(255,255,255,.08)"/>
<rect x="84" y="92" width="1032" height="446" rx="42" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.12)"/>
<text x="120" y="230" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="68" font-weight="900" fill="#ffffff">${escapeHtml(
      t
    )}</text>
<text x="120" y="304" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="34" font-weight="650" fill="rgba(255,255,255,.86)">${escapeHtml(
      s
    )}</text>
<text x="120" y="400" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="26" font-weight="650" fill="rgba(255,255,255,.76)">Secure checkout • Instant receipt</text>
<text x="120" y="444" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="24" font-weight="650" fill="rgba(255,255,255,.70)">Powered by FutureFunded</text>
</svg>`;

    const encoded = encodeURIComponent(svg)
      .replace(/%0A/g, "")
      .replace(/%20/g, " ")
      .replace(/%3D/g, "=")
      .replace(/%3A/g, ":")
      .replace(/%2F/g, "/")
      .replace(/%22/g, "'");

    return `data:image/svg+xml;charset=utf-8,${encoded}`;
  }

  function ensureSocialMeta() {
    const org = String(CONFIG.org?.shortName || "Fundraiser");
    const title = `${org} • Fundraiser`;
    const desc =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      "Donate securely in under a minute with instant email receipts and transparent impact.";

    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", desc);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", desc);

    const ogImg = document.querySelector('meta[property="og:image"]');
    const twImg = document.querySelector('meta[name="twitter:image"]');
    const existing = (ogImg?.getAttribute("content") || "").trim();

    if (!existing) {
      const img = svgOgPlaceholderDataUri(org, "FutureFunded • Secure checkout");
      ogImg?.setAttribute("content", img);
      twImg?.setAttribute("content", img);
    }
  }

  function injectJsonLd() {
    const el = document.getElementById("ffJsonLd");
    if (!el) return;

    const url = canonicalUrl();
    const org = String(CONFIG.org?.shortName || "Fundraiser");
    const goal = Number(state.goal || 0);
    const raised = Number(state.raised || 0);

    const json = {
      "@context": "https://schema.org",
      "@type": "DonateAction",
      name: `${org} Fundraiser`,
      target: url,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
      recipient: { "@type": "Organization", name: org },
      object: { "@type": "MonetaryAmount", currency: currencyCode(), value: raised },
      potentialAction: { "@type": "DonateAction", target: url },
      additionalProperty: [
        { "@type": "PropertyValue", name: "goal", value: goal },
        { "@type": "PropertyValue", name: "raised", value: raised },
      ],
    };

    el.textContent = JSON.stringify(json);
  }

  /* -------------------------
  Clipboard + Share
  ------------------------- */

  async function copyToClipboard(text) {
    const v = String(text || "");
    try {
      await navigator.clipboard.writeText(v);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = v;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  function buildShareUrlWithUtm(baseUrl, utm) {
    try {
      const u = new URL(baseUrl);
      if (utm?.source) u.searchParams.set("utm_source", utm.source);
      if (utm?.medium) u.searchParams.set("utm_medium", utm.medium);
      if (utm?.campaign) u.searchParams.set("utm_campaign", utm.campaign);
      return u.toString();
    } catch {
      return baseUrl;
    }
  }

  function shareTextVariant(kind = "standard") {
    const org = String(CONFIG.org?.shortName || "our program");
    const dl = String(CONFIG.fundraiser?.deadlineISO || "");
    const d = dl ? new Date(dl) : null;

    const deadlinePretty =
      d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

    if (kind === "urgent") {
      return `We’re fundraising for ${org}. If you can, donate today—every gift helps. ${deadlinePretty ? `Ends ${deadlinePretty}.` : ""}`;
    }

    if (kind === "sponsor") {
      return `Local businesses: sponsor ${org} and get recognition + a receipt for records. Want to help stabilize travel, gear, and scholarships?`;
    }

    return `Support ${org}—secure checkout + instant receipt. Every gift keeps the program accessible.`;
  }

  async function doShare({ url, title, text }) {
    const payload = { title, text, url };
    emit("ff:share", { url, title, text });

    if (navigator.share) {
      try {
        await navigator.share(payload);
        return true;
      } catch {}
    }

    const ok = await copyToClipboard(url);
    toast(ok ? "Link copied." : "Couldn’t copy link.", { haptic: ok });
    return ok;
  }

  /* -------------------------
  Modal utilities
  ------------------------- */

  const modalState = new Map();

  function isModalOpen(el) {
    return !!el && el.getAttribute("data-open") === "true";
  }

  function openModal(el) {
    if (!el || isModalOpen(el)) return;

    modalState.set(el, { lastFocus: document.activeElement, trapCleanup: null });

    el.setAttribute("data-open", "true");
    setOpenHiddenA11y(el, true);
    lockScroll(true);

    const panel = el.querySelector(".modal-panel") || el;
    const entry = modalState.get(el);
    if (entry?.trapCleanup) entry.trapCleanup();
    entry.trapCleanup = trapFocus(el);

    requestAnimationFrame(() => focusFirst(panel));
  }

  function closeModal(el) {
    if (!el || !isModalOpen(el)) return;

    el.setAttribute("data-open", "false");
    setOpenHiddenA11y(el, false);

    const entry = modalState.get(el);
    if (entry?.trapCleanup) entry.trapCleanup();
    modalState.delete(el);

    lockScroll(false);

    const target = entry?.lastFocus;
    if (target && typeof target.focus === "function") requestAnimationFrame(() => target.focus());
  }

  function closeTopmostModal() {
    const order = [E.shareOptionsModal, E.sponsorKitModal, E.successModal, E.checkoutModal].filter(Boolean);
    for (const m of order) {
      if (isModalOpen(m)) {
        closeModal(m);
        return true;
      }
    }
    return false;
  }

  /* -------------------------
  UI text + basics
  ------------------------- */

  function applyOrgText() {
    const org = CONFIG.org || {};

    if (E.orgName) E.orgName.textContent = org.shortName || "Fundraiser";
    if (E.orgMeta) E.orgMeta.textContent = org.metaLine || "";
    if (E.heroOrgLine) E.heroOrgLine.textContent = `${org.shortName || "Fundraiser"} • Fundraiser`;
    if (E.orgPill) E.orgPill.textContent = `${org.shortName || "Fundraiser"} Fundraiser`;
    if (E.seasonPill) E.seasonPill.textContent = org.seasonLabel || "Season Fund";
    if (E.sportPill) E.sportPill.textContent = org.sportLabel || "Youth program";
    if (E.year) E.year.textContent = String(new Date().getFullYear());

    // QR: use ff-qr-endpoint if provided; else fallback to qrserver
    if (E.donateQr) {
      const base = canonicalUrl();
      const qre = getQrEndpoint().trim();

      if (qre) {
        try {
          const u = new URL(qre, window.location.origin);
          // Convention: pass "data" query param
          u.searchParams.set("data", base);
          E.donateQr.src = u.toString();
        } catch {
          const qrData = encodeURIComponent(base);
          E.donateQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${qrData}`;
        }
      } else {
        const qrData = encodeURIComponent(base);
        E.donateQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${qrData}`;
      }
    }

    const phone = meta("ff-text-to-donate-phone").trim();
    const keyword = meta("ff-text-to-donate-keyword").trim();

    if (phone && keyword && E.textDonateCard) {
      E.textDonateCard.hidden = false;
      E.textDonatePhone.textContent = phone;
      E.textDonateKeyword.textContent = keyword;
      E.textDonateHint.textContent = "Standard messaging rates may apply.";
      const sms = `sms:${phone}?&body=${encodeURIComponent(keyword)}`;
      E.textDonateSmsLink?.setAttribute("href", sms);

      E.textDonateCopy?.addEventListener("click", async () => {
        const ok = await copyToClipboard(`Text ${keyword} to ${phone}`);
        toast(ok ? "Copied." : "Couldn’t copy.", { haptic: ok });
      });
    }
  }

  function initInputClassAliases() {
    // enables .input[aria-invalid="true"] styling without changing markup
    [E.amountInput, E.nameInput, E.emailInput, E.noteInput].forEach((el) => {
      if (!el) return;
      if (!el.classList.contains("input")) el.classList.add("input");
    });
  }

  /* -------------------------
  Progress
  ------------------------- */

  function setLastUpdatedUi(now = Date.now()) {
    const age = state.lastUpdatedAt ? now - state.lastUpdatedAt : Infinity;
    const label = state.lastUpdatedAt ? `Updated ${formatAge(age)}` : "Updated —";

    if (E.lastUpdatedPill) {
      E.lastUpdatedPill.textContent = label;
      let status = "offline";
      if (state.lastStatusOk) status = age < CONFIG.liveRefreshMs * 2.2 ? "ok" : "stale";
      E.lastUpdatedPill.setAttribute("data-status", status);
    }

    if (E.lastUpdatedText) E.lastUpdatedText.textContent = label;
  }

  function setDeadlineUi() {
    const iso = String(CONFIG.fundraiser?.deadlineISO || "");
    const d = new Date(iso);

    if (E.deadlineText) {
      if (!iso || Number.isNaN(d.getTime())) E.deadlineText.textContent = "—";
      else E.deadlineText.textContent = `Ends ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }

    const dl = daysLeft(iso);
    if (E.daysLeftText) E.daysLeftText.textContent = dl == null ? "—" : String(dl);

    if (E.countdownPill) {
      if (dl == null) E.countdownPill.textContent = "Ends soon";
      else if (dl === 0) E.countdownPill.textContent = "Last day";
      else if (dl === 1) E.countdownPill.textContent = "1 day left";
      else E.countdownPill.textContent = `${dl} days left`;
    }
  }

  function nextMilestone(goal, raised) {
    const g = Number(goal) || 0;
    if (!g) return null;

    const p = pct(raised, g);
    const steps = [25, 50, 75, 100];
    const next = steps.find((s) => s > p) || 100;
    const target = Math.round((next / 100) * g);

    return { nextPct: next, target, remaining: Math.max(0, target - (Number(raised) || 0)) };
  }

  function updateProgressUi() {
    const goal = Number(state.goal) || 0;
    const raised = Number(state.raised) || 0;
    const donors = Number(state.donors) || 0;

    const p = pct(raised, goal);
    const remain = Math.max(0, goal - raised);
    const avg = donors > 0 ? raised / donors : 0;

    E.raisedBig && (E.raisedBig.textContent = money0(raised));
    E.raisedRow && (E.raisedRow.textContent = money0(raised));
    E.goalRow && (E.goalRow.textContent = money0(goal));
    E.goalPill && (E.goalPill.textContent = money0(goal));
    E.remainingText && (E.remainingText.textContent = money0(remain));
    E.pctText && (E.pctText.textContent = String(p));
    E.donorsText && (E.donorsText.textContent = String(donors));
    E.avgGiftText && (E.avgGiftText.textContent = money0(avg));

    if (E.overallBar) {
      // supports both old width and new CSS API (--progress)
      E.overallBar.style.width = `${clamp(p, 0, 100)}%`;
      E.overallBar.style.setProperty("--progress", `${clamp(p, 0, 100)}%`);
    }

    const meter = E.overallBar?.closest?.('[role="progressbar"]');
    if (meter) {
      meter.setAttribute("aria-valuenow", String(clamp(p, 0, 100)));
      meter.setAttribute("aria-valuetext", `${p}% funded`);
    }

    const ms = nextMilestone(goal, raised);
    if (E.nextMilestoneText) {
      if (!ms) E.nextMilestoneText.textContent = "—";
      else if (p >= 100) E.nextMilestoneText.textContent = "Goal reached";
      else E.nextMilestoneText.textContent = `${ms.nextPct}% (${money0(ms.remaining)} to go)`;
    }

    E.stickyRaised && (E.stickyRaised.textContent = money0(raised));
    E.stickyGoal && (E.stickyGoal.textContent = money0(goal));
    E.stickyPct && (E.stickyPct.textContent = String(p));

    const matchActive = !!CONFIG.fundraiser?.match?.active;
    if (E.matchPill) E.matchPill.hidden = !matchActive;
  }

  /* -------------------------
  Render: Allocation / Impact / Gifts / Teams / Sponsors
  ------------------------- */

  function renderAllocation() {
    if (!E.allocationBars) return;

    const rows = Array.isArray(CONFIG.allocation) ? CONFIG.allocation : [];
    if (!rows.length) {
      E.allocationBars.innerHTML = `<div class="notice"><strong>No allocation data yet.</strong><div class="help">Add CONFIG.allocation to show transparency bars.</div></div>`;
      return;
    }

    E.allocationBars.innerHTML = rows
      .map((r) => {
        const label = escapeHtml(r.label || "");
        const pctV = clamp(Number(r.pct) || 0, 0, 100);

        return `
<div class="mini">
  <div class="progress-mini">
    <div style="min-width:0;">
      <div class="kicker">${label}</div>
    </div>
    <div class="progress-mini__right">
      <div class="badge num">${pctV}%</div>
    </div>
  </div>
  <div class="meter" aria-hidden="true"><span style="width:${pctV}%;--progress:${pctV}%"></span></div>
</div>
`;
      })
      .join("");
  }

  function renderImpact() {
    if (!E.impactGrid) return;

    const items = Array.isArray(CONFIG.impact) ? CONFIG.impact : [];
    if (!items.length) {
      E.impactGrid.innerHTML = `<div class="notice"><strong>No impact options yet.</strong><div class="help">Add CONFIG.impact to show prefill cards.</div></div>`;
      return;
    }

    E.impactGrid.innerHTML = items
      .map((it) => {
        const amt = Number(it.amount) || 0;
        const tag = escapeHtml(it.tag || "Impact");
        const title = escapeHtml(it.title || "");
        const desc = escapeHtml(it.desc || "");
        const badge = it.badge ? `<span class="badge">${escapeHtml(it.badge)}</span>` : "";

        return `
<button class="impact-card" type="button" data-prefill-amount="${amt}" role="listitem" aria-label="Prefill donation ${money0(
          amt
        )}">
  <div class="impact-top">
    <span class="tag">${tag}</span>
    ${badge}
  </div>
  <div class="impact-amt num">${money0(amt)}</div>
  <div class="impact-title">${title}</div>
  <div class="impact-desc">${desc}</div>
  <div class="impact-hint">Tap to prefill →</div>
</button>
`;
      })
      .join("");
  }

  function renderGifts(gifts) {
    if (!E.giftsList) return;

    const rows = Array.isArray(gifts) ? gifts : [];
    if (!rows.length) {
      E.giftsList.innerHTML = `<div class="notice"><strong>No gifts listed yet.</strong><div class="help">Once donations start coming in, this section shows momentum.</div></div>`;
      return;
    }

    E.giftsList.innerHTML = rows
      .slice(0, 8)
      .map((g) => {
        const who = escapeHtml(g.who || "Anonymous");
        const amt = money0(Number(g.amount) || 0);
        const when = g.minutesAgo != null ? `${Number(g.minutesAgo)}m ago` : g.when || "";

        return `
<div class="gift">
  <div style="min-width:0;">
    <div class="who">${who}</div>
    <div class="when">${escapeHtml(when)}</div>
  </div>
  <div class="amt num">${amt}</div>
</div>
`;
      })
      .join("");
  }

  function computeNeedsSet() {
    state.needsSet = new Set();
    for (const t of state.teams) {
      const g = Number(t.goal) || 0;
      const r = Number(t.raised) || 0;
      if (g > 0 && r / g < 0.45) state.needsSet.add(String(t.key));
    }
  }

  function renderTeams() {
    if (!E.teamsGrid) return;

    const teams = state.teams || [];
    if (!teams.length) {
      E.teamsGrid.innerHTML = `<div class="notice"><strong>No teams configured.</strong><div class="help">Add CONFIG.teams to show team cards.</div></div>`;
      return;
    }

    E.teamsGrid.innerHTML = teams
      .map((t) => {
        const key = escapeHtml(t.key || "");
        const name = escapeHtml(t.name || "Team");
        const blurb = escapeHtml(t.blurb || "");
        const img = escapeHtml(t.image || "");
        const goal = Number(t.goal) || 0;
        const raised = Number(t.raised) || 0;
        const p = goal ? clamp(Math.round((raised / goal) * 100), 0, 100) : 0;
        const tag = t.tag ? `<span class="badge">${escapeHtml(t.tag)}</span>` : "";

        return `
<article class="team-card" role="listitem"
  data-team-key="${key}"
  data-team-name="${escapeHtml(String(t.name || "").toLowerCase())}"
  data-team-tag="${escapeHtml(String(t.tag || "").toLowerCase())}"
  data-team-needs="${state.needsSet.has(String(t.key)) ? "1" : "0"}"
>
  <div class="team-media">
    ${img ? `<img class="team-img" src="${img}" alt="" loading="lazy" decoding="async" />` : ``}
  </div>

  <div class="team-body">
    <div class="team-head">
      <div style="min-width:0;">
        <div class="kicker">Team</div>
        <div class="team-name">${name}</div>
        <div class="team-blurb">${blurb}</div>
        <div style="margin-top:.55rem; display:flex; gap:.45rem; flex-wrap:wrap;">
          ${tag}
          ${state.needsSet.has(String(t.key)) ? `<span class="badge">Needing support</span>` : ``}
        </div>
      </div>

      <div class="team-raise num">${money0(raised)}<div class="help" style="margin-top:.15rem;">of ${money0(
          goal
        )}</div></div>
    </div>

    <div class="meter" aria-hidden="true"><span style="width:${p}%;--progress:${p}%"></span></div>

    <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-top:.35rem;">
      <button class="btn btn-primary btn-sm" type="button" data-team-pick="${key}" data-prefill-amount="50">Donate to team</button>
      <button class="btn btn-secondary btn-sm" type="button" data-team-select="${key}">Tag team</button>
    </div>
  </div>
</article>
`;
      })
      .join("");

    applyTeamFilter();
  }

  function applyTeamFilter() {
    const grid = E.teamsGrid;
    if (!grid) return;

    const filter = state.teamFilter || "all";
    const q = (state.teamQuery || "").trim().toLowerCase();
    const cards = $$("[data-team-key]", grid);

    let shown = 0;
    for (const c of cards) {
      const key = c.getAttribute("data-team-key") || "";
      const name = c.getAttribute("data-team-name") || "";
      const tag = c.getAttribute("data-team-tag") || "";
      const needs = c.getAttribute("data-team-needs") === "1";

      let ok = true;
      if (filter === "featured") ok = tag.includes("featured");
      if (filter === "needs") ok = needs;
      if (ok && q) ok = name.includes(q) || key.toLowerCase().includes(q);

      c.hidden = !ok;
      if (ok) shown++;
    }

    if (shown === 0) {
      grid.innerHTML = `<div class="notice"><strong>No teams match.</strong><div class="help">Try a different filter or clear the search.</div></div>`;
    }
  }

  function bindTeamTools() {
    $$("[data-team-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-team-filter") || "all";
        state.teamFilter = v;
        $$("[data-team-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        renderTeams();
      });
    });

    E.teamSearch?.addEventListener(
      "input",
      debounce(() => {
        state.teamQuery = E.teamSearch.value || "";
        renderTeams();
      }, 120)
    );
  }

  function populateTeamSelect() {
    if (!E.teamSelect) return;

    const base = `<option value="all">All teams • Support the full program</option>`;
    const opts = (state.teams || [])
      .map((t) => {
        const key = escapeHtml(t.key || "");
        const name = escapeHtml(t.name || "Team");
        return `<option value="${key}">${name}</option>`;
      })
      .join("");

    E.teamSelect.innerHTML = base + opts;
  }

  function renderSponsors() {
    if (E.sponsorWall) {
      const wall = Array.isArray(CONFIG.sponsors?.wall) ? CONFIG.sponsors.wall : [];
      if (!wall.length) {
        E.sponsorWall.innerHTML = `<div class="notice"><strong>No sponsors listed yet.</strong><div class="help">Early sponsors show up here for recognition.</div></div>`;
      } else {
        E.sponsorWall.innerHTML = wall
          .slice(0, 10)
          .map((s, i) => {
            const rank = i + 1;
            const name = escapeHtml(s.name || "Sponsor");
            const metaLine = escapeHtml(s.meta || "");
            const amt = money0(Number(s.amount) || 0);

            return `
<div class="leader">
  <div class="leader-left">
    <div class="rank num">${rank}</div>
    <div style="min-width:0;">
      <div class="leader-name">${name}</div>
      <div class="leader-meta">${metaLine}</div>
    </div>
  </div>
  <div class="leader-amt num">${amt}</div>
</div>
`;
          })
          .join("");
      }
    }

    if (E.sponsorTiers) {
      const tiers = Array.isArray(CONFIG.sponsors?.tiers) ? CONFIG.sponsors.tiers : [];
      if (!tiers.length) {
        E.sponsorTiers.innerHTML = `<div class="notice"><strong>No sponsor tiers configured.</strong><div class="help">Add CONFIG.sponsors.tiers for prefilled sponsor options.</div></div>`;
      } else {
        E.sponsorTiers.innerHTML = tiers
          .map((t) => {
            const name = escapeHtml(t.name || "Sponsor");
            const amt = Number(t.amount) || 0;
            const desc = escapeHtml(t.desc || "");
            const badges = Array.isArray(t.badges)
              ? t.badges.map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join(" ")
              : "";

            return `
<article class="tier lift">
  <div class="tier-row">
    <div style="min-width:0;">
      <div class="kicker">Tier</div>
      <h3 style="margin-top:.35rem;">${name}</h3>
      <div style="margin-top:.55rem; display:flex; gap:.45rem; flex-wrap:wrap;">
        ${badges}
      </div>
    </div>
    <div class="tier-price num">${money0(amt)}</div>
  </div>

  <p class="tier-desc">${desc}</p>

  <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-top:.85rem;">
    <button class="btn btn-primary btn-sm" type="button" data-prefill-amount="${amt}">Choose ${money0(amt)}</button>
    <button class="btn btn-secondary btn-sm" type="button" data-open-sponsor-kit="true" data-sponsor-tier="${escapeHtml(
      t.name || ""
    )}">Sponsor Kit</button>
  </div>
</article>
`;
          })
          .join("");
      }
    }

    if (E.spotlightTitle) E.spotlightTitle.textContent = String(CONFIG.sponsors?.spotlight?.title || "Sponsor spotlight");
    if (E.spotlightCopy) E.spotlightCopy.textContent = String(CONFIG.sponsors?.spotlight?.copy || "");
  }

  /* -------------------------
  Sponsor Kit (tier-aware + tier-aware copy)
  ------------------------- */

  let sponsorKitCurrentTier = null;

  function sponsorKitPayload(tierOverride) {
    const org = String(CONFIG.org?.shortName || "our program");
    const url = canonicalUrl();
    const spotlight = String(tierOverride || CONFIG.sponsors?.spotlight?.title || "Sponsor");
    const msg = `Proud to support ${org} as a ${spotlight}. Help keep the program accessible: ${url}`;
    const badge = `✅ Proud ${spotlight} of ${org} • ${url}`;
    return { msg, badge, url, spotlight };
  }

  function bindSponsorKit() {
    const open = (tierName) => {
      sponsorKitCurrentTier = tierName || null;
      const { msg, badge } = sponsorKitPayload(sponsorKitCurrentTier);

      if (E.sponsorKitMessagePreview) E.sponsorKitMessagePreview.textContent = msg;
      if (E.sponsorKitBadgePreview) E.sponsorKitBadgePreview.textContent = badge;

      openModal(E.sponsorKitModal);
      emit("ff:sponsor_kit_open", { tier: sponsorKitCurrentTier });
    };

    E.openSponsorKit?.addEventListener("click", () => open(null));

    document.addEventListener("click", (e) => {
      const b = e.target?.closest?.('[data-open-sponsor-kit="true"]');
      if (!b) return;
      const tier = b.getAttribute("data-sponsor-tier") || null;
      open(tier);
    });

    E.sponsorKitClose?.addEventListener("click", () => closeModal(E.sponsorKitModal));
    E.sponsorKitClose2?.addEventListener("click", () => closeModal(E.sponsorKitModal));

    E.sponsorKitCopyMessage?.addEventListener("click", async () => {
      const { msg } = sponsorKitPayload(sponsorKitCurrentTier);
      const ok = await copyToClipboard(msg);
      toast(ok ? "Sponsor message copied." : "Couldn’t copy.", { haptic: ok });
    });

    E.sponsorKitCopyBadge?.addEventListener("click", async () => {
      const { badge } = sponsorKitPayload(sponsorKitCurrentTier);
      const ok = await copyToClipboard(badge);
      toast(ok ? "Badge line copied." : "Couldn’t copy.", { haptic: ok });
    });

    E.sponsorKitCopyLink?.addEventListener("click", async () => {
      const ok = await copyToClipboard(canonicalUrl());
      toast(ok ? "Link copied." : "Couldn’t copy.", { haptic: ok });
    });

    E.copySponsorBadgeBtn?.addEventListener("click", async () => {
      const { badge } = sponsorKitPayload(sponsorKitCurrentTier);
      const ok = await copyToClipboard(badge);
      toast(ok ? "Copied." : "Couldn’t copy.", { haptic: ok });
    });
  }

  /* -------------------------
  Share Options + Copy links
  ------------------------- */

  function readUtmInputs() {
    return {
      source: (E.utmSource?.value || "").trim(),
      medium: (E.utmMedium?.value || "").trim(),
      campaign: (E.utmCampaign?.value || "").trim(),
    };
  }

  function updateShareOptionsPreview() {
    const base = canonicalUrl();
    const utm = readUtmInputs();
    const url = buildShareUrlWithUtm(base, utm);

    const variant = E.shareVariant?.value || "standard";
    const text = shareTextVariant(variant);

    if (E.shareLinkPreview) E.shareLinkPreview.textContent = url;
    if (E.shareTextPreview) E.shareTextPreview.textContent = text;

    return { url, text, title: `${String(CONFIG.org?.shortName || "Fundraiser")} • Fundraiser` };
  }

  function bindShareOptions() {
    E.shareOptionsBtn?.addEventListener("click", () => {
      updateShareOptionsPreview();
      openModal(E.shareOptionsModal);
    });

    E.shareOptionsClose?.addEventListener("click", () => closeModal(E.shareOptionsModal));
    E.shareOptionsClose2?.addEventListener("click", () => closeModal(E.shareOptionsModal));

    [E.shareVariant, E.utmSource, E.utmMedium, E.utmCampaign].forEach((el) => {
      el?.addEventListener("input", debounce(updateShareOptionsPreview, 80));
      el?.addEventListener("change", debounce(updateShareOptionsPreview, 80));
    });

    E.shareOptionsCopyLink?.addEventListener("click", async () => {
      const { url } = updateShareOptionsPreview();
      const ok = await copyToClipboard(url);
      toast(ok ? "Share link copied." : "Couldn’t copy.", { haptic: ok });
    });

    E.shareOptionsShare?.addEventListener("click", async () => {
      const p = updateShareOptionsPreview();
      await doShare(p);
    });

    const shareButtons = ["#shareBtnTop", "#shareBtnDrawer", "#shareBtnGifts", "#shareBtn2", "#successShare"]
      .map((id) => $(id))
      .filter(Boolean);

    shareButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        await doShare({
          url: canonicalUrl(),
          title: `${String(CONFIG.org?.shortName || "Fundraiser")} • Fundraiser`,
          text: shareTextVariant("standard"),
        });
      });
    });
  }

  function bindCopyLinks() {
    const ids = ["copyLinkBtn", "copyLinkBtn2", "copyLinkBtn3", "copyLinkBtn4", "qrCopyLink", "successCopy"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("click", async () => {
        const ok = await copyToClipboard(canonicalUrl());
        toast(ok ? "Link copied." : "Couldn’t copy.", { haptic: ok });
      });
    });
  }

  /* -------------------------
  Stripe / Donate form (core flow intact)
  ------------------------- */

  const FEE_RATE = 0.029;
  const FEE_FIXED = 0.30;

  function roundUpToNext5(amount) {
    const a = Math.max(0, Number(amount) || 0);
    const next = Math.ceil(a / 5) * 5;
    return clamp(next - a, 0, 5);
  }

  function coverFeeAmount(base) {
    const b = Math.max(0, Number(base) || 0);
    const total = (b + FEE_FIXED) / (1 - FEE_RATE);
    return Math.max(0, total - b);
  }

  function getDonationInputs() {
    const base = Math.max(0, Number(E.amountInput?.value) || 0);
    const addRound = E.roundUp?.checked ? roundUpToNext5(base) : 0;
    const basePlusRound = base + addRound;
    const addFee = E.coverFees?.checked ? coverFeeAmount(basePlusRound) : 0;
    const total = basePlusRound + addFee;

    return {
      base,
      addRound,
      addFee,
      total,
      frequency: E.frequencyHidden?.value || "once",
      team: E.teamSelect?.value || "all",
      name: (E.nameInput?.value || "").trim(),
      email: (E.emailInput?.value || "").trim(),
      note: (E.noteInput?.value || "").trim(),
      updatesOptIn: !!E.updatesOptIn?.checked,
    };
  }

  function renderReceiptPreview() {
    const v = getDonationInputs();

    if (E.summaryAmount) E.summaryAmount.textContent = money0(v.total);
    if (E.receiptBase) E.receiptBase.textContent = money0(v.base);

    if (E.receiptRoundRow) E.receiptRoundRow.hidden = !(v.addRound > 0);
    if (E.receiptRound) E.receiptRound.textContent = money0(v.addRound);

    if (E.receiptFeeRow) E.receiptFeeRow.hidden = !(v.addFee > 0);
    if (E.receiptFee) E.receiptFee.textContent = money2(v.addFee);

    if (E.receiptTotal) E.receiptTotal.textContent = money0(v.total);
    if (E.ffTotalHidden) E.ffTotalHidden.value = String(Math.round(v.total * 100) / 100);

    if (E.summaryFeeLine) {
      if (v.addFee > 0) {
        E.summaryFeeLine.style.display = "";
        E.summaryFeeLine.textContent = `Includes ${money2(v.addFee)} to help cover processing fees.`;
      } else {
        E.summaryFeeLine.style.display = "none";
        E.summaryFeeLine.textContent = "";
      }
    }
  }

  function setFormError(msg) {
    if (!E.formError) return;
    if (!msg) {
      E.formError.style.display = "none";
      E.formError.textContent = "";
      return;
    }
    E.formError.style.display = "";
    E.formError.textContent = String(msg);
  }

  function setCheckoutError(msg) {
    if (!E.checkoutModalError) return;
    if (!msg) {
      E.checkoutModalError.style.display = "none";
      E.checkoutModalError.textContent = "";
      return;
    }
    E.checkoutModalError.style.display = "";
    E.checkoutModalError.textContent = String(msg);
  }

  function validateFormInputs() {
    const v = getDonationInputs();
    if (v.base < 1) return { ok: false, message: "Enter an amount of at least $1." };
    if (!v.name) return { ok: false, message: "Enter your name." };
    if (!isEmail(v.email)) return { ok: false, message: "Enter a valid email for your receipt." };
    return { ok: true };
  }

  function setSubmitEnabled() {
    const res = validateFormInputs();
    if (!E.submitBtn) return;
    E.submitBtn.disabled = !res.ok;
    E.submitBtn.setAttribute("aria-disabled", String(!res.ok));

    // optional: aria-invalid for premium inline styles
    if (E.amountInput) E.amountInput.setAttribute("aria-invalid", String(!(getDonationInputs().base >= 1)));
    if (E.nameInput) E.nameInput.setAttribute("aria-invalid", String(!getDonationInputs().name));
    if (E.emailInput) E.emailInput.setAttribute("aria-invalid", String(!isEmail(getDonationInputs().email)));
  }

  let stripe = null;
  let elements = null;
  let paymentElementInstance = null;
  let mountedClientSecret = "";
  let confirming = false;

  function ensureStripe() {
    if (stripe) return stripe;
    const pk = getStripePkFromMeta();
    if (!pk || !window.Stripe) throw new Error("Stripe is not configured (missing publishable key or Stripe.js).");
    stripe = window.Stripe(pk);
    return stripe;
  }

  function openCheckout() {
    setCheckoutError("");
    if (E.checkoutLoading) E.checkoutLoading.style.display = "";
    if (E.payNowBtn) {
      E.payNowBtn.disabled = true;
      E.payNowBtn.setAttribute("aria-disabled", "true");
    }
    openModal(E.checkoutModal);
    emit("ff:checkout_open", { url: canonicalUrl() });
  }

  function closeCheckout() {
    closeModal(E.checkoutModal);
  }

  async function createPaymentIntent(payload) {
    const endpoint = getCheckoutEndpoint();
    const csrf = getCsrfToken();
    const headers = csrf ? { "X-CSRF-TOKEN": csrf } : {};
    return fetchJson(endpoint, { method: "POST", payload, headers, timeoutMs: 20000 });
  }

  function extractClientSecret(data) {
    return (
      data?.clientSecret ||
      data?.client_secret ||
      data?.payment_intent_client_secret ||
      data?.data?.clientSecret ||
      data?.data?.client_secret ||
      ""
    );
  }

  async function mountElements(clientSecret) {
    ensureStripe();
    if (!clientSecret) throw new Error("Missing client secret from checkout endpoint.");

    if (clientSecret === mountedClientSecret && elements && paymentElementInstance) {
      if (E.checkoutLoading) E.checkoutLoading.style.display = "none";
      if (E.payNowBtn) {
        E.payNowBtn.disabled = false;
        E.payNowBtn.setAttribute("aria-disabled", "false");
      }
      return;
    }

    // Cleanup prior element instance (prevents remount issues)
    try {
      paymentElementInstance?.unmount?.();
    } catch {}
    paymentElementInstance = null;
    elements = null;
    mountedClientSecret = "";

    elements = stripe.elements({ clientSecret });
    if (E.paymentElement) E.paymentElement.innerHTML = "";
    paymentElementInstance = elements.create("payment", { layout: "tabs" });
    paymentElementInstance.mount("#paymentElement");

    mountedClientSecret = clientSecret;

    if (E.checkoutLoading) E.checkoutLoading.style.display = "none";
    if (E.payNowBtn) {
      E.payNowBtn.disabled = false;
      E.payNowBtn.setAttribute("aria-disabled", "false");
    }
  }

  async function confirmPaymentFlow() {
    if (confirming) return;
    confirming = true;
    setCheckoutError("");

    try {
      if (!stripe || !elements) throw new Error("Payment form not ready yet.");

      if (E.payNowBtn) {
        E.payNowBtn.disabled = true;
        E.payNowBtn.setAttribute("aria-disabled", "true");
      }

      const returnUrl = canonicalUrl();
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (result?.error) throw new Error(result.error.message || "Payment failed.");
      showSuccessModal();
    } catch (err) {
      setCheckoutError(err?.message || "Payment failed.");
      if (E.payNowBtn) {
        E.payNowBtn.disabled = false;
        E.payNowBtn.setAttribute("aria-disabled", "false");
      }
    } finally {
      confirming = false;
    }
  }

  function maybeConfettiBurst() {
    const host = E.confettiHost;
    if (!host) return;
    // If host already contains confetti elements, let CSS do it.
    // Otherwise: generate a light burst.
    if (host.querySelector(".confetti")) return;

    const frag = document.createDocumentFragment();
    const classes = ["c1", "c2", "c3", "c4"];
    for (let i = 0; i < 12; i++) {
      const el = document.createElement("i");
      el.className = `confetti ${classes[i % classes.length]}`;
      // randomize a bit (safe)
      el.style.left = `${10 + Math.random() * 80}%`;
      el.style.animationDelay = `${Math.floor(Math.random() * 240)}ms`;
      frag.appendChild(el);
    }
    host.appendChild(frag);

    // cleanup
    window.setTimeout(() => {
      try {
        host.innerHTML = "";
      } catch {}
    }, 2200);
  }

  function showSuccessModal() {
    const v = getDonationInputs();

    if (E.successEmail) E.successEmail.textContent = v.email || "your email";
    if (E.successAmount) E.successAmount.textContent = money0(v.total);
    if (E.successFrequency) E.successFrequency.textContent = v.frequency === "monthly" ? "Monthly" : "One-time";

    if (E.successTeam) {
      const teamKey = v.team;
      const teamName =
        teamKey === "all" ? "All teams" : state.teams.find((t) => String(t.key) === String(teamKey))?.name || "Selected team";
      E.successTeam.textContent = teamName;
    }

    closeCheckout();
    openModal(E.successModal);

    maybeConfettiBurst();

    emit("ff:payment_success", { amount: v.total, team: v.team, frequency: v.frequency, email: v.email });
  }

  function bindStripeUi() {
    E.checkoutClose?.addEventListener("click", closeCheckout);
    E.checkoutClose2?.addEventListener("click", closeCheckout);

    E.checkoutHelp?.addEventListener("click", () => {
      const email = CONFIG.supportEmail || "support@getfuturefunded.com";
      window.location.href = `mailto:${email}?subject=${encodeURIComponent("Donation help")}`;
    });

    E.payNowBtn?.addEventListener("click", confirmPaymentFlow);

    E.checkoutModal?.addEventListener("click", (e) => {
      if (e.target === E.checkoutModal) closeCheckout();
    });

    E.successClose?.addEventListener("click", () => closeModal(E.successModal));
    E.successBack?.addEventListener("click", () => closeModal(E.successModal));

    E.successModal?.addEventListener("click", (e) => {
      if (e.target === E.successModal) closeModal(E.successModal);
    });

    E.successShare?.addEventListener("click", async () => {
      await doShare({
        url: canonicalUrl(),
        title: `${String(CONFIG.org?.shortName || "Fundraiser")} • Fundraiser`,
        text: shareTextVariant("standard"),
      });
    });

    E.successCopy?.addEventListener("click", async () => {
      const ok = await copyToClipboard(canonicalUrl());
      toast(ok ? "Link copied." : "Couldn’t copy.", { haptic: ok });
    });
  }

  function prefillDonation({ amount, team, scroll = true } = {}) {
    if (E.amountInput && Number(amount) > 0) E.amountInput.value = String(Math.round(Number(amount)));
    if (E.teamSelect && team) E.teamSelect.value = String(team);

    renderReceiptPreview();
    setSubmitEnabled();

    if (scroll) document.getElementById("donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
    E.amountInput?.focus();
  }

  function bindDonateForm() {
    if (!E.form) return;

    $$("[data-form-amount]").forEach((b) => {
      b.addEventListener("click", () => {
        const amt = Number(b.getAttribute("data-form-amount")) || 0;
        E.amountInput.value = String(amt);
        $$("[data-form-amount]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        renderReceiptPreview();
        setSubmitEnabled();
        E.amountInput.focus();
      });
    });

    $$("[data-quick-amount]").forEach((b) => {
      b.addEventListener("click", () => {
        const amt = Number(b.getAttribute("data-quick-amount")) || 0;
        prefillDonation({ amount: amt, scroll: true });
      });
    });

    // SINGLE delegated handler (prevents double-prefill on team buttons)
    document.addEventListener("click", (e) => {
      const pick = e.target?.closest?.("[data-team-pick]");
      if (pick) {
        const teamKey = pick.getAttribute("data-team-pick") || "all";
        const amt = Number(pick.getAttribute("data-prefill-amount")) || 50;
        prefillDonation({ amount: amt, team: teamKey, scroll: true });
        return;
      }

      const sel = e.target?.closest?.("[data-team-select]");
      if (sel) {
        const teamKey = sel.getAttribute("data-team-select") || "all";
        if (E.teamSelect) E.teamSelect.value = teamKey;
        toast("Team tagged.", { haptic: true });
        return;
      }

      const btn = e.target?.closest?.("[data-prefill-amount]");
      if (btn) {
        const amt = Number(btn.getAttribute("data-prefill-amount")) || 0;
        prefillDonation({ amount: amt, scroll: true });
      }
    });

    $$("[data-frequency]").forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-frequency") || "once";
        if (b.getAttribute("aria-disabled") === "true") return;

        $$("[data-frequency]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        if (E.frequencyHidden) E.frequencyHidden.value = v;
        if (E.summaryFreq) E.summaryFreq.textContent = v === "monthly" ? "Monthly" : "One-time";
      });
    });

    ["input", "change"].forEach((evt) => {
      E.amountInput?.addEventListener(evt, () => {
        renderReceiptPreview();
        setSubmitEnabled();
      });
      E.nameInput?.addEventListener(evt, setSubmitEnabled);
      E.emailInput?.addEventListener(evt, setSubmitEnabled);
      E.coverFees?.addEventListener(evt, () => {
        renderReceiptPreview();
        setSubmitEnabled();
      });
      E.roundUp?.addEventListener(evt, () => {
        renderReceiptPreview();
        setSubmitEnabled();
      });
    });

    E.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setFormError("");

      const check = validateFormInputs();
      if (!check.ok) {
        setFormError(check.message);
        return;
      }

      const v = getDonationInputs();
      const idem = uuid();
      if (E.ffIdemHidden) E.ffIdemHidden.value = idem;

      try {
        openCheckout();

        const payload = {
          amount: v.total,
          base_amount: v.base,
          currency: currencyCode(),
          name: v.name,
          email: v.email,
          note: v.note,
          team_focus: v.team,
          frequency: v.frequency,
          updates_opt_in: v.updatesOptIn,
          cover_fees: !!E.coverFees?.checked,
          round_up: !!E.roundUp?.checked,
          idempotency_key: idem,
        };

        const data = await createPaymentIntent(payload);

        emit("ff:checkout_intent_created", { amount: v.total, team: v.team, frequency: v.frequency });

        const clientSecret = extractClientSecret(data);
        await mountElements(clientSecret);
      } catch (err) {
        closeCheckout();
        setFormError(err?.message || "Could not start checkout.");
      }
    });

    renderReceiptPreview();
    setSubmitEnabled();
  }

  /* -------------------------
  Sticky + Back to top (supports .sticky-donate)
  ------------------------- */

  function initStickyAndTop() {
    const sticky = E.sticky;
    const back = E.backToTop;
    const donate = document.getElementById("donate");

    const onScroll = () => {
      const y = window.scrollY || 0;
      if (back) back.hidden = y < 800;

      if (sticky && donate) {
        const donateTop = donate.getBoundingClientRect().top + y;
        const show = y > 520 && y < donateTop - 260;
        sticky.hidden = !show;
        sticky.setAttribute("data-show", show ? "true" : "false");
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    back?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* -------------------------
  Status refresh
  ------------------------- */

  function applyStatusPayload(data) {
    const f = data?.fundraiser || data?.data?.fundraiser || data;
    if (f) {
      if (f.goal != null) state.goal = Number(f.goal) || state.goal;
      if (f.raised != null) state.raised = Number(f.raised) || state.raised;
      if (f.donors != null) state.donors = Number(f.donors) || state.donors;
      if (f.deadlineISO) CONFIG.fundraiser.deadlineISO = f.deadlineISO;
    }

    const gifts = data?.recentGifts || data?.data?.recentGifts;
    if (gifts) CONFIG.recentGifts = gifts;

    const teams = data?.teams || data?.data?.teams;
    if (Array.isArray(teams) && teams.length) state.teams = teams.map((t) => ({ ...t }));

    const sponsors = data?.sponsors || data?.data?.sponsors;
    if (sponsors && isPlainObject(sponsors)) CONFIG.sponsors = deepMerge(CONFIG.sponsors || {}, sponsors);

    const iso = data?.updatedAt || data?.updatedAtISO || data?.data?.updatedAt || data?.data?.updatedAtISO;
    const d = iso ? new Date(iso) : null;
    state.lastUpdatedAt = d && !Number.isNaN(d.getTime()) ? d.getTime() : Date.now();
  }

  async function refreshStatusOnce() {
    const endpoint = getStatusEndpoint();
    try {
      const data = await fetchJson(endpoint, { method: "GET", timeoutMs: 12000 });

      applyStatusPayload(data);

      state.lastStatusOk = true;
      computeNeedsSet();
      updateProgressUi();
      setDeadlineUi();
      setLastUpdatedUi();

      renderGifts(CONFIG.recentGifts || []);
      populateTeamSelect();
      renderTeams();
      renderSponsors();
    } catch {
      state.lastStatusOk = state.lastStatusOk || false;
      setLastUpdatedUi();

      if (!state.lastStatusOk) {
        renderGifts(CONFIG.recentGifts || []);
        renderAllocation();
        renderImpact();
        computeNeedsSet();
        populateTeamSelect();
        renderTeams();
        renderSponsors();
        updateProgressUi();
      }
    }
  }

  function initLiveRefresh() {
    computeNeedsSet();
    updateProgressUi();
    setDeadlineUi();
    setLastUpdatedUi();

    renderAllocation();
    renderImpact();
    renderGifts(CONFIG.recentGifts || []);
    populateTeamSelect();
    renderTeams();
    renderSponsors();

    refreshStatusOnce();
    window.setInterval(refreshStatusOnce, clamp(Number(CONFIG.liveRefreshMs) || 20000, 8000, 120000));
  }

  /* -------------------------
  Countdown tickers
  ------------------------- */

  function renderEventCountdown() {
    const evt = (CONFIG.events || [])[0];
    if (!evt || !E.eventCountdown || !E.eventTitle) return;

    E.eventTitle.textContent = evt.title || "Upcoming event";
    const d = new Date(evt.startISO);
    if (Number.isNaN(d.getTime())) {
      E.eventCountdown.textContent = "Date TBD";
      return;
    }

    const ms = d.getTime() - Date.now();
    if (ms <= 0) {
      E.eventCountdown.textContent = "Happening now / recently";
      return;
    }

    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    const m = mins % 60;

    if (days > 0) E.eventCountdown.textContent = `${days}d ${h}h`;
    else if (hours > 0) E.eventCountdown.textContent = `${hours}h ${m}m`;
    else E.eventCountdown.textContent = `${m}m`;
  }

  function initCountdownTickers() {
    const tick = () => {
      setDeadlineUi();
      setLastUpdatedUi();
      renderEventCountdown();
    };
    tick();
    window.setInterval(tick, 1000 * 15);
  }

  /* -------------------------
  Global Esc handling
  ------------------------- */

  function initGlobalEscClose() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        if (closeTopmostModal()) return;
        if (drawerApi.isOpen && drawerApi.isOpen()) drawerApi.close();
      },
      true
    );
  }

  /* -------------------------
  PWA hook (safe)
  ------------------------- */

  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  /* -------------------------
  Announcement flag (optional)
  - Markup: <div class="announcement-flag" id="announcementFlag" data-visible="true" data-autohide-ms="8000">...</div>
  - Close: <button class="a-close">×</button>
  ------------------------- */

  const ANNOUNCE_KEY = "ff_announcement_dismissed_v1";

  function initAnnouncement() {
    const el = E.announcementFlag;
    if (!el) return;

    const closeBtn = el.querySelector(".a-close") || el.querySelector("[data-close]");
    let dismissed = false;

    try {
      dismissed = localStorage.getItem(ANNOUNCE_KEY) === "1";
    } catch {}

    if (dismissed) el.setAttribute("data-visible", "false");

    const hide = () => {
      el.setAttribute("data-visible", "false");
      try {
        localStorage.setItem(ANNOUNCE_KEY, "1");
      } catch {}
      emit("ff:announcement_dismiss", {});
    };

    closeBtn?.addEventListener("click", hide);

    // Optional autohide
    const ms = Number(el.getAttribute("data-autohide-ms") || 0);
    if (ms > 0 && el.getAttribute("data-visible") === "true") {
      window.setTimeout(() => {
        if (el.getAttribute("data-visible") === "true") hide();
      }, clamp(ms, 1500, 60000));
    }

    // Optional imperative API
    window.ffAnnounce = (message, { autoHideMs = 0 } = {}) => {
      try {
        el.querySelector(".a-text") ? (el.querySelector(".a-text").textContent = message) : (el.childNodes[0].textContent = message);
      } catch {}
      el.setAttribute("data-visible", "true");
      try {
        localStorage.removeItem(ANNOUNCE_KEY);
      } catch {}
      if (autoHideMs > 0) {
        window.setTimeout(() => {
          if (el.getAttribute("data-visible") === "true") hide();
        }, clamp(autoHideMs, 1500, 60000));
      }
    };
  }

  /* -------------------------
  Mobile bottom tabs (optional)
  - Markup: <nav class="ff-mobile-tabs"> <a class="ff-mobile-tab" href="#donate">Donate</a> ...</nav>
  ------------------------- */

  function initMobileTabs() {
    const tabs = E.mobileTabs;
    if (!tabs) return;

    const scrollToHash = (hash) => {
      const id = String(hash || "").replace("#", "");
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      drawerApi?.close?.();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    tabs.addEventListener("click", (e) => {
      const a = e.target?.closest?.('a[href^="#"],button[data-target]');
      if (!a) return;

      const href = a.getAttribute("href");
      const target = a.getAttribute("data-target") || href;
      if (!target) return;

      e.preventDefault();
      scrollToHash(target);
      emit("ff:mobile_tab_click", { target });
    });
  }

  /* -------------------------
  Boot
  ------------------------- */

  function init() {
    applyBrand();
    initTheme();

    ensureCanonicalAndOgUrl();
    ensureSocialMeta();
    injectJsonLd();

    initInputClassAliases();

    applyOrgText();

    measureStickyOffsets();
    initTopbarDismiss();
    initHeaderShadow();

    initDrawer();
    initScrollSpy();

    bindCopyLinks();
    bindShareOptions();
    bindSponsorKit();

    bindDonateForm();
    bindStripeUi();
    bindTeamTools();

    initStickyAndTop();
    initCountdownTickers();
    initLiveRefresh();

    initAnnouncement();
    initMobileTabs();

    initGlobalEscClose();
    initServiceWorker();

    window.addEventListener("load", debounce(measureStickyOffsets, 120));
    window.addEventListener("resize", debounce(measureStickyOffsets, 160), { passive: true });

    window.FutureFunded = {
      prefillDonation,
      refreshStatusOnce,
      share: (text) => doShare({ url: canonicalUrl(), title: document.title, text: text || shareTextVariant("standard") }),
      config: () => safeClone(CONFIG),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(); /* end IIFE */

