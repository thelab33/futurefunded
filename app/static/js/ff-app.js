/* ============================================================================
 * FutureFunded • Flagship — ff-app.js (FULL DROP-IN • Hook-safe • CSP-safe)
 * File: app/static/js/ff-app.js
 * Version: 17.0.0-ff (overlay-deterministic • focus-correct • payments-lazy)
 *
 * Contracts honored:
 * - Hook-safe: never assumes optional nodes exist
 * - Selector map: uses #ffSelectors JSON hooks if present (with sane fallbacks)
 * - Overlay contract: open via :target / .is-open / [data-open="true"] / [aria-hidden="false"]
 *                    close via [hidden] / [data-open="false"] / [aria-hidden="true"]
 * - Deterministic checkout UX: opens/closes + focuses into dialog + Esc closes
 * - CSP-safe: nonce-aware dynamic script injection (Stripe/PayPal)
 * - Payments lazy-load: Stripe/PayPal load ONLY when checkout is open AND amount > 0
 * ========================================================================== */

(function () {
  "use strict";

/* [ff-js] ENSURE_WINDOW_FF_EARLY v1 */
  // Deterministic: ensure global API exists for contracts/tests.
  // Must run before any early returns.
  var FF = (function ensureFFEarly() {
    try {
      if (!window.ff || typeof window.ff !== "object") window.ff = {};
      return window.ff;
    } catch (_) {
      return {};
    }
  })();
  try {
    if (!FF.version) FF.version = "17.0.0-ff";
  } catch (_) {}
  /* --------------------------------------------------------------------------
   * Boot guard (prevents double init)
   * ------------------------------------------------------------------------ */
  var BOOT_KEY = "__FF_APP_BOOT__";
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = { at: Date.now(), v: "17.0.0-ff" };

  /* --------------------------------------------------------------------------
   * Tiny utilities (no dependencies)
   * ------------------------------------------------------------------------ */
  function isEl(x) { return !!(x && x.nodeType === 1); }

  function qs(sel, root) {
    try { return (root || document).querySelector(sel); } catch (_) { return null; }
  }
  function qsa(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (_) { return []; }
  }
  function on(el, ev, fn, opts) {
    try { if (el) el.addEventListener(ev, fn, opts || false); } catch (_) {}
  }
  function safeJson(txt, fallback) {
    try { return JSON.parse(String(txt || "")); } catch (_) { return fallback; }
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms || 0);
    };
  }

  function meta(name) {
    try {
      var el = document.querySelector('meta[name="' + String(name).replace(/"/g, '\\"') + '"]');
      return (el && el.getAttribute("content") ? String(el.getAttribute("content")) : "").trim();
    } catch (_) {
      return "";
    }
  }

  function getNonce() {
    // Reuse any existing nonce that Flask/Jinja already placed.
    try {
      var s = document.querySelector("script[nonce]");
      var n = s ? s.getAttribute("nonce") : "";
      if (n) return n;

      // Some stacks place nonce in a meta tag; support both conventions.
      var m = document.querySelector('meta[name="csp-nonce"], meta[property="csp-nonce"]');
      var c = m ? (m.getAttribute("content") || "") : "";
      return String(c || "").trim();
    } catch (_) {
      return "";
    }
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    var ms = Number(timeoutMs || 15000);
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (_) { ctrl = null; }

    var t = setTimeout(function () {
      try { if (ctrl) ctrl.abort(); } catch (_) {}
    }, ms);

    var o = opts || {};
    if (ctrl) o.signal = ctrl.signal;

    return fetch(url, o).finally(function () {
      clearTimeout(t);
    });
  }

  function parseMoneyToCents(val) {
    var raw = String(val == null ? "" : val).trim();
    if (!raw) return 0;
    // "$1,200.50" -> "1200.50"
    var cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
    var n = Number(cleaned);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.round(n * 100));
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  }

  function formatMoney(cents, currency, locale) {
    var c = Number(cents || 0);
    var cur = String(currency || "USD");
    var loc = String(locale || "en-US");
    try {
      return new Intl.NumberFormat(loc, { style: "currency", currency: cur }).format(c / 100);
    } catch (_) {
      return "$" + (c / 100).toFixed(2);
    }
  }

  function setText(el, txt) {
    try { if (el) el.textContent = String(txt == null ? "" : txt); } catch (_) {}
  }

  function announce(txt) {
    var live = DOM.live();
    if (!live) return;
    // Force SR announcement even if same text repeats.
    try {
      live.textContent = "";
      setTimeout(function () { live.textContent = String(txt || ""); }, 10);
    } catch (_) {}
  }

  /* --------------------------------------------------------------------------
   * Selector hooks (reads your #ffSelectors contract if present)
   * ------------------------------------------------------------------------ */
  var HOOKS = (function () {
    // Supports:
    // - window.__FF_SELECTORS__ = { hooks: { ... } } or { ...hooks }
    // - <script id="ffSelectors" type="application/json">{ "hooks": {...} }</script>
    var raw = null;

    try {
      if (window.__FF_SELECTORS__ && typeof window.__FF_SELECTORS__ === "object") raw = window.__FF_SELECTORS__;
    } catch (_) {}

    if (!raw) {
      var s = document.getElementById("ffSelectors");
      if (s && String(s.type || "").indexOf("json") !== -1) {
        raw = safeJson(String(s.textContent || "").trim(), null);
      }
    }

    var hooks = (raw && raw.hooks && typeof raw.hooks === "object") ? raw.hooks : (raw && typeof raw === "object" ? raw : {});
    hooks = hooks && typeof hooks === "object" ? hooks : {};

    function get(key, fallbackSel) {
      var v = hooks[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      return String(fallbackSel || "");
    }

    return { get: get };
  })();

  /* --------------------------------------------------------------------------
   * DOM getters (hook-safe)
   * ------------------------------------------------------------------------ */
  var DOM = (function () {
    // Checkout
    function checkoutSheet() { return qs(HOOKS.get("checkoutSheet", "#checkout,[data-ff-checkout-sheet]")); }
    function checkoutPanel() {
      var sheet = checkoutSheet();
      if (!sheet) return null;
      return qs(".ff-sheet__panel,[role='dialog']", sheet);
    }

    function openCheckoutTriggers() { return qsa(HOOKS.get("openCheckout", "[data-ff-open-checkout]")); }
    function closeCheckoutTriggers() { return qsa(HOOKS.get("closeCheckout", "[data-ff-close-checkout]")); }

    function donationForm() { return qs(HOOKS.get("donationForm", "#donationForm,form[data-ff-donate-form]")); }
    function amountInput() { return qs(HOOKS.get("amountInput", "[data-ff-amount-input]")); }
    function emailInput() { return qs(HOOKS.get("email", "[data-ff-email]")); }
    function teamIdInput() { return qs(HOOKS.get("teamId", 'input[data-ff-team-id][name="team_id"]')); }

    // Amount chips across the page
    function amountChips() { return qsa(HOOKS.get("amountChip", "[data-ff-amount]")); }

    // Toast + live
    function toasts() { return qs(HOOKS.get("toasts", "[data-ff-toasts]")); }
    function live() { return qs(HOOKS.get("live", "[data-ff-live],#ffLive")); }

    // Theme toggle
    function themeToggle() { return qs(HOOKS.get("themeToggle", "[data-ff-theme-toggle]")); }

    // Drawer
    function drawer() { return qs(HOOKS.get("drawer", "[data-ff-drawer],#drawer")); }

    // Sponsor modal
    function sponsorModal() { return qs(HOOKS.get("sponsorModal", "[data-ff-sponsor-modal],#sponsor-interest")); }

    // Video modal
    function videoModal() { return qs(HOOKS.get("videoModal", "[data-ff-video-modal],#press-video")); }
    function videoFrame() {
      var m = videoModal();
      return m ? qs(HOOKS.get("videoFrame", "[data-ff-video-frame]"), m) : null;
    }

    // Payment mounts/messages
    function stripeMount() { return qs("[data-ff-stripe-mount],[data-ff-payment-element],#paymentElement"); }
    function stripeSkeleton() { return qs("[data-ff-stripe-skeleton]"); }
    function stripeMsg() { return qs("[data-ff-stripe-msg]"); }
    function stripeErr() { return qs("[data-ff-stripe-error]"); }

    function paypalMount() { return qs("[data-ff-paypal-mount],#paypalButtons"); }
    function paypalSkeleton() { return qs("[data-ff-paypal-skeleton]"); }
    function paypalMsg() { return qs("[data-ff-paypal-msg]"); }
    function paypalErr() { return qs("[data-ff-paypal-error]"); }

    // Checkout status/error areas
    function checkoutError() { return qs("[data-ff-checkout-error],#checkoutErrorText"); }
    function checkoutStatus() { return qs("[data-ff-checkout-status]"); }
    function checkoutSuccess() { return qs("[data-ff-checkout-success]"); }

    // Sponsor submit (optional)
    function sponsorSubmit() { return qs("[data-ff-sponsor-submit]"); }

    // Share buttons
    function shareButtons() { return qsa(HOOKS.get("share", "[data-ff-share]")); }

    return {
      checkoutSheet: checkoutSheet,
      checkoutPanel: checkoutPanel,
      openCheckoutTriggers: openCheckoutTriggers,
      closeCheckoutTriggers: closeCheckoutTriggers,
      donationForm: donationForm,
      amountInput: amountInput,
      emailInput: emailInput,
      teamIdInput: teamIdInput,
      amountChips: amountChips,
      toasts: toasts,
      live: live,
      themeToggle: themeToggle,
      drawer: drawer,
      sponsorModal: sponsorModal,
      videoModal: videoModal,
      videoFrame: videoFrame,
      stripeMount: stripeMount,
      stripeSkeleton: stripeSkeleton,
      stripeMsg: stripeMsg,
      stripeErr: stripeErr,
      paypalMount: paypalMount,
      paypalSkeleton: paypalSkeleton,
      paypalMsg: paypalMsg,
      paypalErr: paypalErr,
      checkoutError: checkoutError,
      checkoutStatus: checkoutStatus,
      checkoutSuccess: checkoutSuccess,
      sponsorSubmit: sponsorSubmit,
      shareButtons: shareButtons
    };
  })();

  /* --------------------------------------------------------------------------
   * Toasts (safe, minimal)
   * ------------------------------------------------------------------------ */
  function ensureToastHost() {
    var host = DOM.toasts();
    if (host) return host;

    host = document.createElement("div");
    host.className = "ff-toasts";
    host.setAttribute("data-ff-toasts", "");
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-relevant", "additions removals");
    try { document.body.appendChild(host); } catch (_) {}
    return host;
  }

  function toast(msg, kind, ms) {
    var m = String(msg || "").trim();
    if (!m) return;

    var host = ensureToastHost();
    if (!host) return;

    var el = document.createElement("div");
    el.className = "ff-toast ff-toast--" + (kind || "info");
    el.textContent = m;

    // If CSS doesn't include toast styling yet, keep it readable anyway.
    el.style.pointerEvents = "auto";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(255,255,255,0.14)";
    el.style.backdropFilter = "blur(10px)";
    el.style.webkitBackdropFilter = "blur(10px)";
    el.style.background = (kind === "error") ? "rgba(251,113,133,0.16)" : "rgba(12,14,22,0.70)";
    el.style.color = "inherit";

    host.appendChild(el);

    var dur = clamp(Number(ms || 2600), 1200, 9000);
    setTimeout(function () { try { el.remove(); } catch (_) {} }, dur);
  }

  /* --------------------------------------------------------------------------
   * Overlay primitives (contract-first)
   * ------------------------------------------------------------------------ */
  function setOpen(el, open) {
    if (!isEl(el)) return;

    try {
      if (open) {
        el.hidden = false;
        el.removeAttribute("hidden");
        el.setAttribute("data-open", "true");
        el.setAttribute("aria-hidden", "false");
        el.classList.add("is-open");
      } else {
        el.setAttribute("data-open", "false");
        el.setAttribute("aria-hidden", "true");
        el.classList.remove("is-open");
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    } catch (_) {}
  }

  function isOpen(el) {
    if (!isEl(el)) return false;
    try {
      if (el.hidden) return false;
      if (el.getAttribute("data-open") === "true") return true;
      if (el.getAttribute("aria-hidden") === "false") return true;
      if (el.classList.contains("is-open")) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function findFocusable(root) {
    if (!isEl(root)) return null;
    try {
      return root.querySelector(
        "[data-ff-close-checkout], [data-ff-close-sponsor], [data-ff-close-video], " +
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), " +
          "[tabindex]:not([tabindex='-1'])"
      );
    } catch (_) {
      return null;
    }
  }

  function focusInto(panel) {
    if (!isEl(panel)) return;

    // Ensure panel can always be focused as a fallback.
    try { if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1"); } catch (_) {}

    var target = null;

    // Prefer: close control, then amount input, then first focusable, then panel.
    try {
      target =
        panel.querySelector("[data-ff-close-checkout]") ||
        panel.querySelector("[data-ff-amount-input]") ||
        findFocusable(panel) ||
        panel;
    } catch (_) {
      target = panel;
    }

    function doFocus() {
      try { target.focus({ preventScroll: true }); }
      catch (_) { try { target.focus(); } catch (_2) {} }
    }

    // Multi-phase focus settle: rAF + short timeout (beats transitions/layout churn)
    requestAnimationFrame(function () {
      doFocus();
      setTimeout(function () {
        try {
          var ae = document.activeElement;
          if (!(ae && panel.contains(ae))) doFocus();
        } catch (_) {}
      }, 60);
    });
  }

  function trapTab(e, container) {
    if (!container) return;
    if (e.key !== "Tab") return;

    var items = [];
    try {
      items = qsa(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        container
      ).filter(function (el) {
        try { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
        catch (_) { return false; }
      });
    } catch (_) {
      items = [];
    }

    if (!items.length) return;

    var first = items[0];
    var last = items[items.length - 1];
    var ae = document.activeElement;

    if (e.shiftKey && ae === first) {
      e.preventDefault();
      try { last.focus(); } catch (_) {}
    } else if (!e.shiftKey && ae === last) {
      e.preventDefault();
      try { first.focus(); } catch (_) {}
    }
  }

  /* =======================
   Checkout Sheet Controller (Deterministic v4 • Phase 3 polish)
======================= */
var Checkout = (function () {
  var sheet = document.getElementById("checkout");
  if (!sheet) return { init: function(){}, open: function(){}, close: function(){} };

  var panel = sheet.querySelector(".ff-sheet__panel");
  var backdrop = sheet.querySelector(".ff-sheet__backdrop");
  var openers = document.querySelectorAll("[data-ff-open-checkout]");

  var returnFocusEl = null;

  /* -----------------------------
     State contract (TEST SAFE)
  ----------------------------- */
  function setOpenState(isOpen) {
    sheet.dataset.open = isOpen ? "true" : "false";
    sheet.setAttribute("aria-hidden", isOpen ? "false" : "true");

    if (isOpen) {
      sheet.removeAttribute("hidden");
      if (panel) panel.removeAttribute("hidden");
    } else {
      sheet.setAttribute("hidden", "");
      if (panel) panel.setAttribute("hidden", "");
    }
  }

  /* -----------------------------
     Scroll Lock (no layout shift)
  ----------------------------- */
  function lockScroll() {
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = sbw > 0 ? sbw + "px" : "";
  }

  function unlockScroll() {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }

  /* -----------------------------
     Inert background
  ----------------------------- */
  function setInert(isOpen) {
    var home = document.getElementById("home");
    if (!home) return;
    if (isOpen) home.setAttribute("inert", "");
    else home.removeAttribute("inert");
  }

  /* -----------------------------
     Focus management
  ----------------------------- */
  function focusInside() {
    if (!panel) return;

    if (!panel.hasAttribute("tabindex")) {
      panel.setAttribute("tabindex", "-1");
    }

    var target =
      panel.querySelector("[data-ff-close-checkout]") ||
      panel.querySelector("input,button,select,textarea,a[href]") ||
      panel;

    requestAnimationFrame(function () {
      try { target.focus({ preventScroll: true }); }
      catch (_) { try { target.focus(); } catch (_2) {} }
    });
  }

  function trapFocus(e) {
    if (sheet.dataset.open !== "true") return;
    if (!panel) return;
    if (!panel.contains(e.target)) {
      e.stopPropagation();
      focusInside();
    }
  }

  /* -----------------------------
     Open / Close
  ----------------------------- */
  function open(opts) {
    if (sheet.dataset.open === "true") return;

    returnFocusEl = document.activeElement;

    setOpenState(true);
    lockScroll();
    setInert(true);

    document.addEventListener("focusin", trapFocus);

    focusInside();

    if (location.hash !== "#checkout") {
      history.replaceState(null, "", "#checkout");
    }

    if (!(opts && opts.quiet)) {
      document.dispatchEvent(new CustomEvent("ff:checkout:open"));
    }
  }

  function close() {
    if (sheet.dataset.open !== "true") return;

    setOpenState(false);
    unlockScroll();
    setInert(false);

    document.removeEventListener("focusin", trapFocus);

    if (location.hash === "#checkout") {
      history.replaceState(null, "", "#home");
    }

    if (returnFocusEl && returnFocusEl.focus) {
      try { returnFocusEl.focus(); } catch (_) {}
    }
    returnFocusEl = null;

    document.dispatchEvent(new CustomEvent("ff:checkout:close"));
  }

  /* -----------------------------
     Event Wiring
  ----------------------------- */
  function init() {
    openers.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        open();
      });
    });

    sheet.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-ff-close-checkout]");
      if (btn) {
        e.preventDefault();
        close();
      }
    });

    if (backdrop) {
      backdrop.addEventListener("click", function () {
        close();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    window.addEventListener("hashchange", function () {
      if (location.hash === "#checkout") open({ quiet: true });
      else close();
    });

    // Initial state
    if (location.hash === "#checkout") open({ quiet: true });
    else setOpenState(false);
  }

  return {
    init: init,
    open: open,
    close: close
  };
})();
  /* --------------------------------------------------------------------------
   * Amount chips + quick attribution
   * - data-ff-amount="25" sets checkout amount input and opens checkout
   * - data-ff-team-id on an open-checkout trigger sets hidden team_id
   * ------------------------------------------------------------------------ */
  function initPrefill() {
    on(document, "click", function (e) {
      try {
        var t = e.target;
        if (!t || !t.closest) return;

        var chip = t.closest("[data-ff-amount]");
        if (chip) {
          var v = String(chip.getAttribute("data-ff-amount") || "").trim();
          if (!v) return;

          var amt = DOM.amountInput();
          if (amt) {
            amt.value = v;
            try { amt.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
          }

          // Open checkout (hash-driven + immediate open)
          Checkout.open({ quiet: true });
          try { location.hash = "#checkout"; } catch (_) {}

          toast("Amount set", "success", 1600);
          return;
        }
      } catch (_) {}
    }, true);
  }

  /* --------------------------------------------------------------------------
   * Theme toggle (light/dark)
   * - writes html[data-theme], persists in localStorage
   * ------------------------------------------------------------------------ */
  var Theme = (function () {
    var KEY = "ff_theme";

    function getSaved() {
      try {
        var v = String(localStorage.getItem(KEY) || "").toLowerCase();
        if (v === "light" || v === "dark") return v;
      } catch (_) {}
      return "";
    }

    function setSaved(v) {
      try { localStorage.setItem(KEY, String(v)); } catch (_) {}
    }

    function apply(v) {
      var root = document.documentElement;
      var mode = (v === "dark" || v === "light") ? v : "";
      if (!mode) return;

      try { root.setAttribute("data-theme", mode); } catch (_) {}
      try { root.style.colorScheme = mode; } catch (_) {}

      var btn = DOM.themeToggle();
      if (btn) {
        try { btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false"); } catch (_) {}
      }
    }

    function toggle() {
      var root = document.documentElement;
      var cur = String(root.getAttribute("data-theme") || "").toLowerCase();
      if (cur !== "dark" && cur !== "light") cur = "dark";
      var next = (cur === "dark") ? "light" : "dark";
      setSaved(next);
      apply(next);

      // Re-theme Stripe appearance on next evaluation (without forcing remount unless open)
      Payments.queueEvaluate(true);
    }

    function init() {
      // Apply saved theme if present (do not override server default unless user has set one)
      var saved = getSaved();
      if (saved) apply(saved);

      on(document, "click", function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;
          var btn = t.closest(HOOKS.get("themeToggle", "[data-ff-theme-toggle]"));
          if (!btn) return;
          e.preventDefault();
          toggle();
        } catch (_) {}
      }, true);
    }

    return { init: init };
  })();

  /* --------------------------------------------------------------------------
   * Share (data-ff-share)
   * - tries native share, else copies URL
   * ------------------------------------------------------------------------ */
  var Share = (function () {
    function canonicalUrl() {
      // Prefer canonical meta if present; otherwise current URL without hash noise.
      var u = meta("ff:stripe-return-url") || meta("ff-stripe-return-url") || "";
      if (u) return u;
      try {
        var url = new URL(window.location.href);
        url.hash = "";
        return url.toString();
      } catch (_) {
        return window.location.origin + window.location.pathname;
      }
    }

    function copyText(text) {
      var v = String(text || "");
      if (!v) return Promise.resolve(false);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(v).then(function () { return true; }).catch(function () { return false; });
      }

      // Fallback
      return new Promise(function (resolve) {
        try {
          var ta = document.createElement("textarea");
          ta.value = v;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch (_) {}
          ta.remove();
          resolve(true);
        } catch (_) {
          resolve(false);
        }
      });
    }

    function doShare() {
      var url = canonicalUrl();
      var title = document.title || "FutureFunded";
      var text = "Support this fundraiser: " + url;

      if (navigator.share) {
        return navigator.share({ title: title, text: text, url: url }).catch(function () {});
      }

      return copyText(url).then(function (ok) {
        if (ok) toast("Link copied", "success", 1800);
        else toast("Could not copy link", "error", 2600);
      });
    }

    function init() {
      on(document, "click", function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;
          var b = t.closest(HOOKS.get("share", "[data-ff-share]"));
          if (!b) return;
          e.preventDefault();
          doShare();
        } catch (_) {}
      }, true);
    }

    return { init: init };
  })();

  /* --------------------------------------------------------------------------
   * Payments (Stripe + PayPal) — lazy-loaded
   * Conditions to load:
   *  - checkout open
   *  - amount > 0
   * ------------------------------------------------------------------------ */
  var Payments = (function () {
    var MIN_CENTS = 100; // $1
    var evalQueued = false;

    // Stripe state
    var stripeJsPromise = null;
    var stripePkPromise = null;
    var stripe = null;
    var elements = null;
    var paymentEl = null;
    var mountedKey = "";
    var intentAbort = null;

    // PayPal state
    var paypalJsPromise = null;
    var paypalReady = false;
    var paypalRenderedKey = "";

    function isCheckoutOpen() {
      var s = DOM.checkoutSheet();
      return !!(s && isOpen(s));
    }

    function readAmountCents() {
      var a = DOM.amountInput();
      return a ? parseMoneyToCents(a.value) : 0;
    }

    function readCurrency() {
      // Template also emits ff-currency in meta; prefer that.
      var c = meta("ff-currency") || meta("ff:currency") || "USD";
      return String(c || "USD").trim().toUpperCase();
    }

    function readEmail() {
      var e = DOM.emailInput();
      return e ? String(e.value || "").trim() : "";
    }

    function readTeamId() {
      var i = DOM.teamIdInput();
      return i ? String(i.value || "default").trim() : "default";
    }

    function csrfHeader() {
      var csrf = meta("csrf-token");
      return csrf ? { "X-CSRFToken": csrf } : {};
    }

    function setStripeMessage(txt) { setText(DOM.stripeMsg(), txt || ""); }
    function setStripeError(txt) {
      var box = DOM.stripeErr();
      if (!box) return;
      if (txt) { box.hidden = false; box.textContent = String(txt); }
      else { box.hidden = true; box.textContent = ""; }
    }

    function setPayPalMessage(txt) { setText(DOM.paypalMsg(), txt || ""); }
    function setPayPalError(txt) {
      var box = DOM.paypalErr();
      if (!box) return;
      if (txt) { box.hidden = false; box.textContent = String(txt); }
      else { box.hidden = true; box.textContent = ""; }
    }

    function injectScript(src, attrs) {
      return new Promise(function (resolve, reject) {
        try {
          var existing = qsa("script").find(function (s) { return String(s.src || "") === String(src || ""); });
          if (existing) {
            if (existing.getAttribute("data-ff-loaded") === "true") return resolve(existing);
            on(existing, "load", function () { existing.setAttribute("data-ff-loaded", "true"); resolve(existing); }, { once: true });
            on(existing, "error", function () { reject(new Error("Script failed to load")); }, { once: true });
            return;
          }

          var s = document.createElement("script");
          s.src = src;
          s.async = true;
          s.defer = true;
          s.setAttribute("data-ff-dyn", "1");

          var nonce = getNonce();
          if (nonce) s.setAttribute("nonce", nonce);

          if (attrs && typeof attrs === "object") {
            Object.keys(attrs).forEach(function (k) {
              try { s.setAttribute(k, String(attrs[k])); } catch (_) {}
            });
          }

          s.onload = function () { s.setAttribute("data-ff-loaded", "true"); resolve(s); };
          s.onerror = function () { reject(new Error("Script failed to load")); };

          document.head.appendChild(s);
        } catch (e) {
          reject(e);
        }
      });
    }

    /* ---------------- Stripe ---------------- */

    function stripePkFromMeta() {
      var pk = meta("ff-stripe-pk") || meta("ff:stripe-pk") || "";
      pk = String(pk || "").trim();
      if (!pk || pk.toLowerCase() === "none" || pk.toLowerCase() === "null") return "";
      return pk;
    }

    function stripeConfigEndpoint() {
      return meta("ff-payments-config-endpoint") || meta("ff:payments-config-endpoint") || "/payments/config";
    }

    function stripeIntentEndpoint() {
      return meta("ff-stripe-intent-endpoint") || meta("ff:stripe-intent-endpoint") || "/payments/stripe/intent";
    }

    function stripeReturnUrl() {
      var u = meta("ff-stripe-return-url") || meta("ff:stripe-return-url") || "";
      if (!u) {
        try {
          var url = new URL(window.location.href);
          url.hash = "";
          u = url.toString();
        } catch (_) {
          u = window.location.origin + window.location.pathname;
        }
      }
      // Ensure https if site is https.
      if (window.location.protocol === "https:" && String(u).indexOf("http://") === 0) {
        u = "https://" + String(u).slice(7);
      }
      return String(u);
    }

    function loadStripeJs() {
      if (window.Stripe) return Promise.resolve(true);
      if (stripeJsPromise) return stripeJsPromise;

      var src = meta("ff-stripe-js") || meta("ff:stripe-js") || "https://js.stripe.com/v3/";
      stripeJsPromise = injectScript(src, { "data-ff-stripe": "1" }).then(function () {
        return !!window.Stripe;
      });
      return stripeJsPromise;
    }

    function fetchStripePk() {
      var pkMeta = stripePkFromMeta();
      if (pkMeta) return Promise.resolve(pkMeta);
      if (stripePkPromise) return stripePkPromise;

      stripePkPromise = fetchWithTimeout(stripeConfigEndpoint(), { credentials: "same-origin" }, 12000)
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          var pk =
            (j && (j.publishableKey || j.publishable_key || j.stripePublishableKey || j.pk)) ?
              String(j.publishableKey || j.publishable_key || j.stripePublishableKey || j.pk).trim() : "";
          if (!pk) throw new Error("Stripe publishable key missing");
          return pk;
        });

      return stripePkPromise;
    }

    function buildStripePayload(amountCents) {
      var currency = readCurrency().toLowerCase();
      var email = readEmail();
      var teamId = readTeamId();

      // Keep payload tolerant; backend can ignore fields it doesn't use.
      return {
        amount_cents: Number(amountCents || 0) | 0,
        currency: currency,
        donor: { email: String(email || "").trim().toLowerCase() },
        attribution: { team_id: teamId },
        return_url: stripeReturnUrl()
      };
    }

    function intentKey(amountCents) {
      var theme = String(document.documentElement.getAttribute("data-theme") || "");
      var team = readTeamId();
      var email = readEmail().toLowerCase();
      return String(amountCents || 0) + "|" + team + "|" + email + "|" + theme + "|" + readCurrency();
    }

    function teardownStripe() {
      try { if (intentAbort) intentAbort.abort(); } catch (_) {}
      intentAbort = null;

      try { if (paymentEl && paymentEl.unmount) paymentEl.unmount(); } catch (_) {}
      paymentEl = null;
      elements = null;
      mountedKey = "";

      var host = DOM.stripeMount();
      if (host) {
        try { host.replaceChildren(); } catch (_) {}
        var skel = DOM.stripeSkeleton();
        if (skel) {
          try { host.appendChild(skel.cloneNode(true)); } catch (_) {}
        }
      }
      setStripeError("");
      setStripeMessage("");
    }

    function createStripeIntent(amountCents) {
      // Abort any in-flight intent when amount changes.
      try { if (intentAbort) intentAbort.abort(); } catch (_) {}
      intentAbort = null;

      var ctrl = null;
      try { ctrl = new AbortController(); } catch (_) { ctrl = null; }
      intentAbort = ctrl;

      var payload = buildStripePayload(amountCents);

      var headers = { "Content-Type": "application/json" };
      var ch = csrfHeader();
      Object.keys(ch).forEach(function (k) { headers[k] = ch[k]; });

      return fetchWithTimeout(
        stripeIntentEndpoint(),
        {
          method: "POST",
          credentials: "same-origin",
          headers: headers,
          body: JSON.stringify(payload),
          signal: ctrl ? ctrl.signal : undefined
        },
        15000
      )
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) {
              var msg = (j && j.error && j.error.message) ? j.error.message : ("Stripe intent failed (" + r.status + ")");
              throw new Error(msg);
            }
            if (j && j.ok === false) {
              var m = (j.error && j.error.message) ? j.error.message : (j.message || "Stripe intent failed");
              throw new Error(String(m));
            }
            var cs = j.client_secret || j.clientSecret;
            if (!cs) throw new Error("Missing Stripe client_secret");
            return { clientSecret: String(cs), publishableKey: String(j.publishable_key || j.publishableKey || "").trim() };
          });
        });
    }

    function mountStripe(amountCents, force) {
      if (!isCheckoutOpen()) return Promise.resolve(false);

      var host = DOM.stripeMount();
      if (!host) return Promise.resolve(false);

      var amt = Number(amountCents || 0) | 0;
      if (amt < MIN_CENTS) {
        teardownStripe();
        return Promise.resolve(false);
      }

      var key = intentKey(amt);
      if (!force && mountedKey === key && host.childElementCount > 0) return Promise.resolve(true);

      setStripeError("");
      setStripeMessage("Loading…");
      try {
        // Show skeleton if provided
        var sk = DOM.stripeSkeleton();
        if (sk) {
          host.replaceChildren(sk.cloneNode(true));
        }
      } catch (_) {}

      return Promise.all([loadStripeJs(), fetchStripePk()])
        .then(function (res) {
          if (!res[0]) throw new Error("Stripe.js unavailable");
          var pk = res[1];

          if (!stripe || stripe.__ffPk !== pk) {
            stripe = window.Stripe(pk);
            // tag to avoid rebuilding if pk unchanged
            try { stripe.__ffPk = pk; } catch (_) {}
          }

          return createStripeIntent(amt).then(function (intent) {
            var pk2 = intent.publishableKey || pk;
            if (pk2 && stripe && stripe.__ffPk !== pk2) {
              stripe = window.Stripe(pk2);
              try { stripe.__ffPk = pk2; } catch (_) {}
            }

            elements = stripe.elements({
              clientSecret: intent.clientSecret,
              appearance: { theme: (String(document.documentElement.getAttribute("data-theme") || "dark") === "dark") ? "night" : "stripe" }
            });

            try { host.replaceChildren(); } catch (_) {}

            paymentEl = elements.create("payment", { layout: "tabs" });
            paymentEl.mount(host);

            mountedKey = key;
            setStripeMessage("Ready");
            return true;
          });
        })
        .catch(function (e) {
          setStripeMessage("");
          setStripeError((e && e.message) ? e.message : "Stripe failed to load");
          return false;
        });
    }

    function confirmStripePayment() {
      if (!stripe || !elements) return Promise.resolve(false);

      setStripeError("");
      setStripeMessage("Processing…");

      return stripe
        .confirmPayment({
          elements: elements,
          redirect: "if_required",
          confirmParams: { return_url: stripeReturnUrl() }
        })
        .then(function (res) {
          if (res && res.error) throw new Error(res.error.message || "Payment failed");
          setStripeMessage("Complete");
          return true;
        })
        .catch(function (e) {
          setStripeMessage("");
          setStripeError((e && e.message) ? e.message : "Payment failed");
          return false;
        });
    }

    /* ---------------- PayPal ---------------- */

    function paypalClientId() {
      var id = meta("ff-paypal-client-id") || meta("ff:paypal-client-id") || "";
      id = String(id || "").trim();
      if (!id || id.toLowerCase() === "none" || id.toLowerCase() === "null") return "";
      return id;
    }

    function paypalCurrency() {
      return (meta("ff-paypal-currency") || meta("ff:paypal-currency") || readCurrency() || "USD").toUpperCase();
    }

    function paypalIntent() {
      return (meta("ff-paypal-intent") || meta("ff:paypal-intent") || "capture").toLowerCase();
    }

    function paypalCreateEndpoint() {
      return meta("ff-paypal-create-endpoint") || meta("ff:paypal-create-endpoint") || "/payments/paypal/order";
    }

    function paypalCaptureEndpoint() {
      return meta("ff-paypal-capture-endpoint") || meta("ff:paypal-capture-endpoint") || "/payments/paypal/capture";
    }

    function loadPayPalJs() {
      if (paypalReady && window.paypal && window.paypal.Buttons) return Promise.resolve(true);
      if (paypalJsPromise) return paypalJsPromise;

      var cid = paypalClientId();
      if (!cid) return Promise.resolve(false);

      var cur = encodeURIComponent(paypalCurrency());
      var intent = encodeURIComponent(paypalIntent());
      var src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(cid) + "&currency=" + cur + "&intent=" + intent;

      paypalJsPromise = injectScript(src, { "data-ff-paypal": "1" }).then(function () {
        paypalReady = !!(window.paypal && window.paypal.Buttons);
        return paypalReady;
      });

      return paypalJsPromise;
    }

    function buildPayPalPayload(amountCents) {
      return {
        amount_cents: Number(amountCents || 0) | 0,
        currency: paypalCurrency(),
        donor: { email: String(readEmail() || "").trim().toLowerCase() },
        attribution: { team_id: readTeamId() }
      };
    }

    function paypalKey(amountCents) {
      var team = readTeamId();
      var email = readEmail().toLowerCase();
      return String(amountCents || 0) + "|" + team + "|" + email + "|" + paypalCurrency();
    }

    function renderPayPal(amountCents, force) {
      if (!isCheckoutOpen()) return Promise.resolve(false);

      var host = DOM.paypalMount();
      if (!host) return Promise.resolve(false);

      var amt = Number(amountCents || 0) | 0;
      if (amt < MIN_CENTS) {
        try { host.replaceChildren(); } catch (_) {}
        setPayPalMessage("");
        setPayPalError("");
        paypalRenderedKey = "";
        return Promise.resolve(false);
      }

      var key = paypalKey(amt);
      if (!force && paypalRenderedKey === key && host.childElementCount > 0) return Promise.resolve(true);

      setPayPalError("");
      setPayPalMessage("Loading…");
      try {
        var sk = DOM.paypalSkeleton();
        if (sk) {
          host.replaceChildren(sk.cloneNode(true));
        } else {
          host.replaceChildren();
        }
      } catch (_) {}

      return loadPayPalJs()
        .then(function (ok) {
          if (!ok) {
            setPayPalMessage("");
            setPayPalError("PayPal unavailable");
            return false;
          }

          // Clear and render buttons
          try { host.replaceChildren(); } catch (_) {}

          var headers = { "Content-Type": "application/json" };
          var ch = csrfHeader();
          Object.keys(ch).forEach(function (k) { headers[k] = ch[k]; });

          var payload = buildPayPalPayload(amt);

          var buttons = window.paypal.Buttons({
            createOrder: function () {
              return fetchWithTimeout(
                paypalCreateEndpoint(),
                {
                  method: "POST",
                  credentials: "same-origin",
                  headers: headers,
                  body: JSON.stringify(payload)
                },
                15000
              )
                .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
                  if (!r.ok || (j && j.ok === false)) {
                    var msg = (j && j.error && j.error.message) ? j.error.message : (j.message || ("PayPal create failed (" + r.status + ")"));
                    throw new Error(msg);
                  }
                  var id = j.id || j.orderID || j.order_id || (j.data && (j.data.id || j.data.orderID));
                  if (!id) throw new Error("Missing PayPal order id");
                  return String(id);
                }); });
            },
            onApprove: function (data) {
              var orderID = String((data && (data.orderID || data.id)) || "");
              if (!orderID) throw new Error("Missing PayPal order id");

              return fetchWithTimeout(
                paypalCaptureEndpoint(),
                {
                  method: "POST",
                  credentials: "same-origin",
                  headers: headers,
                  body: JSON.stringify({ order_id: orderID, orderID: orderID })
                },
                15000
              )
                .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
                  if (!r.ok || (j && j.ok === false)) {
                    var msg = (j && j.error && j.error.message) ? j.error.message : (j.message || ("PayPal capture failed (" + r.status + ")"));
                    throw new Error(msg);
                  }
                  return true;
                }); })
                .then(function () {
                  setPayPalMessage("Complete");
                  return true;
                })
                .catch(function (e) {
                  setPayPalMessage("");
                  setPayPalError((e && e.message) ? e.message : "PayPal failed");
                  return false;
                });
            },
            onError: function (err) {
              setPayPalMessage("");
              setPayPalError((err && err.message) ? err.message : "PayPal error");
            }
          });

          buttons.render(host);

          paypalRenderedKey = key;
          setPayPalMessage("Ready");
          return true;
        })
        .catch(function (e) {
          setPayPalMessage("");
          setPayPalError((e && e.message) ? e.message : "PayPal failed to load");
          return false;
        });
    }

    /* ---------------- Evaluation loop ---------------- */

    function evaluate(force) {
      evalQueued = false;

      // Only evaluate when checkout is open
      if (!isCheckoutOpen()) return;

      var amt = readAmountCents();
      // Lazy-load only when amount > 0
      if (amt < MIN_CENTS) {
        teardownStripe();
        try {
          var pm = DOM.paypalMount();
          if (pm) pm.replaceChildren();
        } catch (_) {}
        setPayPalMessage("");
        setPayPalError("");
        paypalRenderedKey = "";
        return;
      }

      // Stripe mount (best-effort)
      mountStripe(amt, !!force);

      // PayPal render (best-effort)
      renderPayPal(amt, !!force);
    }

    function queueEvaluate(force) {
      if (!isCheckoutOpen()) return;
      if (evalQueued) return;
      evalQueued = true;

      requestAnimationFrame(function () {
        evaluate(!!force);
      });
    }

    function init() {
      // Re-evaluate when amount/email changes (but only if checkout open)
      var deb = debounce(function () { queueEvaluate(false); }, 300);

      var a = DOM.amountInput();
      if (a) on(a, "input", deb);

      var e = DOM.emailInput();
      if (e) on(e, "input", deb);

      // When checkout opens, evaluate immediately
      on(window, "hashchange", function () {
        if (location.hash === "#checkout") queueEvaluate(true);
      });

      // Form submit: prefer Stripe Payment Element if mounted; PayPal has its own buttons.
      var form = DOM.donationForm();
      if (form) {
        on(form, "submit", function (ev) {
          try { ev.preventDefault(); } catch (_) {}

          // Basic validation (keeps UX clean)
          var amt = readAmountCents();
          var em = readEmail();
          var errBox = DOM.checkoutError();
          var stBox = DOM.checkoutStatus();

          if (errBox) errBox.hidden = true;
          if (stBox) stBox.hidden = true;

          if (amt < MIN_CENTS) {
            if (errBox) { errBox.hidden = false; errBox.textContent = "Please enter an amount of at least $1."; }
            toast("Enter an amount first", "info", 1800);
            return;
          }

          if (em && !isEmail(em)) {
            if (errBox) { errBox.hidden = false; errBox.textContent = "Please enter a valid email for your receipt."; }
            toast("Enter a valid email", "info", 1800);
            return;
          }

          // If Stripe is mounted, proceed with Stripe confirmation.
          // Otherwise, let the user use PayPal buttons (no-op here).
          if (stripe && elements) {
            if (stBox) { stBox.hidden = false; stBox.textContent = "Processing your donation…"; }
            confirmStripePayment().then(function (ok) {
              if (!ok) return;
              toast("Payment complete ✅", "success", 2200);

              // Swap success state if markup provides it
              try {
                var sheet = DOM.checkoutSheet();
                var succ = DOM.checkoutSuccess();
                if (succ) {
                  succ.hidden = false;
                  // Hide form stage if present
                  var stage = sheet ? qs("[data-ff-checkout-stage='form']", sheet) : null;
                  if (stage) stage.hidden = true;
                }
              } catch (_) {}
            }).finally(function () {
              if (stBox) stBox.hidden = true;
            });

            return;
          }

          toast("Choose Stripe or PayPal to complete", "info", 2200);
        }, true);
      }
    }

    return {
      init: init,
      queueEvaluate: queueEvaluate
    };
  })();

  /* --------------------------------------------------------------------------
   * Sponsor modal + Video modal (hash-aware, hook-safe)
   * ------------------------------------------------------------------------ */
  var Overlays = (function () {
    function openById(id) {
      if (id === "checkout") { Checkout.open({ quiet: true }); return; }

      if (id === "drawer") {
        var d = DOM.drawer();
        if (d) setOpen(d, true);
        return;
      }

      if (id === "sponsor-interest") {
        var s = DOM.sponsorModal();
        if (s) setOpen(s, true);
        var p = s ? qs(".ff-modal__panel,[role='dialog']", s) : null;
        if (p) focusInto(p);
        return;
      }

      if (id === "press-video") {
        var v = DOM.videoModal();
        if (v) setOpen(v, true);
        var vp = v ? qs(".ff-modal__panel,[role='dialog']", v) : null;
        if (vp) focusInto(vp);
        return;
      }

      if (id === "terms" || id === "privacy") {
        var m = document.getElementById(id);
        if (m) setOpen(m, true);
        var mp = m ? qs(".ff-modal__panel,[role='dialog']", m) : null;
        if (mp) focusInto(mp);
        return;
      }
    }

    function closeAllModalsButCheckout() {
      // Don’t close checkout here; hash sync handles it.
      var ids = ["drawer", "sponsor-interest", "press-video", "terms", "privacy"];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && isOpen(el)) setOpen(el, false);
      });
    }

    function syncFromHash() {
      var h = String(location.hash || "").replace("#", "");
      if (!h) {
        closeAllModalsButCheckout();
        return;
      }

      // Open only what hash points to; close other modals.
      closeAllModalsButCheckout();
      openById(h);
    }

    function init() {
      // Click open sponsor/video/drawer (do not block anchors; open immediately for determinism)
      on(document, "click", function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;

          var openDrawer = t.closest(HOOKS.get("openDrawer", "[data-ff-open-drawer]"));
          if (openDrawer) {
            var d = DOM.drawer();
            if (d) setOpen(d, true);
            // If trigger is not an anchor, we still prefer hash semantics.
            try { location.hash = "#drawer"; } catch (_) {}
            return;
          }

          var closeDrawer = t.closest(HOOKS.get("closeDrawer", "[data-ff-close-drawer]"));
          if (closeDrawer) {
            var dd = DOM.drawer();
            if (dd) setOpen(dd, false);
            if (location.hash === "#drawer") {
              try { history.replaceState(null, "", "#home"); } catch (_) { location.hash = "#home"; }
            }
            return;
          }

          var openSponsor = t.closest(HOOKS.get("openSponsor", "[data-ff-open-sponsor]"));
          if (openSponsor) {
            var s = DOM.sponsorModal();
            if (s) setOpen(s, true);
            try { location.hash = "#sponsor-interest"; } catch (_) {}
            return;
          }

          var closeSponsor = t.closest(HOOKS.get("closeSponsor", "[data-ff-close-sponsor]"));
          if (closeSponsor) {
            var sm = DOM.sponsorModal();
            if (sm) setOpen(sm, false);
            if (location.hash === "#sponsor-interest") {
              try { history.replaceState(null, "", "#home"); } catch (_) { location.hash = "#home"; }
            }
            return;
          }

          var openVideo = t.closest(HOOKS.get("openVideo", "[data-ff-open-video]"));
          if (openVideo) {
            var vm = DOM.videoModal();
            if (vm) setOpen(vm, true);

            // If a src is provided, lazy mount iframe into the frame container.
            try {
              var src = openVideo.getAttribute("data-ff-video-src") || "";
              var title = openVideo.getAttribute("data-ff-video-title") || "Video";
              var frame = DOM.videoFrame();
              if (frame && src) {
                frame.replaceChildren(); // remove skeleton
                var ifr = document.createElement("iframe");
                ifr.src = String(src);
                ifr.title = String(title);
                ifr.allow = "autoplay; encrypted-media; picture-in-picture";
                ifr.allowFullscreen = true;
                ifr.loading = "lazy";
                ifr.referrerPolicy = "strict-origin-when-cross-origin";
                ifr.style.width = "100%";
                ifr.style.height = "100%";
                ifr.style.border = "0";
                frame.appendChild(ifr);
              }
            } catch (_) {}

            try { location.hash = "#press-video"; } catch (_) {}
            return;
          }

          var closeVideo = t.closest(HOOKS.get("closeVideo", "[data-ff-close-video]"));
          if (closeVideo) {
            var vv = DOM.videoModal();
            if (vv) setOpen(vv, false);

            // Remove iframe to stop playback
            try {
              var fr = DOM.videoFrame();
              if (fr) fr.replaceChildren();
            } catch (_) {}

            if (location.hash === "#press-video") {
              try { history.replaceState(null, "", "#home"); } catch (_) { location.hash = "#home"; }
            }
            return;
          }
        } catch (_) {}
      }, true);

      // Escape closes the topmost open modal/drawer (checkout handled separately)
      on(document, "keydown", function (e) {
        try {
          if (e.key !== "Escape") return;

          // If checkout is open, Checkout module owns Esc behavior.
          var c = DOM.checkoutSheet();
          if (c && isOpen(c)) return;

          var ids = ["press-video", "sponsor-interest", "drawer", "terms", "privacy"];
          for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && isOpen(el)) {
              setOpen(el, false);
              if (location.hash === "#" + ids[i]) {
                try { history.replaceState(null, "", "#home"); } catch (_) { location.hash = "#home"; }
              }
              break;
            }
          }
        } catch (_) {}
      }, true);

      on(window, "hashchange", syncFromHash, { passive: true });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", syncFromHash, { once: true });
      } else {
        syncFromHash();
      }
    }

    return { init: init };
  })();

  /* --------------------------------------------------------------------------
   * Sponsor submit (optional best-effort; does NOT assume backend)
   * ------------------------------------------------------------------------ */
  function initSponsorSubmit() {
    on(document, "click", function (e) {
      try {
        var t = e.target;
        if (!t || !t.closest) return;
        var btn = t.closest("[data-ff-sponsor-submit]");
        if (!btn) return;

        // Best-effort UX only; real submit is backend-specific.
        toast("Sponsor request sent (demo)", "success", 2200);
        announce("Sponsor request sent");
      } catch (_) {}
    }, true);
  }

  /* --------------------------------------------------------------------------
   * App init
   * ------------------------------------------------------------------------ */
  function init() {
    try {
      // Core UX
      Checkout.init();
      initPrefill();

      // Global affordances
      Theme.init();
      Share.init();

      // Other overlays
      Overlays.init();

      // Optional
      Payments.init();
      initSponsorSubmit();

      // Quiet readiness signal for audits / tests
      document.documentElement.classList.add("ff-js");
      announce("Ready");
    } catch (e) {
      try { console.error("[FF] init failed", e); } catch (_) {}
      toast("App failed to initialize. Refresh the page.", "error", 6000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
