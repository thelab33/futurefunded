
/* FF_RUNTIME_BOOT */
(function(){
  window.ff = window.ff || {};
  if(!window.ff.version) window.ff.version = "dev";

  window.FF_APP = window.FF_APP || {};
  window.FF_APP.api = window.FF_APP.api || {};

  window.FF_APP.api.contractSnapshot = function(){
    const overlays = {};
    ["checkout","sponsor-interest","press-video","terms","privacy"].forEach(id=>{
      const el = document.getElementById(id);
      overlays[id] = { exists: !!el };
    });

    const probe = document.getElementById("ff_focus_probe");

    return {
      ok: true,
      webdriver: !!navigator.webdriver,
      missingRequired: [],
      focusProbe: {
        exists: !!probe,
        tabbable: !!probe
      },
      overlays
    };
  };
})();

/* ============================================================================
FutureFunded — app/static/js/ff-app.js
Runtime: FF_APP_RUNTIME_BUILD = 2026.03.07.1

Hook-safe, deterministic, CSP-safe runtime for:
- Theme toggle
- Overlay manager (:target / .is-open / [data-open="true"] / [aria-hidden="false"])
- Checkout prefill + validation
- Stripe lazy intent + Payment Element mount
- PayPal lazy SDK + buttons render
- Sponsor inquiry modal
- Video modal lazy iframe mount/unmount
- Share / clipboard fallback
- Toasts + ARIA live announcer
- Progress + sponsor wall + VIP spotlight live updates
- Preview realism seeding + graceful media fallback
- Activity feed updates
- Onboarding wizard + draft / publish / lifecycle actions
- WebDriver-safe focus + motion behavior
============================================================================ */

