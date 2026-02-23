/* ============================================================================
  FutureFunded • Flagship — ff-app.js (FULL DROP-IN • Hook-safe • CSP-safe)
  File: app/static/js/ff-app.js
  Version: 26.2.1-js.0

  Key upgrades vs 26.2.0-js.0:
  - PERF P0: NEVER loads Stripe/PayPal on home automatically (only when checkout is opened + amount > 0)
  - P0: Amount input now triggers Stripe/PayPal prep live while checkout is open
  - Fix: Stripe submit button de-dupe (prior object-key trick could collapse incorrectly)
  - Safety: Removes trailing-arg commas + hardens script loader reuse checks
============================================================================ */

(function () {
  "use strict";

  /* -----------------------------
     Core helpers
  ----------------------------- */

  var APP_VERSION = "26.2.1-js.0";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function safeParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function nowMs() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function getMeta(name) {
    var el = qs('meta[name="' + name + '"]');
    return el ? String(el.getAttribute("content") || "").trim() : "";
  }

  function getCSRF() {
    // Flask-WTF: <meta name="csrf-token" content="...">
    var v = getMeta("csrf-token");
    return v || "";
  }

  function promiseFinally(p, cb) {
    return p.then(
      function (v) {
        try {
          cb();
        } catch (e) {}
        return v;
      },
      function (err) {
        try {
          cb();
        } catch (e2) {}
        throw err;
      }
    );
  }

  function fetchJSON(url, opts) {
    var o = opts || {};
    var headers = o.headers || {};
    headers["Accept"] = "application/json";
    if (o.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    var csrf = getCSRF();
    if (csrf) headers["X-CSRFToken"] = csrf;

    o.headers = headers;
    if (!o.credentials) o.credentials = "same-origin";

    return fetch(url, o).then(function (res) {
      return res.text().then(function (txt) {
        var data = safeParseJSON(txt);
        if (!res.ok) {
          var msg =
            data && (data.error || data.message)
              ? (data.error || data.message)
              : "Request failed (" + res.status + ")";
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          err.raw = txt;
          throw err;
        }
        if (!data) {
          var e = new Error("Server returned non-JSON.");
          e.status = res.status;
          e.raw = txt;
          throw e;
        }
        return data;
      });
    });
  }

  function raf() {
    return new Promise(function (resolve) {
      requestAnimationFrame(resolve);
    });
  }

  function ready(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  function stripHash(url) {
    try {
      var u = new URL(url, window.location.origin);
      u.hash = "";
      return u.toString();
    } catch (e) {
      return String(url || "").split("#")[0] || window.location.href.split("#")[0];
    }
  }

  /* -----------------------------
     CSP nonce (for dynamic script injection)
  ----------------------------- */

  function getCSPNonce() {
    // Prefer explicit meta if you set it server-side
    var meta = getMeta("csp-nonce");
    if (meta) return meta;

    // Current script nonce (works when ff-app.js is loaded with nonce)
    try {
      var cs = document.currentScript;
      if (cs && cs.nonce) return cs.nonce;
      if (cs && cs.getAttribute) {
        var n = cs.getAttribute("nonce");
        if (n) return n;
      }
    } catch (e) {}

    // Any existing nonce'd script tag
    var s = qs("script[nonce]");
    if (s) {
      try {
        return s.nonce || s.getAttribute("nonce") || "";
      } catch (e2) {
        return "";
      }
    }
    return "";
  }

  /* -----------------------------
     Config + Selectors
  ----------------------------- */

  var cfgEl = qs("#ffConfig");
  var cfg = cfgEl ? safeParseJSON(cfgEl.textContent || "") : null;

  if (!cfg) {
    cfg = {
      env: getMeta("ff-env") || getMeta("ff:env") || "",
      dataMode: getMeta("ff-data-mode") || getMeta("ff:data-mode") || "live",
      version: getMeta("ff-version") || getMeta("ff:version") || "",
      payments: {
        stripePk: getMeta("ff-stripe-pk") || getMeta("ff:stripe-pk") || "",
        stripeJs: getMeta("ff-stripe-js") || getMeta("ff:stripe-js") || "https://js.stripe.com/v3/",
        stripeIntentEndpoint:
          getMeta("ff-stripe-intent-endpoint") ||
          getMeta("ff:stripe-intent-endpoint") ||
          "/payments/stripe/intent",
        stripeReturnUrl: stripHash(window.location.href),
        paypalClientId: getMeta("ff-paypal-client-id") || getMeta("ff:paypal-client-id") || "",
        paypalJs: getMeta("ff-paypal-js") || getMeta("ff:paypal-js") || "https://www.paypal.com/sdk/js",
        paypalCreateEndpoint:
          getMeta("ff-paypal-create-endpoint") || getMeta("ff:paypal-create-endpoint") || "/payments/paypal/order",
        paypalCaptureEndpoint:
          getMeta("ff-paypal-capture-endpoint") || getMeta("ff:paypal-capture-endpoint") || "/payments/paypal/capture"
      },
      fundraiser: { currency: "USD" },
      support: { email: "support@getfuturefunded.com" },
      accessibility: { focusRestore: true, ariaLiveToasts: true }
    };
  }

  var selectorsEl = qs("#ffSelectors");
  var selectorsPayload = selectorsEl ? safeParseJSON(selectorsEl.textContent || "") : null;
  var hooks = selectorsPayload && selectorsPayload.hooks ? selectorsPayload.hooks : {};
  function hookSel(key, fallback) {
    return hooks && hooks[key] ? hooks[key] : (fallback || "");
  }

  /* -----------------------------
     Runtime state + public API
  ----------------------------- */

  var rootEl = document.documentElement;

  var state = {
    version: APP_VERSION,
    cfg: cfg,
    hooks: hooks,
    startedAt: nowMs(),
    cspNonce: getCSPNonce(),
    openStack: [], // stack of { id, root, panel, restoreEl, trap }
    openMap: {}, // id -> true when open (prevents duplicate push)
    stripe: {
      pk: cfg && cfg.payments && cfg.payments.stripePk ? String(cfg.payments.stripePk || "") : "",
      intentEndpoint:
        cfg && cfg.payments && cfg.payments.stripeIntentEndpoint
          ? String(cfg.payments.stripeIntentEndpoint || "")
          : "/payments/stripe/intent",
      returnUrl:
        cfg && cfg.payments && cfg.payments.stripeReturnUrl
          ? String(cfg.payments.stripeReturnUrl || "")
          : stripHash(window.location.href),
      jsUrl:
        cfg && cfg.payments && cfg.payments.stripeJs
          ? String(cfg.payments.stripeJs || "")
          : "https://js.stripe.com/v3/",
      stripe: null,
      elements: null,
      paymentEl: null,
      mounted: false,
      preparing: false,
      submitting: false,
      loadPromise: null,
      clientSecret: "",
      intentAmount: 0,
      amount: 0
    },
    paypal: {
      clientId:
        cfg && cfg.payments && cfg.payments.paypalClientId ? String(cfg.payments.paypalClientId || "") : "",
      jsUrl:
        cfg && cfg.payments && cfg.payments.paypalJs
          ? String(cfg.payments.paypalJs || "")
          : "https://www.paypal.com/sdk/js",
      createEndpoint:
        cfg && cfg.payments && cfg.payments.paypalCreateEndpoint
          ? String(cfg.payments.paypalCreateEndpoint || "")
          : "/payments/paypal/order",
      captureEndpoint:
        cfg && cfg.payments && cfg.payments.paypalCaptureEndpoint
          ? String(cfg.payments.paypalCaptureEndpoint || "")
          : "/payments/paypal/capture",
      loaded: false,
      rendered: false,
      loadPromise: null
    }
  };

  /* -----------------------------
     DOM cache
  ----------------------------- */

  var amountInput = qs("#donationAmount");
  var stripeSkeleton = qs("[data-ff-stripe-skeleton]");
  var paypalSkeleton = qs("[data-ff-paypal-skeleton]");
  var paymentMount = qs("[data-ff-stripe-mount]");
  var paypalMount = qs("[data-ff-paypal-mount]");
  var stripeErr = qs("[data-ff-stripe-error]");
  var paypalErr = qs("[data-ff-paypal-error]");

  // Optional status elements (do NOT require markup changes)
  var stripeMsg = qs("[data-ff-stripe-msg]") || qs("[data-ff-stripe-status]") || qs("[data-ff-payment-msg]");
  var paypalMsg = qs("[data-ff-paypal-msg]") || qs("[data-ff-paypal-status]") || qs("[data-ff-paypal-message]");

  var checkoutSheet = qs("#checkout");
  var checkoutPanel = checkoutSheet ? qs(".ff-sheet__panel", checkoutSheet) : null;

  var drawer = qs("#drawer");
  var drawerPanel = drawer ? qs(".ff-drawer__panel", drawer) : null;

  var sponsorModal = qs("#sponsor-interest");
  var sponsorPanel = sponsorModal ? qs(".ff-modal__panel", sponsorModal) : null;

  var videoModal = qs("#press-video");
  var videoPanel = videoModal ? qs(".ff-modal__panel", videoModal) : null;

  var burst = qs(".ff-burst");

  // Support both legacy and new toast host classes
  var toastHost = qs(".ff-toastHost") || qs(".ff-toasts");

  /* -----------------------------
     Tiny UI helpers
  ----------------------------- */

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function setOpenAttrs(root, isOpen) {
    if (!root) return;
    root.setAttribute("data-open", isOpen ? "true" : "false");
    root.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (isOpen) root.classList.add("is-open");
    else root.classList.remove("is-open");
    setHidden(root, !isOpen);
  }

  function isRootOpen(root) {
    if (!root) return false;
    return (
      root.getAttribute("data-open") === "true" ||
      root.classList.contains("is-open") ||
      root.getAttribute("aria-hidden") === "false"
    );
  }

  function lockScroll(locked) {
    try {
      document.body.style.overflow = locked ? "hidden" : "";
      document.body.style.touchAction = locked ? "none" : "";
    } catch (e) {}
  }

  function toast(kind, msg) {
    if (!toastHost) return;

    var t = document.createElement("div");
    t.className = "ff-toast ff-toast--" + String(kind || "info");
    t.setAttribute("role", "status");

    var inner = document.createElement("div");
    inner.className = "ff-toast__inner";

    var m = document.createElement("div");
    m.className = "ff-toast__msg";
    m.textContent = String(msg || "");

    var btn = document.createElement("button");
    btn.className = "ff-toast__x";
    btn.type = "button";
    btn.setAttribute("aria-label", "Dismiss");
    btn.textContent = "✕";
    btn.addEventListener("click", function () {
      try {
        toastHost.removeChild(t);
      } catch (e) {}
    });

    inner.appendChild(m);
    inner.appendChild(btn);
    t.appendChild(inner);

    toastHost.appendChild(t);

    setTimeout(function () {
      try {
        toastHost.removeChild(t);
      } catch (e) {}
    }, 5200);
  }

  function markLoading(on) {
    if (rootEl) rootEl.classList.toggle("is-loading", !!on);
  }
  function markReady() {
    if (rootEl) rootEl.classList.add("is-ready");
  }
  function markError() {
    if (rootEl) rootEl.classList.add("is-error");
  }

  function burstOnce() {
    if (!burst) return;
    try {
      burst.classList.add("is-open");
      burst.setAttribute("data-open", "true");
      burst.setAttribute("aria-hidden", "false");
      setTimeout(function () {
        try {
          burst.classList.remove("is-open");
          burst.setAttribute("data-open", "false");
          burst.setAttribute("aria-hidden", "true");
        } catch (e) {}
      }, 900);
    } catch (e2) {}
  }

  function ensureInnerWrapper(mountEl, name) {
    // P0: Never wipe mount node; mount providers into a stable child wrapper.
    if (!mountEl) return null;
    var sel = '[data-ff-inner-mount="' + name + '"]';
    var inner = qs(sel, mountEl);
    if (inner) return inner;

    inner = document.createElement("div");
    inner.setAttribute("data-ff-inner-mount", name);
    mountEl.appendChild(inner);
    return inner;
  }

  /* -----------------------------
     Focus trap (lightweight, robust)
  ----------------------------- */

  function getFocusable(root) {
    if (!root) return [];
    var sels = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    return qsa(sels, root).filter(function (el) {
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    });
  }

  function trapFocus(panel, onClose) {
    if (!panel) return { destroy: function () {} };

    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");

    function onKeyDown(e) {
      var key = e.key || e.keyCode;

      if (key === "Escape" || key === "Esc" || key === 27) {
        if (typeof onClose === "function") onClose();
        return;
      }
      if (key !== "Tab" && key !== 9) return;

      var focusables = getFocusable(panel);
      if (!focusables.length) {
        e.preventDefault();
        try {
          panel.focus({ preventScroll: true });
        } catch (e1) {}
        return;
      }

      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault();
          try {
            last.focus({ preventScroll: true });
          } catch (e2) {}
        }
      } else {
        if (active === last) {
          e.preventDefault();
          try {
            first.focus({ preventScroll: true });
          } catch (e3) {}
        }
      }
    }

    panel.addEventListener("keydown", onKeyDown);
    return {
      destroy: function () {
        try {
          panel.removeEventListener("keydown", onKeyDown);
        } catch (e) {}
      }
    };
  }

  /* -----------------------------
     Overlay manager (sheet/modals/drawer + hash targets)
  ----------------------------- */

  function pushOpen(id, root, panel) {
    if (state.openMap[id]) return; // prevents duplicate stacking
    state.openMap[id] = true;

    var restore = document.activeElement;
    var entry = { id: id, root: root, panel: panel, restoreEl: restore, trap: null };
    state.openStack.push(entry);

    lockScroll(true);

    if (panel) {
      entry.trap = trapFocus(panel, function () {
        closeById(id);
      });
      raf().then(function () {
        try {
          panel.focus({ preventScroll: true });
        } catch (e) {}
      });
    }
  }

  function popOpen(id) {
    if (!state.openMap[id]) {
      if (!state.openStack.length) lockScroll(false);
      return;
    }

    state.openMap[id] = false;

    for (var i = state.openStack.length - 1; i >= 0; i--) {
      if (state.openStack[i].id === id) {
        var entry = state.openStack.splice(i, 1)[0];
        if (entry && entry.trap) entry.trap.destroy();
        if (
          cfg &&
          cfg.accessibility &&
          cfg.accessibility.focusRestore &&
          entry &&
          entry.restoreEl &&
          entry.restoreEl.focus
        ) {
          raf().then(function () {
            try {
              entry.restoreEl.focus({ preventScroll: true });
            } catch (e2) {}
          });
        }
        break;
      }
    }

    if (!state.openStack.length) lockScroll(false);
  }

  function openRoot(id, root, panel) {
    if (!root) return;
    if (!isRootOpen(root)) setOpenAttrs(root, true);
    pushOpen(id, root, panel);
  }

  function closeRoot(id, root) {
    if (!root) return;
    if (isRootOpen(root) || state.openMap[id]) setOpenAttrs(root, false);
    popOpen(id);
  }

  function closeById(id) {
    if (id === "checkout") closeCheckout(true);
    else if (id === "drawer") closeDrawer(true);
    else if (id === "sponsor-interest") closeSponsor(true);
    else if (id === "press-video") closeVideo(true);
    else if (id === "terms") closeLegal("terms");
    else if (id === "privacy") closeLegal("privacy");
  }

  function setHash(hash) {
    if (typeof hash !== "string") return;
    if (hash && hash.charAt(0) !== "#") hash = "#" + hash;

    var cur = window.location.hash || "";
    var next = hash || "#home";

    if (cur === next) {
      onHashChange();
      return;
    }

    try {
      history.pushState(null, "", next);
    } catch (e) {
      window.location.hash = next;
      return;
    }
    onHashChange();
  }

  function currentHashId() {
    var h = window.location.hash || "";
    if (!h || h === "#") return "";
    return h.replace("#", "").trim();
  }

  function openCheckout() {
    setHash("checkout");
  }
  function closeCheckout(useHome) {
    setHash(useHome ? "home" : "");
  }
  function openDrawer() {
    setHash("drawer");
  }
  function closeDrawer(useHome) {
    setHash(useHome ? "home" : "");
  }
  function openSponsor() {
    setHash("sponsor-interest");
  }
  function closeSponsor(useHome) {
    setHash(useHome ? "home" : "");
  }
  function openVideo() {
    setHash("press-video");
  }
  function closeVideo(useHome) {
    setHash(useHome ? "home" : "");
  }
  function closeLegal(which) {
    setHash("home");
  }

  function onHashChange() {
    var id = currentHashId();

    if (checkoutSheet) {
      if (id === "checkout") openRoot("checkout", checkoutSheet, checkoutPanel);
      else closeRoot("checkout", checkoutSheet);
    }

    if (drawer) {
      if (id === "drawer") openRoot("drawer", drawer, drawerPanel);
      else closeRoot("drawer", drawer);
    }

    if (sponsorModal) {
      if (id === "sponsor-interest") openRoot("sponsor-interest", sponsorModal, sponsorPanel);
      else closeRoot("sponsor-interest", sponsorModal);
    }

    if (videoModal) {
      if (id === "press-video") openRoot("press-video", videoModal, videoPanel);
      else closeRoot("press-video", videoModal);
    }

    var terms = qs("#terms");
    var privacy = qs("#privacy");
    if (terms) {
      if (id === "terms") openRoot("terms", terms, qs(".ff-modal__panel", terms) || terms);
      else closeRoot("terms", terms);
    }
    if (privacy) {
      if (id === "privacy") openRoot("privacy", privacy, qs(".ff-modal__panel", privacy) || privacy);
      else closeRoot("privacy", privacy);
    }
  }

  window.addEventListener("hashchange", onHashChange);

  // Global ESC closes top overlay even if focus is outside panel
  window.addEventListener("keydown", function (e) {
    var key = e.key || e.keyCode;
    if (key !== "Escape" && key !== "Esc" && key !== 27) return;
    if (!state.openStack || !state.openStack.length) return;
    var top = state.openStack[state.openStack.length - 1];
    if (top && top.id) closeById(top.id);
  });

  /* -----------------------------
     Backdrop click-to-close (contract-safe, no new hooks required)
  ----------------------------- */

  function initBackdropClose() {
    document.addEventListener("click", function (e) {
      var t = e.target;

      if (t && t.classList && t.classList.contains("ff-sheet__backdrop")) {
        e.preventDefault();
        closeCheckout(true);
        return;
      }

      if (t && t.classList && t.classList.contains("ff-modal__backdrop")) {
        e.preventDefault();
        var id = currentHashId();
        if (id === "sponsor-interest") closeSponsor(true);
        else if (id === "press-video") closeVideo(true);
        else if (id === "terms") closeLegal("terms");
        else if (id === "privacy") closeLegal("privacy");
        return;
      }

      if (t && t.classList && t.classList.contains("ff-drawer__backdrop")) {
        e.preventDefault();
        closeDrawer(true);
      }
    });
  }

  /* -----------------------------
     Payments: Stripe / PayPal
  ----------------------------- */

  function setMountState(kind, msg, mountEl, msgEl) {
    if (mountEl) {
      mountEl.setAttribute("data-state", String(kind || ""));
      if (msg != null) mountEl.setAttribute("data-msg", String(msg || ""));
    }
    if (msgEl && msg != null) msgEl.textContent = String(msg || "");
  }

  function showStripeError(msg) {
    if (!stripeErr) return;
    stripeErr.textContent = String(msg || "Card payment error.");
    setHidden(stripeErr, false);
  }
  function hideStripeError() {
    if (stripeErr) setHidden(stripeErr, true);
  }

  function showPayPalError(msg) {
    if (!paypalErr) return;
    paypalErr.textContent = String(msg || "PayPal error.");
    setHidden(paypalErr, false);
  }
  function hidePayPalError() {
    if (paypalErr) setHidden(paypalErr, true);
  }

  function loadScriptOnce(src, id) {
    return new Promise(function (resolve, reject) {
      if (!src) return reject(new Error("Missing script src"));

      // Prefer id reuse
      if (id) {
        var byId = qs("script#" + id);
        if (byId) return resolve(byId);
      }

      // Also reuse same src if already present
      var existing = qsa("script[src]");
      for (var i = 0; i < existing.length; i++) {
        var s0 = existing[i];
        try {
          if (String(s0.getAttribute("src") || "") === String(src)) return resolve(s0);
        } catch (e0) {}
      }

      var s = document.createElement("script");
      if (id) s.id = id;
      s.src = src;
      s.async = true;
      s.defer = true;

      if (state.cspNonce) {
        try {
          s.setAttribute("nonce", state.cspNonce);
        } catch (e) {}
      }

      s.onload = function () {
        resolve(s);
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function getThemeForPayments() {
    var t = rootEl.getAttribute("data-theme");
    if (t === "light") return "stripe";
    if (t === "dark") return "night";
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "night";
    } catch (e) {}
    return "stripe";
  }

  function getCurrency() {
    var c = cfg && cfg.fundraiser && cfg.fundraiser.currency ? String(cfg.fundraiser.currency || "USD") : "USD";
    return (c || "USD").toUpperCase();
  }

  function ensureStripeLoaded() {
    if (!state.stripe.pk) return Promise.reject(new Error("Stripe is not configured."));
    if (state.stripe.stripe) return Promise.resolve(state.stripe.stripe);
    if (state.stripe.loadPromise) return state.stripe.loadPromise;

    state.stripe.loadPromise = loadScriptOnce(state.stripe.jsUrl, "ff-stripe-js").then(function () {
      if (!window.Stripe) throw new Error("Stripe.js did not initialize.");
      state.stripe.stripe = window.Stripe(state.stripe.pk);
      return state.stripe.stripe;
    });

    return state.stripe.loadPromise;
  }

  function extractClientSecret(d) {
    if (!d) return "";
    if (typeof d === "string") return d;
    var cs =
      d.clientSecret ||
      d.client_secret ||
      (d.data && (d.data.clientSecret || d.data.client_secret)) ||
      (d.intent && (d.intent.clientSecret || d.intent.client_secret)) ||
      (d.payment_intent && (d.payment_intent.clientSecret || d.payment_intent.client_secret)) ||
      "";
    return cs ? String(cs) : "";
  }

  function createStripeIntent(amount) {
    var a = Number(amount || 0);
    if (!isFinite(a) || a <= 0) return Promise.reject(new Error("Enter an amount to continue."));
    var payload = { amount: a, currency: getCurrency() };
    return fetchJSON(state.stripe.intentEndpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    }).then(function (d) {
      var cs = extractClientSecret(d);
      if (!cs) throw new Error("Stripe intent did not return a client secret.");
      return { clientSecret: cs };
    });
  }

  function unmountStripeSafe() {
    try {
      if (state.stripe.paymentEl && state.stripe.paymentEl.unmount) state.stripe.paymentEl.unmount();
    } catch (e) {}
    state.stripe.paymentEl = null;
    state.stripe.elements = null;
    state.stripe.mounted = false;
    state.stripe.clientSecret = "";
    state.stripe.intentAmount = 0;
  }

  var stripePrepTimer = null;
  function debounceStripePrep() {
    if (stripePrepTimer) clearTimeout(stripePrepTimer);
    stripePrepTimer = setTimeout(function () {
      prepareStripe();
    }, 140);
  }

  function prepareStripe() {
    if (state.stripe.preparing) return;
    if (!paymentMount) return;

    // PERF P0: do nothing unless checkout is open
    if (currentHashId() !== "checkout") return;

    var amount = Number(state.stripe.amount || 0);

    if (!state.stripe.pk) {
      setMountState("idle", "Stripe is not configured yet.", paymentMount, stripeMsg);
      return;
    }

    if (!amount || amount <= 0) {
      setMountState("idle", "Enter an amount to load card payment.", paymentMount, stripeMsg);
      if (stripeSkeleton) setHidden(stripeSkeleton, true);
      hideStripeError();
      if (state.stripe.mounted) unmountStripeSafe();
      return;
    }

    if (state.stripe.mounted && state.stripe.intentAmount === amount && state.stripe.clientSecret) return;

    state.stripe.preparing = true;
    hideStripeError();
    if (stripeSkeleton) setHidden(stripeSkeleton, false);
    setMountState("loading", "Loading card payment…", paymentMount, stripeMsg);

    if (state.stripe.mounted) unmountStripeSafe();

    var mountTarget = ensureInnerWrapper(paymentMount, "stripe");
    if (!mountTarget) {
      state.stripe.preparing = false;
      return;
    }

    var p = ensureStripeLoaded()
      .then(function (stripe) {
        return createStripeIntent(amount).then(function (r) {
          state.stripe.clientSecret = r.clientSecret;
          state.stripe.intentAmount = amount;

          state.stripe.elements = stripe.elements({
            clientSecret: state.stripe.clientSecret,
            appearance: { theme: getThemeForPayments() }
          });

          state.stripe.paymentEl = state.stripe.elements.create("payment");
          state.stripe.paymentEl.mount(mountTarget);

          state.stripe.mounted = true;

          setMountState("ready", "", paymentMount, stripeMsg);
          if (stripeSkeleton) setHidden(stripeSkeleton, true);
        });
      })
      .catch(function (e) {
        showStripeError(e && e.message ? e.message : "Unable to load Stripe.");
        setMountState("error", "", paymentMount, stripeMsg);
        if (stripeSkeleton) setHidden(stripeSkeleton, true);
        markError();
      });

    return promiseFinally(p, function () {
      state.stripe.preparing = false;
    });
  }

  function disableEl(el, on) {
    if (!el) return;
    try {
      el.disabled = !!on;
    } catch (e) {}
    if (on) el.setAttribute("aria-disabled", "true");
    else el.removeAttribute("aria-disabled");
  }

  function findStripeSubmitButtons() {
    // Hook-safe: supports multiple possible existing hooks without requiring markup changes.
    var btns = []
      .concat(qsa("[data-ff-stripe-submit]"))
      .concat(qsa("[data-ff-pay-card]"))
      .concat(qsa('button[name="stripeSubmit"]'))
      .concat(qsa('button[type="submit"][data-ff-stripe="true"]'));

    // Real de-dupe by identity
    var out = [];
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var seen = false;
      for (var j = 0; j < out.length; j++) {
        if (out[j] === b) {
          seen = true;
          break;
        }
      }
      if (!seen && b) out.push(b);
    }
    return out;
  }

  function getStripeReturnUrl() {
    var base = state.stripe.returnUrl || stripHash(window.location.href);
    return stripHash(base);
  }

  function startStripeConfirm() {
    if (!state.stripe.pk) {
      showStripeError("Stripe is not configured.");
      return Promise.reject(new Error("Stripe not configured"));
    }
    if (!state.stripe.mounted || !state.stripe.elements || !state.stripe.stripe) {
      return prepareStripe() && Promise.resolve().then(function () {
        if (!state.stripe.mounted) throw new Error("Enter an amount to continue.");
      });
    }

    if (state.stripe.submitting) return Promise.resolve(false);
    state.stripe.submitting = true;

    hideStripeError();

    var submitBtns = findStripeSubmitButtons();
    submitBtns.forEach(function (b) {
      disableEl(b, true);
    });

    setMountState("processing", "Processing…", paymentMount, stripeMsg);

    var p = state.stripe.stripe
      .confirmPayment({
        elements: state.stripe.elements,
        confirmParams: { return_url: getStripeReturnUrl() },
        redirect: "if_required"
      })
      .then(function (res) {
        if (res && res.error) throw res.error;

        burstOnce();
        toast("success", "Thank you! Your card donation is confirmed.");
        closeCheckout(true);
        return true;
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "Card payment failed.";
        showStripeError(msg);
        setMountState("error", "", paymentMount, stripeMsg);
        markError();
        return false;
      });

    return promiseFinally(p, function () {
      state.stripe.submitting = false;
      submitBtns.forEach(function (b) {
        disableEl(b, false);
      });
    });
  }

  function loadPayPalOnce() {
    if (!state.paypal.clientId) return Promise.reject(new Error("PayPal is not configured."));
    if (state.paypal.loaded) return Promise.resolve(true);
    if (state.paypal.loadPromise) return state.paypal.loadPromise;

    var src = state.paypal.jsUrl;
    if (src.indexOf("?") === -1) src += "?client-id=" + encodeURIComponent(state.paypal.clientId);
    else if (src.indexOf("client-id=") === -1) src += "&client-id=" + encodeURIComponent(state.paypal.clientId);

    state.paypal.loadPromise = loadScriptOnce(src, "ff-paypal-js")
      .then(function () {
        state.paypal.loaded = true;
        return true;
      })
      .catch(function (e) {
        showPayPalError(e && e.message ? e.message : "Unable to load PayPal.");
        markError();
        throw e;
      });

    return state.paypal.loadPromise;
  }

  var paypalRenderTimer = null;
  function debouncePayPalRender() {
    if (paypalRenderTimer) clearTimeout(paypalRenderTimer);
    paypalRenderTimer = setTimeout(function () {
      renderPayPalButtons();
    }, 180);
  }

  function renderPayPalButtons() {
    if (!paypalMount) return;

    // PERF P0: do nothing unless checkout is open
    if (currentHashId() !== "checkout") return;

    var amount = Number(state.stripe.amount || 0);

    if (!state.paypal.clientId) {
      setMountState("idle", "PayPal is not configured.", paypalMount, paypalMsg);
      if (paypalSkeleton) setHidden(paypalSkeleton, true);
      return;
    }

    if (!amount || amount <= 0) {
      setMountState("idle", "Enter an amount to load PayPal.", paypalMount, paypalMsg);
      if (paypalSkeleton) setHidden(paypalSkeleton, true);
      hidePayPalError();
      return;
    }

    if (state.paypal.rendered) {
      setMountState("ready", "", paypalMount, paypalMsg);
      if (paypalSkeleton) setHidden(paypalSkeleton, true);
      return;
    }

    hidePayPalError();
    if (paypalSkeleton) setHidden(paypalSkeleton, false);
    setMountState("loading", "Loading PayPal…", paypalMount, paypalMsg);

    var ppTarget = ensureInnerWrapper(paypalMount, "paypal");
    if (!ppTarget) {
      if (paypalSkeleton) setHidden(paypalSkeleton, true);
      return;
    }

    return loadPayPalOnce()
      .then(function () {
        if (!window.paypal || !window.paypal.Buttons) throw new Error("PayPal SDK did not initialize.");

        if (ppTarget.childNodes && ppTarget.childNodes.length > 0) {
          state.paypal.rendered = true;
          if (paypalSkeleton) setHidden(paypalSkeleton, true);
          setMountState("ready", "", paypalMount, paypalMsg);
          return;
        }

        window.paypal
          .Buttons({
            style: { layout: "vertical", label: "paypal" },
            createOrder: function () {
              var payload = { amount: Number(state.stripe.amount || 0) };
              return fetchJSON(state.paypal.createEndpoint, {
                method: "POST",
                body: JSON.stringify(payload)
              }).then(function (d) {
                var id = d && (d.id || d.orderID || d.order_id);
                if (!id) throw new Error("PayPal create did not return an order id.");
                return id;
              });
            },
            onApprove: function (data) {
              return fetchJSON(state.paypal.captureEndpoint, {
                method: "POST",
                body: JSON.stringify({ orderID: data && data.orderID })
              }).then(function () {
                burstOnce();
                toast("success", "Thank you! Your PayPal donation is confirmed.");
                closeCheckout(true);
              });
            },
            onError: function (err) {
              showPayPalError(err && err.message ? err.message : "PayPal error.");
            }
          })
          .render(ppTarget);

        state.paypal.rendered = true;
        if (paypalSkeleton) setHidden(paypalSkeleton, true);
        setMountState("ready", "", paypalMount, paypalMsg);
      })
      .catch(function (e) {
        showPayPalError(e && e.message ? e.message : "Unable to render PayPal.");
        if (paypalSkeleton) setHidden(paypalSkeleton, true);
        setMountState("error", "", paypalMount, paypalMsg);
      });
  }

  /* -----------------------------
     Amount handling (chips + input)
  ----------------------------- */

  function parseAmount(v) {
    var s = String(v == null ? "" : v);
    s = s.replace(/[^0-9.]/g, "");
    if (!s) return 0;
    var n = Number(s);
    if (!isFinite(n) || n < 0) return 0;
    n = clamp(n, 0, 100000);
    n = Math.round(n * 100) / 100;
    return n;
  }

  function syncAmountToUI(amount) {
    if (amountInput) {
      if (document.activeElement !== amountInput) amountInput.value = amount ? String(amount) : "";
    }

    var chips = qsa("[data-ff-amount]");
    chips.forEach(function (btn) {
      var v = parseAmount(btn.getAttribute("data-ff-amount") || 0);
      var sel = v > 0 && amount > 0 && v === amount;
      if (sel) {
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
      } else {
        btn.classList.remove("is-selected");
        btn.setAttribute("aria-pressed", "false");
      }
    });
  }

  function setAmount(next) {
    var v = parseAmount(next);
    state.stripe.amount = v;
    syncAmountToUI(v);
  }

  function handleAmountChangedWhileCheckoutOpen() {
    if (currentHashId() !== "checkout") return;
    debounceStripePrep();
    debouncePayPalRender();
  }

  function handleAmountClick(btn) {
    var v = parseAmount(btn.getAttribute("data-ff-amount") || 0);
    setAmount(v);
    handleAmountChangedWhileCheckoutOpen();
  }

  function initAmountInput() {
    if (!amountInput) return;

    setAmount(amountInput.value);

    amountInput.addEventListener("input", function () {
      setAmount(amountInput.value);
      handleAmountChangedWhileCheckoutOpen();
    });
    amountInput.addEventListener("blur", function () {
      setAmount(amountInput.value);
      handleAmountChangedWhileCheckoutOpen();
    });
  }

  /* -----------------------------
     Click delegation for hooks
  ----------------------------- */

  function handleOpenCheckout() {
    openCheckout();
    // Prep happens after hashchange opens overlay
    setTimeout(function () {
      handleAmountChangedWhileCheckoutOpen();
    }, 0);
  }

  function handleCloseAttr(el) {
    if (!el) return;
    if (el.hasAttribute("data-ff-close-checkout")) closeCheckout(true);
    else if (el.hasAttribute("data-ff-close-drawer")) closeDrawer(true);
    else if (el.hasAttribute("data-ff-close-sponsor")) closeSponsor(true);
    else if (el.hasAttribute("data-ff-close-video")) closeVideo(true);
  }

  function doShare() {
    var url = window.location.href;
    var title = document.title || "FutureFunded";
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url);
          toast("success", "Link copied.");
        } else {
          toast("info", url);
        }
      } catch (e) {
        toast("info", url);
      }
    }
  }

  function initEvents() {
    document.addEventListener("click", function (e) {
      var t = e.target;

      function closestAttr(node, attr) {
        while (node && node !== document.documentElement) {
          if (node.getAttribute && node.hasAttribute(attr)) return node;
          node = node.parentNode;
        }
        return null;
      }

      var amt = closestAttr(t, "data-ff-amount");
      if (amt) {
        e.preventDefault();
        handleAmountClick(amt);
        return;
      }

      var oc = closestAttr(t, "data-ff-open-checkout");
      if (oc) {
        e.preventDefault();
        handleOpenCheckout();
        return;
      }

      var cc =
        closestAttr(t, "data-ff-close-checkout") ||
        closestAttr(t, "data-ff-close-drawer") ||
        closestAttr(t, "data-ff-close-sponsor") ||
        closestAttr(t, "data-ff-close-video");
      if (cc) {
        e.preventDefault();
        handleCloseAttr(cc);
        return;
      }

      var od = closestAttr(t, "data-ff-open-drawer");
      if (od) {
        e.preventDefault();
        openDrawer();
        return;
      }

      var os = closestAttr(t, "data-ff-open-sponsor");
      if (os) {
        e.preventDefault();
        openSponsor();
        return;
      }

      var ov = closestAttr(t, "data-ff-open-video");
      if (ov) {
        e.preventDefault();
        openVideo();
        return;
      }

      var sh = closestAttr(t, "data-ff-share");
      if (sh) {
        e.preventDefault();
        doShare();
        return;
      }

      var ss = closestAttr(t, "data-ff-stripe-submit") || closestAttr(t, "data-ff-pay-card");
      if (ss) {
        e.preventDefault();
        startStripeConfirm().catch(function () {});
        return;
      }
    });

    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!form || !form.querySelector) return;

      var explicit =
        form.hasAttribute("data-ff-stripe-form") || form.getAttribute("data-ff-payments") === "stripe";
      var containsMount = !!(paymentMount && form.contains(paymentMount));

      if (!explicit && !containsMount) return;

      e.preventDefault();
      startStripeConfirm().catch(function () {});
    });
  }

  /* -----------------------------
     Theme toggle
  ----------------------------- */

  function getStoredTheme() {
    try {
      return localStorage.getItem("ff:theme") || "";
    } catch (e) {
      return "";
    }
  }
  function setStoredTheme(v) {
    try {
      localStorage.setItem("ff:theme", v);
    } catch (e) {}
  }

  function applyTheme(next) {
    var theme = next === "dark" || next === "light" ? next : "";
    if (!theme) return;
    rootEl.setAttribute("data-theme", theme);
    setStoredTheme(theme);

    try {
      var ev = new CustomEvent("ff:theme", { detail: { theme: theme } });
      window.dispatchEvent(ev);
    } catch (e) {}
  }

  function initTheme() {
    var stored = getStoredTheme();
    if (stored) applyTheme(stored);
    qsa("[data-ff-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var cur = rootEl.getAttribute("data-theme") || "dark";
        applyTheme(cur === "dark" ? "light" : "dark");
      });
    });
  }

  /* -----------------------------
     Sticky donate (mobile): show after hero scroll
  ----------------------------- */

  function initStickyDonate() {
    var sticky = qs("[data-ff-sticky-donate]");
    if (!sticky) return;

    var hero = qs("#home") || qs('[data-ff-section="hero"]');
    var shown = false;

    function setShown(next) {
      var v = !!next;
      if (v === shown) return;
      shown = v;
      sticky.hidden = !shown;
      sticky.setAttribute("aria-hidden", shown ? "false" : "true");
    }

    function shouldHideForOverlay() {
      return !!(state.openStack && state.openStack.length);
    }

    function updateFromHero(isHeroVisible) {
      setShown(!isHeroVisible && !shouldHideForOverlay());
    }

    if (hero && "IntersectionObserver" in window) {
      try {
        var io = new IntersectionObserver(
          function (entries) {
            var entry = entries && entries[0];
            var isVisible = !!(entry && entry.isIntersecting);
            updateFromHero(isVisible);
          },
          { root: null, threshold: 0.12 }
        );
        io.observe(hero);
      } catch (e) {}
    }

    if (!("IntersectionObserver" in window) || !hero) {
      var last = 0;
      window.addEventListener(
        "scroll",
        function () {
          var y = window.scrollY || window.pageYOffset || 0;
          if (Math.abs(y - last) < 40) return;
          last = y;
          updateFromHero(y < 220);
        },
        { passive: true }
      );
      updateFromHero((window.scrollY || 0) < 220);
    }

    window.addEventListener("hashchange", function () {
      raf().then(function () {
        if (shouldHideForOverlay()) setShown(false);
      });
    });
  }

  /* ---------------------------------------------
     A11Y hotfix: KPI <dl> must contain only dt/dd
  --------------------------------------------- */
  function ffFixHeroKpiDl() {
    try {
      var dl = document.querySelector("dl.ff-hero__kpis");
      if (!dl) return;

      var notes = dl.querySelectorAll(".ff-kpiCard > p");
      if (!notes || !notes.length) return;

      for (var i = 0; i < notes.length; i++) {
        var p = notes[i];
        if (!p || !p.parentElement) continue;

        var card = p.parentElement;
        var dd = card.querySelector("dd");
        if (!dd) continue;

        var span = document.createElement("span");
        span.className = p.className || "";
        span.textContent = (p.textContent || "").trim();

        dd.appendChild(span);
        p.remove();
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ffFixHeroKpiDl, { once: true });
  } else {
    ffFixHeroKpiDl();
  }

  /* -----------------------------
     Recent donations ticker (real-only; hidden until data arrives)
  ----------------------------- */

  function normalizeRecentPayload(payload) {
    if (!payload) return { items: [], supportersWeek: null };
    if (Array.isArray(payload)) return { items: payload, supportersWeek: null };
    var items = payload.items || payload.donations || payload.recent || payload.results || [];
    var supportersWeek =
      payload.supportersWeek != null
        ? payload.supportersWeek
        : payload.weekSupporters != null
        ? payload.weekSupporters
        : payload.supporters_this_week != null
        ? payload.supporters_this_week
        : null;
    return { items: Array.isArray(items) ? items : [], supportersWeek: supportersWeek };
  }

  function fmtMoney(val, isCents) {
    var n = Number(val);
    if (!isFinite(n) || n <= 0) return "";
    if (isCents) n = Math.round(n) / 100;
    try {
      return n.toLocaleString(undefined, {
        style: "currency",
        currency: getCurrency(),
        maximumFractionDigits: n % 1 === 0 ? 0 : 2
      });
    } catch (e) {
      return "$" + Math.round(n);
    }
  }

    function initTicker() {
      var wrap = qs("[data-ff-ticker]") || qs("[data-ff-donor-ticker]");
      if (!wrap) return;

      var placeholder = qs("[data-ff-ticker-placeholder]", wrap) || qs("p", wrap);
      if (placeholder && !placeholder.hasAttribute("data-ff-ticker-placeholder")) {
        placeholder.setAttribute("data-ff-ticker-placeholder", "");
      }

      var track = qs("[data-ff-ticker-track]", wrap) || qs("[data-ff-ticker-track]");
      if (!track) {
        track = document.createElement("div");
        track.className = "ff-ticker__track";
        track.setAttribute("data-ff-ticker-track", "");
        track.setAttribute("role", "list");
        track.setAttribute("aria-label", "Recent supporters");
        wrap.appendChild(track);
      } else if (!track.classList.contains("ff-ticker__track")) {
        track.classList.add("ff-ticker__track");
      }

      function clearTrack() {
        while (track.firstChild) track.removeChild(track.firstChild);
      }

      function setPlaceholderVisible(on) {
        if (!placeholder) return;
        if (on) placeholder.removeAttribute("hidden");
        else placeholder.setAttribute("hidden", "");
      }

      function render(items) {
        clearTrack();

        var max = 8;
        var count = 0;

        for (var i = 0; i < items.length; i++) {
          if (count >= max) break;

          var it = items[i];
          if (it && (it.verified === false || it.is_verified === false)) continue;

          var amt = "";
          if (it && it.amount_cents != null) amt = fmtMoney(it.amount_cents, true);
          else if (it && it.amount != null) amt = fmtMoney(it.amount, false);
          if (!amt) continue;

          var team = "";
          if (it && it.team) team = String(it.team || "").trim();
          if (it && it.team_name) team = String(it.team_name || "").trim();

          var when = "";
          if (it && it.when) when = String(it.when || "").trim();
          if (!when && it && it.minutes_ago != null) {
            var m = Number(it.minutes_ago);
            if (isFinite(m) && m >= 0) when = m < 2 ? "just now" : Math.round(m) + " min ago";
          }
          if (!when && it && it.created_at) when = "recent";

          var itemEl = document.createElement("div");
          itemEl.className = "ff-ticker__item";
          itemEl.setAttribute("role", "listitem");

          var amtEl = document.createElement("span");
          amtEl.className = "ff-ticker__amt ff-num";
          amtEl.textContent = amt;

          var metaEl = document.createElement("span");
          metaEl.className = "ff-ticker__meta";
          metaEl.textContent = (team ? "to " + team : "new supporter") + (when ? " • " + when : "");

          itemEl.appendChild(amtEl);
          itemEl.appendChild(metaEl);
          track.appendChild(itemEl);

          count += 1;
        }

        setPlaceholderVisible(count === 0);

        if (count > 0) {
          wrap.setAttribute("data-ff-ticker-live", "true");
          wrap.setAttribute("aria-hidden", "false");
        }
      }

      function getRecentEndpoint() {
        var ep = "";
        if (cfg && cfg.stats && cfg.stats.recentDonationsEndpoint) ep = String(cfg.stats.recentDonationsEndpoint || "").trim();
        if (!ep) ep = getMeta("ff-recent-donations-endpoint") || getMeta("ff:recent-donations-endpoint") || getMeta("recent-donations-endpoint") || "";
        return String(ep || "").trim();
      }

      function startDemoTicker() {
        var teams = cfg && cfg.teams && Array.isArray(cfg.teams) ? cfg.teams : [];
        var names = [];
        for (var i = 0; i < teams.length; i++) {
          var nm = teams[i] && teams[i].name ? String(teams[i].name || "").trim() : "";
          if (nm) names.push(nm);
        }
        if (!names.length) names = ["the team"];

        function anon() {
          var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          return letters.charAt(Math.floor(Math.random() * letters.length)) + ".";
        }

        var amounts = [25, 35, 50, 75, 100, 150, 250, 500];
        var buffer = [];

        function pushOne(minAgo) {
          buffer.unshift({
            amount: amounts[Math.floor(Math.random() * amounts.length)],
            team_name: names[Math.floor(Math.random() * names.length)],
            minutes_ago: minAgo,
            name: anon()
          });
          if (buffer.length > 6) buffer.length = 6;
          render(buffer);
        }

        pushOne(12);
        pushOne(4);

        var t0 = nowMs();
        setInterval(function () {
          var mins = Math.max(0, Math.round((nowMs() - t0) / 60000));
          pushOne(Math.max(1, 1 + (mins % 12)));
        }, 18000);
      }

      var ep = getRecentEndpoint();
      if (!ep) {
        // Demo fallback: only when not production+live (keeps prod clean)
        var isLive = cfg && String(cfg.dataMode || "").toLowerCase() === "live";
        var isProd = cfg && String(cfg.env || "").toLowerCase() === "production";
        if (!isLive || !isProd) startDemoTicker();
        return;
      }

      fetchJSON(ep, { method: "GET" })
        .then(function (data) {
          var norm = normalizeRecentPayload(data);
          render(norm.items);
        })
        .catch(function () {});
    }


  /* -----------------------------
     Init
  ----------------------------- */

  function initMountWrappers() {
    if (paymentMount) ensureInnerWrapper(paymentMount, "stripe");
    if (paypalMount) ensureInnerWrapper(paypalMount, "paypal");
  }

  function initPaymentsHints() {
    if (paymentMount) {
      setMountState("", state.stripe.pk ? "Enter an amount to load card payment." : "Stripe is not configured yet.", paymentMount, stripeMsg);
    }
    if (paypalMount) {
      setMountState("", state.paypal.clientId ? "Enter an amount to load PayPal." : "PayPal is not configured yet.", paypalMount, paypalMsg);
    }
  }

  function init() {
    markLoading(true);

    initMountWrappers();

    onHashChange();

    initTheme();
    initEvents();
    initBackdropClose();
    initAmountInput();
    initTicker();
    initStickyDonate();
    initPaymentsHints();

    // If direct-linked to checkout
    if (currentHashId() === "checkout") {
      handleAmountChangedWhileCheckoutOpen();
    }

    markLoading(false);
    markReady();
  }

  // Minimal public surface (safe)
  try {
    window.FutureFunded = window.FutureFunded || {};
    window.FutureFunded.app = window.FutureFunded.app || {};
    window.FutureFunded.app.version = APP_VERSION;
    window.FutureFunded.app.openCheckout = openCheckout;
    window.FutureFunded.app.closeCheckout = closeCheckout;
    window.FutureFunded.app.openDrawer = openDrawer;
    window.FutureFunded.app.closeDrawer = closeDrawer;
  } catch (e) {}

  ready(function () {
    try {
      init();
    } catch (e) {
      toast("error", "App failed to start.");
      try {
        console.error("[ff-app] init error", e);
      } catch (e2) {}
    }
  });
})();
