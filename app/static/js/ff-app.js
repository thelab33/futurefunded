/* ============================================================================
 * ff-app.js — FutureFunded Flagship (DROP-IN REPLACEMENT • SUPERCHARGED • DEDUPED)
 * File: app/static/js/ff-app.js
 * Version: 19.2.0 (“Reliability Canon++ — Hook-safe • CSP-safe • Single-boot • Hash No-Scroll • Provider Prewarm”)
 *
 * Non-negotiable contracts upheld:
 * - Hook-safe: binds to existing IDs/classes/data-ff-* (no renames assumed)
 * - Single-boot hard guard (no duplicate listeners even if script included twice)
 * - CSP-safe (nonce-aware dynamic scripts, no eval/new Function, no inline handlers)
 * - Defensive DOM (missing optional nodes never throw)
 * - Reduced-motion respected for any JS-initiated scrolling
 *
 * Behavior upgrades (still hook-safe):
 * - Hash updates avoid scroll-jump (history.pushState/replaceState when possible)
 * - Provider prewarm on intent (pointer/focus) without creating intents
 * - Payment intent creation gated to checkout-open (prevents backend spam)
 * - PayPal “missing client id” notice is session-once (no toast spam)
 *
 * Config compatibility:
 * - Reads #ffConfig JSON when present, else meta tags
 * - Keeps legacy endpoint key names intact (stripe_intent_endpoint, paypal_create_endpoint, paypal_capture_endpoint, etc.)
 * ============================================================================ */