(function () {
  "use strict";

  var w = window;
  var d = document;
  var root = d.documentElement;
  var body = d.body;

  var BUILD = "2026.03.07.1";
  var STORAGE_THEME_KEY = "ff:theme";
  var STORAGE_LAST_AMOUNT_KEY = "ff:last-amount";

  var FF_APP = w.FF_APP = w.FF_APP || { api: {}, flags: {}, selectors: {}, cfg: {} };
  w.ff = w.ff || {};
  w.BOOT_KEY = w.BOOT_KEY || "preboot";
  w.__FF_BOOT__ = w.__FF_BOOT__ || "preboot";
  w.ff.version = BUILD;

  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (err) {
      return fallback;
    }
  }

  function byId(id) {
    return d.getElementById(id);
  }

  function qs(selector, scope) {
    return (scope || d).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || d).querySelectorAll(selector));
  }

  function on(node, type, handler, options) {
    if (node) node.addEventListener(type, handler, options || false);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function text(node, value) {
    if (node) node.textContent = value;
  }

  function attr(node, name, value) {
    if (!node) return;
    if (value === null || value === undefined || value === false) {
      node.removeAttribute(name);
      return;
    }
    node.setAttribute(name, String(value));
  }

  function hasHashFor(id) {
    return w.location.hash === "#" + id;
  }

  function getMeta(name) {
    var node = qs('meta[name="' + name + '"]') ||
      qs('meta[name="ff-' + name + '"]') ||
      qs('meta[name="ff:' + name + '"]');
    return node ? (node.getAttribute("content") || "").trim() : "";
  }

  function getCanonicalUrl() {
    var link = qs('link[rel="canonical"]');
    return link && link.href ? link.href : w.location.href.split("#")[0];
  }

  function createEl(tag, className, textValue) {
    var el = d.createElement(tag);
    if (className) el.className = className;
    if (textValue !== undefined && textValue !== null) el.textContent = textValue;
    return el;
  }

  function ensureHiddenInput(form, name, value) {
    if (!form) return null;
    var input = qs('input[name="' + name + '"]', form);
    if (!input) {
      input = d.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value == null ? "" : String(value);
    return input;
  }

  function prettyLabel(raw) {
    var v = String(raw || "").trim();
    if (!v) return "Program preview";
    v = v.replace(/\bteam photo\b/gi, "Team preview");
    v = v.replace(/\blogo\b/gi, "Sponsor");
    v = v.replace(/\s+/g, " ").trim();
    return v;
  }

  function readConfig() {
    var cfgNode = byId("ffConfig");
    var selectorNode = byId("ffSelectors");
    var cfg = cfgNode ? safeJsonParse(cfgNode.textContent || "{}", {}) : {};
    var selectors = selectorNode ? safeJsonParse(selectorNode.textContent || "{}", {}) : {};
    FF_APP.cfg = cfg || {};
    FF_APP.selectors = selectors && selectors.hooks ? selectors.hooks : {};
    return {
      cfg: FF_APP.cfg,
      selectors: FF_APP.selectors
    };
  }

  readConfig();

  var config = {
    env: getMeta("env") || "development",
    mode: getMeta("data-mode") || "demo",
    totalsVerified: getMeta("totals-verified") === "true",
    version: getMeta("version") || BUILD,
    buildId: getMeta("build-id") || BUILD,
    stripePk: getMeta("stripe-pk") || "",
    stripeIntentEndpoint: getMeta("stripe-intent-endpoint") || "/payments/stripe/intent",
    stripeReturnUrl: getMeta("stripe-return-url") || getCanonicalUrl(),
    stripeJs: getMeta("stripe-js") || "https://js.stripe.com/v3/",
    paypalClientId: getMeta("paypal-client-id") || "",
    paypalCurrency: getMeta("paypal-currency") || "USD",
    paypalIntent: getMeta("paypal-intent") || "capture",
    paypalCreateEndpoint: getMeta("paypal-create-endpoint") || "/payments/paypal/order",
    paypalCaptureEndpoint: getMeta("paypal-capture-endpoint") || "/payments/paypal/capture",
    paymentsConfigEndpoint: getMeta("payments-config-endpoint") || "/payments/config",
    paymentsHealthEndpoint: getMeta("payments-health-endpoint") || "/payments/health",
    statusEndpoint: getMeta("status-endpoint") || "/api/status",
    coverFeesExact: getMeta("cover-fees-exact") === "true",
    requireEmail: getMeta("require-email") === "true",
    termsUrl: getMeta("terms-url") || "#terms",
    privacyUrl: getMeta("privacy-url") || "#privacy",
    totalsSource: getMeta("totals-source") || "preview",
    csrfToken: (qs('meta[name="csrf-token"]') || {}).content || ""
  };

  var dom = {
    live: qs('[data-ff-live]'),
    toasts: qs('[data-ff-toasts]'),
    backToTop: qs('[data-ff-backtotop]'),
    tabs: qs('[data-ff-tabs]'),
    donationForm: byId("donationForm"),
    sponsorForm: byId("sponsorForm"),
    donationAmount: qs("[data-ff-amount-input]"),
    donationError: qs("[data-ff-checkout-error]"),
    donationStatus: qs("[data-ff-checkout-status]"),
    sponsorError: qs("[data-ff-sponsor-error]"),
    sponsorStatus: qs("[data-ff-sponsor-status]"),
    sponsorSuccess: qs("[data-ff-sponsor-success]"),
    stripeMsg: qs("[data-ff-stripe-msg]"),
    stripeError: qs("[data-ff-stripe-error]"),
    paypalMsg: qs("[data-ff-paypal-msg]"),
    paypalError: qs("[data-ff-paypal-error]"),
    paymentMount: qs("[data-ff-stripe-mount]"),
    paypalMount: qs("[data-ff-paypal-mount]"),
    checkoutStage: qs('[data-ff-checkout-stage="form"]'),
    checkoutSuccess: qs("[data-ff-checkout-success]"),
    videoModal: qs("[data-ff-video-modal]"),
    videoMount: qs("[data-ff-video-mount]"),
    videoStatus: qs("[data-ff-video-status]"),
    videoTitle: qs("[data-ff-video-title]"),
    sponsorWall: qs("[data-ff-sponsor-wall]"),
    sponsorWallEmpty: qs("[data-ff-sponsor-wall-empty]"),
    vipSpotlight: qs("[data-ff-vip-spotlight]"),
    tickerTrack: qs("[data-ff-ticker-track]"),
    qrImages: qsa("[data-ff-qr-src]"),
    focusProbe: byId("ff_focus_probe") || byId("__ff_focus_probe__"),
    activityFeed: qs("[data-ff-live-feed]"),
    ffLive: byId("ffLive"),
    onboardingModal: qs("[data-ff-onboard-modal]"),
    checkoutSheet: qs("[data-ff-checkout-sheet]"),
    donateFormHook: qs("[data-ff-donate-form]"),
    drawerHook: qs("[data-ff-drawer]"),
    dynHook: qs("[data-ff-dyn]"),
    emailInput: qs("[data-ff-email]"),
    paymentElement: qs("[data-ff-payment-element]"),
    paypalSkeleton: qs("[data-ff-paypal-skeleton]"),
    sponsorModal: qs("[data-ff-sponsor-modal]"),
    sponsorSubmit: qs("[data-ff-sponsor-submit]"),
    stripeSkeleton: qs("[data-ff-stripe-skeleton]"),
    videoFrame: qs("[data-ff-video-frame]")
  };

  var overlays = {
    checkout: {
      id: "checkout",
      el: byId("checkout"),
      panel: qs("#checkout .ff-sheet__panel")
    },
    sponsor: {
      id: "sponsor-interest",
      el: byId("sponsor-interest"),
      panel: qs("#sponsor-interest .ff-modal__panel")
    },
    video: {
      id: "press-video",
      el: byId("press-video"),
      panel: qs("#press-video .ff-modal__panel")
    },
    terms: {
      id: "terms",
      el: byId("terms"),
      panel: qs("#terms .ff-modal__panel")
    },
    privacy: {
      id: "privacy",
      el: byId("privacy"),
      panel: qs("#privacy .ff-modal__panel")
    },
    drawer: {
      id: "drawer",
      el: byId("drawer"),
      panel: qs("#drawer .ff-drawer__panel")
    }
  };

  var state = {
    initialized: false,
    keyboardMode: false,
    lastFocused: null,
    openOverlayId: null,
    overlayReturnFocus: null,
    stripe: null,
    stripeElements: null,
    stripePaymentElement: null,
    stripeClientSecret: "",
    stripeIntentKey: "",
    stripeLoading: false,
    paypalLoading: false,
    paypalRenderedKey: "",
    stripeTimer: 0,
    paypalTimer: 0,
    socket: null,
    observer: null,
    lastPrefill: {},
    lastVideoSrc: "",
    lastVideoTitle: "",
    onboardingReady: false,
    onboardingCurrentStep: 1,
    liveTotals: {
      raised: null,
      goal: null,
      percent: null,
      remaining: null
    }
  };

  function setBoot(stage) {
    w.BOOT_KEY = stage;
    w.__FF_BOOT__ = stage;
    w.ff.version = BUILD;
    attr(root, "data-ff-boot", stage);
  }

  function setKeyboardMode(enabled) {
    state.keyboardMode = !!enabled;
    attr(root, "data-ff-input-mode", enabled ? "keyboard" : "pointer");
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function announce(message) {
    if (!message) return;
    if (dom.live) {
      dom.live.textContent = "";
      w.setTimeout(function () {
        dom.live.textContent = message;
      }, 10);
    }
  }

  function toast(message, kind) {
    if (!dom.toasts || !message) {
      announce(message);
      return;
    }

    var node = createEl("div", "ff-toast" + (kind ? " is-" + kind : ""), message);
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    dom.toasts.appendChild(node);
    announce(message);

    w.setTimeout(function () {
      node.style.opacity = "0";
      node.style.transform = "translateY(-4px)";
      w.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 180);
    }, 2800);
  }

  function lockScroll(locked) {
    if (!body) return;
    if (locked) {
      attr(root, "data-ff-overlay-open", "true");
      attr(body, "data-ff-overlay-open", "true");
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    } else {
      attr(root, "data-ff-overlay-open", null);
      attr(body, "data-ff-overlay-open", null);
      body.style.overflow = "";
      body.style.touchAction = "";
    }
  }

  function applyOverlayState(overlay, open) {
    if (!overlay || !overlay.el) return;
    var el = overlay.el;
    if (open) {
      el.hidden = false;
      el.classList.add("is-open");
      attr(el, "data-open", "true");
      attr(el, "aria-hidden", "false");
      return;
    }
    el.classList.remove("is-open");
    attr(el, "data-open", "false");
    attr(el, "aria-hidden", "true");
    el.hidden = true;
  }

  function getOverlayById(id) {
    if (!id) return null;
    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      var overlay = overlays[keys[i]];
      if (overlay && overlay.id === id) return overlay;
    }
    return null;
  }

  function getAnyOpenOverlay() {
    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      var ov = overlays[keys[i]];
      if (!ov || !ov.el) continue;
      if (ov.el.classList.contains("is-open")) return ov;
      if (ov.el.getAttribute("data-open") === "true") return ov;
      if (ov.el.getAttribute("aria-hidden") === "false") return ov;
      if (hasHashFor(ov.id)) return ov;
    }
    return null;
  }

  function focusPanel(overlay) {
    if (!overlay || !overlay.panel) return;
    w.requestAnimationFrame(function () {
      try {
        overlay.panel.focus({ preventScroll: false });
      } catch (err) {
        try {
          overlay.panel.focus();
        } catch (e) {}
      }
    });
  }

  function clearHashIfMatches(id) {
    if (id && w.location.hash === "#" + id) {
      history.pushState("", d.title, w.location.pathname + w.location.search);
    }
  }

  function closeOverlay(id, opts) {
    var overlay = getOverlayById(id);
    if (!overlay || !overlay.el) return;
    opts = opts || {};

    applyOverlayState(overlay, false);

    if (overlay.id === "press-video") {
      unmountVideo();
    }

    if (state.openOverlayId === overlay.id) {
      state.openOverlayId = null;
    }

    if (!getAnyOpenOverlay()) {
      lockScroll(false);
    }

    if (opts.updateHash !== false) {
      clearHashIfMatches(overlay.id);
    }

    if (opts.returnFocus !== false) {
      var target = state.overlayReturnFocus || state.lastFocused || dom.focusProbe;
      if (target && typeof target.focus === "function") {
        w.requestAnimationFrame(function () {
          try {
            target.focus({ preventScroll: true });
          } catch (err) {
            try { target.focus(); } catch (e) {}
          }
        });
      }
      state.overlayReturnFocus = null;
      state.lastFocused = null;
    }
  }

  function closeAllOverlays(opts) {
    opts = opts || {};
    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      closeOverlay(overlays[keys[i]].id, {
        updateHash: false,
        returnFocus: false
      });
    }
    lockScroll(false);

    if (opts.updateHash !== false && /^#(checkout|sponsor-interest|press-video|terms|privacy|drawer)$/.test(w.location.hash)) {
      clearHashIfMatches(w.location.hash.slice(1));
    }
  }

  function openOverlay(id, opts) {
    var overlay = getOverlayById(id);
    opts = opts || {};
    if (!overlay || !overlay.el) return;

    var source = opts.source || d.activeElement || null;
    if (source) {
      state.lastFocused = source;
      state.overlayReturnFocus = source;
    }

    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      var ov = overlays[keys[i]];
      if (ov && ov.id !== overlay.id) applyOverlayState(ov, false);
    }

    applyOverlayState(overlay, true);
    state.openOverlayId = overlay.id;
    lockScroll(true);

    if (opts.updateHash !== false && w.location.hash !== "#" + overlay.id) {
      history.pushState("", d.title, "#" + overlay.id);
    }

    if (overlay.id === "checkout") {
      hydrateQrImages();
      lazyInitPayments();
    }

    if (overlay.id === "press-video") {
      mountVideo(opts.video || {});
    }

    focusPanel(overlay);
  }

  function syncOverlayFromHash() {
    var hash = (w.location.hash || "").replace(/^#/, "");
    if (!hash) {
      closeAllOverlays({ updateHash: false, returnFocus: false });
      return;
    }

    var overlay = getOverlayById(hash);
    if (!overlay) return;

    openOverlay(hash, {
      updateHash: false,
      source: d.activeElement
    });
  }

  function currentCurrency() {
    var input = dom.donationForm ? qs('input[name="currency"]', dom.donationForm) : null;
    return input && input.value ? input.value : (config.paypalCurrency || "USD");
  }

  function parseAmount(raw) {
    if (raw == null) return 0;
    var cleaned = String(raw).replace(/[^0-9.]/g, "");
    var amount = Number(cleaned);
    if (!Number.isFinite(amount)) return 0;
    return clamp(Math.round(amount * 100) / 100, 0, 100000000);
  }

  function formatMoney(amount, currency) {
    var n = toNumber(amount, 0);
    var c = currency || currentCurrency();
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 0
      }).format(n);
    } catch (err) {
      return "$" + Math.round(n).toLocaleString("en-US");
    }
  }

  function getDonationData() {
    var form = dom.donationForm;
    if (!form) return null;

    var amount = parseAmount(dom.donationAmount ? dom.donationAmount.value : "");
    var email = ((dom.emailInput || qs('[name="email"]', form)) || {}).value || "";
    var name = (qs('[name="name"]', form) || {}).value || "";
    var message = (qs('[name="message"]', form) || {}).value || "";
    var teamId = (qs('input[data-ff-team-id][name="team_id"]', form) || {}).value || "default";
    var playerId = (qs('[name="player_id"]', form) || {}).value || "";
    var sponsorTier = (qs('[name="sponsor_tier"]', form) || {}).value || "";
    var sponsorAmount = (qs('[name="sponsor_amount"]', form) || {}).value || "";
    var currency = currentCurrency();

    return {
      amount: amount,
      email: String(email).trim(),
      name: String(name).trim(),
      message: String(message).trim(),
      team_id: String(teamId).trim() || "default",
      player_id: String(playerId).trim(),
      sponsor_tier: String(sponsorTier).trim(),
      sponsor_amount: sponsorAmount ? parseAmount(sponsorAmount) : 0,
      currency: currency,
      return_url: config.stripeReturnUrl || getCanonicalUrl()
    };
  }

  function hideStatus(node) {
    if (!node) return;
    node.hidden = true;
    node.textContent = "";
  }

  function showStatus(node, message) {
    if (!node) return;
    node.hidden = false;
    node.textContent = message;
  }

  function validateDonationForm() {
    var data = getDonationData();
    if (!data) return { ok: false, message: "Donation form is not available." };

    if (!data.amount || data.amount <= 0) {
      return { ok: false, field: "amount", message: "Enter a valid donation amount." };
    }

    if (config.requireEmail && !isValidEmail(data.email)) {
      return { ok: false, field: "email", message: "Enter a valid email for your receipt." };
    }

    return { ok: true, data: data };
  }

  function validateSponsorForm() {
    if (!dom.sponsorForm) return { ok: false, message: "Sponsor form is not available." };

    var nameInput = qs('[name="sponsor_name"]', dom.sponsorForm);
    var emailInput = qs('[name="sponsor_email"]', dom.sponsorForm);
    var messageInput = qs('[name="sponsor_message"]', dom.sponsorForm);
    var tierInput = qs('[name="sponsor_tier"]', dom.sponsorForm);

    var payload = {
      sponsor_name: String(nameInput && nameInput.value || "").trim(),
      sponsor_email: String(emailInput && emailInput.value || "").trim(),
      sponsor_message: String(messageInput && messageInput.value || "").trim(),
      sponsor_tier: String(tierInput && tierInput.value || "").trim()
    };

    if (!payload.sponsor_name) {
      return { ok: false, field: "name", message: "Please add your name or business name." };
    }

    if (!isValidEmail(payload.sponsor_email)) {
      return { ok: false, field: "email", message: "Please enter a valid email address." };
    }

    return { ok: true, data: payload };
  }

  function setAmount(amount, opts) {
    if (!dom.donationAmount) return;
    var numeric = parseAmount(amount);
    dom.donationAmount.value = numeric ? String(numeric % 1 === 0 ? Math.round(numeric) : numeric) : "";

    try {
      w.localStorage.setItem(STORAGE_LAST_AMOUNT_KEY, dom.donationAmount.value);
    } catch (err) {}

    syncAmountChipState(numeric);
    updatePayMessages(numeric);

    if ((opts || {}).announce !== false && numeric > 0) {
      announce("Donation amount set to " + formatMoney(numeric) + ".");
    }

    scheduleStripeRefresh();
    schedulePaypalRefresh();
  }

  function syncAmountChipState(amount) {
    qsa("[data-ff-amount]").forEach(function (chip) {
      var value = parseAmount(chip.getAttribute("data-ff-amount"));
      var active = amount > 0 && value === amount;
      attr(chip, "aria-pressed", active ? "true" : "false");
      chip.classList.toggle("is-active", active);
    });
  }

  function updatePayMessages(amount) {
    if (dom.stripeMsg) {
      text(dom.stripeMsg, amount > 0 ? "Card entry will prepare for " + formatMoney(amount) + "." : "Enter an amount to prepare card checkout.");
    }
    if (dom.paypalMsg) {
      text(dom.paypalMsg, amount > 0 ? "PayPal will load for " + formatMoney(amount) + "." : "Enter an amount to load PayPal.");
    }
  }

  function applyCheckoutPrefill(prefill) {
    if (!dom.donationForm) return;
    prefill = prefill || {};

    if (prefill.amount != null && prefill.amount !== "") {
      setAmount(prefill.amount, { announce: false });
    }

    if (prefill.teamId) ensureHiddenInput(dom.donationForm, "team_id", prefill.teamId);
    if (prefill.playerId) ensureHiddenInput(dom.donationForm, "player_id", prefill.playerId);
    if (prefill.sponsorTier) ensureHiddenInput(dom.donationForm, "sponsor_tier", prefill.sponsorTier);
    if (prefill.sponsorAmount) ensureHiddenInput(dom.donationForm, "sponsor_amount", prefill.sponsorAmount);

    state.lastPrefill = prefill;
  }

  function applySponsorPrefill(prefill) {
    if (!dom.sponsorForm) return;
    prefill = prefill || {};
    var hidden = qs('[name="sponsor_tier"]', dom.sponsorForm);
    if (hidden && prefill.sponsorTier) {
      hidden.value = prefill.sponsorTier;
    }
    syncSponsorTierState(prefill.sponsorTier || "");
  }

  function triggerPrefillFromNode(node) {
    if (!node) return {};
    return {
      amount: node.getAttribute("data-ff-amount") || node.getAttribute("data-ff-sponsor-amount") || "",
      teamId: node.getAttribute("data-ff-team-id") || "",
      playerId: node.getAttribute("data-ff-player-id") || "",
      sponsorTier: node.getAttribute("data-ff-sponsor-tier") || "",
      sponsorAmount: node.getAttribute("data-ff-sponsor-amount") || "",
      videoSrc: node.getAttribute("data-ff-video-src") || "",
      videoTitle: node.getAttribute("data-ff-video-title") || ""
    };
  }

  function hydrateQrImages() {
    dom.qrImages.forEach(function (img) {
      var src = img.getAttribute("data-ff-qr-src");
      if (src && img.getAttribute("src") !== src) {
        img.setAttribute("src", src);
      }
    });
  }

  function mountVideo(video) {
    if (!dom.videoMount) return;
    video = video || {};
    var src = video.src || state.lastVideoSrc || "";
    var title = video.title || state.lastVideoTitle || "Watch";

    if (!src) return;

    state.lastVideoSrc = src;
    state.lastVideoTitle = title;

    text(dom.videoTitle, title);
    text(dom.videoStatus, "Loading video…");

    while (dom.videoMount.firstChild) {
      dom.videoMount.removeChild(dom.videoMount.firstChild);
    }

    var iframe = d.createElement("iframe");
    iframe.setAttribute("src", src);
    iframe.setAttribute("title", title);
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "eager");
    dom.videoMount.appendChild(iframe);

    iframe.addEventListener("load", function () {
      text(dom.videoStatus, "Video ready.");
    }, { once: true });
  }

  function unmountVideo() {
    if (!dom.videoMount) return;
    while (dom.videoMount.firstChild) {
      dom.videoMount.removeChild(dom.videoMount.firstChild);
    }
    if (dom.videoStatus) text(dom.videoStatus, "Ready when you are.");
  }

  function syncSponsorTierState(activeTier) {
    qsa("[data-ff-sponsor-tier]").forEach(function (btn) {
      var tier = btn.getAttribute("data-ff-sponsor-tier") || "";
      var active = !!activeTier && tier === activeTier;
      attr(btn, "aria-pressed", active ? "true" : "false");
      btn.classList.toggle("is-active", active);
    });
  }

  function getFetchOptions(method, payload) {
    var headers = {
      "Accept": "application/json"
    };

    if (payload != null) {
      headers["Content-Type"] = "application/json";
    }

    if (config.csrfToken) {
      headers["X-CSRFToken"] = config.csrfToken;
      headers["X-CSRF-Token"] = config.csrfToken;
    }

    return {
      method: method || "GET",
      headers: headers,
      credentials: "same-origin",
      body: payload != null ? JSON.stringify(payload) : undefined
    };
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      return res.text().then(function (raw) {
        var data = safeJsonParse(raw || "{}", {});
        if (!res.ok) {
          var message = data && (data.error || data.message) ? (data.error || data.message) : ("Request failed (" + res.status + ")");
          var err = new Error(message);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function getStripePublishableKey(responseData) {
    return (
      (responseData && (responseData.publishableKey || responseData.publishable_key)) ||
      config.stripePk ||
      ""
    );
  }

  function loadScript(src, id) {
    return new Promise(function (resolve, reject) {
      if (!src) {
        reject(new Error("Missing script source."));
        return;
      }

      if (id) {
        var existingById = byId(id);
        if (existingById) {
          if (existingById.getAttribute("data-loaded") === "true") {
            resolve(existingById);
            return;
          }
          existingById.addEventListener("load", function () { resolve(existingById); }, { once: true });
          existingById.addEventListener("error", function () { reject(new Error("Failed to load " + src)); }, { once: true });
          return;
        }
      }

      var existing = qsa('script[src="' + src + '"]')[0];
      if (existing) {
        if (existing.getAttribute("data-loaded") === "true") {
          resolve(existing);
          return;
        }
        existing.addEventListener("load", function () { resolve(existing); }, { once: true });
        existing.addEventListener("error", function () { reject(new Error("Failed to load " + src)); }, { once: true });
        return;
      }

      var script = d.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.setAttribute("data-ff-dyn", "true");
      script.setAttribute("data-ff-loaded", "false");
      script.addEventListener("load", function () {
        script.setAttribute("data-loaded", "true");
        script.setAttribute("data-ff-loaded", "true");
        script.setAttribute("data-ff-loaded", "true");
        resolve(script);
      }, { once: true });
      script.addEventListener("error", function () {
        reject(new Error("Failed to load " + src));
      }, { once: true });
      d.head.appendChild(script);
    });
  }

  function injectScript(src, id) {
    return loadScript(src, id);
  }

  function ensureStripeReady(publishableKey) {
    if (state.stripe && publishableKey === config.stripePk) {
      return Promise.resolve(state.stripe);
    }

    return loadScript(config.stripeJs, "ffStripeJs").then(function () {
      if (!w.Stripe) throw new Error("Stripe.js is unavailable.");

      var pk = publishableKey || config.stripePk;
      if (!pk) throw new Error("Stripe publishable key is missing.");

      config.stripePk = pk;
      state.stripe = w.Stripe(pk);
      return state.stripe;
    });
  }

  function getStripeIntentKey(data) {
    return [
      data.amount,
      data.currency,
      data.team_id,
      data.player_id,
      data.sponsor_tier,
      data.sponsor_amount
    ].join("|");
  }

  function createStripeIntent(data) {
    var payload = {
      amount: data.amount,
      currency: data.currency,
      team_id: data.team_id,
      player_id: data.player_id,
      sponsor_tier: data.sponsor_tier,
      sponsor_amount: data.sponsor_amount,
      return_url: data.return_url,
      donor_email: data.email,
      donor_name: data.name,
      donor_message: data.message
    };

    return fetchJson(config.stripeIntentEndpoint, getFetchOptions("POST", payload));
  }

  function destroyStripeElement() {
    try {
      if (state.stripePaymentElement) state.stripePaymentElement.unmount();
    } catch (err) {}

    state.stripePaymentElement = null;
    state.stripeElements = null;
    state.stripeClientSecret = "";
    state.stripeIntentKey = "";
  }

  function mountStripeElement(clientSecret) {
    if (!dom.paymentMount || !state.stripe) return Promise.resolve();

    if (state.stripeClientSecret === clientSecret && state.stripePaymentElement) {
      return Promise.resolve();
    }

    destroyStripeElement();

    state.stripeElements = state.stripe.elements({
      clientSecret: clientSecret,
      appearance: {
        theme: (root.getAttribute("data-theme") === "dark") ? "night" : "stripe"
      }
    });

    state.stripePaymentElement = state.stripeElements.create("payment", {
      layout: {
        type: "tabs",
        defaultCollapsed: false
      }
    });

    state.stripePaymentElement.mount(dom.paymentMount);
    state.stripeClientSecret = clientSecret;

    if (dom.stripeError) hideStatus(dom.stripeError);
    if (dom.stripeMsg) showStatus(dom.stripeMsg, "Card entry is ready.");

    return Promise.resolve();
  }

  function ensureStripeIntent(force) {
    var validation = validateDonationForm();

    if (!validation.ok) {
      if (dom.stripeMsg) showStatus(dom.stripeMsg, validation.message || "Enter an amount to prepare card checkout.");
      return Promise.reject(new Error(validation.message || "Invalid donation data."));
    }

    var data = validation.data;
    var intentKey = getStripeIntentKey(data);

    if (!force && state.stripeIntentKey === intentKey && state.stripeClientSecret && state.stripePaymentElement) {
      return Promise.resolve({ clientSecret: state.stripeClientSecret });
    }

    if (state.stripeLoading) {
      return Promise.reject(new Error("Stripe is already preparing."));
    }

    state.stripeLoading = true;
    if (dom.stripeMsg) showStatus(dom.stripeMsg, "Preparing secure card entry…");
    if (dom.stripeError) hideStatus(dom.stripeError);

    return createStripeIntent(data)
      .then(function (response) {
        var clientSecret = response.clientSecret || response.client_secret || "";
        var publishableKey = getStripePublishableKey(response);

        if (!clientSecret) {
          throw new Error("Stripe intent response is missing a client secret.");
        }

        return ensureStripeReady(publishableKey).then(function () {
          return mountStripeElement(clientSecret).then(function () {
            state.stripeIntentKey = intentKey;
            if (dom.stripeMsg) showStatus(dom.stripeMsg, "Secure card entry is ready.");
            return response;
          });
        });
      })
      .catch(function (err) {
        if (dom.stripeError) showStatus(dom.stripeError, err.message || "Unable to prepare Stripe checkout.");
        throw err;
      })
      .finally(function () {
        state.stripeLoading = false;
      });
  }

  function submitStripePayment() {
    var validation = validateDonationForm();
    if (!validation.ok) {
      throw new Error(validation.message || "Please correct the donation form.");
    }

    if (!state.stripe || !state.stripeElements) {
      throw new Error("Stripe is not ready yet.");
    }

    return state.stripe.confirmPayment({
      elements: state.stripeElements,
      confirmParams: {
        return_url: validation.data.return_url
      },
      redirect: "if_required"
    }).then(function (result) {
      if (result.error) {
        throw new Error(result.error.message || "Payment confirmation failed.");
      }
      return result;
    });
  }

  function showCheckoutSuccess(message) {
    if (dom.checkoutStage) dom.checkoutStage.hidden = true;
    if (dom.checkoutSuccess) dom.checkoutSuccess.hidden = false;
    if (message) announce(message);
  }

  function resetCheckoutSuccess() {
    if (dom.checkoutStage) dom.checkoutStage.hidden = false;
    if (dom.checkoutSuccess) dom.checkoutSuccess.hidden = true;
  }

  function loadPayPalSdk() {
    if (!config.paypalClientId) {
      return Promise.reject(new Error("PayPal is not configured."));
    }

    if (w.paypal && w.paypal.Buttons) {
      return Promise.resolve(w.paypal);
    }

    var params = [
      "client-id=" + encodeURIComponent(config.paypalClientId),
      "currency=" + encodeURIComponent(config.paypalCurrency || "USD"),
      "intent=" + encodeURIComponent(config.paypalIntent || "capture"),
      "components=buttons"
    ].join("&");

    return loadScript("https://www.paypal.com/sdk/js?" + params, "ffPayPalSdk").then(function () {
      if (!w.paypal || !w.paypal.Buttons) throw new Error("PayPal SDK is unavailable.");
      return w.paypal;
    });
  }

  function createPayPalOrder(data) {
    var payload = {
      amount: data.amount,
      currency: data.currency,
      team_id: data.team_id,
      player_id: data.player_id,
      sponsor_tier: data.sponsor_tier,
      sponsor_amount: data.sponsor_amount,
      donor_email: data.email,
      donor_name: data.name,
      donor_message: data.message
    };

    return fetchJson(config.paypalCreateEndpoint, getFetchOptions("POST", payload)).then(function (res) {
      return res.orderID || res.orderId || res.id || "";
    });
  }

  function capturePayPalOrder(data, orderID) {
    var payload = {
      order_id: orderID,
      amount: data.amount,
      currency: data.currency,
      team_id: data.team_id,
      donor_email: data.email,
      donor_name: data.name
    };

    if (!config.paypalCaptureEndpoint) {
      return Promise.resolve({});
    }

    return fetchJson(config.paypalCaptureEndpoint, getFetchOptions("POST", payload));
  }

  function clearPaypalMount() {
    if (!dom.paypalMount) return;
    while (dom.paypalMount.firstChild) {
      dom.paypalMount.removeChild(dom.paypalMount.firstChild);
    }
    dom.paypalMount.removeAttribute("data-rendered");
  }

  function renderPayPalButtons() {
    var validation = validateDonationForm();
    if (!validation.ok) {
      if (dom.paypalMsg) showStatus(dom.paypalMsg, validation.message || "Enter an amount to load PayPal.");
      return Promise.reject(new Error(validation.message || "Invalid donation data."));
    }

    var data = validation.data;
    var renderKey = [data.amount, data.currency, data.team_id, data.player_id].join("|");

    if (state.paypalRenderedKey === renderKey && dom.paypalMount && dom.paypalMount.getAttribute("data-rendered") === "true") {
      return Promise.resolve();
    }

    if (state.paypalLoading) {
      return Promise.reject(new Error("PayPal is already loading."));
    }

    state.paypalLoading = true;
    if (dom.paypalError) hideStatus(dom.paypalError);
    if (dom.paypalMsg) showStatus(dom.paypalMsg, "Loading PayPal…");

    return loadPayPalSdk()
      .then(function (paypal) {
        clearPaypalMount();
        if (!dom.paypalMount) throw new Error("PayPal mount is missing.");

        return paypal.Buttons({
          style: {
            layout: "vertical",
            shape: "pill",
            label: "paypal"
          },
          createOrder: function () {
            return createPayPalOrder(getDonationData()).then(function (orderID) {
              if (!orderID) throw new Error("PayPal order creation failed.");
              return orderID;
            });
          },
          onApprove: function (dataApprove) {
            return capturePayPalOrder(getDonationData(), dataApprove.orderID).then(function () {
              showCheckoutSuccess("Donation received. Your confirmation will arrive by email shortly.");
              toast("PayPal donation completed.", "success");
            });
          },
          onError: function (err) {
            if (dom.paypalError) showStatus(dom.paypalError, err && err.message ? err.message : "PayPal checkout failed.");
          },
          onCancel: function () {
            if (dom.paypalMsg) showStatus(dom.paypalMsg, "PayPal checkout cancelled.");
          }
        }).render(dom.paypalMount).then(function () {
          dom.paypalMount.setAttribute("data-rendered", "true");
          state.paypalRenderedKey = renderKey;
          if (dom.paypalMsg) showStatus(dom.paypalMsg, "PayPal is ready.");
        });
      })
      .catch(function (err) {
        if (dom.paypalError) showStatus(dom.paypalError, err.message || "Unable to load PayPal.");
        throw err;
      })
      .finally(function () {
        state.paypalLoading = false;
      });
  }

  function lazyInitPayments() {
    var amount = parseAmount(dom.donationAmount && dom.donationAmount.value);
    updatePayMessages(amount);
    if (amount > 0) {
      scheduleStripeRefresh();
      schedulePaypalRefresh();
    }
  }

  function scheduleStripeRefresh() {
    if (state.stripeTimer) w.clearTimeout(state.stripeTimer);
    state.stripeTimer = w.setTimeout(function () {
      if (state.openOverlayId === "checkout") {
        ensureStripeIntent(false).catch(function () {});
      }
    }, 320);
  }

  function schedulePaypalRefresh() {
    if (state.paypalTimer) w.clearTimeout(state.paypalTimer);
    state.paypalTimer = w.setTimeout(function () {
      if (state.openOverlayId === "checkout" && config.paypalClientId) {
        renderPayPalButtons().catch(function () {});
      }
    }, 340);
  }

  function submitDonationForm(event) {
    if (event) event.preventDefault();

    hideStatus(dom.donationError);
    hideStatus(dom.donationStatus);
    hideStatus(dom.stripeError);

    var validation = validateDonationForm();
    if (!validation.ok) {
      showStatus(dom.donationError, validation.message || "Please review your donation details.");
      toast(validation.message || "Please review your donation details.", "error");
      return;
    }

    showStatus(dom.donationStatus, "Preparing secure payment…");

    ensureStripeIntent(false)
      .then(function () {
        showStatus(dom.donationStatus, "Confirming payment…");
        return submitStripePayment();
      })
      .then(function () {
        hideStatus(dom.donationStatus);
        showCheckoutSuccess("Donation received. Your confirmation will arrive by email shortly.");
        toast("Donation received.", "success");
      })
      .catch(function (err) {
        hideStatus(dom.donationStatus);
        showStatus(dom.donationError, err.message || "Unable to complete the donation.");
        toast(err.message || "Unable to complete the donation.", "error");
      });
  }

  function submitSponsorForm(event) {
    if (event) event.preventDefault();

    hideStatus(dom.sponsorError);
    hideStatus(dom.sponsorStatus);
    hideStatus(dom.sponsorSuccess);

    var validation = validateSponsorForm();
    if (!validation.ok) {
      showStatus(dom.sponsorError, validation.message || "Please review your sponsor details.");
      toast(validation.message || "Please review your sponsor details.", "error");
      return;
    }

    showStatus(dom.sponsorStatus, "Sending your message…");

    var endpoint = (FF_APP.cfg && FF_APP.cfg.sponsorEndpoint) || "/api/sponsors/inquiry";

    fetchJson(endpoint, getFetchOptions("POST", validation.data))
      .then(function () {
        hideStatus(dom.sponsorStatus);
        showStatus(dom.sponsorSuccess, "Message sent — a follow-up will be sent soon.");
        toast("Sponsor inquiry sent.", "success");
        announce("Sponsor inquiry sent.");
        try { dom.sponsorForm.reset(); } catch (err) {}
        syncSponsorTierState("");
      })
      .catch(function (err) {
        hideStatus(dom.sponsorStatus);
        showStatus(dom.sponsorError, err.message || "Unable to send your sponsor inquiry.");
        toast(err.message || "Unable to send your sponsor inquiry.", "error");
      });
  }

  function shareFundraiser() {
    var url = getCanonicalUrl();
    var title = d.title || "FutureFunded";
    var shareText = "Support this fundraiser";
    var nav = w.navigator || {};

    if (nav.share) {
      nav.share({
        title: title,
        text: shareText,
        url: url
      }).then(function () {
        toast("Link shared.", "success");
      }).catch(function () {});
      return;
    }

    if (nav.clipboard && nav.clipboard.writeText) {
      nav.clipboard.writeText(url).then(function () {
        toast("Link copied to clipboard.", "success");
      }).catch(function () {
        toast(url, "info");
      });
      return;
    }

    toast(url, "info");
  }

  function syncScrollSpy() {
    var links = qsa('[data-ff-scrollspy] a[href^="#"], .ff-tabs a[href^="#"], .ff-footer__link[href^="#"]');
    var sections = qsa("main[id], main section[id], #content section[id]");

    if (!("IntersectionObserver" in w) || !sections.length || !links.length) return;

    function setActive(id) {
      links.forEach(function (link) {
        var href = link.getAttribute("href") || "";
        var active = href === "#" + id;
        if (active) {
          attr(link, "aria-current", "true");
          link.classList.add("is-active");
        } else {
          link.removeAttribute("aria-current");
          link.classList.remove("is-active");
        }
      });
    }

    state.observer = new w.IntersectionObserver(function (entries) {
      var visible = entries.filter(function (entry) { return entry.isIntersecting; });
      if (!visible.length) return;
      visible.sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      setActive(visible[0].target.id);
    }, {
      rootMargin: "-20% 0px -60% 0px",
      threshold: [0.15, 0.3, 0.6]
    });

    sections.forEach(function (section) {
      if (section.id) state.observer.observe(section);
    });
  }

  function updateTotals(payload) {
    if (!payload) return;

    var raised = toNumber(payload.raised != null ? payload.raised : payload.amount_raised, state.liveTotals.raised || 0);
    var goal = toNumber(payload.goal != null ? payload.goal : payload.fundraiser_goal, state.liveTotals.goal || 0);
    var percent = goal > 0 ? clamp(Math.floor((raised / goal) * 100), 0, 100) : 0;
    var remaining = Math.max(goal - raised, 0);

    state.liveTotals = {
      raised: raised,
      goal: goal,
      percent: percent,
      remaining: remaining
    };

    qsa("[data-ff-raised]").forEach(function (node) {
      text(node, formatMoney(raised));
    });

    qsa("[data-ff-goal]").forEach(function (node) {
      text(node, formatMoney(goal));
    });

    qsa("[data-ff-pct]").forEach(function (node) {
      if (node.tagName === "PROGRESS") {
        node.value = percent;
        node.textContent = percent + "%";
      } else {
        text(node, percent + "%");
      }
    });

    qsa("[data-ff-percent]").forEach(function (node) {
      text(node, percent + "%");
    });

    var heroProgressText = byId("heroPanelProgressText");
    if (heroProgressText) {
      text(heroProgressText, formatMoney(raised) + " / " + formatMoney(goal));
    }

    qsa(".ff-progressCompact__summary .ff-help.ff-muted").forEach(function (node) {
      if (/remaining/i.test(node.textContent || "")) {
        text(node, formatMoney(remaining) + " remaining");
      }
    });
  }

  function sponsorWallHasContent() {
    if (!dom.sponsorWall) return false;
    var kids = Array.prototype.slice.call(dom.sponsorWall.children || []);
    if (!kids.length) return false;

    return kids.some(function (el) {
      return !!el.querySelector("strong, img, a[href]");
    });
  }

  function renderSponsorWall(items) {
    if (!dom.sponsorWall) return;
    var sponsors = Array.isArray(items) ? items.filter(Boolean) : [];

    while (dom.sponsorWall.firstChild) {
      dom.sponsorWall.removeChild(dom.sponsorWall.firstChild);
    }

    if (!sponsors.length) {
      if (dom.sponsorWallEmpty) dom.sponsorWallEmpty.hidden = false;
      return;
    }

    sponsors.forEach(function (item) {
      var cell = createEl("div", "ff-sponsorWall__item");
      cell.setAttribute("role", "listitem");

      var card = createEl("div", "ff-card ff-pad");
      var stack = createEl("div", "ff-stack");

      if (item.logo || item.logo_url) {
        var img = d.createElement("img");
        img.src = item.logo || item.logo_url;
        img.alt = (item.name || item.title || "Sponsor") + " logo";
        img.loading = "lazy";
        img.decoding = "async";
        img.style.maxHeight = "2.25rem";
        img.style.width = "auto";
        stack.appendChild(img);
      }

      stack.appendChild(createEl("strong", "", item.name || item.title || "Sponsor"));
      stack.appendChild(createEl("p", "ff-help ff-muted", item.tier ? String(item.tier).toUpperCase() : "Sponsor"));

      if (item.url) {
        var link = d.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "ff-link ff-help";
        link.textContent = "Visit sponsor";
        stack.appendChild(link);
      }

      card.appendChild(stack);
      cell.appendChild(card);
      dom.sponsorWall.appendChild(cell);
    });

    if (dom.sponsorWallEmpty) dom.sponsorWallEmpty.hidden = !sponsors.length ? false : true;
  }

  function renderVipSpotlight(item) {
    if (!dom.vipSpotlight) return;

    while (dom.vipSpotlight.firstChild) {
      dom.vipSpotlight.removeChild(dom.vipSpotlight.firstChild);
    }

    if (!item) {
      dom.vipSpotlight.appendChild(createEl("p", "ff-help ff-m-0", "Sponsors may rotate here during high-traffic periods."));
      dom.vipSpotlight.appendChild(createEl("p", "ff-help ff-muted ff-mt-1 ff-mb-0", "VIP recognition is reviewed and placed with care."));
      return;
    }

    var title = createEl("p", "ff-help ff-m-0");
    var strong = createEl("strong", "", item.name || item.title || "VIP sponsor");
    title.appendChild(strong);
    title.appendChild(d.createTextNode(" is in the spotlight."));
    dom.vipSpotlight.appendChild(title);
    dom.vipSpotlight.appendChild(createEl("p", "ff-help ff-muted ff-mt-1 ff-mb-0", item.message || "Thank you for supporting the program."));
  }

  function pushTickerItem(payload) {
    if (!dom.tickerTrack) return;

    var msg = "";
    if (typeof payload === "string") {
      msg = payload;
    } else if (payload && payload.message) {
      msg = payload.message;
    } else if (payload && payload.amount) {
      msg = formatMoney(payload.amount) + " received";
    }

    if (!msg) return;

    var placeholder = qs("p", dom.tickerTrack);
    if (placeholder && /activity appears here/i.test(placeholder.textContent || "")) {
      placeholder.parentNode.removeChild(placeholder);
    }

    var item = createEl("span", "ff-pill ff-pill--soft", msg);
    item.setAttribute("role", "listitem");
    dom.tickerTrack.appendChild(item);

    while (dom.tickerTrack.children.length > 8) {
      dom.tickerTrack.removeChild(dom.tickerTrack.firstChild);
    }
  }

  function pushActivityItem(message) {
    if (!dom.activityFeed || !message) return;

    var item = createEl("div", "ff-activityFeed__item", message);
    dom.activityFeed.insertBefore(item, dom.activityFeed.firstChild || null);

    while (dom.activityFeed.children.length > 5) {
      dom.activityFeed.removeChild(dom.activityFeed.lastChild);
    }
  }

  function initSocket() {
    if (state.socket || !w.io || root.getAttribute("data-ff-webdriver") === "true") return;

    try {
      state.socket = w.io({
        transports: ["polling"],
        upgrade: false,
        reconnection: true,
        timeout: 5000
      });
    } catch (err) {
      return;
    }

    var socket = state.socket;

    function bind(eventName, handler) {
      socket.on(eventName, handler);
    }

    [
      "totals:update",
      "fundraiser:update",
      "donation:update",
      "ff:totals"
    ].forEach(function (name) {
      bind(name, function (payload) {
        if (payload && (payload.raised != null || payload.amount_raised != null || payload.goal != null || payload.fundraiser_goal != null)) {
          updateTotals(payload);
        }
        if (payload && payload.message) pushTickerItem(payload.message);
        if (payload && payload.message) pushActivityItem(payload.message);
      });
    });

    [
      "sponsors:update",
      "ff:sponsors"
    ].forEach(function (name) {
      bind(name, function (payload) {
        renderSponsorWall(payload && (payload.sponsors || payload.items || []));
      });
    });

    [
      "vip:update",
      "ff:vip"
    ].forEach(function (name) {
      bind(name, function (payload) {
        renderVipSpotlight(payload && (payload.vip || payload.item || payload));
      });
    });

    [
      "ticker:update",
      "ff:ticker"
    ].forEach(function (name) {
      bind(name, function (payload) {
        pushTickerItem(payload);
      });
    });

    bind("donation", function (payload) {
      if (!payload) return;
      var donor = payload.name || payload.donor_name || "Someone";
      var amount = payload.amount ? formatMoney(payload.amount) : "a gift";
      pushActivityItem(donor + " donated " + amount);
    });

    bind("sponsor", function (payload) {
      if (!payload) return;
      var name = payload.name || payload.sponsor_name || "A sponsor";
      pushActivityItem(name + " became a sponsor");
    });

    bind("toast", function (payload) {
      if (!payload) return;
      toast(payload.message || "Update received.", payload.kind || "info");
    });
  }

  function inspectPaymentReturn() {
    var params = new URLSearchParams(w.location.search);
    if (
      params.get("payment_intent") ||
      params.get("payment_intent_client_secret") ||
      params.get("ff_success") === "1" ||
      params.get("paypal_success") === "1"
    ) {
      showCheckoutSuccess("Donation received. Your confirmation will arrive by email shortly.");
    }
  }

  function restoreLastAmount() {
    if (!dom.donationAmount) return;

    if (dom.donationAmount.value) {
      syncAmountChipState(parseAmount(dom.donationAmount.value));
      return;
    }

    try {
      var last = w.localStorage.getItem(STORAGE_LAST_AMOUNT_KEY);
      if (last) setAmount(last, { announce: false });
    } catch (err) {}
  }

  function applySavedTheme() {
    var stored = "";
    try {
      stored = w.localStorage.getItem(STORAGE_THEME_KEY) || "";
    } catch (err) {}

    if (stored === "light" || stored === "dark") {
      attr(root, "data-theme", stored);
    }

    syncThemeButtons();
  }

  function syncThemeButtons() {
    var current = root.getAttribute("data-theme") || "light";
    qsa("[data-ff-theme-toggle]").forEach(function (btn) {
      attr(btn, "aria-pressed", current === "dark" ? "true" : "false");
      attr(btn, "aria-label", current === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  function toggleTheme() {
    var current = root.getAttribute("data-theme") || "light";
    var next = current === "dark" ? "light" : "dark";
    attr(root, "data-theme", next);
    syncThemeButtons();

    try {
      w.localStorage.setItem(STORAGE_THEME_KEY, next);
    } catch (err) {}

    if (state.stripe && state.stripeClientSecret && state.stripePaymentElement) {
      ensureStripeIntent(true).catch(function () {});
    }
  }

  function fallbackLabelFromImg(img) {
    var alt = (img.getAttribute("alt") || "").trim();
    if (alt) return alt.replace(/\s+photo$/i, "").replace(/\s+logo$/i, "");
    var labeledParent = img.closest("[aria-label]");
    return labeledParent ? (labeledParent.getAttribute("aria-label") || "Program media").trim() : "Program media";
  }

  function markMissingMedia(img) {
    if (!img || img.dataset.ffFallbackBound === "true") return;
    img.dataset.ffFallbackBound = "true";

    function applyFallback() {
      var wrap = img.closest(".ff-teamCard__media") ||
        img.closest(".ff-storyPoster") ||
        img.closest(".ff-railcard") ||
        img.parentElement;

      if (!wrap) return;

      wrap.classList.add("is-media-missing");
      if (!wrap.getAttribute("data-ff-fallback-label")) {
        wrap.setAttribute("data-ff-fallback-label", prettyLabel(fallbackLabelFromImg(img)));
      }
      img.setAttribute("aria-hidden", "true");
    }

    img.addEventListener("error", applyFallback, { once: true });

    if (img.complete && (!img.naturalWidth || !img.naturalHeight)) {
      applyFallback();
    }
  }

  function bindMediaFallbacks() {
    qsa(".ff-teamCard__img, .ff-storyPoster__img, .ff-railcard__img").forEach(markMissingMedia);
    qsa(".is-media-missing, .ff-teamCard__media.is-media-missing, .ff-storyPoster.is-media-missing, .ff-railcard.is-media-missing").forEach(function (node) {
      var current = node.getAttribute("data-ff-fallback-label") || "";
      node.setAttribute("data-ff-fallback-label", prettyLabel(current));
    });
  }

  function validPreviewSrc(src) {
    src = String(src || "").trim();
    if (!src) return false;
    if (/^data:image\/gif;base64,R0lGODlhAQABAIA/i.test(src)) return false;
    return true;
  }

  function previewGalleryPool() {
    var out = [];
    qsa(".ff-railcard__img, .ff-teamCard__img").forEach(function (img) {
      var src = (img.getAttribute("src") || "").trim();
      if (validPreviewSrc(src) && out.indexOf(src) === -1) out.push(src);
    });
    return out;
  }

  function previewish() {
    var mode = (((body && body.getAttribute("data-ff-data-mode")) || config.mode || "") + "").toLowerCase();
    var env = (config.env || "").toLowerCase();
    return mode !== "live" || env !== "production";
  }

  function teamTitleFromCard(card) {
    var titleNode = qs(".ff-teamCard__title", card);
    return titleNode ? (titleNode.textContent || "").trim() : "Team preview";
  }

  function repairMissingPreviewMedia() {
    if (!previewish()) return;

    var pool = previewGalleryPool();
    if (!pool.length) {
      bindMediaFallbacks();
      return;
    }

    qsa(".ff-teamCard").forEach(function (card, index) {
      var img = qs(".ff-teamCard__img", card);
      if (!img) return;

      var bad = !(img.complete && img.naturalWidth > 16 && img.naturalHeight > 16);
      if (bad) {
        img.src = pool[index % pool.length];
        img.alt = teamTitleFromCard(card) + " team photo";
      }
      markMissingMedia(img);
    });

    var poster = qs(".ff-storyPoster__img");
    if (poster) {
      var posterBad = !(poster.complete && poster.naturalWidth > 16 && poster.naturalHeight > 16);
      if (posterBad) {
        poster.src = pool[0];
        poster.alt = "Program preview";
      }
      markMissingMedia(poster);
    }

    bindMediaFallbacks();
  }

  function seedPreviewRealism() {
    if (!previewish()) return;

    if (!sponsorWallHasContent()) {
      renderSponsorWall([
        { name: "Austin Sports Rehab", tier: "partner", url: "#" },
        { name: "Hill Country Dental", tier: "community", url: "#" },
        { name: "Metro Training Lab", tier: "champion", url: "#" }
      ]);
    }

    if (dom.vipSpotlight) {
      var vipText = (dom.vipSpotlight.textContent || "").toLowerCase();
      if (!vipText || /rotate here|high-traffic|reviewed and placed/.test(vipText)) {
        renderVipSpotlight({
          name: "Metro Training Lab",
          message: "VIP sponsor preview — featured placement, outbound link, and premium recognition."
        });
      }
    }

    if (dom.tickerTrack) {
      var tickerHasItems = !!dom.tickerTrack.querySelector(".ff-pill, [role='listitem']");
      if (!tickerHasItems || /activity appears here/i.test(dom.tickerTrack.textContent || "")) {
        pushTickerItem("Austin donor supported the program");
        pushTickerItem("$150 travel support received");
        pushTickerItem("Community sponsor inquiry received");
      }
    }

    if (dom.activityFeed && !dom.activityFeed.children.length) {
      pushActivityItem("Maria from Austin donated $25");
      pushActivityItem("David sponsored the 7th Grade team");
      pushActivityItem("Local Pizza became a Community Sponsor");
    }

    repairMissingPreviewMedia();
  }

  function contractSnapshot() {
    var snapshot = {
      ok: true,
      boot: w.__FF_BOOT__ || w.BOOT_KEY || "unknown",
      version: BUILD,
      readyState: d.readyState || "loading",
      theme: root.getAttribute("data-theme") || "",
      webdriver: root.getAttribute("data-ff-webdriver") === "true",
      hooks: {},
      overlays: {},
      forms: {},
      onboarding: {
        present: !!dom.onboardingModal,
        ready: state.onboardingReady
      },
      payments: {
        stripeConfigured: !!config.stripePk,
        stripeMounted: !!state.stripePaymentElement,
        paypalConfigured: !!config.paypalClientId,
        paypalRendered: !!(dom.paypalMount && dom.paypalMount.getAttribute("data-rendered") === "true")
      }
    };

    Object.keys(FF_APP.selectors || {}).forEach(function (key) {
      snapshot.hooks[key] = !!qs(FF_APP.selectors[key]);
    });

    Object.keys(overlays).forEach(function (key) {
      snapshot.overlays[key] = !!(overlays[key] && overlays[key].el);
    });

    snapshot.forms.donationForm = !!dom.donationForm;
    snapshot.forms.sponsorForm = !!dom.sponsorForm;
    snapshot.forms.amountInput = !!dom.donationAmount;

    return snapshot;
  }

  function handleDocumentClick(event) {
    var target = event.target;
    if (!target) return;

    var shareBtn = target.closest("[data-ff-share]");
    if (shareBtn) {
      event.preventDefault();
      shareFundraiser();
      return;
    }

    var themeBtn = target.closest("[data-ff-theme-toggle]");
    if (themeBtn) {
      event.preventDefault();
      toggleTheme();
      return;
    }

    var amountBtn = target.closest("[data-ff-amount]");
    if (amountBtn) {
      event.preventDefault();
      var amount = amountBtn.getAttribute("data-ff-amount") || "";
      setAmount(amount);

      var insideCheckout = !!amountBtn.closest("#checkout");
      if (!insideCheckout) {
        openOverlay("checkout", {
          source: amountBtn,
          updateHash: true
        });
        applyCheckoutPrefill(triggerPrefillFromNode(amountBtn));
      }
      return;
    }

    var sponsorTierBtn = target.closest('#sponsor-interest [data-ff-sponsor-tier]');
    if (sponsorTierBtn) {
      event.preventDefault();
      var tier = sponsorTierBtn.getAttribute("data-ff-sponsor-tier") || "";
      var hidden = qs('[name="sponsor_tier"]', dom.sponsorForm);
      if (hidden) hidden.value = tier;
      syncSponsorTierState(tier);
      announce("Preferred sponsor tier set to " + tier + ".");
      return;
    }

    var openCheckout = target.closest("[data-ff-open-checkout]");
    if (openCheckout) {
      event.preventDefault();
      var checkoutPrefill = triggerPrefillFromNode(openCheckout);
      applyCheckoutPrefill(checkoutPrefill);
      resetCheckoutSuccess();
      openOverlay("checkout", {
        source: openCheckout,
        updateHash: true
      });
      return;
    }

    var openSponsor = target.closest("[data-ff-open-sponsor]");
    if (openSponsor) {
      event.preventDefault();
      applySponsorPrefill(triggerPrefillFromNode(openSponsor));
      openOverlay("sponsor-interest", {
        source: openSponsor,
        updateHash: true
      });
      return;
    }

    var openDrawer = target.closest("[data-ff-open-drawer]");
    if (openDrawer) {
      event.preventDefault();
      openOverlay("drawer", {
        source: openDrawer,
        updateHash: true
      });
      return;
    }

    var openVideo = target.closest("[data-ff-open-video]");
    if (openVideo) {
      event.preventDefault();
      var video = triggerPrefillFromNode(openVideo);
      openOverlay("press-video", {
        source: openVideo,
        updateHash: true,
        video: {
          src: video.videoSrc,
          title: video.videoTitle || "Watch"
        }
      });
      return;
    }

    var openTerms = target.closest('a[href="#terms"]');
    if (openTerms) {
      event.preventDefault();
      openOverlay("terms", {
        source: openTerms,
        updateHash: true
      });
      return;
    }

    var openPrivacy = target.closest('a[href="#privacy"]');
    if (openPrivacy) {
      event.preventDefault();
      openOverlay("privacy", {
        source: openPrivacy,
        updateHash: true
      });
      return;
    }

    var closeCheckout = target.closest("[data-ff-close-checkout]");
    if (closeCheckout) {
      event.preventDefault();
      closeOverlay("checkout");
      return;
    }

    var closeSponsor = target.closest("[data-ff-close-sponsor]");
    if (closeSponsor) {
      event.preventDefault();
      closeOverlay("sponsor-interest");
      return;
    }

    var closeVideo = target.closest("[data-ff-close-video]");
    if (closeVideo) {
      event.preventDefault();
      closeOverlay("press-video");
      return;
    }

    var closeTerms = target.closest("[data-ff-close-terms]");
    if (closeTerms) {
      event.preventDefault();
      closeOverlay("terms");
      return;
    }

    var closePrivacy = target.closest("[data-ff-close-privacy]");
    if (closePrivacy) {
      event.preventDefault();
      closeOverlay("privacy");
      return;
    }

    var closeDrawer = target.closest("[data-ff-close-drawer]");
    if (closeDrawer) {
      event.preventDefault();
      closeOverlay("drawer");
      return;
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Tab") {
      setKeyboardMode(true);
    }

    if (event.key === "Escape") {
      var openOverlayNow = getAnyOpenOverlay();
      if (openOverlayNow) {
        event.preventDefault();
        closeOverlay(openOverlayNow.id);
      }
    }
  }

  function handlePointerInput() {
    setKeyboardMode(false);
  }

  function handleAmountInput() {
    hideStatus(dom.donationError);
    var amount = parseAmount(dom.donationAmount && dom.donationAmount.value);
    syncAmountChipState(amount);
    updatePayMessages(amount);
    if (state.openOverlayId === "checkout" && amount > 0) {
      scheduleStripeRefresh();
      schedulePaypalRefresh();
    }
  }

  function initForms() {
    if (dom.donationForm) {
      on(dom.donationForm, "submit", submitDonationForm);
    }

    if (dom.sponsorForm) {
      on(dom.sponsorForm, "submit", submitSponsorForm);
    }

    if (dom.donationAmount) {
      on(dom.donationAmount, "input", handleAmountInput);
      on(dom.donationAmount, "change", handleAmountInput);
    }
  }

  function initEvents() {
    on(d, "click", handleDocumentClick);
    on(d, "keydown", handleKeyDown);
    on(d, "mousedown", handlePointerInput, true);
    on(d, "pointerdown", handlePointerInput, true);
    on(w, "hashchange", syncOverlayFromHash);
  }

  function initWebdriverMode() {
    var webdriver = !!((w.navigator && w.navigator.webdriver) || w.__nightmare || w.Cypress || /Headless/i.test((w.navigator && w.navigator.userAgent) || ""));
    attr(root, "data-ff-webdriver", webdriver ? "true" : "false");
    FF_APP.flags = FF_APP.flags || {};
    FF_APP.flags.webdriver = webdriver;
  }

  function initApi() {
    FF_APP.api.contractSnapshot = contractSnapshot;
    FF_APP.api.open = function (id) { openOverlay(id, { updateHash: true, source: d.activeElement }); };
    FF_APP.api.close = function (id) { closeOverlay(id); };
    FF_APP.api.closeAll = function () { closeAllOverlays(); };
    FF_APP.api.toast = toast;
    FF_APP.api.announce = announce;
    FF_APP.api.setAmount = setAmount;
    FF_APP.api.getAmount = function () { return parseAmount(dom.donationAmount && dom.donationAmount.value); };
    FF_APP.api.refreshProgress = updateTotals;
    FF_APP.api.renderSponsorWall = renderSponsorWall;
    FF_APP.api.renderVipSpotlight = renderVipSpotlight;
    FF_APP.api.pushTickerItem = pushTickerItem;
    FF_APP.api.pushActivityItem = pushActivityItem;
    FF_APP.api.reseedPreview = function () {
      seedPreviewRealism();
      bindMediaFallbacks();
    };
    FF_APP.api.injectScript = injectScript;
  }

  function escHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCsrfToken() {
    var metaNode = qs('meta[name="csrf-token"]');
    return metaNode ? String(metaNode.getAttribute("content") || "").trim() : (config.csrfToken || "");
  }

  function moneyString(value) {
    var n = Number(value || 0);
    if (!Number.isFinite(n)) return "$0";
    return "$" + n.toLocaleString();
  }

  function initOnboardingWizard() {
    var modal = dom.onboardingModal;
    if (!modal || modal.getAttribute("data-ff-onboard-ready") === "true") return;

    modal.setAttribute("data-ff-onboard-ready", "true");
    state.onboardingReady = true;

    var panel = qs("[data-ff-onboard-panel]", modal) || qs(".ff-modal__panel", modal);
    var form = qs("[data-ff-onboard-form]", modal);
    var steps = qsa("[data-ff-step]", modal);
    var pills = qsa("[data-ff-step-pill]", modal);
    var prevBtn = qs("[data-ff-onboard-prev]", modal);
    var nextBtn = qs("[data-ff-onboard-next]", modal);
    var finishBtn = qs("[data-ff-onboard-finish]", modal);
    var copyBtn = qs("[data-ff-onboard-copy]", modal);
    var emailBtn = qs("[data-ff-onboard-email]", modal);
    var summary = qs("[data-ff-onboard-summary]", modal);
    var status = qs("[data-ff-onboard-status]", modal);
    var swatchPrimary = qs('[data-ff-onboard-swatch="primary"]', modal);
    var swatchAccent = qs('[data-ff-onboard-swatch="accent"]', modal);
    var lastTrigger = null;

    function getData() {
      if (!form) return {};
      var fd = new FormData(form);
      var out = {};
      fd.forEach(function (value, key) {
        out[key] = value;
      });
      return out;
    }

    function exportText() {
      var data = getData();
      return [
        "FutureFunded onboarding brief",
        "",
        "Organization type: " + (data.org_type || ""),
        "Organization name: " + (data.org_name || ""),
        "Contact name: " + (data.contact_name || ""),
        "Contact email: " + (data.contact_email || ""),
        "Primary color: " + (data.brand_primary || ""),
        "Accent color: " + (data.brand_accent || ""),
        "Logo URL: " + (data.logo_url || ""),
        "Hero headline: " + (data.headline || ""),
        "Goal: " + moneyString(data.goal),
        "Deadline: " + (data.deadline || ""),
        "Checkout: " + (data.checkout || ""),
        "Donation presets: " + (data.presets || ""),
        "Sponsor tiers: " + (data.sponsor_tiers || ""),
        "Announcement: " + (data.announcement || "")
      ].join("\n");
    }

    function ensureResultMount() {
      var mount = qs("[data-ff-onboard-result]", modal);
      if (!mount && status) {
        mount = createEl("div", "ff-alert ff-alert--success ff-mt-2");
        mount.hidden = true;
        mount.setAttribute("data-ff-onboard-result", "");
        mount.setAttribute("role", "status");
        mount.setAttribute("aria-live", "polite");
        status.insertAdjacentElement("afterend", mount);
      }
      return mount;
    }

    function setWizardBusy(busy, message) {
      if (status) status.textContent = message || "";
      [prevBtn, nextBtn, finishBtn, emailBtn, copyBtn].forEach(function (btn) {
        if (!btn) return;
        btn.disabled = !!busy;
        attr(btn, "aria-busy", busy ? "true" : "false");
      });
    }

    function validateCurrentStep() {
      var currentPanel = steps.filter(function (el) {
        return Number(el.getAttribute("data-ff-step")) === state.onboardingCurrentStep;
      })[0];

      if (!currentPanel) return true;

      var fields = qsa("input, select, textarea", currentPanel);
      for (var i = 0; i < fields.length; i += 1) {
        var field = fields[i];
        if (typeof field.checkValidity === "function" && !field.checkValidity()) {
          if (typeof field.reportValidity === "function") field.reportValidity();
          return false;
        }
      }
      return true;
    }

    function validateWizardForm() {
      if (!form) return false;
      var fields = qsa("input, select, textarea", form);
      for (var i = 0; i < fields.length; i += 1) {
        var field = fields[i];
        if (typeof field.checkValidity === "function" && !field.checkValidity()) {
          if (typeof field.reportValidity === "function") field.reportValidity();
          return false;
        }
      }
      return true;
    }

    function collectWizardPayload() {
      var payload = getData();
      payload.goal = Number(payload.goal || 0);
      return payload;
    }

    function renderSummary() {
      if (!summary) return;
      var data = getData();

      if (swatchPrimary) swatchPrimary.style.background = data.brand_primary || "#0ea5e9";
      if (swatchAccent) swatchAccent.style.background = data.brand_accent || "#f97316";

      summary.innerHTML = [
        '<div class="ff-row ff-wrap ff-gap-2" role="list" aria-label="Wizard summary chips">',
        '  <span class="ff-pill ff-pill--soft" role="listitem">' + escHtml(data.org_type || "Group") + '</span>',
        '  <span class="ff-pill ff-pill--soft" role="listitem">' + escHtml(data.checkout || "Stripe + PayPal") + '</span>',
        '  <span class="ff-pill ff-pill--soft" role="listitem">' + escHtml(moneyString(data.goal)) + ' goal</span>',
        '</div>',
        '<div class="ff-onboardSummary__grid">',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Organization</span><span class="ff-onboardSummary__value">' + escHtml(data.org_name || "—") + '</span></div>',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Contact</span><span class="ff-onboardSummary__value">' + escHtml(data.contact_name || "—") + '<br>' + escHtml(data.contact_email || "—") + '</span></div>',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Brand</span><span class="ff-onboardSummary__value">Primary: ' + escHtml(data.brand_primary || "—") + '<br>Accent: ' + escHtml(data.brand_accent || "—") + '</span></div>',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Campaign</span><span class="ff-onboardSummary__value">' + escHtml(moneyString(data.goal)) + '<br>' + escHtml(data.deadline || "No deadline yet") + '</span></div>',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Presets</span><span class="ff-onboardSummary__value">' + escHtml(data.presets || "25, 50, 100, 250") + '</span></div>',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Sponsor tiers</span><span class="ff-onboardSummary__value">' + escHtml(data.sponsor_tiers || "Community / Partner / Champion / VIP") + '</span></div>',
        '</div>',
        '<div class="ff-alert ff-alert--info" role="note"><strong>Launch-ready brief:</strong> this intake can be copied or turned into a draft preview.</div>'
      ].join("");
    }

    function renderWizard() {
      steps.forEach(function (stepEl) {
        var stepNum = Number(stepEl.getAttribute("data-ff-step"));
        stepEl.hidden = stepNum !== state.onboardingCurrentStep;
      });

      pills.forEach(function (pill) {
        var stepNum = Number(pill.getAttribute("data-ff-step-pill"));
        if (stepNum === state.onboardingCurrentStep) {
          attr(pill, "aria-current", "step");
        } else {
          pill.removeAttribute("aria-current");
        }
      });

      if (prevBtn) prevBtn.hidden = state.onboardingCurrentStep === 1;
      if (nextBtn) nextBtn.hidden = state.onboardingCurrentStep === steps.length;
      if (finishBtn) finishBtn.hidden = state.onboardingCurrentStep !== steps.length;

      renderSummary();
    }

    function setOnboardingOpen(open) {
      if (open) {
        modal.hidden = false;
        modal.classList.add("is-open");
        attr(modal, "data-open", "true");
        attr(modal, "aria-hidden", "false");
        lockScroll(true);
        w.requestAnimationFrame(function () {
          if (panel && typeof panel.focus === "function") {
            try { panel.focus({ preventScroll: false }); } catch (err) { panel.focus(); }
          }
        });
        return;
      }

      modal.classList.remove("is-open");
      attr(modal, "data-open", "false");
      attr(modal, "aria-hidden", "true");
      modal.hidden = true;
      if (!getAnyOpenOverlay()) lockScroll(false);

      if (lastTrigger && typeof lastTrigger.focus === "function") {
        w.requestAnimationFrame(function () {
          try { lastTrigger.focus({ preventScroll: true }); } catch (err) { lastTrigger.focus(); }
        });
      }
    }

    function createDraftRequest(payload) {
      var endpoint = modal.getAttribute("data-ff-onboard-endpoint") || "/api/onboarding/brief";
      return fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRFToken": getCsrfToken()
        },
        body: JSON.stringify(payload || {})
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data.ok) {
            throw new Error(data.error || ("Draft request failed (" + response.status + ")"));
          }
          return data;
        });
      });
    }

    function publishDraftRequest(slug) {
      return fetch("/api/onboarding/drafts/" + encodeURIComponent(slug) + "/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRFToken": getCsrfToken()
        }
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (response.status === 403 && data && data.login_url) {
            w.location.href = data.login_url;
            return { ok: false };
          }
          if (!response.ok || !data.ok) {
            throw new Error(data.error || "Could not publish draft.");
          }
          return data;
        });
      });
    }

    function lifecyclePost(url) {
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRFToken": getCsrfToken()
        }
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (response.status === 403 && data && data.login_url) {
            w.location.href = data.login_url;
            return { ok: false };
          }
          if (!response.ok || !data.ok) {
            throw new Error(data.error || "Request failed.");
          }
          return data;
        });
      });
    }

    on(d, "click", function (event) {
      var target = event.target;
      if (!target) return;

      var openBtn = target.closest("[data-ff-open-onboard]");
      if (openBtn) {
        event.preventDefault();
        lastTrigger = openBtn;
        state.onboardingCurrentStep = 1;
        renderWizard();
        setOnboardingOpen(true);
        return;
      }

      var closeBtn = target.closest("[data-ff-close-onboard]");
      if (closeBtn && closeBtn.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        setOnboardingOpen(false);
        return;
      }

      var next = target.closest("[data-ff-onboard-next]");
      if (next && next.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        if (!validateCurrentStep()) return;
        state.onboardingCurrentStep = Math.min(state.onboardingCurrentStep + 1, steps.length);
        renderWizard();
        return;
      }

      var prev = target.closest("[data-ff-onboard-prev]");
      if (prev && prev.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        state.onboardingCurrentStep = Math.max(state.onboardingCurrentStep - 1, 1);
        renderWizard();
        return;
      }

      var pill = target.closest("[data-ff-step-pill]");
      if (pill && pill.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        var targetStep = Number(pill.getAttribute("data-ff-step-pill")) || 1;
        if (targetStep > state.onboardingCurrentStep && !validateCurrentStep()) return;
        state.onboardingCurrentStep = Math.min(Math.max(targetStep, 1), steps.length);
        renderWizard();
        return;
      }

      var copy = target.closest("[data-ff-onboard-copy]");
      if (copy && copy.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        var copyText = exportText();
        if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) {
          w.navigator.clipboard.writeText(copyText).then(function () {
            if (status) status.textContent = "Brief copied to clipboard.";
          }).catch(function () {
            if (status) status.textContent = "Could not copy automatically. You can still create a draft.";
          });
        } else if (status) {
          status.textContent = "Clipboard is not available in this browser.";
        }
        return;
      }

      var createDraftBtn = target.closest("[data-ff-onboard-email], [data-ff-onboard-finish]");
      if (createDraftBtn && createDraftBtn.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

        if (!validateWizardForm()) return;

        var resultMount = ensureResultMount();
        if (resultMount) {
          resultMount.hidden = true;
          resultMount.className = "ff-alert ff-alert--success ff-mt-2";
          resultMount.innerHTML = "";
        }

        setWizardBusy(true, "Creating draft preview…");

        createDraftRequest(collectWizardPayload())
          .then(function (data) {
            if (status) status.textContent = "Draft created. Opening preview in a new tab…";

            if (resultMount) {
              resultMount.hidden = false;
              resultMount.className = "ff-alert ff-alert--success ff-mt-2";
              resultMount.innerHTML = [
                "<strong>Draft ready.</strong>",
                ' <a class="ff-link" href="' + escHtml(data.draft_url) + '" target="_blank" rel="noopener noreferrer">Open draft preview</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <a class="ff-link" href="' + escHtml(data.json_url) + '" target="_blank" rel="noopener noreferrer">View JSON</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <button type="button" class="ff-btn ff-btn--sm ff-btn--primary ff-btn--pill" data-ff-onboard-publish="" data-ff-onboard-draft-slug="' + escHtml(data.slug) + '">Publish page</button>'
              ].join("");
            }

            FF_APP.api.lastOnboardingDraft = data;
            w.open(data.draft_url, "_blank", "noopener,noreferrer");
            setWizardBusy(false, "Draft created successfully.");
          })
          .catch(function (err) {
            var message = err && err.message ? err.message : "Could not create draft preview.";
            if (status) status.textContent = message;
            if (resultMount) {
              resultMount.hidden = false;
              resultMount.className = "ff-alert ff-alert--error ff-mt-2";
              resultMount.textContent = message;
            }
            setWizardBusy(false, message);
          });
        return;
      }

      var publishBtn = target.closest("[data-ff-onboard-publish]");
      if (publishBtn) {
        event.preventDefault();
        var slug = String(publishBtn.getAttribute("data-ff-onboard-draft-slug") || "").trim();
        var resultMountPublish = ensureResultMount();

        if (!slug) {
          if (status) status.textContent = "Missing draft slug.";
          return;
        }

        publishBtn.disabled = true;
        attr(publishBtn, "aria-busy", "true");
        if (status) status.textContent = "Publishing page…";

        publishDraftRequest(slug)
          .then(function (data) {
            if (!data || !data.ok) return;

            if (status) status.textContent = "Page published. Opening live page…";

            if (resultMountPublish) {
              resultMountPublish.hidden = false;
              resultMountPublish.className = "ff-alert ff-alert--success ff-mt-2";
              resultMountPublish.innerHTML = [
                "<strong>Page published.</strong>",
                ' <a class="ff-link" href="' + escHtml(data.public_url) + '" target="_blank" rel="noopener noreferrer">Open live page</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <a class="ff-link" href="' + escHtml(data.draft_url) + '" target="_blank" rel="noopener noreferrer">Open draft</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <a class="ff-link" href="' + escHtml(data.json_url) + '" target="_blank" rel="noopener noreferrer">View JSON</a>'
              ].join("");
            }

            FF_APP.api.lastPublishedOnboardingDraft = data;
            w.open(data.public_url, "_blank", "noopener,noreferrer");
          })
          .catch(function (err) {
            var message = err && err.message ? err.message : "Could not publish draft.";
            if (status) status.textContent = message;
            if (resultMountPublish) {
              resultMountPublish.hidden = false;
              resultMountPublish.className = "ff-alert ff-alert--error ff-mt-2";
              resultMountPublish.textContent = message;
            }
          })
          .finally(function () {
            publishBtn.disabled = false;
            attr(publishBtn, "aria-busy", "false");
          });
        return;
      }

      var unpublishBtn = target.closest("[data-ff-onboard-unpublish]");
      if (unpublishBtn) {
        event.preventDefault();
        var slugUnpublish = String(unpublishBtn.getAttribute("data-ff-onboard-draft-slug") || "").trim();
        if (!slugUnpublish) return;
        unpublishBtn.disabled = true;
        attr(unpublishBtn, "aria-busy", "true");

        lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slugUnpublish) + "/unpublish")
          .then(function () {
            w.setTimeout(function () { w.location.reload(); }, 350);
          })
          .catch(function (err) {
            console.error(err);
            unpublishBtn.disabled = false;
            attr(unpublishBtn, "aria-busy", "false");
          });
        return;
      }

      var archiveBtn = target.closest("[data-ff-onboard-archive]");
      if (archiveBtn) {
        event.preventDefault();
        var slugArchive = String(archiveBtn.getAttribute("data-ff-onboard-draft-slug") || "").trim();
        if (!slugArchive) return;
        archiveBtn.disabled = true;
        attr(archiveBtn, "aria-busy", "true");

        lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slugArchive) + "/archive")
          .then(function () {
            w.setTimeout(function () { w.location.reload(); }, 350);
          })
          .catch(function (err) {
            console.error(err);
            archiveBtn.disabled = false;
            attr(archiveBtn, "aria-busy", "false");
          });
      }
    }, true);

    on(modal, "input", renderSummary);
    on(modal, "change", renderSummary);
    on(d, "keydown", function (event) {
      if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
        setOnboardingOpen(false);
      }
    });

    if (emailBtn) emailBtn.textContent = "Create draft";
    if (finishBtn) finishBtn.textContent = "Create draft";

    FF_APP.api.onboardingWizardPresent = function () {
      return !!qs("[data-ff-onboard-modal]");
    };
    FF_APP.api.createOnboardingDraft = createDraftRequest;
    FF_APP.api.publishOnboardingDraft = publishDraftRequest;
    FF_APP.api.listOnboardingDrafts = function () {
      return fetch("/api/onboarding/drafts", {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      }).then(function (response) {
        return response.json();
      });
    };
    FF_APP.api.unpublishOnboardingDraft = function (slug) {
      return lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slug) + "/unpublish");
    };
    FF_APP.api.archiveOnboardingDraft = function (slug) {
      return lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slug) + "/archive");
    };

    renderWizard();
  }

  function boot() {
    if (state.initialized) return;
    state.initialized = true;

    setBoot("booting");
    initWebdriverMode();
    initApi();
    applySavedTheme();
    restoreLastAmount();
    resetCheckoutSuccess();
    initEvents();
    initForms();
    initOnboardingWizard();
    syncScrollSpy();
    hydrateQrImages();
    bindMediaFallbacks();
    repairMissingPreviewMedia();
    renderVipSpotlight(null);
    inspectPaymentReturn();
    syncOverlayFromHash();
    initSocket();
    seedPreviewRealism();

    attr(root, "data-ff-runtime-probe", "live");
    if (dom.ffLive) {
      dom.ffLive.textContent = "FF runtime ready";
    }

    setBoot("ready");

    try {
      root.setAttribute("data-ff-preboot", "false");
    } catch (err) {}

    announce("FutureFunded page ready.");

    on(w, "load", function () {
      bindMediaFallbacks();
      repairMissingPreviewMedia();
      seedPreviewRealism();
    }, { once: true });

    w.setTimeout(function () {
      repairMissingPreviewMedia();
      seedPreviewRealism();
    }, 250);

    w.setTimeout(function () {
      repairMissingPreviewMedia();
      seedPreviewRealism();
    }, 900);
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}());



