/* ============================================================================
 * FutureFunded • Flagship — ff-app.js (FULL DROP-IN • Hook-safe • CSP-safe)
 * File: app/static/js/ff-app.js
 * Version: 17.1.0-ff (close-by-contract • overlay-cleanup • blob-safe • focus-correct)
 *
 * Contracts honored:
 * - Hook-safe: never assumes optional nodes exist
 * - Selector map: uses #ffSelectors JSON hooks if present (with sane fallbacks)
 * - Overlay contract: open via :target / .is-open / [data-open="true"] / [aria-hidden="false"]
 *                    close via [hidden] / [data-open="false"] / [aria-hidden="true"]
 * - Deterministic checkout UX: opens/closes + focuses into dialog + Esc/backdrop closes
 * - Close-by-contract: checkout always closes to contract state regardless of hash-sync
 * - CSP-safe: nonce-aware dynamic script injection (Stripe/PayPal) + blob: supported
 * - Payments lazy-load: Stripe/PayPal load ONLY when checkout is open AND amount >= $1
 * ========================================================================== */

(function () {
  "use strict";

  /* --------------------------------------------------------------------------
   * EARLY GLOBAL (must exist for contracts/tests)
   * ------------------------------------------------------------------------ */
  var VERSION = "17.1.0-ff";

  var FF = (function ensureFFEarly() {
    try {
      if (!window.ff || typeof window.ff !== "object") window.ff = {};
      return window.ff;
    } catch (_) {
      return {};
    }
  })();

  try {
    if (!FF.version) FF.version = VERSION;
    try {
      if (window.ff && !window.ff.version) window.ff.version = VERSION;
    } catch (_) {}
  } catch (_) {}

  /* --------------------------------------------------------------------------
   * CSP nonce + script injection (blob-safe)
   * ------------------------------------------------------------------------ */
  function ffGetNonce() {
    try {
      var s = document.querySelector("script[nonce]");
      if (s) {
        try {
          if (s.nonce) return String(s.nonce || "");
        } catch (_) {}
        try {
          var n = s.getAttribute("nonce");
          if (n) return String(n || "");
        } catch (_) {}
      }
      // Optional meta conventions
      var m = document.querySelector('meta[name="csp-nonce"], meta[property="csp-nonce"]');
      if (m) {
        var c = m.getAttribute("content");
        if (c) return String(c || "").trim();
      }
    } catch (_) {}
    return "";
  }

  function ffInjectScript(src, opts) {
    try {
      var url = String(src || "").trim();
      if (!url) return Promise.reject(new Error("injectScript: missing src"));

      // Deduplicate by exact src (best-effort)
      try {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
          var ex = scripts[i];
          if (!ex) continue;
          var exSrc = "";
          try {
            exSrc = String(ex.getAttribute("data-ff-src") || ex.getAttribute("src") || ex.src || "");
          } catch (_) {
            exSrc = "";
          }
          if (exSrc === url) return Promise.resolve(ex);
          // For some browsers ex.src may normalize; keep a looser match too
          try {
            if (String(ex.src || "") === url) return Promise.resolve(ex);
          } catch (_) {}
        }
      } catch (_) {}

      return new Promise(function (resolve, reject) {
        try {
          var s = document.createElement("script");
          // ✅ Required hook for audits/contracts: marks dynamic injections
          try { s.setAttribute("data-ff-dyn", "1"); } catch (_) {}
          
          // Tag the *original* string for deterministic dedupe
          try { s.setAttribute("data-ff-src", url); } catch (_) {}

          // Tag the *original* string for deterministic dedupe
          try {
            s.setAttribute("data-ff-src", url);
          } catch (_) {}

          // Support blob: and https: etc
          s.src = url;
          s.async = true;
          s.defer = true;

          // CSP nonce: prefer explicit opts.nonce; fallback to first script[nonce]
          var nonce = opts && opts.nonce ? String(opts.nonce || "") : ffGetNonce();
          if (nonce) {
            try {
              s.setAttribute("nonce", nonce);
            } catch (_) {}
          }

          // Optional attrs
          if (opts && opts.attrs && typeof opts.attrs === "object") {
            try {
              Object.keys(opts.attrs).forEach(function (k) {
                try {
                  s.setAttribute(k, String(opts.attrs[k]));
                } catch (_) {}
              });
            } catch (_) {}
          }

          s.onload = function () {
            try {
              s.setAttribute("data-ff-loaded", "true");
            } catch (_) {}
            resolve(s);
          };
          s.onerror = function () {
            reject(new Error("injectScript: failed to load " + url));
          };

          (document.head || document.documentElement || document.body).appendChild(s);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e2) {
      return Promise.reject(e2);
    }
  }

  /* --------------------------------------------------------------------------
   * Close-by-contract primitives (critical stability)
   * ------------------------------------------------------------------------ */
  /* [ff-js] CLOSE_BY_CONTRACT v1 */
  function ffCloseByContract(el) {
    if (!el) return;
    try {
      if (el.classList) el.classList.remove("is-open");
    } catch (_) {}
    try {
      if (el.setAttribute) el.setAttribute("data-open", "false");
    } catch (_) {}
    try {
      if (el.setAttribute) el.setAttribute("aria-hidden", "true");
    } catch (_) {}
    try {
      el.hidden = true;
    } catch (_) {}
    try {
      if (el.setAttribute) el.setAttribute("hidden", "");
    } catch (_) {}
  }

  function ffOpenByContract(el) {
    if (!el) return;
    try {
      el.hidden = false;
    } catch (_) {}
    try {
      if (el.removeAttribute) el.removeAttribute("hidden");
    } catch (_) {}
    try {
      if (el.setAttribute) el.setAttribute("data-open", "true");
    } catch (_) {}
    try {
      if (el.setAttribute) el.setAttribute("aria-hidden", "false");
    } catch (_) {}
    try {
      if (el.classList) el.classList.add("is-open");
    } catch (_) {}
  }

  function ffBestEffortReplaceHash(nextHash) {
    try {
      var h = String(nextHash || "");
      if (h && h.charAt(0) !== "#") h = "#" + h;
      if (!history || !history.replaceState) {
        try {
          location.hash = h;
        } catch (_) {}
        return;
      }
      var path = String(location.pathname || "") + String(location.search || "");
      history.replaceState(null, "", path + (h || ""));
    } catch (_) {}
  }

  /* --------------------------------------------------------------------------
   * Export required public API deterministically (do not clobber existing)
   * ------------------------------------------------------------------------ */
  try {
    if (typeof FF.injectScript !== "function") FF.injectScript = ffInjectScript;
    if (typeof FF.closeAllOverlays !== "function") FF.closeAllOverlays = ffCloseAllOverlays;
  } catch (_) {}

  /* --------------------------------------------------------------------------
   * Boot guard (prevents double init)
   * ------------------------------------------------------------------------ */
  var BOOT_KEY = "__FF_APP_BOOT__";
  try {
    if (window[BOOT_KEY]) return;
    window[BOOT_KEY] = { at: Date.now(), v: VERSION };
  } catch (_) {
    // if window is weird, continue anyway
  }

  /* --------------------------------------------------------------------------
   * Tiny utilities (no dependencies)
   * ------------------------------------------------------------------------ */
  function isEl(x) {
    return !!(x && x.nodeType === 1);
  }

  function qs(sel, root) {
    try {
      return (root || document).querySelector(sel);
    } catch (_) {
      return null;
    }
  }

  function qsa(sel, root) {
    try {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    } catch (_) {
      return [];
    }
  }

  function on(el, ev, fn, opts) {
    try {
      if (el) el.addEventListener(ev, fn, opts || false);
    } catch (_) {}
  }

  function safeJson(txt, fallback) {
    try {
      return JSON.parse(String(txt || ""));
    } catch (_) {
      return fallback;
    }
  }

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms || 0);
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

  function parseMoneyToCents(val) {
    var raw = String(val == null ? "" : val).trim();
    if (!raw) return 0;
    var cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
    var n = Number(cleaned);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.round(n * 100));
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  }

  function setText(el, txt) {
    try {
      if (el) el.textContent = String(txt == null ? "" : txt);
    } catch (_) {}
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    var ms = Number(timeoutMs || 15000);
    var ctrl = null;
    try {
      ctrl = new AbortController();
    } catch (_) {
      ctrl = null;
    }

    var t = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, ms);

    var o = opts || {};
    if (ctrl) o.signal = ctrl.signal;

    return fetch(url, o).finally(function () {
      clearTimeout(t);
    });
  }

  /* --------------------------------------------------------------------------
   * Selector hooks (#ffSelectors contract)
   * ------------------------------------------------------------------------ */
  var HOOKS = (function () {
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

    var hooks =
      raw && raw.hooks && typeof raw.hooks === "object"
        ? raw.hooks
        : raw && typeof raw === "object"
          ? raw
          : {};
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
    function checkoutSheet() {
      return document.getElementById("checkout") || qs(HOOKS.get("checkoutSheet", "[data-ff-checkout-sheet]"));
    }
    function checkoutPanel() {
      var sheet = checkoutSheet();
      if (!sheet) return null;
      return qs(".ff-sheet__panel,[role='dialog'],[data-ff-checkout-panel]", sheet);
    }
    function checkoutBackdrop() {
      var sheet = checkoutSheet();
      if (!sheet) return null;
      return qs(".ff-sheet__backdrop,[data-ff-checkout-backdrop]", sheet);
    }

    function donationForm() {
      return qs(HOOKS.get("donationForm", "#donationForm,form[data-ff-donate-form]"));
    }
    function amountInput() {
      return qs(HOOKS.get("amountInput", "[data-ff-amount-input]"));
    }
    function emailInput() {
      return qs(HOOKS.get("email", "[data-ff-email]"));
    }
    function teamIdInput() {
      return qs(HOOKS.get("teamId", 'input[data-ff-team-id][name="team_id"]'));
    }

    function amountChips() {
      return qsa(HOOKS.get("amountChip", "[data-ff-amount]"));
    }

    function toasts() {
      return qs(HOOKS.get("toasts", "[data-ff-toasts]"));
    }
    function live() {
      return qs(HOOKS.get("live", "[data-ff-live],#ffLive"));
    }

    function themeToggle() {
      return qs(HOOKS.get("themeToggle", "[data-ff-theme-toggle]"));
    }

    function drawer() {
      return document.getElementById("drawer") || qs(HOOKS.get("drawer", "[data-ff-drawer]"));
    }

    function sponsorModal() {
      return document.getElementById("sponsor-interest") || qs(HOOKS.get("sponsorModal", "[data-ff-sponsor-modal]"));
    }

    function videoModal() {
      return document.getElementById("press-video") || qs(HOOKS.get("videoModal", "[data-ff-video-modal]"));
    }
    function videoFrame() {
      var m = videoModal();
      return m ? qs(HOOKS.get("videoFrame", "[data-ff-video-frame]"), m) : null;
    }

    function stripeMount() {
      return qs("[data-ff-stripe-mount],[data-ff-payment-element],#paymentElement");
    }
    function stripeSkeleton() {
      return qs("[data-ff-stripe-skeleton]");
    }
    function stripeMsg() {
      return qs("[data-ff-stripe-msg]");
    }
    function stripeErr() {
      return qs("[data-ff-stripe-error]");
    }

    function paypalMount() {
      return qs("[data-ff-paypal-mount],#paypalButtons");
    }
    function paypalSkeleton() {
      return qs("[data-ff-paypal-skeleton]");
    }
    function paypalMsg() {
      return qs("[data-ff-paypal-msg]");
    }
    function paypalErr() {
      return qs("[data-ff-paypal-error]");
    }

    function checkoutError() {
      return qs("[data-ff-checkout-error],#checkoutErrorText");
    }
    function checkoutStatus() {
      return qs("[data-ff-checkout-status]");
    }
    function checkoutSuccess() {
      return qs("[data-ff-checkout-success]");
    }

    return {
      checkoutSheet: checkoutSheet,
      checkoutPanel: checkoutPanel,
      checkoutBackdrop: checkoutBackdrop,
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
      checkoutSuccess: checkoutSuccess
    };
  })();

  /* --------------------------------------------------------------------------
   * Live region announce (optional)
   * ------------------------------------------------------------------------ */
  function announce(txt) {
    var live = DOM.live();
    if (!live) return;
    try {
      live.textContent = "";
      setTimeout(function () {
        live.textContent = String(txt || "");
      }, 10);
    } catch (_) {}
  }

  /* --------------------------------------------------------------------------
   * Toasts (safe, minimal)
   * ------------------------------------------------------------------------ */
  function ensureToastHost() {
    var host = DOM.toasts();
    if (host) return host;

    try {
      host = document.createElement("div");
      host.className = "ff-toasts";
      host.setAttribute("data-ff-toasts", "");
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-relevant", "additions removals");
      document.body.appendChild(host);
      return host;
    } catch (_) {
      return null;
    }
  }

  function toast(msg, kind, ms) {
    var m = String(msg || "").trim();
    if (!m) return;

    var host = ensureToastHost();
    if (!host) return;

    var el = document.createElement("div");
    el.className = "ff-toast ff-toast--" + (kind || "info");
    el.textContent = m;

    // Hard fallback styling (in case CSS is missing toast rules)
    try {
      el.style.pointerEvents = "auto";
      el.style.padding = "10px 12px";
      el.style.borderRadius = "14px";
      el.style.border = "1px solid rgba(255,255,255,0.14)";
      el.style.backdropFilter = "blur(10px)";
      el.style.webkitBackdropFilter = "blur(10px)";
      el.style.background = kind === "error" ? "rgba(251,113,133,0.16)" : "rgba(12,14,22,0.70)";
      el.style.color = "inherit";
    } catch (_) {}

    try {
      host.appendChild(el);
    } catch (_) {}

    var dur = clamp(Number(ms || 2600), 1200, 9000);
    setTimeout(function () {
      try {
        el.remove();
      } catch (_) {}
    }, dur);
  }

  /* --------------------------------------------------------------------------
   * Overlay helpers
   * ------------------------------------------------------------------------ */
  function isOpenByContract(el) {
    if (!isEl(el)) return false;
    try {
      if (el.hidden) return false;
      if (el.getAttribute("data-open") === "true") return true;
      if (el.getAttribute("aria-hidden") === "false") return true;
      if (el.classList && el.classList.contains("is-open")) return true;
      // :target is handled by CSS; we treat hash match as open intent elsewhere
      return false;
    } catch (_) {
      return false;
    }
  }

  function findFocusable(root) {
    if (!isEl(root)) return null;
    try {
      return root.querySelector(
        "[data-ff-close-checkout], [data-ff-close-sponsor], [data-ff-close-video], [data-ff-close-drawer], " +
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), " +
          "[tabindex]:not([tabindex='-1'])"
      );
    } catch (_) {
      return null;
    }
  }

  function focusInto(panel) {
    if (!isEl(panel)) return;

    try {
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    } catch (_) {}

    var target = null;
    try {
      target =
        panel.querySelector("[data-ff-close-checkout]") ||
        panel.querySelector("[data-ff-close-video]") ||
        panel.querySelector("[data-ff-close-sponsor]") ||
        panel.querySelector("[data-ff-amount-input]") ||
        findFocusable(panel) ||
        panel;
    } catch (_) {
      target = panel;
    }

    function doFocus() {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        try {
          target.focus();
        } catch (_2) {}
      }
    }

    try {
      requestAnimationFrame(function () {
        doFocus();
        setTimeout(function () {
          try {
            var ae = document.activeElement;
            if (!(ae && panel.contains(ae))) doFocus();
          } catch (_) {}
        }, 60);
      });
    } catch (_) {
      doFocus();
    }
  }

  /* --------------------------------------------------------------------------
   * CHECKOUT (deterministic + close-by-contract)
   * ------------------------------------------------------------------------ */
  var Checkout = (function () {
    var sheet = DOM.checkoutSheet();
    if (!sheet) {
      return {
        init: function () {},
        open: function () {},
        close: function () {},
        closeByContract: function () {},
        isOpen: function () { return false; }
      };
    }

    var panel = DOM.checkoutPanel();
    var backdrop = DOM.checkoutBackdrop();
    var returnFocusEl = null;

    // Scroll lock snapshot
    var prevOverflow = "";
    var prevPadRight = "";
    var scrollLocked = false;

    // Focus trap
    var focusTrapOn = false;
    function onFocusIn(e) {
      try {
        if (!panel || !isOpenByContract(sheet)) return;
        if (!panel.contains(e.target)) {
          e.stopPropagation();
          focusInto(panel);
        }
      } catch (_) {}
    }

    function setInert(isOpen) {
      // Prefer main content container if present; fall back to #home
      var main =
        qs("[data-ff-main]") ||
        document.getElementById("home") ||
        qs("main") ||
        null;

      if (!main) return;

      try {
        if (isOpen) main.setAttribute("inert", "");
        else main.removeAttribute("inert");
      } catch (_) {}

      // Also help SR by toggling aria-hidden on main (best-effort)
      try {
        if (isOpen) main.setAttribute("aria-hidden", "true");
        else main.removeAttribute("aria-hidden");
      } catch (_) {}
    }

    function lockScroll() {
      if (scrollLocked) return;
      scrollLocked = true;

      try {
        prevOverflow = String(document.body.style.overflow || "");
        prevPadRight = String(document.body.style.paddingRight || "");
      } catch (_) {
        prevOverflow = "";
        prevPadRight = "";
      }

      try {
        var sbw = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight = sbw > 0 ? sbw + "px" : "";
      } catch (_) {}

      try {
        document.documentElement.setAttribute("data-ff-scroll-locked", "true");
      } catch (_) {}
    }

    function unlockScroll() {
      if (!scrollLocked) return;
      scrollLocked = false;

      try {
        document.body.style.overflow = prevOverflow || "";
        document.body.style.paddingRight = prevPadRight || "";
      } catch (_) {}

      try {
        document.documentElement.removeAttribute("data-ff-scroll-locked");
      } catch (_) {}
    }

    function setOpenState(open) {
      // Always drive contract attributes/classes on BOTH sheet and panel
      try {
        if (open) {
          ffOpenByContract(sheet);
          try { sheet.setAttribute("role", sheet.getAttribute("role") || "dialog"); } catch (_) {}
          try { sheet.setAttribute("aria-modal", sheet.getAttribute("aria-modal") || "true"); } catch (_) {}
        } else {
          ffCloseByContract(sheet);
        }
      } catch (_) {}

      try {
        if (panel) {
          if (open) ffOpenByContract(panel);
          else ffCloseByContract(panel);
        }
      } catch (_) {}
    }

    function isOpen() {
      return isOpenByContract(sheet);
    }

    function open(opts) {
      try {
        if (isOpen()) return;

        try {
          returnFocusEl = document.activeElement && isEl(document.activeElement) ? document.activeElement : null;
        } catch (_) {
          returnFocusEl = null;
        }

        setOpenState(true);
        lockScroll();
        setInert(true);

        if (!focusTrapOn) {
          focusTrapOn = true;
          on(document, "focusin", onFocusIn, true);
        }

        if (panel) focusInto(panel);

        // Set hash without relying on hashchange for correctness
        if (String(location.hash || "") !== "#checkout") {
          ffBestEffortReplaceHash("#checkout");
        }

        if (!(opts && opts.quiet)) {
          try {
            document.dispatchEvent(new CustomEvent("ff:checkout:open"));
          } catch (_) {}
        }

        try {
          if (Payments && Payments.queueEvaluate) Payments.queueEvaluate(true);
        } catch (_) {}
      } catch (_) {}
    }

    function close(opts) {
      try {
        // Always close by contract, even if state already "looks closed"
        setOpenState(false);
        unlockScroll();
        setInert(false);

        if (focusTrapOn) {
          focusTrapOn = false;
          try {
            document.removeEventListener("focusin", onFocusIn, true);
          } catch (_) {}
        }

        // Clear hash if we're on #checkout (best effort)
        try {
          if (String(location.hash || "") === "#checkout") {
            // Prefer #home if it exists, else clear hash
            if (document.getElementById("home")) ffBestEffortReplaceHash("#home");
            else ffBestEffortReplaceHash("");
          }
        } catch (_) {}

        // Restore focus
        try {
          if (returnFocusEl && returnFocusEl.focus) returnFocusEl.focus();
        } catch (_) {}
        returnFocusEl = null;

        if (!(opts && opts.quiet)) {
          try {
            document.dispatchEvent(new CustomEvent("ff:checkout:close"));
          } catch (_) {}
        }

        // Payments cleanup (deterministic)
        try {
          if (Payments && Payments.onCheckoutClosed) Payments.onCheckoutClosed();
        } catch (_) {}
      } catch (_) {}
    }

    function closeByContract() {
      // Public contract-close: close + ensure everything is reset, no dependency on hash sync
      close({ quiet: true });
      // Force contract-close again (in case other logic re-opened attrs)
      try { ffCloseByContract(sheet); } catch (_) {}
      try { if (panel) ffCloseByContract(panel); } catch (_) {}
    }

    function onBackdropClick(e) {
      try {
        if (!isOpen()) return;
        // Close when clicking backdrop OR clicking sheet outside panel
        var t = e && e.target ? e.target : null;
        if (backdrop && t === backdrop) {
          try { e.preventDefault(); } catch (_) {}
          close();
          return;
        }
        if (t === sheet) {
          try { e.preventDefault(); } catch (_) {}
          close();
          return;
        }
        // If clicked on something marked as backdrop
        if (t && t.closest && t.closest(".ff-sheet__backdrop,[data-ff-checkout-backdrop]")) {
          try { e.preventDefault(); } catch (_) {}
          close();
        }
      } catch (_) {}
    }

    function init() {
      // Delegated open/close hooks (supports dynamically added openers)
      on(document, "click", function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;

          var opener = t.closest(HOOKS.get("openCheckout", "[data-ff-open-checkout]"));
          if (opener) {
            try { e.preventDefault(); } catch (_) {}
            open();
            return;
          }

          var closer = t.closest(HOOKS.get("closeCheckout", "[data-ff-close-checkout]"));
          if (closer) {
            try { e.preventDefault(); } catch (_) {}
            // Close checkout by CONTRACT (not hash dependency)
            close();
            return;
          }
        } catch (_) {}
      }, true);

      // Backdrop close
      if (backdrop) on(backdrop, "click", function (e) { onBackdropClick(e); }, true);
      on(sheet, "click", function (e) { onBackdropClick(e); }, true);

      // Esc closes checkout (deterministic)
      on(document, "keydown", function (e) {
        try {
          if (e.key !== "Escape") return;
          if (!isOpen()) return;
          try { e.preventDefault(); } catch (_) {}
          close();
        } catch (_) {}
      }, true);

      // Hash sync (but NEVER relied upon for correctness)
      on(window, "hashchange", function () {
        try {
          if (String(location.hash || "") === "#checkout") open({ quiet: true });
          else close({ quiet: true });
        } catch (_) {}
      }, { passive: true });

      // Initial state
      try {
        if (String(location.hash || "") === "#checkout") open({ quiet: true });
        else close({ quiet: true });
      } catch (_) {}
    }

    return {
      init: init,
      open: open,
      close: close,
      closeByContract: closeByContract,
      isOpen: isOpen
    };
  })();

  /* --------------------------------------------------------------------------
   * Amount chips + prefill (open checkout deterministically)
   * ------------------------------------------------------------------------ */
  function initPrefill() {
    on(document, "click", function (e) {
      try {
        var t = e.target;
        if (!t || !t.closest) return;

        var chip = t.closest("[data-ff-amount]");
        if (!chip) return;

        var v = String(chip.getAttribute("data-ff-amount") || "").trim();
        if (!v) return;

        var amt = DOM.amountInput();
        if (amt) {
          amt.value = v;
          try {
            amt.dispatchEvent(new Event("input", { bubbles: true }));
          } catch (_) {}
        }

        // Open checkout deterministically (NOT hash-dependent)
        Checkout.open({ quiet: true });
        try {
          ffBestEffortReplaceHash("#checkout");
        } catch (_) {}

        toast("Amount set", "success", 1600);
      } catch (_) {}
    }, true);
  }

  /* --------------------------------------------------------------------------
   * Theme toggle (light/dark) — persists via localStorage
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
      var mode = v === "dark" || v === "light" ? v : "";
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
      var next = cur === "dark" ? "light" : "dark";
      setSaved(next);
      apply(next);

      // Re-theme Stripe appearance (best-effort) when open
      try { if (Payments && Payments.queueEvaluate) Payments.queueEvaluate(true); } catch (_) {}
    }

    function init() {
      var saved = getSaved();
      if (saved) apply(saved);

      on(document, "click", function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;
          var btn = t.closest(HOOKS.get("themeToggle", "[data-ff-theme-toggle]"));
          if (!btn) return;
          try { e.preventDefault(); } catch (_) {}
          toggle();
        } catch (_) {}
      }, true);
    }

    return { init: init };
  })();

  /* --------------------------------------------------------------------------
   * Share (data-ff-share) — native share else copy URL
   * ------------------------------------------------------------------------ */
  var Share = (function () {
    function canonicalUrl() {
      var u = meta("ff:canonical") || meta("og:url") || "";
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
          try { e.preventDefault(); } catch (_) {}
          doShare();
        } catch (_) {}
      }, true);
    }

    return { init: init };
  })();

  /* --------------------------------------------------------------------------
   * Overlays (drawer, sponsor, video, terms, privacy) — hash-aware + delegated
   * ------------------------------------------------------------------------ */
  var Overlays = (function () {
    var IDS = ["drawer", "sponsor-interest", "press-video", "terms", "privacy"];

    function getPanelFor(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      return qs(".ff-modal__panel,.ff-drawer__panel,[role='dialog']", el) || el;
    }

    function openById(id, opts) {
      var el = document.getElementById(id);
      if (!el) return;

      // Close other non-checkout overlays first (deterministic)
      IDS.forEach(function (x) {
        if (x === id) return;
        var other = document.getElementById(x);
        if (other) ffCloseByContract(other);
      });

      ffOpenByContract(el);

      // Focus
      var panel = getPanelFor(id);
      if (panel) focusInto(panel);

      // Video: lazy mount iframe when opened via opener with src
      if (id === "press-video") {
        try {
          var frame = DOM.videoFrame();
          if (frame && !(opts && opts.keepFrame)) {
            // if already has iframe, keep it; else it will be injected on opener click
            // (no-op here)
          }
        } catch (_) {}
      }
    }

    function closeById(id, opts) {
      var el = document.getElementById(id);
      if (!el) return;

      ffCloseByContract(el);

      // Video: remove iframe to stop playback
      if (id === "press-video") {
        try {
          var fr = DOM.videoFrame();
          if (fr) fr.replaceChildren();
        } catch (_) {}
      }

      // Hash cleanup (best-effort)
      try {
        if (String(location.hash || "") === "#" + id) {
          if (document.getElementById("home")) ffBestEffortReplaceHash("#home");
          else ffBestEffortReplaceHash("");
        }
      } catch (_) {}

      if (!(opts && opts.quiet)) {
        try {
          document.dispatchEvent(new CustomEvent("ff:overlay:close", { detail: { id: id } }));
        } catch (_) {}
      }
    }

    function closeAllNonCheckout() {
      IDS.forEach(function (id) {
        closeById(id, { quiet: true });
      });
    }

    function syncFromHash() {
      var h = String(location.hash || "");
      if (!h || h === "#") {
        closeAllNonCheckout();
        return;
      }
      var id = h.replace("#", "");
      if (!id) {
        closeAllNonCheckout();
        return;
      }

      // Checkout is owned by Checkout module
      if (id === "checkout") {
        closeAllNonCheckout();
        return;
      }

      // Only open known overlays; otherwise close all
      if (IDS.indexOf(id) === -1) {
        closeAllNonCheckout();
        return;
      }

      openById(id);
    }

    function init() {
      // Delegated open/close for dynamic nodes
      on(document, "click", function (e) {
        try {
          var t = e.target;
          if (!t || !t.closest) return;

          // Drawer
          var openDrawer = t.closest(HOOKS.get("openDrawer", "[data-ff-open-drawer]"));
          if (openDrawer) {
            try { e.preventDefault(); } catch (_) {}
            openById("drawer");
            try { ffBestEffortReplaceHash("#drawer"); } catch (_) {}
            return;
          }

          var closeDrawer = t.closest(HOOKS.get("closeDrawer", "[data-ff-close-drawer]"));
          if (closeDrawer) {
            try { e.preventDefault(); } catch (_) {}
            closeById("drawer");
            return;
          }

          // Sponsor
          var openSponsor = t.closest(HOOKS.get("openSponsor", "[data-ff-open-sponsor]"));
          if (openSponsor) {
            try { e.preventDefault(); } catch (_) {}
            openById("sponsor-interest");
            try { ffBestEffortReplaceHash("#sponsor-interest"); } catch (_) {}
            return;
          }

          var closeSponsor = t.closest(HOOKS.get("closeSponsor", "[data-ff-close-sponsor]"));
          if (closeSponsor) {
            try { e.preventDefault(); } catch (_) {}
            closeById("sponsor-interest");
            return;
          }

          // Video
          var openVideo = t.closest(HOOKS.get("openVideo", "[data-ff-open-video]"));
          if (openVideo) {
            try { e.preventDefault(); } catch (_) {}

            openById("press-video", { keepFrame: true });

            // Lazy mount iframe into the frame container
            try {
              var src = openVideo.getAttribute("data-ff-video-src") || "";
              var title = openVideo.getAttribute("data-ff-video-title") || "Video";
              var frame = DOM.videoFrame();

              if (frame) {
                frame.replaceChildren();
                if (src) {
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
              }
            } catch (_) {}

            try { ffBestEffortReplaceHash("#press-video"); } catch (_) {}
            return;
          }

          var closeVideo = t.closest(HOOKS.get("closeVideo", "[data-ff-close-video]"));
          if (closeVideo) {
            try { e.preventDefault(); } catch (_) {}
            closeById("press-video");
            return;
          }

          // Terms / Privacy (optional)
          var openTerms = t.closest('[href="#terms"],[data-ff-open-terms]');
          if (openTerms) {
            try { e.preventDefault(); } catch (_) {}
            openById("terms");
            try { ffBestEffortReplaceHash("#terms"); } catch (_) {}
            return;
          }
          var openPrivacy = t.closest('[href="#privacy"],[data-ff-open-privacy]');
          if (openPrivacy) {
            try { e.preventDefault(); } catch (_) {}
            openById("privacy");
            try { ffBestEffortReplaceHash("#privacy"); } catch (_) {}
            return;
          }

          var closeTerms = t.closest("[data-ff-close-terms]");
          if (closeTerms) {
            try { e.preventDefault(); } catch (_) {}
            closeById("terms");
            return;
          }
          var closePrivacy = t.closest("[data-ff-close-privacy]");
          if (closePrivacy) {
            try { e.preventDefault(); } catch (_) {}
            closeById("privacy");
            return;
          }
        } catch (_) {}
      }, true);

      // Escape: close topmost overlay (checkout handled by Checkout)
      on(document, "keydown", function (e) {
        try {
          if (e.key !== "Escape") return;

          // If checkout is open, Checkout owns Esc
          try {
            if (Checkout && Checkout.isOpen && Checkout.isOpen()) return;
          } catch (_) {}

          // Close in priority order (most "modal" first)
          var order = ["press-video", "sponsor-interest", "terms", "privacy", "drawer"];
          for (var i = 0; i < order.length; i++) {
            var id = order[i];
            var el = document.getElementById(id);
            if (el && isOpenByContract(el)) {
              try { e.preventDefault(); } catch (_) {}
              closeById(id);
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

    return {
      init: init,
      closeAllNonCheckout: closeAllNonCheckout,
      closeById: closeById,
      openById: openById
    };
  })();

  /* --------------------------------------------------------------------------
   * Payments (Stripe + PayPal) — lazy-loaded, checkout-open gated
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
      try {
        return Checkout && Checkout.isOpen && Checkout.isOpen();
      } catch (_) {
        var s = DOM.checkoutSheet();
        return !!(s && isOpenByContract(s));
      }
    }

    function readAmountCents() {
      var a = DOM.amountInput();
      return a ? parseMoneyToCents(a.value) : 0;
    }

    function readCurrency() {
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
      if (window.location.protocol === "https:" && String(u).indexOf("http://") === 0) {
        u = "https://" + String(u).slice(7);
      }
      return String(u);
    }

    function loadStripeJs() {
      if (window.Stripe) return Promise.resolve(true);
      if (stripeJsPromise) return stripeJsPromise;

      var src = meta("ff-stripe-js") || meta("ff:stripe-js") || "https://js.stripe.com/v3/";
      stripeJsPromise = FF.injectScript(src, { attrs: { "data-ff-stripe": "1" } }).then(function () {
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
            j && (j.publishableKey || j.publishable_key || j.stripePublishableKey || j.pk)
              ? String(j.publishableKey || j.publishable_key || j.stripePublishableKey || j.pk).trim()
              : "";
          if (!pk) throw new Error("Stripe publishable key missing");
          return pk;
        });

      return stripePkPromise;
    }

    function buildStripePayload(amountCents) {
      var currency = readCurrency().toLowerCase();
      var email = readEmail();
      var teamId = readTeamId();

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
      ).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var msg = j && j.error && j.error.message ? j.error.message : ("Stripe intent failed (" + r.status + ")");
            throw new Error(msg);
          }
          if (j && j.ok === false) {
            var m = j.error && j.error.message ? j.error.message : (j.message || "Stripe intent failed");
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
        var sk = DOM.stripeSkeleton();
        if (sk) host.replaceChildren(sk.cloneNode(true));
      } catch (_) {}

      return Promise.all([loadStripeJs(), fetchStripePk()])
        .then(function (res) {
          if (!res[0]) throw new Error("Stripe.js unavailable");
          var pk = res[1];

          if (!stripe || stripe.__ffPk !== pk) {
            stripe = window.Stripe(pk);
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
              appearance: {
                theme: String(document.documentElement.getAttribute("data-theme") || "dark") === "dark" ? "night" : "stripe"
              }
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
          setStripeError(e && e.message ? e.message : "Stripe failed to load");
          return false;
        });
    }

    function confirmStripePayment() {
      if (!stripe || !elements) return Promise.resolve(false);

      setStripeError("");
      setStripeMessage("Processing…");

      return stripe.confirmPayment({
        elements: elements,
        redirect: "if_required",
        confirmParams: { return_url: stripeReturnUrl() }
      }).then(function (res) {
        if (res && res.error) throw new Error(res.error.message || "Payment failed");
        setStripeMessage("Complete");
        return true;
      }).catch(function (e) {
        setStripeMessage("");
        setStripeError(e && e.message ? e.message : "Payment failed");
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

      paypalJsPromise = FF.injectScript(src, { attrs: { "data-ff-paypal": "1" } }).then(function () {
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
        if (sk) host.replaceChildren(sk.cloneNode(true));
        else host.replaceChildren();
      } catch (_) {}

      return loadPayPalJs()
        .then(function (ok) {
          if (!ok) {
            setPayPalMessage("");
            setPayPalError("PayPal unavailable");
            return false;
          }

          try { host.replaceChildren(); } catch (_) {}

          var headers = { "Content-Type": "application/json" };
          var ch = csrfHeader();
          Object.keys(ch).forEach(function (k) { headers[k] = ch[k]; });

          var payload = buildPayPalPayload(amt);

          var buttons = window.paypal.Buttons({
            createOrder: function () {
              return fetchWithTimeout(
                paypalCreateEndpoint(),
                { method: "POST", credentials: "same-origin", headers: headers, body: JSON.stringify(payload) },
                15000
              ).then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                  if (!r.ok || (j && j.ok === false)) {
                    var msg = j && j.error && j.error.message ? j.error.message : (j.message || ("PayPal create failed (" + r.status + ")"));
                    throw new Error(msg);
                  }
                  var id = j.id || j.orderID || j.order_id || (j.data && (j.data.id || j.data.orderID));
                  if (!id) throw new Error("Missing PayPal order id");
                  return String(id);
                });
              });
            },
            onApprove: function (data) {
              var orderID = String((data && (data.orderID || data.id)) || "");
              if (!orderID) throw new Error("Missing PayPal order id");

              return fetchWithTimeout(
                paypalCaptureEndpoint(),
                { method: "POST", credentials: "same-origin", headers: headers, body: JSON.stringify({ order_id: orderID, orderID: orderID }) },
                15000
              ).then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                  if (!r.ok || (j && j.ok === false)) {
                    var msg = j && j.error && j.error.message ? j.error.message : (j.message || ("PayPal capture failed (" + r.status + ")"));
                    throw new Error(msg);
                  }
                  return true;
                });
              }).then(function () {
                setPayPalMessage("Complete");
                return true;
              }).catch(function (e) {
                setPayPalMessage("");
                setPayPalError(e && e.message ? e.message : "PayPal failed");
                return false;
              });
            },
            onError: function (err) {
              setPayPalMessage("");
              setPayPalError(err && err.message ? err.message : "PayPal error");
            }
          });

          buttons.render(host);

          paypalRenderedKey = key;
          setPayPalMessage("Ready");
          return true;
        })
        .catch(function (e) {
          setPayPalMessage("");
          setPayPalError(e && e.message ? e.message : "PayPal failed to load");
          return false;
        });
    }

    /* ---------------- Evaluation loop ---------------- */

    function evaluate(force) {
      evalQueued = false;

      if (!isCheckoutOpen()) return;

      var amt = readAmountCents();
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

      mountStripe(amt, !!force);
      renderPayPal(amt, !!force);
    }

    function queueEvaluate(force) {
      if (!isCheckoutOpen()) return;
      if (evalQueued) return;
      evalQueued = true;

      try {
        requestAnimationFrame(function () { evaluate(!!force); });
      } catch (_) {
        setTimeout(function () { evaluate(!!force); }, 0);
      }
    }

    function onCheckoutClosed() {
      // Deterministic cleanup when checkout closes (prevents “invisible overlay still active” bugs)
      try { teardownStripe(); } catch (_) {}
      try {
        var pm = DOM.paypalMount();
        if (pm) pm.replaceChildren();
      } catch (_) {}
      setPayPalMessage("");
      setPayPalError("");
      paypalRenderedKey = "";
    }

    function init() {
      var deb = debounce(function () { queueEvaluate(false); }, 300);

      var a = DOM.amountInput();
      if (a) on(a, "input", deb);

      var e = DOM.emailInput();
      if (e) on(e, "input", deb);

      // When checkout opens, evaluate immediately (hash-change is a hint, not a dependency)
      on(window, "hashchange", function () {
        if (String(location.hash || "") === "#checkout") queueEvaluate(true);
      });

      // Also evaluate on explicit checkout open event
      on(document, "ff:checkout:open", function () { queueEvaluate(true); }, true);

      // Form submit: prefer Stripe Payment Element if mounted; PayPal has its own buttons.
      var form = DOM.donationForm();
      if (form) {
        on(form, "submit", function (ev) {
          try { ev.preventDefault(); } catch (_) {}

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

          if (stripe && elements) {
            if (stBox) { stBox.hidden = false; stBox.textContent = "Processing your donation…"; }
            confirmStripePayment().then(function (ok) {
              if (!ok) return;
              toast("Payment complete ✅", "success", 2200);

              try {
                var sheet = DOM.checkoutSheet();
                var succ = DOM.checkoutSuccess();
                if (succ) {
                  succ.hidden = false;
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
      queueEvaluate: queueEvaluate,
      onCheckoutClosed: onCheckoutClosed
    };
  })();

  /* --------------------------------------------------------------------------
   * Sponsor submit (optional best-effort)
   * ------------------------------------------------------------------------ */
  function initSponsorSubmit() {
    on(document, "click", function (e) {
      try {
        var t = e.target;
        if (!t || !t.closest) return;
        var btn = t.closest("[data-ff-sponsor-submit]");
        if (!btn) return;
        toast("Sponsor request sent (demo)", "success", 2200);
        announce("Sponsor request sent");
      } catch (_) {}
    }, true);
  }

  /* --------------------------------------------------------------------------
   * closeAllOverlays (PUBLIC API) — deterministic cleanup, not selector-only
   * ------------------------------------------------------------------------ */
  function ffCloseAllOverlays() {
    try {
      // 1) Close checkout by CONTRACT (kills side effects: scroll lock, inert, focus trap)
      try { if (Checkout && Checkout.closeByContract) Checkout.closeByContract(); } catch (_) {}

      // 2) Close known overlays by contract
      try { if (Overlays && Overlays.closeAllNonCheckout) Overlays.closeAllNonCheckout(); } catch (_) {}

      // 3) Generic sweep: anything that still looks open by contract → close
      try {
        var nodes = document.querySelectorAll(".is-open, [data-open='true'], [aria-hidden='false']");
        for (var i = 0; i < nodes.length; i++) {
          ffCloseByContract(nodes[i]);
        }
      } catch (_) {}

      // 4) Clear hash (best-effort)
      try {
        if (location && location.hash) {
          if (document.getElementById("home")) ffBestEffortReplaceHash("#home");
          else ffBestEffortReplaceHash("");
        }
      } catch (_) {}
    } catch (_) {}
  }

  // Re-export in case earlier export happened before function declaration
  try {
    FF.closeAllOverlays = ffCloseAllOverlays;
    FF.injectScript = FF.injectScript || ffInjectScript;
    FF.version = FF.version || VERSION;
  } catch (_) {}

  /* --------------------------------------------------------------------------
   * App init
   * ------------------------------------------------------------------------ */
  function init() {
    try {
      Checkout.init();
      initPrefill();

      Theme.init();
      Share.init();

      Overlays.init();

      Payments.init();
      initSponsorSubmit();

      try { document.documentElement.classList.add("ff-js"); } catch (_) {}
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

/* EOF: app/static/js/ff-app.js */