(() => {
  "use strict";

  const APP = "FutureFunded Flagship";
  const VERSION = "19.2.0";

  // ---------------------------------------------------------------------------
  // Single boot guard (HARD)
  // ---------------------------------------------------------------------------
  const BOOT_KEY = "__FF_APP_BOOT__";
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = { at: Date.now(), app: APP, v: VERSION };

  // ---------------------------------------------------------------------------
  // Tiny utilities (CSP-safe)
  // ---------------------------------------------------------------------------
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

  const safeJson = (txt, fallback = null) => {
    try {
      return JSON.parse(String(txt ?? ""));
    } catch {
      return fallback;
    }
  };

  const cssEscape = (s) => {
    const v = String(s ?? "");
    try {
      if (window.CSS?.escape) return window.CSS.escape(v);
    } catch {}
    return v.replace(/["\\]/g, "\\$&");
  };

  const $ = (sel, root = document) => {
    try {
      return (root || document).querySelector(sel);
    } catch {
      return null;
    }
  };

  const $$ = (sel, root = document) => {
    try {
      return Array.from((root || document).querySelectorAll(sel));
    } catch {
      return [];
    }
  };

  const on = (el, ev, fn, opts) => {
    try {
      el?.addEventListener?.(ev, fn, opts || false);
    } catch {}
  };

  const meta = (name) => {
    try {
      const el = document.querySelector(`meta[name="${cssEscape(name)}"]`);
      return (el?.getAttribute("content") || "").trim();
    } catch {
      return "";
    }
  };

  const metaAny = (...names) => {
    for (const n of names) {
      const v = meta(n);
      if (v) return v;
    }
    return "";
  };

  const prefersReducedMotion = () => {
    try {
      return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      return false;
    }
  };

  const fetchWithTimeout = async (url, opts = {}, timeoutMs = 15000) => {
    const ctrl = new AbortController();
    const callerSignal = opts?.signal;

    try {
      if (callerSignal?.addEventListener) {
        if (callerSignal.aborted) ctrl.abort();
        else callerSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
      }
    } catch {}

    const t = setTimeout(() => {
      try {
        ctrl.abort();
      } catch {}
    }, clamp(Number(timeoutMs) || 15000, 1000, 60000));

    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const safeFetchJson = async (url, opts = {}, timeoutMs = 15000) => {
    try {
      const r = await fetchWithTimeout(url, opts, timeoutMs);
      const j = await r.json().catch(() => ({}));
      return { ok: !!r.ok, status: r.status, json: j, res: r };
    } catch (e) {
      return { ok: false, status: 0, json: {}, error: e };
    }
  };

  // ---------------------------------------------------------------------------
  // Money + validation
  // ---------------------------------------------------------------------------
  const MIN_CENTS = 100; // $1.00 minimum
  const MAX_CENTS = 5_000_000; // $50,000 max (sane ceiling)

  const parseMoneyToCents = (val) => {
    const raw = String(val ?? "").trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
    if (!cleaned) return 0;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  };

  const centsToDollarsString = (cents) => {
    const c = Number(cents || 0);
    if (!Number.isFinite(c) || c <= 0) return "";
    const d = c / 100;
    return String(d % 1 === 0 ? Math.round(d) : d.toFixed(2));
  };

  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  const formatMoney = (cents, currency = "USD", locale = "en-US") => {
    const c = Number(cents || 0);
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(c / 100);
    } catch {
      return `$${(c / 100).toFixed(2)}`;
    }
  };

  // ---------------------------------------------------------------------------
  // Hash (no-scroll updates when possible)
  // ---------------------------------------------------------------------------
  const Hash = (() => {
    const set = (hash, { replace = false } = {}) => {
      const h = String(hash || "").trim();
      if (!h) return;

      try {
        if (location.hash === h) return;
      } catch {}

      const url = (() => {
        try {
          const u = new URL(location.href);
          u.hash = h.startsWith("#") ? h : `#${h}`;
          return u.toString();
        } catch {
          return h.startsWith("#") ? h : `#${h}`;
        }
      })();

      try {
        if (replace) history.replaceState(null, "", url);
        else history.pushState(null, "", url);
        return;
      } catch {}

      try {
        location.hash = h.startsWith("#") ? h : `#${h}`;
      } catch {}
    };

    const clear = ({ replace = true } = {}) => {
      try {
        const u = new URL(location.href);
        u.hash = "";
        if (replace) history.replaceState(null, "", u.toString());
        else history.pushState(null, "", u.toString());
      } catch {
        try {
          if (replace) history.replaceState(null, "", `${location.pathname}${location.search || ""}`);
          else history.pushState(null, "", `${location.pathname}${location.search || ""}`);
        } catch {}
      }
    };

    return { set, clear };
  })();

  // ---------------------------------------------------------------------------
  // CSP nonce + safe dynamic script loader (single-flight)
  // ---------------------------------------------------------------------------
  const CSP = (() => {
    const findNonce = () => {
      try {
        const m = metaAny("csp-nonce", "ff-csp-nonce");
        if (m) return m;

        const cs = document.currentScript;
        const n1 = cs?.nonce || cs?.getAttribute?.("nonce") || "";
        if (n1) return n1;

        const tag = $$("script[src]").find((s) => (s.getAttribute("src") || "").includes("ff-app"));
        const n2 = tag?.nonce || tag?.getAttribute?.("nonce") || "";
        return n2 || "";
      } catch {
        return "";
      }
    };
    return { nonce: () => String(findNonce() || "").trim() };
  })();

  const loadScriptOnce = (src, { id = "", nonce = "", attrs = {} } = {}) => {
    const key = id || src;
    if (!key || !src) return Promise.reject(new Error("Missing script src"));

    window.__FF_SCRIPT_PROMISES__ = window.__FF_SCRIPT_PROMISES__ || {};
    if (window.__FF_SCRIPT_PROMISES__[key]) return window.__FF_SCRIPT_PROMISES__[key];

    const existing = id ? document.getElementById(id) : $$("script").find((s) => (s.src || "") === src);
    if (existing) {
      const already = existing.getAttribute("data-ff-loaded") === "1" || existing.dataset?.ffLoaded === "1";
      if (already) return Promise.resolve(existing);

      window.__FF_SCRIPT_PROMISES__[key] = new Promise((resolve, reject) => {
        try {
          existing.addEventListener("load", () => resolve(existing), { once: true });
          existing.addEventListener("error", () => reject(new Error(`Script failed: ${src}`)), { once: true });
        } catch (e) {
          reject(e);
        }
      });
      return window.__FF_SCRIPT_PROMISES__[key];
    }

    window.__FF_SCRIPT_PROMISES__[key] = new Promise((resolve, reject) => {
      try {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        if (id) s.id = id;

        const n = String(nonce || CSP.nonce() || "").trim();
        if (n) s.setAttribute("nonce", n);

        try {
          Object.entries(attrs || {}).forEach(([k, v]) => {
            if (v === true) s.setAttribute(k, "");
            else if (v != null && v !== false) s.setAttribute(k, String(v));
          });
        } catch {}

        s.onload = () => {
          try {
            s.setAttribute("data-ff-loaded", "1");
          } catch {}
          resolve(s);
        };
        s.onerror = () => reject(new Error(`Script failed: ${src}`));

        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });

    return window.__FF_SCRIPT_PROMISES__[key];
  };

  // ---------------------------------------------------------------------------
  // Analytics (safe, zero-network by default unless endpoint already exists)
  // ---------------------------------------------------------------------------
  const Analytics = (() => {
    const ENDPOINT = meta("ff-analytics-endpoint") || "";
    const DEBUG = (() => {
      const d = (meta("ff-debug") || "").toLowerCase();
      if (["1", "true", "yes"].includes(d)) return true;
      const host = String(location.hostname || "").toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
    })();

    const base = () => ({
      ts: (() => {
        try {
          return new Date().toISOString();
        } catch {
          return String(Date.now());
        }
      })(),
      app: APP,
      v: VERSION,
      path: String(location.pathname || ""),
      host: String(location.host || ""),
    });

    const queue = [];
    let flushing = false;
    let flushTimer = 0;

    const scheduleFlush = () => {
      if (!ENDPOINT) return;
      if (flushing) return;
      clearTimeout(flushTimer);
      flushTimer = setTimeout(async () => {
        if (!queue.length || flushing) return;
        flushing = true;
        const batch = queue.splice(0, 25);
        try {
          await fetchWithTimeout(
            ENDPOINT,
            {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ events: batch }),
              keepalive: true,
            },
            6000
          ).catch(() => null);
        } catch {}
        finally {
          flushing = false;
        }
      }, 650);
    };

    const emit = (eventName, payload = {}) => {
      if (!eventName) return;
      const detail = { name: String(eventName), ...base(), ...(isObj(payload) ? payload : {}) };

      try {
        window.dispatchEvent(new CustomEvent("ff:event", { detail }));
      } catch {}

      if (ENDPOINT) {
        queue.push(detail);
        scheduleFlush();
      }

      if (DEBUG) {
        try {
          console.debug("[FF]", eventName, payload);
        } catch {}
      }
    };

    return { emit };
  })();

  // ---------------------------------------------------------------------------
  // Selectors overrides (#ffSelectors JSON)
  // ---------------------------------------------------------------------------
  const Selectors = (() => {
    const readSelectors = () => {
      try {
        const el = document.getElementById("ffSelectors");
        if (el && String(el.type || "").includes("json")) {
          const j = safeJson(el.textContent || "", null);
          if (j && typeof j === "object") return j;
        }
      } catch {}
      return {};
    };

    const overrides = readSelectors();

    const merge = (key, fallback) => {
      const o = overrides?.[key];
      if (typeof o === "string" && o.trim()) return o.trim();
      if (Array.isArray(o) && o.length) return o.filter(Boolean).join(",");
      return String(fallback || "").trim();
    };

    return { merge };
  })();

  // ---------------------------------------------------------------------------
  // Config loader + normalization (keeps legacy key names)
  // ---------------------------------------------------------------------------
  const Config = (() => {
    const readConfigJson = () => {
      try {
        const el = document.getElementById("ffConfig");
        if (!el) return null;
        const raw = String(el.textContent || "").trim();
        if (!raw) return null;
        const j = safeJson(raw, null);
        return j && typeof j === "object" ? j : null;
      } catch {
        return null;
      }
    };

    // raw config (public for debugging)
    const raw = readConfigJson() || {};
    window.__FF_CONFIG__ = raw;

    const sanitizeClientId = (cid) => {
      const v = String(cid || "").trim();
      if (!v) return "";
      const low = v.toLowerCase();
      if (low === "none" || low === "null" || low === "undefined") return "";
      return v;
    };

    const normalize = () => {
      const c = raw || {};

      // legacy keys (root-level)
      const stripe_intent_endpoint = String(
        c.stripe_intent_endpoint ||
          c?.payments?.stripe?.intent_endpoint ||
          c?.stripe?.intent_endpoint ||
          metaAny("ff-stripe-intent-endpoint", "ff-stripe-intent-url") ||
          "/payments/stripe/intent"
      ).trim();

      const paypal_create_endpoint = String(
        c.paypal_create_endpoint ||
          c?.payments?.paypal?.create_endpoint ||
          c?.paypal?.create_endpoint ||
          metaAny("ff-paypal-create-endpoint") ||
          "/payments/paypal/order"
      ).trim();

      const paypal_capture_endpoint = String(
        c.paypal_capture_endpoint ||
          c?.payments?.paypal?.capture_endpoint ||
          c?.paypal?.capture_endpoint ||
          metaAny("ff-paypal-capture-endpoint") ||
          "/payments/paypal/capture"
      ).trim();

      const stripe_pk = String(
        c.stripe_pk ||
          c?.payments?.stripe?.publishable_key ||
          c?.stripe?.publishable_key ||
          metaAny("ff-stripe-pk", "ff:stripe-pk", "ff-stripe-publishable-key") ||
          ""
      ).trim();

      const paypal_client_id = sanitizeClientId(
        c.paypal_client_id ||
          c?.payments?.paypal?.client_id ||
          c?.paypal?.client_id ||
          metaAny("ff-paypal-client-id", "ff-paypal-clientid") ||
          ""
      );

      const env = String(c.env || c?.flagship?.env || metaAny("ff-env") || "").trim();

      const currency = String(
        c?.flagship?.defaults?.currency ||
          c?.defaults?.currency ||
          metaAny("ff-currency", "ff-paypal-currency") ||
          "USD"
      ).trim();

      const locale = String(
        c?.flagship?.defaults?.locale || c?.defaults?.locale || metaAny("ff-locale") || "en-US"
      ).trim();

      const stripe_return_url = String(
        c.stripe_return_url ||
          c?.payments?.stripe?.return_url ||
          c?.stripe?.return_url ||
          metaAny("ff-stripe-return-url", "ff-canonical") ||
          `${location.origin}${location.pathname}${location.search || ""}`
      ).trim();

      const paypal_currency = String(
        c.paypal_currency ||
          c?.payments?.paypal?.currency ||
          c?.paypal?.currency ||
          metaAny("ff-paypal-currency") ||
          currency ||
          "USD"
      ).trim();

      const paypal_intent = String(
        c.paypal_intent ||
          c?.payments?.paypal?.intent ||
          c?.paypal?.intent ||
          metaAny("ff-paypal-intent") ||
          "capture"
      ).trim();

      const sponsor_endpoint = String(
        c?.sponsor?.endpoint ||
          c?.sponsors?.endpoint ||
          c?.sponsor_endpoint ||
          metaAny("ff-sponsor-endpoint") ||
          ""
      ).trim();

      const csrf_token = String(metaAny("csrf-token", "ff-csrf", "x-csrf-token") || "").trim();

      const require_email = (() => {
        const v0 = c.require_email ?? c?.flagship?.require_email ?? c?.payments?.require_email;
        if (typeof v0 === "boolean") return v0;
        const v = String(metaAny("ff-require-email", "ff-email-required") || "").toLowerCase();
        if (["0", "false", "no"].includes(v)) return false;
        if (["1", "true", "yes"].includes(v)) return true;
        return true; // default: require email for receipts
      })();

      return Object.freeze({
        env,
        currency,
        locale,
        csrf_token,

        // legacy keys kept verbatim
        stripe_intent_endpoint,
        paypal_create_endpoint,
        paypal_capture_endpoint,

        // providers
        stripe_pk,
        stripe_return_url,
        paypal_client_id,
        paypal_currency,
        paypal_intent,

        // misc
        sponsor_endpoint,

        // derived helpers
        providers: {
          stripe: { pk: stripe_pk, intent_endpoint: stripe_intent_endpoint, return_url: stripe_return_url },
          paypal: {
            client_id: paypal_client_id,
            currency: paypal_currency,
            intent: paypal_intent,
            create_endpoint: paypal_create_endpoint,
            capture_endpoint: paypal_capture_endpoint,
          },
        },

        require_email,
      });
    };

    const data = normalize();

    // getters (stable)
    const currency = () => data.currency;
    const locale = () => data.locale;
    const csrfToken = () => data.csrf_token;
    const requireEmail = () => !!data.require_email;

    // legacy key getters
    const stripeIntentEndpoint = () => String(data.stripe_intent_endpoint || "").trim();
    const paypalCreateEndpoint = () => String(data.paypal_create_endpoint || "").trim();
    const paypalCaptureEndpoint = () => String(data.paypal_capture_endpoint || "").trim();

    const sponsorEndpoint = () => String(data.sponsor_endpoint || "").trim();

    const stripePk = () => String(data.stripe_pk || "").trim();
    const stripeReturnUrl = () => String(data.stripe_return_url || "").trim();

    const paypalClientId = () => String(data.paypal_client_id || "").trim();
    const paypalCurrency = () => String(data.paypal_currency || "").trim();
    const paypalIntent = () => String(data.paypal_intent || "").trim();

    return {
      raw,
      data,
      currency,
      locale,
      csrfToken,
      requireEmail,

      stripeIntentEndpoint,
      paypalCreateEndpoint,
      paypalCaptureEndpoint,

      sponsorEndpoint,

      stripePk,
      stripeReturnUrl,

      paypalClientId,
      paypalCurrency,
      paypalIntent,
    };
  })();

  // ---------------------------------------------------------------------------
  // DOM access (contract defaults + optional selector overrides)
  // ---------------------------------------------------------------------------
  const DOM = (() => {
    const q = (key, fallback) => $(Selectors.merge(key, fallback));
    const qa = (key, fallback) => $$(Selectors.merge(key, fallback));

    // Checkout sheet contract
    const checkoutSheet = () =>
      q(
        "checkoutSheet",
        `#checkout.ff-sheet[data-ff-checkout-sheet],
         section#checkout.ff-sheet.ff-sheet--checkout[data-ff-checkout-sheet],
         [data-ff-checkout-sheet]#checkout,
         [data-ff-checkout-sheet],
         #donate.ff-sheet[data-ff-checkout-sheet],
         #donate,
         #donateSheet`
      );

    const checkoutPanel = (sheet) => {
      const host = sheet || checkoutSheet();
      if (!host) return null;
      return host.querySelector?.("[data-ff-sheet-panel]") || host.querySelector?.(".ff-sheet__panel") || host;
    };

    const checkoutBackdrop = () =>
      q(
        "checkoutBackdrop",
        `a.ff-sheet__backdrop[href="#home"][data-ff-close-checkout],
         .ff-sheet__backdrop[data-ff-close-checkout],
         [data-ff-close-checkout].ff-sheet__backdrop,
         .ff-sheet__backdrop`
      );

    const openCheckoutTriggers = () =>
      qa(
        "openCheckout",
        `[data-ff-open-checkout],
         [data-ff-checkout-open],
         [data-ff-open-donate],
         [data-ff-donate-open],
         a[href="#checkout"],
         a[href="#donate"]`
      );

    const closeCheckoutTriggers = () =>
      qa(
        "closeCheckout",
        `[data-ff-close-checkout],
         [data-ff-checkout-close],
         [data-ff-close-donate],
         [data-ff-donate-close]`
      );

    // Donation form contract
    const donationForm = () =>
      q("donationForm", `form#donationForm[data-ff-donate-form], #donationForm, form[data-ff-donate-form]`);
    const amountInput = () => q("amountInput", `#donationAmount[data-ff-amount-input], #donationAmount, [data-ff-amount-input]`);
    const amountDisplays = () => qa("amountDisplays", `[data-ff-amount-display]`);
    const teamHiddenInput = () =>
      q(
        "teamHiddenInput",
        `input[name="team_id"][data-ff-team-id], input[data-ff-team-id][name="team_id"], input[data-ff-team-id]`
      );

    const stripeMount = () => q("stripeMount", `#paymentElement[data-ff-payment-element], #paymentElement, [data-ff-payment-element]`);
    const paypalMount = () => q("paypalMount", `#paypalButtons[data-ff-paypal-mount], #paypalButtons, [data-ff-paypal-mount]`);
    const payBtn = () => q("payBtn", `#payBtn[data-ff-pay-btn], #payBtn, [data-ff-pay-btn]`);

    const checkoutError = () => q("checkoutError", `[data-ff-checkout-error]`);
    const checkoutStatus = () => q("checkoutStatus", `[data-ff-checkout-status]`);

    // Sponsor modal contract
    const sponsorModal = () =>
      q(
        "sponsorModal",
        `section#sponsor-interest.ff-modal[data-ff-sponsor-modal],
         #sponsor-interest[data-ff-sponsor-modal],
         [data-ff-sponsor-modal]#sponsor-interest,
         [data-ff-sponsor-modal]`
      );
    const sponsorOpeners = () => qa("sponsorOpeners", `[data-ff-open-sponsor], a[href="#sponsor-interest"]`);
    const sponsorClosers = () => qa("sponsorClosers", `[data-ff-close-sponsor]`);
    const sponsorSubmit = () => q("sponsorSubmit", `[data-ff-sponsor-submit]`);
    const sponsorName = () => q("sponsorName", `[data-ff-sponsor-name]`);
    const sponsorEmail = () => q("sponsorEmail", `[data-ff-sponsor-email]`);
    const sponsorMessage = () => q("sponsorMessage", `[data-ff-sponsor-message]`);

    // Drawer contract
    const drawer = () => q("drawer", `aside.ff-drawer[data-ff-drawer], [data-ff-drawer].ff-drawer, [data-ff-drawer], #mobileDrawer`);
    const drawerPanel = (d) => (d || drawer())?.querySelector?.("[data-ff-drawer-panel]") || (d || drawer());
    const drawerOpeners = () => qa("drawerOpeners", `[data-ff-open-drawer], [data-ff-drawer-open]`);
    const drawerClosers = () => qa("drawerClosers", `[data-ff-close-drawer], [data-ff-drawer-close]`);

    // Theme toggle
    const themeToggles = () => qa("themeToggles", `[data-ff-theme-toggle]`);

    // Toasts
    const toastsHost = () => q("toastsHost", `[data-ff-toasts]`);

    // Back to top
    const backToTop = () => q("backToTop", `a.ff-backtotop[data-ff-backtotop], [data-ff-backtotop]`);

    // Share
    const shareButtons = () => qa("shareButtons", `[data-ff-share]`);

    // Countdown contract: [data-ff-countdown] inside node with data-ff-deadline="ISO"
    const deadlineNodes = () => qa("deadlineNodes", `[data-ff-deadline]`);

    // Team attribution contract: clickable nodes with data-ff-team-id="…"
    const teamNodes = () => qa("teamNodes", `[data-ff-team-id]`);

    // Optional donor fields
    const donorNameInput = () => q("donorNameInput", `[data-ff-name], input[name="donor_name"], input[name="name"]`);
    const donorEmailInput = () => q("donorEmailInput", `[data-ff-email], input[name="donor_email"], input[name="email"]`);
    const donorMessageInput = () => q("donorMessageInput", `[data-ff-message], textarea[name="donor_message"], textarea[name="message"]`);

    return {
      q,
      qa,
      checkoutSheet,
      checkoutPanel,
      checkoutBackdrop,
      openCheckoutTriggers,
      closeCheckoutTriggers,
      donationForm,
      amountInput,
      amountDisplays,
      teamHiddenInput,
      stripeMount,
      paypalMount,
      payBtn,
      checkoutError,
      checkoutStatus,
      sponsorModal,
      sponsorOpeners,
      sponsorClosers,
      sponsorSubmit,
      sponsorName,
      sponsorEmail,
      sponsorMessage,
      drawer,
      drawerPanel,
      drawerOpeners,
      drawerClosers,
      themeToggles,
      toastsHost,
      backToTop,
      shareButtons,
      deadlineNodes,
      teamNodes,
      donorNameInput,
      donorEmailInput,
      donorMessageInput,
    };
  })();

  // ---------------------------------------------------------------------------
  // Toast system (non-breaking, never throws)
  // ---------------------------------------------------------------------------
  const Toasts = (() => {
    const escapeHtml = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const ensureHost = () => {
      let host = DOM.toastsHost();
      if (host) return host;

      try {
        host = document.createElement("div");
        host.setAttribute("data-ff-toasts", "");
        host.setAttribute("aria-live", "polite");
        host.setAttribute("aria-atomic", "false");
        host.className = "ff-toasts";
        document.body.appendChild(host);
        return host;
      } catch {
        return null;
      }
    };

    const showToast = (type, title, message, opts = {}) => {
      try {
        const host = ensureHost();
        if (!host) return;

        const kind = String(type || "info").toLowerCase();
        const ttl = String(title || "").trim();
        const msg = String(message || "").trim();
        const ms = clamp(Number(opts.ms ?? opts.duration ?? 2600) || 2600, 1200, 9000);

        const el = document.createElement("div");
        el.className = "ff-toast";
        el.setAttribute("role", "status");
        el.setAttribute("data-ff-toast", kind);
        el.tabIndex = -1;

        el.innerHTML = `
          <div class="ff-toast__inner">
            ${ttl ? `<div class="ff-toast__title">${escapeHtml(ttl)}</div>` : ``}
            <div class="ff-toast__msg">${escapeHtml(msg || ttl || "Done")}</div>
          </div>
        `;

        host.appendChild(el);
        try {
          el.focus({ preventScroll: true });
        } catch {}

        setTimeout(() => {
          try {
            el.remove();
          } catch {}
        }, ms);
      } catch {}
    };

    return { showToast };
  })();

  // ---------------------------------------------------------------------------
  // UI helpers (busy/disabled/status/toast/scroll)
  // ---------------------------------------------------------------------------
  const UI = (() => {
    const setHidden = (el, hide) => {
      try {
        if (el) el.hidden = !!hide;
      } catch {}
    };

    const setText = (el, txt) => {
      try {
        if (el) el.textContent = String(txt ?? "");
      } catch {}
    };

    const clearCheckoutNotices = () => {
      setHidden(DOM.checkoutError(), true);
      setHidden(DOM.checkoutStatus(), true);
    };

    const showError = (msg, { toast = false } = {}) => {
      const box = DOM.checkoutError();
      if (box) {
        setText(box, msg || "Something went wrong.");
        setHidden(box, false);
      } else if (toast) {
        Toasts.showToast("error", "Checkout", msg || "Something went wrong.");
      }
    };

    const showStatus = (msg) => {
      const box = DOM.checkoutStatus();
      if (box) {
        setText(box, msg || "");
        setHidden(box, false);
      }
    };

    const setDisabled = (el, disabled) => {
      try {
        if (!el) return;
        el.disabled = !!disabled;
      } catch {}
      try {
        if (!el) return;
        el.setAttribute("aria-disabled", disabled ? "true" : "false");
      } catch {}
    };

    const setBusy = (el, busy, opts = {}) => {
      if (!el) return;
      try {
        const label = String(opts.label || "Processing…");
        const was = el.getAttribute("data-ff-label") || el.textContent || "";
        if (!el.getAttribute("data-ff-label")) el.setAttribute("data-ff-label", was);

        el.setAttribute("aria-busy", busy ? "true" : "false");
        setDisabled(el, !!busy);

        if (typeof opts.setText === "boolean" ? opts.setText : true) {
          el.textContent = busy ? label : el.getAttribute("data-ff-label") || was;
        }
      } catch {}
    };

    const safeScrollIntoView = (el, opts = {}) => {
      try {
        if (!el?.scrollIntoView) return;
        const reduce = prefersReducedMotion();
        el.scrollIntoView({
          block: opts.block || "center",
          inline: opts.inline || "nearest",
          behavior: reduce ? "auto" : opts.behavior || "smooth",
        });
      } catch {
        try {
          const r = el?.getBoundingClientRect?.();
          if (!r) return;
          window.scrollTo({
            top: Math.max(0, window.scrollY + r.top - 24),
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
        } catch {}
      }
    };

    return {
      clearCheckoutNotices,
      showError,
      showStatus,
      setDisabled,
      setBusy,
      safeScrollIntoView,
      formatMoney: (cents) => formatMoney(cents, Config.currency(), Config.locale()),
      toast: Toasts.showToast,
    };
  })();

  // ---------------------------------------------------------------------------
  // Scroll lock (ref-counted)
  // ---------------------------------------------------------------------------
  const ScrollLock = (() => {
    let count = 0;
    const prev = { bodyOverflow: "", bodyPadR: "", htmlOverflow: "" };

    const lock = () => {
      count += 1;
      if (count > 1) return;

      const body = document.body;
      const html = document.documentElement;

      prev.bodyOverflow = body.style.overflow || "";
      prev.bodyPadR = body.style.paddingRight || "";
      prev.htmlOverflow = html.style.overflow || "";

      let scrollbarW = 0;
      try {
        scrollbarW = Math.max(0, window.innerWidth - html.clientWidth);
      } catch {}

      try {
        html.style.overflow = "hidden";
      } catch {}
      try {
        body.style.overflow = "hidden";
      } catch {}

      if (scrollbarW > 0) {
        try {
          body.style.paddingRight = `${scrollbarW}px`;
        } catch {}
      }
    };

    const unlock = () => {
      count = Math.max(0, count - 1);
      if (count !== 0) return;

      const body = document.body;
      const html = document.documentElement;

      try {
        body.style.overflow = prev.bodyOverflow;
      } catch {}
      try {
        body.style.paddingRight = prev.bodyPadR;
      } catch {}
      try {
        html.style.overflow = prev.htmlOverflow;
      } catch {}
    };

    return { lock, unlock };
  })();

  // ---------------------------------------------------------------------------
  // Focus helpers (trap + restore)
  // ---------------------------------------------------------------------------
  const Focus = (() => {
    const focusable = (root) => {
      const host = root && root.nodeType ? root : document;
      const selectors = [
        'a[href]:not([tabindex="-1"])',
        'area[href]:not([tabindex="-1"])',
        'button:not([disabled]):not([tabindex="-1"])',
        'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        'iframe:not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]:not([tabindex="-1"])',
      ].join(",");

      let list = [];
      try {
        list = Array.from(host.querySelectorAll(selectors));
      } catch {
        list = [];
      }

      return list.filter((el) => {
        try {
          if (!el) return false;
          if (el.hidden) return false;
          if (el.getAttribute("aria-hidden") === "true") return false;

          if (el.offsetParent === null) {
            const cs = getComputedStyle(el);
            if (cs.position !== "fixed") return false;
          }
          return true;
        } catch {
          return false;
        }
      });
    };

    const trapKeydown = (e, container, onEscape) => {
      try {
        if (!e) return;

        if (e.key === "Escape") {
          try {
            onEscape?.();
          } catch {}
          e.preventDefault();
          return;
        }

        if (e.key !== "Tab") return;

        const root = container || document;
        const items = focusable(root);
        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (!root.contains(active)) {
          e.preventDefault();
          (first || root)?.focus?.();
          return;
        }

        if (e.shiftKey) {
          if (active === first || active === root) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } catch {}
    };

    return { focusable, trapKeydown };
  })();

  // ---------------------------------------------------------------------------
  // State: amount + team attribution
  // ---------------------------------------------------------------------------
  const State = (() => {
    const KEY_TEAM = "ff_selected_team_id";
    const KEY_AMOUNT = "ff_last_amount_cents";

    let teamId = "";
    let amountCents = 0;

    const readStored = () => {
      try {
        teamId = String(localStorage.getItem(KEY_TEAM) || "").trim();
      } catch {
        teamId = "";
      }

      try {
        const a = Number(localStorage.getItem(KEY_AMOUNT) || 0) || 0;
        amountCents = clamp(a | 0, 0, MAX_CENTS);
      } catch {
        amountCents = 0;
      }
    };

    const persistTeam = () => {
      try {
        if (teamId) localStorage.setItem(KEY_TEAM, teamId);
        else localStorage.removeItem(KEY_TEAM);
      } catch {}
    };

    const persistAmount = () => {
      try {
        if (amountCents > 0) localStorage.setItem(KEY_AMOUNT, String(amountCents));
      } catch {}
    };

    const setTeam = (id) => {
      const v = String(id || "").trim();
      if (!v) return;
      teamId = v;
      persistTeam();
      try {
        const inp = DOM.teamHiddenInput();
        if (inp) inp.value = teamId;
      } catch {}
      Analytics.emit("team_selected", { team_id: teamId });
    };

    const setAmount = (cents) => {
      amountCents = clamp(Number(cents || 0) | 0, 0, MAX_CENTS);
      persistAmount();
      Analytics.emit("amount_set", { amount_cents: amountCents });
    };

    const getTeam = () => teamId;
    const getAmount = () => amountCents;

    readStored();

    return { setTeam, setAmount, getTeam, getAmount, readStored };
  })();

  // ---------------------------------------------------------------------------
  // Amount controller (input + displays + quick buttons)
  // ---------------------------------------------------------------------------
  const Amounts = (() => {
    const syncDisplays = (cents) => {
      const displays = DOM.amountDisplays();
      if (!displays.length) return;
      const txt = cents > 0 ? UI.formatMoney(cents) : "—";
      for (const el of displays) {
        try {
          el.textContent = txt;
        } catch {}
      }
    };

    const syncInput = (cents) => {
      const input = DOM.amountInput();
      if (!input) return;
      try {
        const asStr = centsToDollarsString(cents);
        if (asStr && String(input.value || "") !== asStr) input.value = asStr;
        if (!asStr && String(input.value || "")) input.value = "";
      } catch {}
    };

    const normalizeAndSet = (rawVal, { clampMin = true } = {}) => {
      const cents0 = parseMoneyToCents(rawVal);
      const cents1 = clamp(cents0, 0, MAX_CENTS);
      const cents2 = clampMin ? (cents1 > 0 ? Math.max(cents1, MIN_CENTS) : 0) : cents1;

      State.setAmount(cents2);
      syncInput(cents2);
      syncDisplays(cents2);

      Payments.queuePrepare(false);
    };

    const setFromQuick = (val) => {
      const n = Number(String(val || "").replace(/[^\d.]/g, "")) || 0;
      if (n <= 0) return;
      normalizeAndSet(String(n), { clampMin: true });
    };

    const init = () => {
      try {
        const cents = State.getAmount();
        syncInput(cents);
        syncDisplays(cents);
      } catch {}

      const input = DOM.amountInput();
      if (input) {
        on(input, "input", () => normalizeAndSet(input.value, { clampMin: false }));
        on(input, "change", () => normalizeAndSet(input.value, { clampMin: true }));
      }
    };

    return { init, setFromQuick, normalizeAndSet };
  })();

  // ---------------------------------------------------------------------------
  // Team attribution controller
  // ---------------------------------------------------------------------------
  const TeamAttribution = (() => {
    const applyToHiddenInput = () => {
      try {
        const inp = DOM.teamHiddenInput();
        if (inp) inp.value = State.getTeam() || "";
      } catch {}
    };

    const init = () => {
      applyToHiddenInput();
      try {
        const u = new URL(location.href);
        const src = String(u.searchParams.get("src") || "").trim();
        const m = src.match(/^team:(.+)$/i);
        const fromUrl = m ? String(m[1] || "").trim() : "";
        if (fromUrl) State.setTeam(fromUrl);
        applyToHiddenInput();
      } catch {}
    };

    const handleTeamClick = (node) => {
      try {
        const id = node?.getAttribute?.("data-ff-team-id") || node?.dataset?.ffTeamId || "";
        if (!id) return;
        State.setTeam(id);
        applyToHiddenInput();
        Payments.queuePrepare(true);
      } catch {}
    };

    return { init, handleTeamClick };
  })();

  // ---------------------------------------------------------------------------
  // Overlay controller core (sheet/drawer/modal)
  // ---------------------------------------------------------------------------
  const OverlayCore = (() => {
    const setOpenAttrs = (root, open, { addOpenClass = true } = {}) => {
      if (!root) return;
      try {
        if (open) {
          root.hidden = false;
          if (addOpenClass) root.classList.add("is-open");
          root.setAttribute("data-open", "true");
          root.setAttribute("aria-hidden", "false");
        } else {
          if (addOpenClass) root.classList.remove("is-open");
          root.setAttribute("data-open", "false");
          root.setAttribute("aria-hidden", "true");
          root.hidden = true;
        }
      } catch {}
    };

    const isOpenByState = (root) => {
      if (!root) return false;

      const byTarget = (() => {
        const id = String(root.id || "").trim();
        const h = String(location.hash || "").trim();
        return id && h === `#${id}`;
      })();

      const byClass = (() => {
        try {
          return root.classList.contains("is-open");
        } catch {
          return false;
        }
      })();

      const byData = (() => {
        try {
          return root.getAttribute("data-open") === "true";
        } catch {
          return false;
        }
      })();

      const byAria = (() => {
        try {
          return root.getAttribute("aria-hidden") === "false";
        } catch {
          return false;
        }
      })();

      return !!(byTarget || byClass || byData || byAria);
    };

    return { setOpenAttrs, isOpenByState };
  })();

  // ---------------------------------------------------------------------------
  // Checkout sheet controller (hash + JS toggles + focus trap + restore)
  // ---------------------------------------------------------------------------
  const Checkout = (() => {
    let openState = false;
    let returnFocusEl = null;
    let panelEl = null;

    const sheet = () => DOM.checkoutSheet();
    const panel = () => DOM.checkoutPanel(sheet());

    const open = (openerEl, { setHash = true } = {}) => {
      const s = sheet();
      if (!s) return;

      returnFocusEl = openerEl || document.activeElement || null;

      if (!openState) {
        openState = true;
        panelEl = panel();
        ScrollLock.lock();
      }

      OverlayCore.setOpenAttrs(s, true, { addOpenClass: true });

      if (setHash) {
        try {
          const id = String(s.id || "checkout");
          Hash.set(`#${id}`, { replace: false });
        } catch {}
      }

      requestAnimationFrame(() => {
        try {
          const amt = DOM.amountInput();
          const root = panelEl || panel() || sheet();
          const items = Focus.focusable(root);
          const target = amt || items[0] || root || s;
          target?.focus?.({ preventScroll: true });
        } catch {}
      });

      try {
        Payments.queuePrepare(true);
      } catch {}

      Analytics.emit("checkout_open", { mode: "sheet" });
    };

    const close = ({ restoreHash = true } = {}) => {
      const s = sheet();
      if (!s || !openState) return;

      openState = false;
      panelEl = null;

      OverlayCore.setOpenAttrs(s, false, { addOpenClass: true });
      ScrollLock.unlock();

      if (restoreHash) {
        try {
          if (document.getElementById("home")) Hash.set("#home", { replace: true });
          else Hash.clear({ replace: true });
        } catch {}
      }

      const prev = returnFocusEl;
      returnFocusEl = null;
      try {
        prev?.focus?.({ preventScroll: true });
      } catch {}

      Analytics.emit("checkout_close", { mode: "sheet" });
    };

    const syncWithHash = () => {
      const s = sheet();
      if (!s) return;

      if (OverlayCore.isOpenByState(s)) {
        if (!openState) open(null, { setHash: false });
        else OverlayCore.setOpenAttrs(s, true, { addOpenClass: true });
      } else {
        if (openState) close({ restoreHash: false });
        else OverlayCore.setOpenAttrs(s, false, { addOpenClass: true });
      }
    };

    const isOpen = () => !!openState;

    const getTrapRoot = () => panelEl || panel() || sheet();

    const onBackdropClick = (target) => {
      const s = sheet();
      if (!s || !openState) return false;

      const p = panelEl || panel();
      if (p && p.contains(target)) return false;

      const backdrop = DOM.checkoutBackdrop();
      if (backdrop && (target === backdrop || backdrop.contains(target))) return true;

      // rare markup: click on sheet root outside panel
      if (target === s) return true;

      return false;
    };

    return { open, close, syncWithHash, isOpen, getTrapRoot, onBackdropClick };
  })();

  // ---------------------------------------------------------------------------
  // Drawer controller (open/close + trap + restore)
  // ---------------------------------------------------------------------------
  const Drawer = (() => {
    let openState = false;
    let returnFocusEl = null;
    let panelEl = null;

    const root = () => DOM.drawer();
    const panel = () => DOM.drawerPanel(root());

    const open = (openerEl) => {
      const d = root();
      if (!d) return;

      if (!openState) {
        openState = true;
        returnFocusEl = openerEl || document.activeElement || null;
        panelEl = panel();
        ScrollLock.lock();
      }

      try {
        d.hidden = false;
        d.setAttribute("aria-hidden", "false");
        d.setAttribute("data-open", "true");
      } catch {}

      requestAnimationFrame(() => {
        try {
          const items = Focus.focusable(panelEl || d);
          (items[0] || panelEl || d)?.focus?.({ preventScroll: true });
        } catch {}
      });

      Analytics.emit("drawer_open", {});
    };

    const close = () => {
      const d = root();
      if (!d || !openState) return;

      openState = false;
      panelEl = null;

      try {
        d.setAttribute("aria-hidden", "true");
        d.setAttribute("data-open", "false");
        d.hidden = true;
      } catch {}

      ScrollLock.unlock();

      const prev = returnFocusEl;
      returnFocusEl = null;
      try {
        prev?.focus?.({ preventScroll: true });
      } catch {}

      Analytics.emit("drawer_close", {});
    };

    const isOpen = () => !!openState;
    const getTrapRoot = () => panelEl || panel() || root();

    const onBackdropClick = (target) => {
      const d = root();
      if (!d || !openState) return false;
      const p = panelEl || panel();
      if (p && p.contains(target)) return false;
      return target === d; // click on drawer root overlay
    };

    return { open, close, isOpen, getTrapRoot, onBackdropClick };
  })();

  // ---------------------------------------------------------------------------
  // Sponsor modal controller (open/close + trap + restore + submit)
  // ---------------------------------------------------------------------------
  const Sponsor = (() => {
    let openState = false;
    let returnFocusEl = null;
    let panelEl = null;

    const modal = () => DOM.sponsorModal();

    const setAttrs = (m, open) => {
      if (!m) return;
      try {
        if (open) {
          m.hidden = false;
          m.setAttribute("aria-hidden", "false");
          m.setAttribute("role", m.getAttribute("role") || "dialog");
          m.setAttribute("aria-modal", "true");
        } else {
          m.setAttribute("aria-hidden", "true");
          m.hidden = true;
        }
      } catch {}
    };

    const open = (openerEl, { setHash = false } = {}) => {
      const m = modal();
      if (!m) return;

      if (!openState) {
        openState = true;
        returnFocusEl = openerEl || document.activeElement || null;
        panelEl = m.querySelector?.("[data-ff-modal-panel]") || m.querySelector?.(".ff-modal__panel") || m;
        ScrollLock.lock();
      }

      setAttrs(m, true);

      if (setHash) {
        try {
          const id = String(m.id || "sponsor-interest");
          Hash.set(`#${id}`, { replace: false });
        } catch {}
      }

      requestAnimationFrame(() => {
        try {
          const items = Focus.focusable(panelEl || m);
          (items[0] || panelEl || m)?.focus?.({ preventScroll: true });
        } catch {}
      });

      Analytics.emit("sponsor_open", {});
    };

    const close = ({ restoreHash = false } = {}) => {
      const m = modal();
      if (!m || !openState) return;

      openState = false;
      panelEl = null;

      setAttrs(m, false);
      ScrollLock.unlock();

      if (restoreHash) {
        try {
          if (document.getElementById("home")) Hash.set("#home", { replace: true });
          else Hash.clear({ replace: true });
        } catch {}
      }

      const prev = returnFocusEl;
      returnFocusEl = null;
      try {
        prev?.focus?.({ preventScroll: true });
      } catch {}

      Analytics.emit("sponsor_close", {});
    };

    const syncWithHash = () => {
      const m = modal();
      if (!m) return;
      const id = String(m.id || "sponsor-interest");
      if (location.hash === `#${id}`) {
        if (!openState) open(null, { setHash: false });
      } else {
        if (openState) close({ restoreHash: false });
      }
    };

    const submit = async () => {
      UI.clearCheckoutNotices();

      const name = String(DOM.sponsorName()?.value || "").trim();
      const email = String(DOM.sponsorEmail()?.value || "").trim();
      const message = String(DOM.sponsorMessage()?.value || "").trim();

      if (email && !isEmail(email)) {
        UI.toast("error", "Sponsor", "Please enter a valid email.");
        return;
      }

      const endpoint = Config.sponsorEndpoint();
      const csrf = Config.csrfToken();

      if (!endpoint) {
        UI.toast("success", "Sponsor", "Sent! We’ll follow up ASAP.");
        Analytics.emit("sponsor_submit", { mode: "local" });
        close({ restoreHash: false });
        return;
      }

      try {
        const payload = {
          sponsor_name: name,
          sponsor_email: email,
          sponsor_message: message,
          team_id: State.getTeam() || "",
          page: `${location.origin}${location.pathname}`,
        };

        const out = await safeFetchJson(
          endpoint,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(csrf ? { "X-CSRFToken": csrf } : {}),
            },
            body: JSON.stringify(payload),
          },
          15000
        );

        if (!out.ok) {
          const msg = String(out.json?.error || out.json?.message || "Could not send sponsor note.");
          throw new Error(msg);
        }

        UI.toast("success", "Sponsor", "Sent! We’ll follow up ASAP.");
        Analytics.emit("sponsor_submit", { mode: "network" });
        close({ restoreHash: false });
      } catch (e) {
        UI.toast("error", "Sponsor", String(e?.message || "Could not send. Please try again."));
        Analytics.emit("sponsor_submit_error", { message: String(e?.message || "") });
      }
    };

    const isOpen = () => !!openState;
    const getTrapRoot = () => panelEl || modal();

    const onBackdropClick = (target) => {
      const m = modal();
      if (!m || !openState) return false;
      const p = panelEl || m;
      if (p && p.contains(target) && target !== m) return false;
      return target === m;
    };

    return { open, close, syncWithHash, submit, isOpen, getTrapRoot, onBackdropClick };
  })();

  // ---------------------------------------------------------------------------
  // Theme toggle (html[data-theme="light"/"dark"], persists preference)
  // ---------------------------------------------------------------------------
  const Theme = (() => {
    const STORAGE_KEY = "ff_theme";

    const getSaved = () => {
      try {
        const v = String(localStorage.getItem(STORAGE_KEY) || "").trim().toLowerCase();
        if (v === "light" || v === "dark" || v === "system") return v;
      } catch {}
      return "system";
    };

    const resolve = (mode) => {
      if (mode === "light" || mode === "dark") return mode;
      try {
        const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
        return mql && mql.matches ? "dark" : "light";
      } catch {
        return "light";
      }
    };

    const apply = (mode) => {
      const resolved = resolve(mode);
      const root = document.documentElement;

      try {
        root.dataset.theme = resolved;
        root.classList.toggle("dark", resolved === "dark");
        root.style.colorScheme = resolved;
      } catch {}

      try {
        DOM.themeToggles().forEach((btn) => {
          try {
            btn.setAttribute("aria-pressed", resolved === "dark" ? "true" : "false");
          } catch {}
        });
      } catch {}

      try {
        Stripe.invalidateMount();
      } catch {}
      Payments.queuePrepare(true);
    };

    const toggle = (e) => {
      const saved = getSaved();
      const cur = resolve(saved);
      const next =
        e?.altKey
          ? saved === "system"
            ? "dark"
            : saved === "dark"
              ? "light"
              : "system"
          : cur === "dark"
            ? "light"
            : "dark";

      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      apply(next);

      Analytics.emit("theme_toggle", { mode: next, resolved: resolve(next) });
      UI.toast("info", "Theme", resolve(next) === "dark" ? "Dark mode" : "Light mode", { ms: 1800 });
    };

    const init = () => {
      apply(getSaved());
      try {
        const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
        mql?.addEventListener?.("change", () => {
          if (getSaved() === "system") apply("system");
        });
      } catch {}
    };

    return { init, toggle };
  })();

  // ---------------------------------------------------------------------------
  // Canonical URL (share-safe, no hash noise)
  // ---------------------------------------------------------------------------
  const Canonical = (() => {
    let cachedBase = "";

    const baseUrl = () => {
      if (cachedBase) return cachedBase;

      const fromMeta = metaAny("ff-canonical", "ff-stripe-return-url");
      const fallback = `${location.origin}${location.pathname}${location.search || ""}`;

      try {
        const u = new URL(fromMeta || fallback, location.origin);
        u.hash = "";
        cachedBase = u.toString();
        return cachedBase;
      } catch {
        cachedBase = `${location.origin}${location.pathname}${location.search || ""}`;
        return cachedBase;
      }
    };

    const shareUrl = () => {
      try {
        const u = new URL(baseUrl());
        const tid = State.getTeam();
        if (tid) u.searchParams.set("src", `team:${tid}`);
        else u.searchParams.delete("src");
        return u.toString();
      } catch {
        return baseUrl();
      }
    };

    return { baseUrl, shareUrl };
  })();

  // ---------------------------------------------------------------------------
  // Share flow ([data-ff-share])
  // ---------------------------------------------------------------------------
  const Share = (() => {
    const copyText = async (text) => {
      const v = String(text ?? "");
      if (!v) return false;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(v);
          return true;
        }
      } catch {}

      try {
        const ta = document.createElement("textarea");
        ta.value = v;
        ta.readOnly = true;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch {}
        ta.remove();
        return true;
      } catch {
        return false;
      }
    };

    const doShare = async () => {
      const url = Canonical.shareUrl();
      const title = String(meta("application-name") || Config.raw?.org?.name || "FutureFunded").trim() || "FutureFunded";
      const text = `Support the program here: ${url}`;

      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
          UI.toast("success", "Share", "Shared!");
          Analytics.emit("share", { mode: "native" });
          return;
        } catch {}
      }

      const ok = await copyText(url);
      UI.toast("success", "Share", ok ? "Link copied" : "Copy failed");
      Analytics.emit("share", { mode: ok ? "copy" : "copy_failed" });
    };

    return { doShare };
  })();

  // ---------------------------------------------------------------------------
  // Countdown
  // ---------------------------------------------------------------------------
  const Countdown = (() => {
    let timer = 0;

    const parseDeadline = (node) => {
      try {
        const iso = String(node?.getAttribute?.("data-ff-deadline") || "").trim();
        if (!iso) return null;
        const d = new Date(iso);
        return Number.isFinite(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    };

    const fmt = (ms) => {
      const s = Math.max(0, Math.floor(ms / 1000));
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);

      if (d > 1) return `${d}d ${h}h`;
      if (d === 1) return `Final day`;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${sec}s`;
      return `${sec}s`;
    };

    const tick = () => {
      const nodes = DOM.deadlineNodes();
      if (!nodes.length) return;

      for (const n of nodes) {
        const d = parseDeadline(n);
        const targets = $$("[data-ff-countdown]", n);
        if (!targets.length) continue;

        let txt = "—";
        if (!d) txt = "—";
        else {
          const ms = d.getTime() - Date.now();
          if (ms <= 0) txt = "Ended";
          else txt = fmt(ms);
        }

        for (const t of targets) {
          try {
            t.textContent = txt;
          } catch {}
        }
      }
    };

    const start = () => {
      stop();
      tick();
      timer = window.setInterval(tick, 1000);
    };

    const stop = () => {
      if (timer) {
        try {
          clearInterval(timer);
        } catch {}
        timer = 0;
      }
    };

    const init = () => {
      if (!DOM.deadlineNodes().length) return;
      start();
      on(document, "visibilitychange", () => {
        try {
          if (document.hidden) stop();
          else start();
        } catch {}
      });
    };

    return { init };
  })();

  // ---------------------------------------------------------------------------
  // Stripe (Payment Element) — single-flight init + single mount + resilient retries
  // ---------------------------------------------------------------------------
  const Stripe = (() => {
    let stripe = null;
    let elements = null;

    let sdkPromise = null;
    let intentPromise = null;

    let mountedSig = "";
    let lastClientSecret = "";
    let lastIntentSig = "";

    const sdkReady = () => typeof window.Stripe === "function";

    const loadSdk = async () => {
      if (sdkReady()) return true;
      if (sdkPromise) return sdkPromise;

      sdkPromise = loadScriptOnce("https://js.stripe.com/v3/", {
        id: "ffStripeSdk",
        nonce: CSP.nonce(),
        attrs: { referrerpolicy: "origin" },
      })
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          sdkPromise = null;
        });

      return sdkPromise;
    };

    const appearance = () => {
      const theme = String(document.documentElement.dataset.theme || "light");
      return { theme: theme === "dark" ? "night" : "stripe" };
    };

    const readDonor = () => ({
      donor_name: String(DOM.donorNameInput()?.value || "").trim(),
      donor_email: String(DOM.donorEmailInput()?.value || "").trim(),
      donor_message: String(DOM.donorMessageInput()?.value || "").trim(),
    });

    const readAmountTeam = () => ({
      amount_cents: clamp(State.getAmount() | 0, 0, MAX_CENTS),
      currency: String(Config.currency() || "USD"),
      team_id: String(State.getTeam() || "").trim(),
    });

    const intentSig = (p) => [p.amount_cents || 0, p.currency || "", p.team_id || "", p.donor_email || "", p.donor_name || ""].join("|");

    const createOrReuseIntent = async ({ force = false } = {}) => {
      const pk0 = Config.stripePk();
      const ep = String(Config.stripeIntentEndpoint() || "").trim();
      const mount = DOM.stripeMount();
      if (!pk0 || !ep || !mount) return { ok: false, reason: "missing_config" };

      const donor = readDonor();
      if (Config.requireEmail() && !donor.donor_email) return { ok: false, reason: "incomplete_form", message: "Email required." };
      if (donor.donor_email && !isEmail(donor.donor_email)) return { ok: false, reason: "incomplete_form", message: "Invalid email." };

      const core = readAmountTeam();
      if (!core.amount_cents || core.amount_cents < MIN_CENTS) return { ok: false, reason: "incomplete_form", message: "Amount required." };

      const payload = {
        amount_cents: core.amount_cents,
        currency: core.currency,
        donor_name: donor.donor_name,
        donor_email: donor.donor_email,
        donor_message: donor.donor_message,
        team_id: core.team_id,
      };

      const sig = intentSig(payload);
      if (!force && lastClientSecret && sig === lastIntentSig) {
        return { ok: true, reused: true, client_secret: lastClientSecret, publishable_key: pk0 };
      }

      if (intentPromise) return intentPromise;

      const csrf = Config.csrfToken();

      intentPromise = (async () => {
        UI.clearCheckoutNotices();

        const out = await safeFetchJson(
          ep,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(csrf ? { "X-CSRFToken": csrf } : {}),
            },
            body: JSON.stringify(payload),
          },
          15000
        );

        try {
          if (!out.ok) {
            const msg = String(out.json?.error || out.json?.message || "Could not start Stripe checkout.");
            return { ok: false, reason: "server_error", message: msg };
          }

          const cs = String(out.json?.client_secret || out.json?.clientSecret || out.json?.secret || "").trim();
          const pkFromServer = String(out.json?.publishable_key || out.json?.publishableKey || "").trim();
          if (!cs) return { ok: false, reason: "bad_response", message: "Missing Stripe client secret." };

          lastClientSecret = cs;
          lastIntentSig = sig;

          return { ok: true, client_secret: cs, publishable_key: pkFromServer || pk0 };
        } catch {
          return { ok: false, reason: "bad_response", message: "Stripe intent response error." };
        } finally {
          intentPromise = null;
        }
      })();

      return intentPromise;
    };

    const mountOnce = async ({ force = false } = {}) => {
      const mount = DOM.stripeMount();
      if (!mount) return { ok: false, reason: "no_mount" };

      const pk0 = Config.stripePk();
      if (!pk0) return { ok: false, reason: "missing_pk" };

      const sdkOk = await loadSdk();
      if (!sdkOk || !sdkReady()) return { ok: false, reason: "sdk" };

      const intent = await createOrReuseIntent({ force });
      if (!intent.ok) return intent;

      try {
        if (!stripe) stripe = window.Stripe(intent.publishable_key || pk0);
      } catch {
        stripe = null;
      }
      if (!stripe) return { ok: false, reason: "stripe_init", message: "Stripe failed to initialize." };

      const themeKey = String(document.documentElement.dataset.theme || "light");
      const sig = `${intent.client_secret}::${themeKey}`;

      if (!force && mountedSig === sig && mount.getAttribute("data-ff-stripe-mounted") === sig) {
        return { ok: true, reused: true };
      }

      try {
        mount.replaceChildren();
      } catch {}

      elements = null;

      try {
        elements = stripe.elements({
          clientSecret: intent.client_secret,
          appearance: appearance(),
        });

        const paymentEl = elements.create("payment");
        paymentEl.mount(mount);

        mountedSig = sig;
        mount.setAttribute("data-ff-stripe-mounted", sig);

        Analytics.emit("stripe_ready", { mounted: true });
        return { ok: true };
      } catch {
        return { ok: false, reason: "mount_error", message: "Stripe failed to mount." };
      }
    };

    const invalidateMount = () => {
      mountedSig = "";
      try {
        const mount = DOM.stripeMount();
        if (mount) mount.removeAttribute("data-ff-stripe-mounted");
      } catch {}
    };

    const confirm = async () => {
      UI.clearCheckoutNotices();

      const donor = readDonor();
      const core = readAmountTeam();

      if (!core.amount_cents || core.amount_cents < MIN_CENTS) {
        UI.showError("Enter a donation amount.");
        return;
      }

      if (Config.requireEmail() && !donor.donor_email) {
        UI.showError("Enter your email for a receipt.");
        return;
      }

      if (donor.donor_email && !isEmail(donor.donor_email)) {
        UI.showError("Enter a valid email.");
        return;
      }

      const btn = DOM.payBtn();
      UI.setBusy(btn, true, { label: "Processing…" });

      Analytics.emit("payment_attempt", { provider: "stripe" });

      const prep = await mountOnce({ force: false });
      if (!prep.ok) {
        const msg = prep.message || "Card payment is unavailable right now.";
        UI.showError(msg);
        UI.toast("error", "Card payment", msg, { ms: 4200 });
        Analytics.emit("payment_error", { provider: "stripe", reason: prep.reason || "", message: msg });
        UI.setBusy(btn, false);
        return;
      }

      if (!stripe || !elements) {
        UI.showError("Stripe is not ready.");
        Analytics.emit("payment_error", { provider: "stripe", reason: "not_ready" });
        UI.setBusy(btn, false);
        return;
      }

      try {
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: Config.stripeReturnUrl(),
            receipt_email: donor.donor_email || undefined,
          },
          redirect: "if_required",
        });

        if (result?.error) {
          const msg = String(result.error.message || "Payment failed.");
          UI.showError(msg);
          UI.toast("error", "Payment failed", msg, { ms: 4200 });
          Analytics.emit("payment_error", { provider: "stripe", message: msg, code: String(result.error.code || "") });
          return;
        }

        const pi = result?.paymentIntent;
        if (pi && (pi.status === "succeeded" || pi.status === "processing")) {
          UI.showStatus("Payment received. Thank you!");
          UI.toast("success", "Thank you!", "Payment received.", { ms: 3200 });
          Analytics.emit("payment_success", {
            provider: "stripe",
            payment_intent_id: String(pi.id || ""),
            status: String(pi.status || ""),
          });
          try {
            Checkout.close();
          } catch {}
        } else {
          UI.showStatus("Payment submitted. Completing…");
          Analytics.emit("payment_success", { provider: "stripe", status: "submitted" });
        }
      } catch (e) {
        const msg = "Payment could not be completed.";
        UI.showError(msg);
        Analytics.emit("payment_error", { provider: "stripe", message: String(e?.message || "") });
      } finally {
        UI.setBusy(btn, false);
      }
    };

    const handleReturnIfPresent = async () => {
      try {
        const u = new URL(location.href);
        const cs =
          u.searchParams.get("payment_intent_client_secret") ||
          u.searchParams.get("setup_intent_client_secret") ||
          "";
        if (!cs) return;

        const pk0 = Config.stripePk();
        if (!pk0) return;

        const sdkOk = await loadSdk();
        if (!sdkOk || !sdkReady()) return;

        const s = window.Stripe(pk0);
        const res = await s.retrievePaymentIntent(cs).catch(() => null);
        const pi = res?.paymentIntent;
        if (!pi) return;

        if (pi.status === "succeeded") {
          UI.showStatus("Payment received. Thank you!");
          UI.toast("success", "Thank you!", "Payment received.", { ms: 3200 });
          Analytics.emit("payment_success", {
            provider: "stripe",
            payment_intent_id: String(pi.id || ""),
            status: "succeeded",
          });
        } else if (pi.status === "processing") {
          UI.showStatus("Payment processing. You’ll receive a receipt by email.");
          Analytics.emit("payment_success", {
            provider: "stripe",
            payment_intent_id: String(pi.id || ""),
            status: "processing",
          });
        } else if (pi.status === "requires_payment_method") {
          UI.showError("Payment failed. Please try again.");
          Analytics.emit("payment_error", {
            provider: "stripe",
            payment_intent_id: String(pi.id || ""),
            status: String(pi.status || ""),
          });
        }
      } catch {}
    };

    return { loadSdk, mountOnce, confirm, invalidateMount, handleReturnIfPresent };
  })();

  // ---------------------------------------------------------------------------
  // PayPal (Buttons) — lazy-load once, render once, server create/capture only
  // ---------------------------------------------------------------------------
  const PayPal = (() => {
    let sdkPromise = null;
    let renderedKey = "";
    let rendered = false;

    const sdkReady = () => !!window.paypal?.Buttons;

    const loadSdk = async () => {
      if (sdkReady()) return true;
      if (sdkPromise) return sdkPromise;

      const cid = Config.paypalClientId();
      if (!cid) return false;

      const params = new URLSearchParams({
        "client-id": cid,
        currency: Config.paypalCurrency(),
        components: "buttons",
        intent: Config.paypalIntent(),
      });

      const src = `https://www.paypal.com/sdk/js?${params.toString()}`;

      sdkPromise = loadScriptOnce(src, {
        id: "ffPayPalSdk",
        nonce: CSP.nonce(),
        attrs: { "data-namespace": "paypal" },
      })
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          sdkPromise = null;
        });

      return sdkPromise;
    };

    const readDonor = () => ({
      donor_name: String(DOM.donorNameInput()?.value || "").trim(),
      donor_email: String(DOM.donorEmailInput()?.value || "").trim(),
      donor_message: String(DOM.donorMessageInput()?.value || "").trim(),
    });

    const buildPayload = () => {
      const donor = readDonor();
      return {
        amount_cents: clamp(State.getAmount() | 0, 0, MAX_CENTS),
        currency: String(Config.paypalCurrency() || Config.currency() || "USD"),
        team_id: String(State.getTeam() || "").trim(),
        donor_name: donor.donor_name,
        donor_email: donor.donor_email,
        donor_message: donor.donor_message,
      };
    };

    const canAttempt = () => {
      const cid = Config.paypalClientId();
      if (!cid) return { ok: false, reason: "missing_client_id" };

      const amt = State.getAmount() | 0;
      if (!amt || amt < MIN_CENTS) return { ok: false, reason: "incomplete_form" };

      const donor = readDonor();
      if (Config.requireEmail() && !donor.donor_email) return { ok: false, reason: "incomplete_form" };
      if (donor.donor_email && !isEmail(donor.donor_email)) return { ok: false, reason: "incomplete_form" };

      const createUrl = String(Config.paypalCreateEndpoint() || "").trim();
      const captureUrl = String(Config.paypalCaptureEndpoint() || "").trim();
      if (!createUrl || !captureUrl) return { ok: false, reason: "missing_endpoints" };

      return { ok: true };
    };

    const disablePaypalGracefully = (mount, why) => {
      try {
        if (!mount) return;
        mount.setAttribute("data-ff-paypal-disabled", why || "1");
        mount.setAttribute("aria-disabled", "true");
      } catch {}
    };

    const renderOnce = async ({ force = false } = {}) => {
      const mount = DOM.paypalMount();
      if (!mount) return { ok: false, reason: "no_mount" };

      const cid = Config.paypalClientId();
      if (!cid) {
        disablePaypalGracefully(mount, "missing_client_id");
        return { ok: false, reason: "missing_config" };
      }

      const can = canAttempt();
      if (!can.ok) return can;

      const okSdk = await loadSdk();
      if (!okSdk || !sdkReady()) return { ok: false, reason: "sdk" };

      const p = buildPayload();
      const key = `${p.currency}|${p.team_id}|${p.amount_cents}|${p.donor_email}`;

      if (!force && rendered && renderedKey === key && mount.getAttribute("data-ff-paypal-rendered") === key) {
        return { ok: true, reused: true };
      }

      try {
        mount.replaceChildren();
      } catch {}
      rendered = false;
      renderedKey = key;

      const csrf = Config.csrfToken();
      const createUrl = String(Config.paypalCreateEndpoint() || "").trim();
      const captureUrl = String(Config.paypalCaptureEndpoint() || "").trim();

      try {
        const buttons = window.paypal.Buttons({
          style: { layout: "vertical", label: "donate" },

          createOrder: async () => {
            UI.clearCheckoutNotices();
            Analytics.emit("payment_attempt", { provider: "paypal" });

            const payload = buildPayload();
            const out = await safeFetchJson(
              createUrl,
              {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  ...(csrf ? { "X-CSRFToken": csrf } : {}),
                },
                body: JSON.stringify(payload),
              },
              15000
            );

            if (!out.ok) {
              const msg = String(out.json?.error || out.json?.message || "Could not create PayPal order.");
              throw new Error(msg);
            }

            const id = String(out.json?.id || out.json?.order_id || out.json?.orderId || "").trim();
            if (!id) throw new Error("Missing PayPal order id.");
            return id;
          },

          onApprove: async (data) => {
            const btn = DOM.payBtn();
            UI.setBusy(btn, true, { label: "Finalizing…" });

            try {
              const payload = { order_id: String(data?.orderID || ""), ...buildPayload() };
              const out = await safeFetchJson(
                captureUrl,
                {
                  method: "POST",
                  credentials: "same-origin",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(csrf ? { "X-CSRFToken": csrf } : {}),
                  },
                  body: JSON.stringify(payload),
                },
                15000
              );

              if (!out.ok) {
                const msg = String(out.json?.error || out.json?.message || "Could not capture PayPal order.");
                throw new Error(msg);
              }

              UI.showStatus("Payment received. Thank you!");
              UI.toast("success", "Thank you!", "Payment received.", { ms: 3200 });

              Analytics.emit("payment_success", {
                provider: "paypal",
                order_id: String(data?.orderID || ""),
                status: String(out.json?.status || "captured"),
              });

              try {
                Checkout.close();
              } catch {}
            } catch (e) {
              const msg = String(e?.message || "PayPal payment failed.");
              UI.showError(msg);
              UI.toast("error", "PayPal", msg, { ms: 4200 });
              Analytics.emit("payment_error", { provider: "paypal", message: msg });
            } finally {
              UI.setBusy(DOM.payBtn(), false);
            }
          },

          onCancel: () => {
            UI.toast("info", "PayPal", "Canceled", { ms: 2000 });
            Analytics.emit("payment_error", { provider: "paypal", message: "canceled" });
          },

          onError: () => {
            UI.showError("PayPal error. Please try again.");
            Analytics.emit("payment_error", { provider: "paypal", message: "sdk_error" });
          },
        });

        const eligible = buttons?.isEligible?.() !== false;
        if (!eligible) return { ok: false, reason: "ineligible" };

        await buttons.render(mount);

        rendered = true;
        renderedKey = key;
        mount.setAttribute("data-ff-paypal-rendered", key);

        Analytics.emit("paypal_ready", { rendered: true });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: "render_error", message: String(e?.message || "PayPal failed to render.") };
      }
    };

    return { loadSdk, renderOnce };
  })();

  // ---------------------------------------------------------------------------
  // Payments Orchestration (intent creation gated to checkout-open)
  // ---------------------------------------------------------------------------
  const Payments = (() => {
    let prepTimer = 0;
    let paypalWarnedMissingCid = false;

    const updateReadyState = () => {
      const btn = DOM.payBtn();
      const amt = State.getAmount() | 0;
      const email = String(DOM.donorEmailInput()?.value || "").trim();

      const okAmount = amt >= MIN_CENTS;
      const okEmail = Config.requireEmail() ? isEmail(email) : !email || isEmail(email);

      if (btn) {
        try {
          btn.disabled = !(okAmount && okEmail);
        } catch {}
        try {
          btn.setAttribute("aria-disabled", okAmount && okEmail ? "false" : "true");
        } catch {}
      }
    };

    const shouldPrepareNow = (force) => {
      if (force) return true;
      // Avoid creating intents/rendering buttons until checkout is open.
      return Checkout.isOpen();
    };

    const prepare = async (force = false) => {
      updateReadyState();

      if (!shouldPrepareNow(!!force)) return;

      const amt = State.getAmount() | 0;
      const email = String(DOM.donorEmailInput()?.value || "").trim();
      const okEmail = Config.requireEmail() ? isEmail(email) : !email || isEmail(email);

      if (amt < MIN_CENTS || !okEmail) return;

      // Stripe (attempt if configured)
      if (Config.stripePk() && DOM.stripeMount()) {
        const res = await Stripe.mountOnce({ force: !!force });
        if (!res.ok && res.reason !== "incomplete_form") {
          Analytics.emit("stripe_ready", { mounted: false, reason: res.reason || "" });
        }
      }

      // PayPal (quietly attempt; skip if disabled; no spammy toasts)
      if (DOM.paypalMount()) {
        const cid = Config.paypalClientId();
        if (!cid) return;
        await PayPal.renderOnce({ force: !!force });
      }
};

    const queuePrepare = (force = false) => {
      clearTimeout(prepTimer);
      prepTimer = setTimeout(() => {
        prepare(!!force);
      }, force ? 0 : 220);
    };

    const init = () => {
      // donor fields rerender triggers
      const rerender = () => queuePrepare(false);
      [DOM.donorEmailInput(), DOM.donorNameInput(), DOM.donorMessageInput()].forEach((el) => {
        if (!el) return;
        on(el, "input", rerender);
        on(el, "change", rerender);
      });

      // form submit (Enter key safety)
      const form = DOM.donationForm();
      if (form) {
        on(form, "submit", (e) => {
          try {
            e.preventDefault();
          } catch {}
          Stripe.confirm();
        });
      }

      updateReadyState();
      queuePrepare(false);
    };

    return { init, queuePrepare, prepare, updateReadyState };
  })();

  // ---------------------------------------------------------------------------
  // Provider prewarm (intent-based) — loads SDKs without mounting/intents
  // ---------------------------------------------------------------------------
  const Prewarm = (() => {
    let didStripe = false;
    let didPayPal = false;

    const warm = () => {
      try {
        if (!didStripe && Config.stripePk()) {
          didStripe = true;
          Stripe.loadSdk?.().catch?.(() => null);
        }
      } catch {}

      try {
        if (!didPayPal && Config.paypalClientId()) {
          didPayPal = true;
          PayPal.loadSdk?.().catch?.(() => null);
        }
      } catch {}
    };

    const init = () => {
      // Capture-phase intent signals: pointer/focus on open-checkout or pay actions.
      const handler = (e) => {
        try {
          const t = e?.target;
          if (!t) return;

          const intentNode = t.closest?.(
            "[data-ff-open-checkout],[data-ff-checkout-open],[data-ff-open-donate],[data-ff-donate-open],a[href='#checkout'],a[href='#donate'],#payBtn,[data-ff-pay-btn]"
          );
          if (intentNode) warm();
        } catch {}
      };

      on(document, "pointerdown", handler, true);
      on(document, "pointerenter", handler, true);
      on(document, "focusin", handler, true);
    };

    return { init };
  })();

  // ---------------------------------------------------------------------------
  // Back-to-top (smooth, reduced-motion aware) + optional autohide if toggles exist
  // ---------------------------------------------------------------------------
  const BackToTop = (() => {
    const scrollTop = () => {
      const reduce = prefersReducedMotion();
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      Analytics.emit("back_to_top", {});
    };

    const maybeAutoHide = () => {
      const el = DOM.backToTop();
      if (!el) return;

      // ONLY toggle if element already participates in hide semantics
      const hasToggle = el.hasAttribute("data-hidden") || el.hasAttribute("aria-hidden");
      if (!hasToggle) return;

      const y = (() => {
        try {
          return window.scrollY || document.documentElement.scrollTop || 0;
        } catch {
          return 0;
        }
      })();

      const show = y > 420;
      try {
        if (el.hasAttribute("data-hidden")) el.setAttribute("data-hidden", show ? "false" : "true");
      } catch {}
      try {
        if (el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", show ? "false" : "true");
      } catch {}
    };

    const init = () => {
      maybeAutoHide();
      on(
        window,
        "scroll",
        () => {
          try {
            maybeAutoHide();
          } catch {}
        },
        { passive: true }
      );
      return { scrollTop };
    };

    return { init, scrollTop };
  })();

  // ---------------------------------------------------------------------------
  // Global event delegation (single listener for click/keydown/hashchange/popstate)
  // Ensures: team + amount updates happen BEFORE checkout open.
  // ---------------------------------------------------------------------------
  const Events = (() => {
    const isModifiedClick = (e) => !!(e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey);

    const handleClick = (e) => {
      try {
        const t = e.target;
        if (!t) return;

        // 1) Team attribution: any [data-ff-team-id] click
        const teamNode = t.closest?.("[data-ff-team-id]");
        if (teamNode) TeamAttribution.handleTeamClick(teamNode);

        // 2) Quick amount: [data-ff-amount="25"]
        const amtNode = t.closest?.("[data-ff-amount]");
        if (amtNode) {
          const v = amtNode.getAttribute("data-ff-amount") || amtNode.dataset?.ffAmount || "";
          if (v) Amounts.setFromQuick(v);
        }

        // 3) Theme toggle
        const themeBtn = t.closest?.("[data-ff-theme-toggle]");
        if (themeBtn) {
          if (themeBtn.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          Theme.toggle(e);
          return;
        }

        // 4) Share
        const shareBtn = t.closest?.("[data-ff-share]");
        if (shareBtn) {
          if (shareBtn.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          Share.doShare();
          return;
        }

        // 5) Back to top
        const btt = t.closest?.("a.ff-backtotop[data-ff-backtotop],[data-ff-backtotop]");
        if (btt) {
          if (btt.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          BackToTop.scrollTop();
          return;
        }

        // 6) Drawer open/close
        const drawerOpen = t.closest?.("[data-ff-open-drawer],[data-ff-drawer-open]");
        if (drawerOpen) {
          if (drawerOpen.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          Drawer.open(drawerOpen);
          return;
        }

        const drawerClose = t.closest?.("[data-ff-close-drawer],[data-ff-drawer-close]");
        if (drawerClose) {
          e.preventDefault();
          Drawer.close();
          return;
        }

        // 7) Sponsor modal open/close/submit
        const sponsorOpen = t.closest?.("[data-ff-open-sponsor],a[href='#sponsor-interest']");
        if (sponsorOpen) {
          if (sponsorOpen.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          Sponsor.open(sponsorOpen, { setHash: true });
          return;
        }

        const sponsorClose = t.closest?.("[data-ff-close-sponsor]");
        if (sponsorClose) {
          e.preventDefault();
          Sponsor.close({ restoreHash: false });
          return;
        }

        const sponsorSubmit = t.closest?.("[data-ff-sponsor-submit]");
        if (sponsorSubmit) {
          e.preventDefault();
          Sponsor.submit();
          return;
        }

        // 8) Checkout open triggers (after team/amount set)
        const openNode = t.closest?.(
          "[data-ff-open-checkout],[data-ff-checkout-open],[data-ff-open-donate],[data-ff-donate-open],a[href='#checkout'],a[href='#donate']"
        );
        if (openNode) {
          if (openNode.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          Checkout.open(openNode, { setHash: true });
          return;
        }

        // 9) Checkout close triggers
        const closeNode = t.closest?.(
          "[data-ff-close-checkout],[data-ff-checkout-close],[data-ff-close-donate],[data-ff-donate-close]"
        );
        if (closeNode) {
          e.preventDefault();
          Checkout.close({ restoreHash: true });
          return;
        }

        // 10) Backdrop clicks (never close when clicking inside panel)
        if (Checkout.isOpen() && Checkout.onBackdropClick(t)) {
          e.preventDefault();
          Checkout.close({ restoreHash: true });
          return;
        }
        if (Drawer.isOpen() && Drawer.onBackdropClick(t)) {
          e.preventDefault();
          Drawer.close();
          return;
        }
        if (Sponsor.isOpen() && Sponsor.onBackdropClick(t)) {
          e.preventDefault();
          Sponsor.close({ restoreHash: false });
          return;
        }

        // 11) Pay button (Stripe confirm)
        const payBtn = t.closest?.("#payBtn,[data-ff-pay-btn]");
        if (payBtn) {
          if (payBtn.tagName === "A" && isModifiedClick(e)) return;
          e.preventDefault();
          Stripe.confirm();
          return;
        }
      } catch {}
    };

    const handleKeydown = (e) => {
      try {
        // priority: checkout > drawer > sponsor
        if (Checkout.isOpen()) {
          Focus.trapKeydown(e, Checkout.getTrapRoot(), () => Checkout.close({ restoreHash: true }));
          return;
        }
        if (Drawer.isOpen()) {
          Focus.trapKeydown(e, Drawer.getTrapRoot(), () => Drawer.close());
          return;
        }
        if (Sponsor.isOpen()) {
          Focus.trapKeydown(e, Sponsor.getTrapRoot(), () => Sponsor.close({ restoreHash: false }));
          return;
        }
      } catch {}
    };

    const handleHashChange = () => {
      try {
        Checkout.syncWithHash();
      } catch {}
      try {
        Sponsor.syncWithHash();
      } catch {}
    };

    const init = () => {
      on(document, "click", handleClick, true);
      on(document, "keydown", handleKeydown, true);
      on(window, "hashchange", handleHashChange);
      on(window, "popstate", handleHashChange);
    };

    return { init, handleHashChange };
  })();

  // ---------------------------------------------------------------------------
  // App init
  // ---------------------------------------------------------------------------
  const App = (() => {
    const init = () => {
      try {
        Analytics.emit("app_boot", { v: VERSION });

        try {
          State.readStored?.();
        } catch {}

        Theme.init();
        Amounts.init();
        TeamAttribution.init();

        Countdown.init();
        BackToTop.init();

        Payments.init();
        Prewarm.init();
        Events.init();

        // initial sync for hash-driven overlays (:target)
        Events.handleHashChange();

        // Stripe return handling (safe no-op if none)
        Stripe.handleReturnIfPresent();

        Payments.queuePrepare(false);

        Analytics.emit("app_ready", {});
      } catch (e) {
        try {
          console.warn("[FF] init error", e);
        } catch {}
      }
    };

    return { init };
  })();

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => App.init(), { once: true });
    } else {
      App.init();
    }
  } catch {
    try {
      App.init();
    } catch {}
  }
})();