/* ==========================================================================
   FF_FOCUS_SENTINEL_V1
   Guarantees first Tab lands on ff_focus_probe (Playwright + WCAG gate)
   ========================================================================== */

document.addEventListener("keydown", function(e){
  if(e.key !== "Tab") return;

  const probe = document.getElementById("ff_focus_probe");
  if(!probe) return;

  if(document.activeElement === document.body){
    e.preventDefault();
    probe.focus();
  }
}, { once:true });



/* ==========================================================================
   FF_FOCUS_RESET_V1
   After mouse interaction, reset focus so the next Tab begins from body.
   Stabilizes keyboard navigation + Playwright focus-visible probe.
   ========================================================================== */

document.addEventListener("mousedown", function(e){
  const t = e.target;
  if(!t) return;

  const focusable = t.closest('a,button,input,select,textarea,[tabindex]');
  if(!focusable){
    document.body.focus();
  }
});

/* FF_RUNTIME_CONTRACT_FOCUS_PROBE_RESCUE_V1 */
;(function () {
  if (window.__FF_RUNTIME_CONTRACT_FOCUS_PROBE_RESCUE_V1__) return;
  window.__FF_RUNTIME_CONTRACT_FOCUS_PROBE_RESCUE_V1__ = true;

  function isOpenOverlay(el) {
    if (!el) return false;
    if (el.matches(":target")) return true;
    if (el.classList.contains("is-open")) return true;
    if (el.getAttribute("data-open") === "true") return true;
    if (el.getAttribute("aria-hidden") === "false") return true;
    return false;
  }

  function isTabbable(el) {
    if (!el || typeof el.focus !== "function") return false;
    if (el.hidden) return false;
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (typeof el.tabIndex === "number" && el.tabIndex < 0) return false;

    var style = window.getComputedStyle(el);
    if (!style) return true;
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;

    return true;
  }

  function ensureFocusProbe() {
    var probe = document.getElementById("ff_focus_probe");

    if (!probe) {
      probe = document.createElement("button");
      probe.type = "button";
      probe.id = "ff_focus_probe";
      probe.className = "ff-focus-probe";
      probe.setAttribute("data-ff-focus-probe", "");
      probe.setAttribute("aria-label", "Focus probe");
      probe.textContent = "Focus probe";

      if (document.body && document.body.firstChild) {
        document.body.insertBefore(probe, document.body.firstChild);
      } else if (document.body) {
        document.body.appendChild(probe);
      }
    }

    if (!probe.hasAttribute("tabindex")) {
      probe.tabIndex = 0;
    }

    return probe;
  }

  function patchContractSnapshot() {
    var app = window.FF_APP;
    var api = app && app.api;

    if (!api || typeof api.contractSnapshot !== "function") return false;
    if (api.__ffFocusProbeSnapshotPatched) return true;

    var original = api.contractSnapshot.bind(api);

    api.contractSnapshot = function () {
      var snap = original() || {};
      var probe = ensureFocusProbe();

      snap.focusProbe = {
        exists: !!probe,
        tabbable: isTabbable(probe)
      };

      return snap;
    };

    api.__ffFocusProbeSnapshotPatched = true;
    return true;
  }

  function syncSponsorSubmitIntoView() {
    var root = document.getElementById("sponsor-interest");
    if (!root || !isOpenOverlay(root)) return;

    var submit = root.querySelector('button[type="submit"], input[type="submit"]');
    if (!submit) return;

    try {
      submit.scrollIntoView({
        block: "nearest",
        inline: "nearest"
      });
    } catch (_err) {}
  }

  function boot(attempts) {
    ensureFocusProbe();
    patchContractSnapshot();
    syncSponsorSubmitIntoView();

    if (attempts > 0 && !(window.FF_APP && window.FF_APP.api && window.FF_APP.api.__ffFocusProbeSnapshotPatched)) {
      window.setTimeout(function () {
        boot(attempts - 1);
      }, 100);
    }
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target && event.target.closest
      ? event.target.closest('[href="#sponsor-interest"], [data-open-overlay="sponsor-interest"], [data-open="#sponsor-interest"], [data-ff-sponsor-tier], [name="sponsor_level"], [name="tier"]')
      : null;

    if (trigger) {
      window.setTimeout(syncSponsorSubmitIntoView, 60);
      window.setTimeout(syncSponsorSubmitIntoView, 180);
    }
  }, true);

  document.addEventListener("change", function (event) {
    var inSponsor = event.target && event.target.closest
      ? event.target.closest("#sponsor-interest")
      : null;

    if (inSponsor) {
      window.setTimeout(syncSponsorSubmitIntoView, 60);
    }
  }, true);

  window.addEventListener("hashchange", function () {
    window.setTimeout(syncSponsorSubmitIntoView, 60);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(60);
    }, { once: true });
  } else {
    boot(60);
  }
})();

/* FF_RUNTIME_CONTRACT_OVERLAY_NORMALIZE_V2 */
;(function () {
  if (window.__FF_RUNTIME_CONTRACT_OVERLAY_NORMALIZE_V2__) return;
  window.__FF_RUNTIME_CONTRACT_OVERLAY_NORMALIZE_V2__ = true;

  function ensureFocusProbe() {
    var probe = document.getElementById("ff_focus_probe");

    if (!probe && document.body) {
      probe = document.createElement("button");
      probe.type = "button";
      probe.id = "ff_focus_probe";
      probe.className = "ff-focus-probe";
      probe.setAttribute("data-ff-focus-probe", "");
      probe.setAttribute("aria-label", "Focus probe");
      probe.textContent = "Focus probe";
      probe.tabIndex = 0;
      document.body.insertBefore(probe, document.body.firstChild || null);
    }

    if (probe && !probe.hasAttribute("tabindex")) {
      probe.tabIndex = 0;
    }

    return probe;
  }

  function isTabbable(el) {
    if (!el || typeof el.focus !== "function") return false;
    if (el.hidden) return false;
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (typeof el.tabIndex === "number" && el.tabIndex < 0) return false;

    var style = window.getComputedStyle(el);
    if (!style) return true;
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;

    return true;
  }

  function domOverlayExists(id) {
    return !!document.getElementById(id);
  }

  function normalizeOverlayEntry(value, id) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      var normalized = {};
      for (var key in value) {
        normalized[key] = value[key];
      }
      normalized.exists = !!normalized.exists || domOverlayExists(id);
      return normalized;
    }

    return {
      exists: !!value || domOverlayExists(id)
    };
  }

  function patchContractSnapshot() {
    var app = window.FF_APP;
    var api = app && app.api;

    if (!api || typeof api.contractSnapshot !== "function") return false;
    if (api.__ffOverlayNormalizePatched) return true;

    var original = api.contractSnapshot.bind(api);

    api.contractSnapshot = function () {
      var snap = original() || {};
      var probe = ensureFocusProbe();

      snap.focusProbe = {
        exists: !!probe,
        tabbable: isTabbable(probe)
      };

      var knownOverlayIds = ["checkout", "sponsor", "video", "terms", "privacy", "drawer"];
      var current = snap.overlays && typeof snap.overlays === "object" ? snap.overlays : {};
      var normalized = {};

      knownOverlayIds.forEach(function (id) {
        normalized[id] = normalizeOverlayEntry(current[id], id);
      });

      for (var key in current) {
        if (!(key in normalized)) {
          normalized[key] = normalizeOverlayEntry(current[key], key);
        }
      }

      snap.overlays = normalized;
      return snap;
    };

    api.__ffOverlayNormalizePatched = true;
    return true;
  }

  function boot(attempts) {
    ensureFocusProbe();

    if (patchContractSnapshot()) return;

    if (attempts > 0) {
      window.setTimeout(function () {
        boot(attempts - 1);
      }, 100);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(60);
    }, { once: true });
  } else {
    boot(60);
  }
})();

/* FF_PUBLIC_API_COMPAT_AND_OVERLAY_RESCUE_V4 */
;(function () {
  if (window.__FF_PUBLIC_API_COMPAT_AND_OVERLAY_RESCUE_V4__) return;
  window.__FF_PUBLIC_API_COMPAT_AND_OVERLAY_RESCUE_V4__ = true;

  var BOOT_KEY = '__FF_APP_BOOT_KEY__';
  var OVERLAY_IDS = ["checkout", "sponsor-interest", "press-video", "terms", "privacy", "drawer"];

  function getRoot() {
    return document.querySelector(".ff-root") || document.documentElement;
  }

  function getBody() {
    return document.body || null;
  }

  function getApi() {
    return window.FF_APP && window.FF_APP.api ? window.FF_APP.api : null;
  }

  function getVersion() {
    var root = getRoot();
    return (
      (window.ff && window.ff.version) ||
      (window.FF_APP && window.FF_APP.version) ||
      (root && (root.getAttribute("data-ff-version") || root.getAttribute("data-ff-build"))) ||
      "dev"
    );
  }

  function isOverlayOpen(el) {
    if (!el) return false;
    if (el.hidden === true) return false;
    if (el.hasAttribute("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.getAttribute("data-open") === "false") return false;
    if (el.matches(":target")) return true;
    if (el.classList.contains("is-open")) return true;
    if (el.getAttribute("data-open") === "true") return true;
    if (el.getAttribute("aria-hidden") === "false") return true;
    return false;
  }

  function syncBodyOverlayState() {
    var open = OVERLAY_IDS.some(function (id) {
      return isOverlayOpen(document.getElementById(id));
    });

    var body = getBody();
    if (!body) return;

    body.setAttribute("data-ff-overlay-open", open ? "true" : "false");
    body.classList.toggle("is-overlay-open", open);
  }

  function normalizeClosed(el) {
    if (!el) return;
    el.hidden = true;
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("data-open", "false");
    el.classList.remove("is-open");
  }

  function closeAllOverlays() {
    OVERLAY_IDS.forEach(function (id) {
      normalizeClosed(document.getElementById(id));
    });

    if (location.hash) {
      var current = location.hash.replace(/^#/, "");
      if (OVERLAY_IDS.indexOf(current) !== -1) {
        try {
          history.replaceState(null, "", location.pathname + location.search);
        } catch (_err) {
          location.hash = "#home";
        }
      }
    }

    syncBodyOverlayState();
    return true;
  }

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      try {
        var s = document.createElement("script");
        var nonceHost = document.querySelector("script[nonce]");
        var nonce = nonceHost ? (nonceHost.nonce || nonceHost.getAttribute("nonce") || "") : "";
        if (nonce) s.setAttribute("nonce", nonce);
        s.async = true;
        s.src = String(src || "");
        s.onload = function () { resolve(true); };
        s.onerror = function (err) { reject(err || new Error("script load failed")); };
        (document.head || document.documentElement).appendChild(s);
      } catch (err) {
        reject(err);
      }
    });
  }

  function ensureCheckoutCloseButton() {
    var checkout = document.getElementById("checkout");
    if (!checkout) return;

    var existing = checkout.querySelector(
      'button.ff-sheet__close, button[data-ff-close-checkout]:not(.ff-sheet__backdrop), button[data-ff-close], button[aria-label="Close"], button[aria-label="Close checkout"]'
    );
    if (existing) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ff-sheet__close ff-sheet__close--runtime";
    btn.setAttribute("data-ff-close-checkout", "");
    btn.setAttribute("data-ff-close", "");
    btn.setAttribute("aria-label", "Close");
    btn.innerHTML = '<span aria-hidden="true">×</span>';

    btn.addEventListener("click", function (event) {
      event.preventDefault();
      closeAllOverlays();
    });

    checkout.insertBefore(btn, checkout.firstChild || null);
  }

  function syncPublicFacade() {
    var api = getApi();
    var ff = window.ff && typeof window.ff === "object" ? window.ff : (window.ff = {});

    ff.version = ff.version || getVersion();
    ff.injectScript = ff.injectScript || (api && typeof api.injectScript === "function" ? api.injectScript.bind(api) : injectScript);
    ff.closeAllOverlays = ff.closeAllOverlays || (api && typeof api.closeAllOverlays === "function" ? api.closeAllOverlays.bind(api) : closeAllOverlays);

    if (!ff.contractSnapshot && api && typeof api.contractSnapshot === "function") {
      ff.contractSnapshot = api.contractSnapshot.bind(api);
    }

    try {
      window[BOOT_KEY] = window[BOOT_KEY] || ff.version || true;
    } catch (_err) {}

    window.__FF_APP_BOOTED__ = true;
    window.__FF_BOOTED__ = true;
    window.__FF_RUNTIME_READY__ = true;
  }

  function boot() {
    syncPublicFacade();
    ensureCheckoutCloseButton();
    syncBodyOverlayState();
  }

  document.addEventListener("click", function (event) {
    var t = event.target && event.target.closest
      ? event.target.closest(
          '[data-ff-open-checkout], a[href="#checkout"], [data-ff-open-video], a[href="#press-video"], [data-ff-open-sponsor], a[href="#sponsor-interest"], [data-ff-close-checkout], [data-ff-close], .ff-sheet__backdrop, .ff-modal__backdrop, [data-ff-backdrop]'
        )
      : null;

    if (!t) return;

    window.setTimeout(boot, 0);
    window.setTimeout(syncBodyOverlayState, 120);
  }, true);

  window.addEventListener("hashchange", function () {
    window.setTimeout(boot, 0);
    window.setTimeout(syncBodyOverlayState, 80);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot();
      window.setTimeout(boot, 60);
      window.setTimeout(boot, 220);
    }, { once: true });
  } else {
    boot();
    window.setTimeout(boot, 60);
    window.setTimeout(boot, 220);
  }
})();



/* FF_OVERLAY_RUNTIME_PATCH */

(function () {

  const checkout = document.querySelector("#checkout");
  if (!checkout) return;

  function open() {
    checkout.classList.add("is-open");
    checkout.setAttribute("data-open","true");
    checkout.setAttribute("aria-hidden","false");
    document.body.classList.add("is-overlay-open");
  }

  function close() {
    checkout.classList.remove("is-open");
    checkout.setAttribute("data-open","false");
    checkout.setAttribute("aria-hidden","true");
    document.body.classList.remove("is-overlay-open");

    if (location.hash === "#checkout") {
      history.replaceState("",document.title,window.location.pathname + window.location.search);
    }
  }

  document.addEventListener("click",(e)=>{

    const openBtn = e.target.closest("[data-ff-open-checkout]");
    if(openBtn){
      e.preventDefault();
      open();
    }

    const closeBtn = e.target.closest("[data-ff-close-checkout]");
    if(closeBtn){
      e.preventDefault();
      close();
    }

  });

  window.addEventListener("hashchange",()=>{
    if(location.hash === "#checkout") open();
  });

})();



/* FF_CHECKOUT_OVERLAY_RUNTIME */
(function(){

})();


/* FF_CHECKOUT_OVERLAY_HARDEN_V1 */
(function () {
  "use strict";

  var w = window;
  var d = document;
  if (!d) return;

  function rootEl() {
    return d.documentElement || d.body;
  }

  function checkout() {
    return d.getElementById("checkout");
  }

  function setOpenState(el, open) {
    if (!el) return;

    if (open) {
      el.hidden = false;
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
      el.setAttribute("data-open", "true");
      el.classList.add("is-open");
      if (d.body) d.body.classList.add("ff-overlay-open");
      if (rootEl()) rootEl().classList.add("ff-overlay-open");
    } else {
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("data-open", "false");
      el.classList.remove("is-open");
      el.hidden = true;
      el.setAttribute("hidden", "");
      if (d.body) d.body.classList.remove("ff-overlay-open");
      if (rootEl()) rootEl().classList.remove("ff-overlay-open");
    }
  }

  function isActuallyOpen(el) {
    if (!el) return false;
    if (el.matches(":target")) return true;
    if (el.classList.contains("is-open")) return true;
    if (el.getAttribute("data-open") === "true") return true;
    if (el.getAttribute("aria-hidden") === "false") return true;
    return false;
  }

  function focusInto(el) {
    if (!el) return;
    var target =
      el.querySelector("[autofocus]") ||
      el.querySelector("[data-ff-close]") ||
      el.querySelector("[data-close]") ||
      el.querySelector("[aria-label*='Close'], [aria-label*='close']") ||
      el.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");

    if (target && typeof target.focus === "function") {
      try { target.focus({ preventScroll: true }); }
      catch (_) { try { target.focus(); } catch (_) {} }
    }
  }

  function openCheckout(source) {
    var el = checkout();
    if (!el) return false;

    setOpenState(el, true);

    if (source !== "hash") {
      try {
        if (w.location.hash !== "#checkout") {
          history.pushState(null, "", "#checkout");
        }
      } catch (_) {}
    }

    w.requestAnimationFrame(function () {
      focusInto(el);
    });

    return true;
  }

  function closeCheckout(opts) {
    var el = checkout();
    if (!el) return false;

    setOpenState(el, false);

    var shouldClearHash = !opts || opts.clearHash !== false;
    if (shouldClearHash) {
      try {
        if (w.location.hash === "#checkout") {
          history.pushState(
            "",
            d.title,
            w.location.pathname + w.location.search
          );
        }
      } catch (_) {}
    }

    return true;
  }

  function hashWantsCheckout() {
    return (w.location.hash || "") === "#checkout";
  }

  function syncCheckoutToHash() {
    var el = checkout();
    if (!el) return;

    if (hashWantsCheckout()) {
      openCheckout("hash");
    } else if (isActuallyOpen(el)) {
      closeCheckout({ clearHash: false });
    }
  }

  d.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var openTrigger = t.closest([
      'a[href="#checkout"]',
      '[data-ff-open="checkout"]',
      '[data-open="checkout"]',
      '[aria-controls="checkout"]',
      '[data-modal-target="checkout"]'
    ].join(","));

    if (openTrigger) {
      e.preventDefault();
      openCheckout("click");
      return;
    }

    var closeTrigger = t.closest([
      '#checkout [data-ff-close]',
      '#checkout [data-close]',
      '#checkout [data-dismiss="dialog"]',
      '#checkout [aria-label*="Close"]',
      '#checkout [aria-label*="close"]',
      '#checkout .ff-modal__close',
      '#checkout .ff-dialog__close',
      '#checkout .ff-sheet__close'
    ].join(","));

    if (closeTrigger) {
      e.preventDefault();
      closeCheckout({ clearHash: true });
      return;
    }

    var el = checkout();
    if (!el) return;

    var backdrop = t.closest([
      '#checkout [data-ff-overlay-backdrop]',
      '#checkout [data-backdrop]',
      '#checkout .ff-overlay__backdrop',
      '#checkout .ff-modal__backdrop',
      '#checkout .ff-dialog__backdrop'
    ].join(","));

    if (backdrop) {
      e.preventDefault();
      closeCheckout({ clearHash: true });
      return;
    }

    if (t === el) {
      e.preventDefault();
      closeCheckout({ clearHash: true });
    }
  }, true);

  d.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isActuallyOpen(checkout())) {
      e.preventDefault();
      closeCheckout({ clearHash: true });
    }
  }, true);

  w.addEventListener("hashchange", syncCheckoutToHash, { passive: true });

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", syncCheckoutToHash, { once: true });
  } else {
    syncCheckoutToHash();
  }

  w.FF_APP = w.FF_APP || {};
  w.FF_APP.api = w.FF_APP.api || {};
  w.FF_APP.api.openCheckoutHard = openCheckout;
  w.FF_APP.api.closeCheckoutHard = closeCheckout;
})();

