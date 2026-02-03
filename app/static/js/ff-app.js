/* ============================================================================
 * ff-app.js — FutureFunded Flagship (Drop-In, contract-first + template-first)
 * Version: 17.0.0
 *
 * What’s new vs v16:
 * - Selector adapter layer: supports data-ff*, ids, data-ff="key", data-ff-role="key"
 * - Optional selector overrides via:
 *     <script id="ffSelectors" type="application/json">{ "payBtn": "#donateBtn" }</script>
 *   or window.__FF_SELECTORS__ = { payBtn: "#donateBtn" }
 * - Template-first rendering for Team Cards and Toasts:
 *     <template data-ff-template="team-card">...</template>
 *     <template data-ff-template="toast">...</template>
 * ========================================================================== */
(() => {
  "use strict";

  const APP = "FutureFunded Flagship";
  const VERSION = "17.0.0";

  // --------------------------------------------------------------------------
  // Boot guard (prevents double init)
  // --------------------------------------------------------------------------
  const BOOT_KEY = "__FF_APP_BOOT__";
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = { at: Date.now(), app: APP, v: VERSION };

  // --------------------------------------------------------------------------
  // Tiny utilities
  // --------------------------------------------------------------------------
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const safeJson = (txt, fallback = null) => {
    try { return JSON.parse(txt); } catch { return fallback; }
  };

  const cssEscape = (s) => {
    try {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s));
    } catch {}
    return String(s).replace(/["\\]/g, "\\$&");
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const kebab = (s) =>
    String(s || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/_/g, "-")
      .toLowerCase();

  const $ = (sel, root = document) => {
    try { return (root || document).querySelector(sel); } catch { return null; }
  };
  const $$ = (sel, root = document) => {
    try { return Array.from((root || document).querySelectorAll(sel)); } catch { return []; }
  };
  const on = (el, ev, fn, opts) => {
    try { if (el) el.addEventListener(ev, fn, opts || false); } catch {}
  };
  const debounce = (fn, ms = 150) => {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const meta = (name) => {
    try {
      const el = document.querySelector(`meta[name="${cssEscape(name)}"]`);
      return (el?.getAttribute("content") || "").trim();
    } catch {
      return "";
    }
  };

  const fetchWithTimeout = async (url, opts = {}, timeoutMs = 15000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  // Handles: "$25", "25.00", "1,200.50" etc. (non-negative)
  const parseMoneyToCents = (val) => {
    const raw = String(val ?? "").trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/,/g, "").replace(/[^\d.\-()]/g, "");
    const paren = cleaned.match(/^\((.*)\)$/);
    const numeric = paren ? `-${paren[1]}` : cleaned;
    const n = Number(numeric);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.round(n * 100));
  };

  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  const formatMoney = (cents, currency = "USD", locale = "en-US") => {
    const c = Number(cents || 0);
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(c / 100);
    } catch {
      const v = (c / 100).toFixed(2);
      return `$${v}`;
    }
  };

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
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
      return true;
    } catch {
      return false;
    }
  };

  // --------------------------------------------------------------------------
  // Selector Adapter (lets JS match your real HTML/CSS without editing JS)
  // --------------------------------------------------------------------------
  const SelectorAdapter = (() => {
    const readOverrides = () => {
      const fromWindow = window.__FF_SELECTORS__;
      if (fromWindow && typeof fromWindow === "object") return fromWindow;

      const el = document.getElementById("ffSelectors");
      if (el && String(el.type || "").includes("json")) {
        const j = safeJson(String(el.textContent || "").trim(), null);
        if (j && typeof j === "object") return j;
      }
      return {};
    };

    const overrides = readOverrides();

    const buildGeneric = (key) => {
      const k = String(key || "").trim();
      if (!k) return "";
      const kk = kebab(k);

      // Generic aliases that survive HTML refactors:
      // - data-ff="key"
      // - data-ff-role="key"
      // - data-ff-id="key"
      // - data-ff-key (boolean attribute style)
      // - #key (id)
      return [
        `[data-ff="${cssEscape(k)}"]`,
        `[data-ff-role="${cssEscape(k)}"]`,
        `[data-ff-id="${cssEscape(k)}"]`,
        `[data-ff-${cssEscape(kk)}]`,
        `#${cssEscape(k)}`,
      ].join(",");
    };

    const merge = (key, defaults = []) => {
      const o = overrides[key];
      if (typeof o === "string" && o.trim()) return o.trim();
      if (Array.isArray(o) && o.length) return o.filter(Boolean).join(",");
      return defaults.filter(Boolean).join(",") || buildGeneric(key);
    };

    return { merge };
  })();

  // --------------------------------------------------------------------------
  // DOM contract (data-ff-* / data-ff-id, then fallback ids + generic aliases)
  // --------------------------------------------------------------------------
  const DOM = (() => {
    const byFfId = (id) => {
      try {
        return document.querySelector(`[data-ff-id="${cssEscape(id)}"]`) || document.getElementById(id);
      } catch {
        return document.getElementById(id);
      }
    };

    // Note: each getter supports:
    // 1) selector overrides via ffSelectors / window.__FF_SELECTORS__
    // 2) contract-first selectors
    // 3) generic aliases (data-ff="key", data-ff-role="key", #key)
    const q = (key, defaults = []) => $(SelectorAdapter.merge(key, defaults));
    const qa = (key, defaults = []) => $$(SelectorAdapter.merge(key, defaults));

    return {
      // Shell
      shell: () => q("shell", ["#ffShell", "[data-ff-shell]"]),

      // Brand
      orgName: () => q("orgName", ["[data-ff-org-name]"]),
      orgMeta: () => q("orgMeta", ["[data-ff-org-location]"]),
      footerOrgName: () => q("footerOrgName", ['[data-ff-footer-org-name]', '[data-ff="footerOrgName"]']) || byFfId("footerOrgName"),
      footerOrgMeta: () => q("footerOrgMeta", ['[data-ff-footer-org-meta]', '[data-ff="footerOrgMeta"]']) || byFfId("footerOrgMeta"),
      seasonPill: () => q("seasonPill", ["[data-ff-season-pill]"]) || byFfId("seasonPill"),
      sportPill: () => q("sportPill", ["[data-ff-sport-pill]"]) || byFfId("sportPill"),
      heroAccentLine: () => q("heroAccentLine", ["#heroAccentLine"]) || byFfId("heroAccentLine"),

      // Live totals / progress
      topbarRaised: () => q("topbarRaised", ["[data-ff-raised]"]),
      topbarGoal: () => q("topbarGoal", ["[data-ff-goal]"]),
      topbarDeadline: () => q("topbarDeadline", ["[data-ff-deadline]"]),
      topbarCountdown: () => q("topbarCountdown", ["[data-ff-countdown]"]),
      raisedBig: () => q("raisedBig", ["#raisedBig"]) || byFfId("raisedBig"),
      raisedRow: () => q("raisedRow", ["#raisedRow"]) || byFfId("raisedRow"),
      goalRow: () => q("goalRow", ["#goalRow"]) || byFfId("goalRow"),
      remainingText: () => q("remainingText", ["#remainingText"]) || byFfId("remainingText"),
      deadlineText: () => q("deadlineText", ["#deadlineText"]) || byFfId("deadlineText"),
      pctText: () => q("pctText", ["#pctText"]) || byFfId("pctText"),
      overallBar: () => q("overallBar", ["#overallBar", '[data-ff-progress-bar]']) || byFfId("overallBar"),
      goalPill: () => q("goalPill", ["#goalPill"]) || byFfId("goalPill"),

      // Sticky
      sticky: () => q("sticky", ["#ffSticky", "[data-ff-sticky]"]) || byFfId("ffSticky"),
      stickyRaised: () => q("stickyRaised", ["#stickyRaised"]) || byFfId("stickyRaised"),
      stickyGoal: () => q("stickyGoal", ["#stickyGoal"]) || byFfId("stickyGoal"),
      stickyGift: () => q("stickyGift", ["#stickyGift"]) || byFfId("stickyGift"),
      stickyHint: () => q("stickyHint", ["[data-ff-sticky-hint]"]),
      stickyTeam: () => q("stickyTeam", ["#stickyTeam"]) || byFfId("stickyTeam"),
      stickyImpact: () => q("stickyImpact", ["#stickyImpact"]) || byFfId("stickyImpact"),

      // Countdown in hero
      heroCountdown: () => q("heroCountdown", ["#heroCountdown"]) || byFfId("heroCountdown"),

      // Teams
      teamsGrid: () => q("teamsGrid", ["[data-ff-teams-grid]"]),
      teamsStatus: () => q("teamsStatus", ["[data-ff-teams-status]"]),
      teamSearch: () => q("teamSearch", ["[data-ff-team-search]"]),
      teamSortWrap: () => q("teamSortWrap", ["[data-ff-team-sort]"]),
      teamSelectedPill: () => q("teamSelectedPill", ["[data-ff-team-selected]"]),
      teamSelectedName: () => q("teamSelectedName", ["[data-ff-team-selected-name]"]),
      teamShareBtn: () => q("teamShareBtn", ["[data-ff-team-share]"]),
      teamsEmpty: () => q("teamsEmpty", ["[data-ff-teams-empty]"]),
      teamsSkeleton: () => q("teamsSkeleton", ["[data-ff-teams-skeleton]"]),

      // Donate form
      donationForm: () => q("donationForm", ["#donationForm", "[data-ff-donate-form]", "form[data-ff-role='donateForm']"]) || byFfId("donationForm"),
      amount: () => q("amount", ["[data-ff-amount]"]),
      email: () => q("email", ["[data-ff-email]"]),
      fullName: () => q("fullName", ["[data-ff-name]"]),
      message: () => q("message", ["[data-ff-message]"]),
      anonymous: () => q("anonymous", ["[data-ff-anonymous]"]),
      coverFees: () => q("coverFees", ["[data-ff-cover-fees], [data-ff-coverfees]"]),
      roundUp: () => q("roundUp", ["[data-ff-round-up]"]),

      // Attribution summary
      attribBox: () => q("attribBox", ["[data-ff-attrib-box]", "#attribBox"]) || byFfId("attribBox"),
      summaryTeamRow: () => q("summaryTeamRow", ["#summaryTeamRow"]) || byFfId("summaryTeamRow"),
      summaryTeam: () => q("summaryTeam", ["#summaryTeam"]) || byFfId("summaryTeam"),

      // Receipt / totals
      receiptEmail: () => q("receiptEmail", ["#receiptEmail"]) || byFfId("receiptEmail"),
      summaryAmount: () => q("summaryAmount", ["#summaryAmount"]) || byFfId("summaryAmount"),
      summaryFees: () => q("summaryFees", ["#summaryFees"]) || byFfId("summaryFees"),
      summaryTotal: () => q("summaryTotal", ["#summaryTotal"]) || byFfId("summaryTotal"),

      // Payment UI
      payBtn: () => q("payBtn", ["[data-ff-pay-btn]", "#payBtn"]) || byFfId("payBtn"),
      payError: () => q("payError", ["#payError"]) || byFfId("payError"),
      payErrorText: () => q("payErrorText", ["#payErrorText"]) || byFfId("payErrorText"),
      paySuccess: () => q("paySuccess", ["#paySuccess"]) || byFfId("paySuccess"),
      paySuccessText: () => q("paySuccessText", ["#paySuccessText"]) || byFfId("paySuccessText"),
      checkoutStatusText: () => q("checkoutStatusText", ["#checkoutStatusText"]) || byFfId("checkoutStatusText"),
      checkoutMethodPill: () => q("checkoutMethodPill", ["#checkoutMethodPill", "[data-ff-payment-method]"]) || byFfId("checkoutMethodPill"),
      checkoutMethodText: () => q("checkoutMethodText", ["#checkoutMethodText"]) || byFfId("checkoutMethodText"),
      stripeMountEl: () => q("paymentElement", ["[data-ff-stripe-element]", "#paymentElement"]) || byFfId("paymentElement"),
      // Share / QR
      shareLink: () => q("shareLink", ["#shareLink"]) || byFfId("shareLink"),

      // Role-aware QR hooks (new contract):
      // - [data-ff-qr][data-ff-qr-role="hero"]
      // - [data-ff-qr][data-ff-qr-role="share"]
      qrHero: () => qa("qrHero", ['[data-ff-qr][data-ff-qr-role="hero"]']),
      qrShare: () => qa("qrShare", ['[data-ff-qr][data-ff-qr-role="share"]']),

      // Back-compat: still supports old IDs, then any [data-ff-qr]
      shareQr: () => q("shareQr", ['[data-ff-qr][data-ff-qr-role="share"]', "#shareQr", "[data-ff-qr]"]) || byFfId("shareQr"),
      progressQr: () => q("progressQr", ['[data-ff-qr][data-ff-qr-role="hero"]', "#progressQr", "[data-ff-qr]"]) || byFfId("progressQr"),

      // All QR images (includes hero + share + any future placements)
      qrImgs: () => qa("qrImgs", ["[data-ff-qr]"]),


      shareScript: () => q("shareScript", ["[data-ff-share-script]"]),
      proofScript: () => q("proofScript", ["[data-ff-proof-script]"]),

      // Proof modal
      proofCaption: () => q("proofCaption", ["#proofCaption"]) || byFfId("proofCaption"),
      proofDonorName: () => q("proofDonorName", ["#proofDonorName"]) || byFfId("proofDonorName"),
      proofAmount: () => q("proofAmount", ["#proofAmount"]) || byFfId("proofAmount"),
      proofCampaign: () => q("proofCampaign", ["#proofCampaign"]) || byFfId("proofCampaign"),

      // Theme toggle
      themeToggle: () => q("themeToggle", ["[data-ff-theme-toggle]"]),

      // Drawer
      drawer: () => q("drawer", ["#mobileDrawer", "[data-ff-drawer]"]) || byFfId("mobileDrawer"),
      drawerPanel: () => q("drawerPanel", ["[data-ff-drawer-panel]"]),
      drawerOpeners: () => qa("drawerOpeners", ["[data-ff-drawer-open]"]),
      drawerClosers: () => qa("drawerClosers", ["[data-ff-drawer-close]"]),

      // Modals
      modalShare: () => q("ffShareModal", ["#ffShareModal", "[data-ff-modal='share']"]) || byFfId("ffShareModal"),
      modalProof: () => q("ffProofModal", ["#ffProofModal", "[data-ff-modal='proof']"]) || byFfId("ffProofModal"),
      modalPolicy: () => q("ffPolicyModal", ["#ffPolicyModal", "[data-ff-modal='policy']"]) || byFfId("ffPolicyModal"),

      // Templates
      
tplTeamCard: () => $('template[data-ff-template="team-card"], template[data-ff-team-card-template]'),

      tplToast: () => $(`template[data-ff-template="toast"]`),
    };
  })();

  // --------------------------------------------------------------------------
  // Tiny template binder (lets HTML own the markup/CSS)
  // --------------------------------------------------------------------------
  const Template = (() => {
    // Supported bindings:
    // - data-ff-text="field"
    // - data-ff-attr="src:photo,alt:name,href:url"
    // - data-ff-class="is-selected:selected,is-soldout:soldOut"
    const setText = (el, v) => { try { el.textContent = String(v ?? ""); } catch {} };
    const setAttr = (el, k, v) => {
      try {
        if (v == null || v === "") el.removeAttribute(k);
        else el.setAttribute(k, String(v));
      } catch {}
    };
    const toggleClass = (el, cls, on) => { try { el.classList.toggle(cls, !!on); } catch {} };

    const get = (data, path) => {
      const p = String(path || "").trim();
      if (!p) return "";
      // supports nested like "team.name"
      const parts = p.split(".");
      let cur = data;
      for (const part of parts) {
        if (!cur || typeof cur !== "object") return "";
        cur = cur[part];
      }
      return cur;
    };

    const apply = (root, data) => {
      if (!root) return root;

      // root itself can have bindings too
      const nodes = [root, ...$$(`
        [data-ff-text],
        [data-ff-attr],
        [data-ff-class]
      `, root)];

      for (const el of nodes) {
        const t = el.getAttribute("data-ff-text");
        if (t) setText(el, get(data, t));

        const a = el.getAttribute("data-ff-attr");
        if (a) {
          const pairs = a.split(",").map(x => x.trim()).filter(Boolean);
          for (const pair of pairs) {
            const [attr, field] = pair.split(":").map(x => String(x || "").trim());
            if (!attr || !field) continue;
            setAttr(el, attr, get(data, field));
          }
        }

        const c = el.getAttribute("data-ff-class");
        if (c) {
          const pairs = c.split(",").map(x => x.trim()).filter(Boolean);
          for (const pair of pairs) {
            const [cls, field] = pair.split(":").map(x => String(x || "").trim());
            if (!cls || !field) continue;
            toggleClass(el, cls, !!get(data, field));
          }
        }
      }

      return root;
    };

    const clone = (tplEl) => {
      try {
        if (!tplEl?.content) return null;
        return tplEl.content.firstElementChild
          ? tplEl.content.firstElementChild.cloneNode(true)
          : tplEl.content.cloneNode(true);
      } catch {
        return null;
      }
    };

    return { apply, clone };
  })();

  // --------------------------------------------------------------------------
  // Toasts (template-first)
  // --------------------------------------------------------------------------
  const toast = (msg, kind = "info", ms = 2600) => {
    if (!msg) return;

    let host = $("[data-ff-toasts]");
    if (!host) {
      host = document.createElement("div");
      host.className = "ff-toasts";
      host.setAttribute("data-ff-toasts", "");
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "false");
      host.style.position = "fixed";
      host.style.right = "14px";
      host.style.bottom = "14px";
      host.style.zIndex = "99999";
      host.style.display = "grid";
      host.style.gap = "10px";
      document.body.appendChild(host);
    }

    const tpl = DOM.tplToast();
    let el = null;

    if (tpl) {
      el = Template.clone(tpl);
      if (el) {
        Template.apply(el, { msg: String(msg), kind: String(kind) });
        // optional: let your CSS target kinds
        try { el.setAttribute("data-ff-kind", String(kind)); } catch {}
      }
    }

    if (!el) {
      el = document.createElement("div");
      el.className = `ff-toast ff-toast--${kind}`;
      el.textContent = String(msg);

      // readable even without CSS
      el.style.padding = "10px 12px";
      el.style.borderRadius = "12px";
      el.style.backdropFilter = "blur(8px)";
      el.style.background = kind === "error" ? "rgba(255,59,48,0.95)" : "rgba(15, 15, 20, 0.85)";
      el.style.color = "white";
      el.style.boxShadow = "0 10px 28px rgba(0,0,0,0.22)";
    }

    host.appendChild(el);

    setTimeout(() => {
      try { el.remove(); } catch {}
    }, clamp(Number(ms) || 2600, 1200, 7000));
  };

  // --------------------------------------------------------------------------
  // Draft ID (stabilizes checkout session)
  // --------------------------------------------------------------------------
  const DraftId = {
    KEY: "ff_draft_id",
    get() {
      try {
        let v = String(localStorage.getItem(this.KEY) || "").trim();
        if (v) return v;

        v = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : `ff_${Math.random().toString(16).slice(2)}_${Date.now()}`;

        localStorage.setItem(this.KEY, v);
        return v;
      } catch {
        return `ff_${Math.random().toString(16).slice(2)}_${Date.now()}`;
      }
    },
    clear() {
      try { localStorage.removeItem(this.KEY); } catch {}
    },
  };

  // --------------------------------------------------------------------------
  // Config loader + normalization (same schema as v16)
  // --------------------------------------------------------------------------
  const Config = {
    data: null,
    _warnedInvalid: false,

    read() {
      const el = $("#ffConfig");
      if (!el) return null;

      const raw = String(el.textContent || "").trim();
      if (!raw) return null;

      const parsed = safeJson(raw, null);
      if (!parsed || typeof parsed !== "object") {
        if (!this._warnedInvalid) {
          this._warnedInvalid = true;
          console.warn("[FF] Invalid ffConfig JSON; falling back.");
          toast("Config JSON is invalid (ffConfig). Using fallback.", "error", 4200);
        }
        return null;
      }
      return parsed;
    },

    shellFallback() {
      const shell = DOM.shell();
      const version = String(shell?.dataset?.ffVersion || window?.__FF_APP_BOOT__?.v || VERSION);

      const orgName = String(DOM.orgName()?.textContent || "").trim() || "Fundraiser";
      const orgMeta = String(DOM.orgMeta()?.textContent || "").trim();

      return {
        org: {
          id: shell?.dataset?.ffOrg || null,
          slug: "",
          allocationMode: "club_total",
          name: orgName,
          meta: orgMeta,
        },
        fundraiser: {},
        flagship: { version, defaults: { currency: "USD", locale: "en-US" } },
        sponsors: { enabled: false, items: [] },
        donations: { enabled: false, items: [] },
        payments: {},
        campaign: {},
      };
    },

    merge(base, extra) {
      const b = base && typeof base === "object" ? base : {};
      const e = extra && typeof extra === "object" ? extra : {};

      const mergeObj = (x, y) => ({
        ...(x && typeof x === "object" ? x : {}),
        ...(y && typeof y === "object" ? y : {}),
      });

      return {
        ...b,
        ...e,
        org: mergeObj(b.org, e.org),
        fundraiser: mergeObj(b.fundraiser, e.fundraiser),
        campaign: mergeObj(b.campaign, e.campaign),
        sponsors: mergeObj(b.sponsors, e.sponsors),
        donations: mergeObj(b.donations, e.donations),
        payments: mergeObj(b.payments, e.payments),
        flagship: {
          ...mergeObj(b.flagship, e.flagship),
          defaults: mergeObj(b.flagship?.defaults, e.flagship?.defaults),
        },
        teams: Array.isArray(e.teams) ? e.teams : (Array.isArray(b.teams) ? b.teams : []),
      };
    },

    normalize(raw) {
      const shell = DOM.shell();
      const obj = (v) => (v && typeof v === "object" ? v : {});
      const arr = (v) => (Array.isArray(v) ? v : []);

      raw = obj(raw);

      const version = String(
        raw?.flagship?.version ||
          shell?.dataset?.ffVersion ||
          document.documentElement.getAttribute("data-ff-version") ||
          window?.__FF_APP_BOOT__?.v ||
          VERSION
      );

      const defaults = obj(raw.flagship?.defaults);
      const currency = String(defaults.currency || "USD");
      const locale = String(defaults.locale || "en-US");

      const org = obj(raw.org);
      const fundraiser = obj(raw.fundraiser);

      const allocationMode = String(org.allocationMode || "club_total");
      const clubGoal = Number(fundraiser.goalAmount ?? fundraiser.goal_amount ?? 0) || 0;
      const clubRaised = Number(fundraiser.raisedAmount ?? fundraiser.raised_amount ?? 0) || 0;

      const teams = arr(raw.teams);
      const normalizedTeams = teams.map((t, idx) => {
        const tt = obj(t);
        const id = String(tt.id || `team_${idx + 1}`);
        const name = String(tt.name || "Team");

        const goal =
          allocationMode === "club_total" ? clubGoal : (Number(tt.goal ?? clubGoal ?? 0) || 0);

        const raised =
          allocationMode === "club_total" ? clubRaised : (Number(tt.raised ?? 0) || 0);

        return {
          id,
          name,
          meta: String(tt.meta || ""),
          photo: String(tt.photo || ""),
          featured: !!tt.featured,
          ask: String(tt.ask || ""),
          goal,
          raised,
          createdISO: String(tt.createdISO || tt.created_at || ""),
          restricted: !!tt.restricted,
          needs: !!tt.needs,
        };
      });

      const sponsorsRaw = obj(raw.sponsors);
      const donationsRaw = obj(raw.donations);

      const sponsors = { enabled: sponsorsRaw.enabled !== false, items: arr(sponsorsRaw.items) };
      const donations = { enabled: donationsRaw.enabled !== false, items: arr(donationsRaw.items) };

      return {
        __schema: "flagship",
        flagship: { version, defaults: { currency, locale } },
        org: {
          name: String(org.name || DOM.orgName()?.textContent?.trim() || "Fundraiser"),
          meta: String(org.meta || DOM.orgMeta()?.textContent?.trim() || ""),
          seasonPill: String(org.seasonPill || ""),
          sportPill: String(org.sportPill || ""),
          heroAccentLine: String(org.heroAccentLine || ""),
          footerTagline: String(org.footerTagline || ""),
          allocationMode,
          id: org.id ?? (shell?.dataset?.ffOrg || null),
          slug: String(org.slug || ""),
          whitelabel: String(shell?.dataset?.ffWhitelabel || "false") === "true",
        },
        fundraiser: {
          goalAmount: clubGoal,
          raisedAmount: clubRaised,
          deadlineISO: String(fundraiser.deadlineISO || fundraiser.deadline_iso || ""),
          match: fundraiser.match && typeof fundraiser.match === "object" ? fundraiser.match : null,
        },
        campaign: { name: String(raw?.campaign?.name || raw?.campaign?.campaign_name || "") },
        teams: normalizedTeams,
        sponsors,
        donations,
        payments: obj(raw.payments),
      };
    },

    load() {
      const fallback = this.shellFallback();
      const raw = this.read();
      const merged = this.merge(fallback, raw || {});
      this.data = this.normalize(merged);
      window.__FF_CONFIG__ = this.data;
      return this.data;
    },
  };

  // --------------------------------------------------------------------------
  // State (client-only context)
  // --------------------------------------------------------------------------
  const State = {
    selectedTeam: null,
    prefill: { purpose: "", sku: "" },
    _KEY_TEAM: "ff_selected_team",

    hydrateSelectedTeam() {
      try {
        const raw = sessionStorage.getItem(this._KEY_TEAM);
        if (!raw) return;
        const j = safeJson(raw, null);
        if (j && typeof j === "object" && j.id) {
          this.selectedTeam = { id: String(j.id), name: String(j.name || "") };
          window.__FF_SELECTED_TEAM__ = this.selectedTeam;
        }
      } catch {}
    },

    persistSelectedTeam() {
      try {
        if (!this.selectedTeam) sessionStorage.removeItem(this._KEY_TEAM);
        else sessionStorage.setItem(this._KEY_TEAM, JSON.stringify(this.selectedTeam));
      } catch {}
    },

    setSelectedTeam(team) {
      if (!team?.id) return;
      this.selectedTeam = { id: String(team.id), name: String(team.name || "") };
      window.__FF_SELECTED_TEAM__ = this.selectedTeam;
      this.persistSelectedTeam();
    },

    clearSelectedTeam() {
      this.selectedTeam = null;
      window.__FF_SELECTED_TEAM__ = null;
      this.persistSelectedTeam();
    },
  };

  // --------------------------------------------------------------------------
  // Canonical/share URL helpers
  // --------------------------------------------------------------------------
  const Canonical = {
    _cachedBase: null,

    _coerceHttps(u) {
      let out = String(u || "");
      if (window.location.protocol === "https:" && out.startsWith("http://")) {
        out = "https://" + out.slice(7);
      }
      return out;
    },

    baseUrl() {
      if (this._cachedBase) return new URL(this._cachedBase.toString());

      const fromMeta = meta("ff-canonical") || meta("ff-stripe-return-url") || "";
      const fallback = `${window.location.origin}${window.location.pathname}`;

      const raw = this._coerceHttps(fromMeta || fallback);

      try {
        const url = new URL(raw, window.location.origin);
        url.hash = "";
        this._cachedBase = url;
        return new URL(url.toString());
      } catch {
        const url = new URL(fallback, window.location.origin);
        url.hash = "";
        this._cachedBase = url;
        return new URL(url.toString());
      }
    },

    readSrc() {
      try {
        const u = new URL(window.location.href);
        const src = String(u.searchParams.get("src") || "").trim();
        if (!src) return null;

        const m = src.match(/^team:(.+)$/i);
        if (!m) return null;

        const teamId = String(m[1] || "").trim();
        return teamId || null;
      } catch {
        return null;
      }
    },

    shareUrl() {
      const url = this.baseUrl();
      if (State.selectedTeam?.id) url.searchParams.set("src", `team:${State.selectedTeam.id}`);
      else url.searchParams.delete("src");
      return url.toString();
    },
  };

  // --------------------------------------------------------------------------
  // Mirror system (unchanged)
  // --------------------------------------------------------------------------
  const Mirror = {
    _raf: 0,
    _readNode(node) {
      if (!node) return "";
      if ("value" in node) return String(node.value ?? "");
      return String(node.textContent ?? "");
    },
    _writeNode(node, v) {
      if (!node) return;
      const val = String(v ?? "");
      if ("value" in node) node.value = val;
      else node.textContent = val;
    },
    _resolveSource(selOrKey) {
      const token = String(selOrKey || "").trim();
      if (!token) return null;

      const looksLikeSelector =
        token.startsWith("#") ||
        token.startsWith(".") ||
        token.startsWith("[") ||
        token.includes(" ") ||
        token.includes(">") ||
        token.includes(":");

      if (looksLikeSelector) {
        try { return $(token); } catch { return null; }
      }

      try { return $(`[data-ff-mirror-source="${cssEscape(token)}"]`); } catch { return null; }
    },
    refresh() {
      const mirrors = $$("[data-ff-mirror]");
      if (!mirrors.length) return;

      for (const m of mirrors) {
        const key = String(m.getAttribute("data-ff-mirror") || "").trim();
        if (!key) continue;
        const src = this._resolveSource(key);
        if (!src) continue;
        this._writeNode(m, this._readNode(src));
      }
    },
    schedule() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.refresh();
      });
    },
    init() {
      const sources = $$("[data-ff-mirror-source]");
      if (sources.length) {
        for (const s of sources) {
          if (!("addEventListener" in s)) continue;
          on(s, "input", () => this.schedule());
          on(s, "change", () => this.schedule());
        }
      }
      on(document, "input", (e) => {
        try {
          if (e.target?.closest?.("[data-ff-mirror-source]")) this.schedule();
        } catch {}
      }, true);
      this.refresh();
    },
  };

  // --------------------------------------------------------------------------
  // Theme (unchanged)
  // --------------------------------------------------------------------------
  const Theme = {
    STORAGE_KEY: "ff_theme",
    _mql: null,

    getSaved() {
      try {
        const v = String(localStorage.getItem(this.STORAGE_KEY) || "").toLowerCase();
        if (v === "light" || v === "dark" || v === "system") return v;
      } catch {}
      return "system";
    },

    resolve(mode) {
      if (mode === "light" || mode === "dark") return mode;
      const mql = this._mql || (window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);
      return mql && mql.matches ? "dark" : "light";
    },

    apply(mode) {
      const resolved = this.resolve(mode);
      const root = document.documentElement;

      root.dataset.theme = resolved;
      root.classList.toggle("dark", resolved === "dark");
      try { root.style.colorScheme = resolved; } catch {}

      const btn = DOM.themeToggle();
      if (btn) btn.setAttribute("aria-pressed", resolved === "dark" ? "true" : "false");
    },

    toggle(e) {
      const saved = this.getSaved();
      const currentResolved = this.resolve(saved);

      let next;
      if (e?.altKey) next = saved === "system" ? "dark" : (saved === "dark" ? "light" : "system");
      else next = currentResolved === "dark" ? "light" : "dark";

      try { localStorage.setItem(this.STORAGE_KEY, next); } catch {}
      this.apply(next);
    },

    init() {
      this._mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      this.apply(this.getSaved());

      try {
        this._mql?.addEventListener?.("change", () => {
          if (this.getSaved() === "system") this.apply("system");
        });
      } catch {}

      on(document, "click", (e) => {
        try {
          const btn = e.target.closest?.("[data-ff-theme-toggle]");
          if (!btn) return;
          e.preventDefault();
          this.toggle(e);
          try { Stripe.queuePrepare(true); } catch {}
        } catch {}
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // Announcement + Topbar dismiss (unchanged)
  // --------------------------------------------------------------------------
  const Dismiss = {
    key(name) {
      const orgId = String(Config.data?.org?.id || DOM.shell()?.dataset?.ffOrg || "");
      return orgId ? `${name}:${orgId}` : name;
    },
    ANN_KEY: "ff_announce_dismissed",
    TOPBAR_KEY: "ff_topbar_dismissed",
    _get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    _set(k, v) { try { localStorage.setItem(k, v); } catch {} },

    init() {
      try {
        const ann = $("[data-ff-announcement]");
        if (ann) {
          const key = this.key(this.ANN_KEY);
          if (this._get(key) === "1") ann.hidden = true;

          on(document, "click", (e) => {
            try {
              const b = e.target.closest?.("[data-ff-announcement-dismiss]");
              if (!b) return;
              e.preventDefault();
              ann.hidden = true;
              this._set(key, "1");
            } catch {}
          }, true);
        }
      } catch {}

      try {
        const topbar = $("[data-ff-topbar]");
        if (topbar) {
          const key = this.key(this.TOPBAR_KEY);
          if (this._get(key) === "1") topbar.hidden = true;

          on(document, "click", (e) => {
            try {
              const b = e.target.closest?.("[data-ff-topbar-dismiss]");
              if (!b) return;
              e.preventDefault();
              topbar.hidden = true;
              this._set(key, "1");
            } catch {}
          }, true);
        }
      } catch {}
    },
  };

  // --------------------------------------------------------------------------
  // Scroll lock + focus trap (unchanged)
  // --------------------------------------------------------------------------
  const ScrollLock = {
    _count: 0,
    _prevOverflow: "",
    _prevPaddingRight: "",
    lock() {
      this._count++;
      if (this._count > 1) return;

      const body = document.body;
      const docEl = document.documentElement;

      this._prevOverflow = body.style.overflow || "";
      this._prevPaddingRight = body.style.paddingRight || "";

      const scrollbar = Math.max(0, window.innerWidth - docEl.clientWidth);
      body.style.overflow = "hidden";
      if (scrollbar) body.style.paddingRight = `${scrollbar}px`;
    },
    unlock() {
      this._count = Math.max(0, this._count - 1);
      if (this._count !== 0) return;

      const body = document.body;
      try {
        body.style.overflow = this._prevOverflow;
        body.style.paddingRight = this._prevPaddingRight;
      } catch {}
    },
  };

  const Focus = {
    _focusable(root) {
      if (!root) return [];
      try {
        return Array.from(
          root.querySelectorAll(
            [
              "a[href]",
              "button:not([disabled])",
              "input:not([disabled])",
              "select:not([disabled])",
              "textarea:not([disabled])",
              "[tabindex]:not([tabindex='-1'])",
            ].join(",")
          )
        ).filter((el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      } catch {
        return [];
      }
    },
    trapKeydown(e, container, onEscape) {
      if (!container) return;
      if (e.key === "Escape") { onEscape?.(); return; }
      if (e.key !== "Tab") return;

      const items = this._focusable(container);
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
  };

  // --------------------------------------------------------------------------
  // Drawer (unchanged)
  // --------------------------------------------------------------------------
  const Drawer = {
    _isOpen: false,
    _returnFocusEl: null,
    _panelEl: null,

    _drawerEl() { return DOM.drawer(); },

    open(openerEl) {
      const d = this._drawerEl();
      if (!d || this._isOpen) return;

      this._isOpen = true;
      this._returnFocusEl = openerEl || document.activeElement || null;

      try { d.hidden = false; d.setAttribute("aria-hidden", "false"); } catch {}

      (DOM.drawerOpeners() || []).forEach((b) => {
        try { b.setAttribute("aria-expanded", "true"); } catch {}
      });

      ScrollLock.lock();

      const panel = DOM.drawerPanel() || $("[data-ff-drawer-panel]", d) || d;
      this._panelEl = panel;

      setTimeout(() => {
        try {
          const items = Focus._focusable(panel);
          (items[0] || panel)?.focus?.();
        } catch {}
      }, 0);
    },

    close() {
      const d = this._drawerEl();
      if (!d || !this._isOpen) return;

      this._isOpen = false;

      try { d.hidden = true; d.setAttribute("aria-hidden", "true"); } catch {}

      (DOM.drawerOpeners() || []).forEach((b) => {
        try { b.setAttribute("aria-expanded", "false"); } catch {}
      });

      ScrollLock.unlock();

      const el = this._returnFocusEl;
      this._returnFocusEl = null;
      this._panelEl = null;
      try { el?.focus?.(); } catch {}
    },

    init() {
      on(document, "click", (e) => {
        try {
          const open = e.target.closest?.("[data-ff-drawer-open]");
          if (open) { e.preventDefault(); this.open(open); return; }

          const close = e.target.closest?.("[data-ff-drawer-close]");
          if (close) { e.preventDefault(); this.close(); return; }

          const d = this._drawerEl();
          if (this._isOpen && d && e.target === d) { e.preventDefault(); this.close(); }
        } catch {}
      }, true);

      on(document, "keydown", (e) => {
        if (!this._isOpen) return;
        Focus.trapKeydown(e, this._panelEl || this._drawerEl(), () => this.close());
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // Modals (unchanged)
  // --------------------------------------------------------------------------
  const Modals = {
    current: null,
    currentKey: "",
    _returnFocusEl: null,
    _panelEl: null,

    _map(which) {
      return { share: DOM.modalShare(), proof: DOM.modalProof(), policy: DOM.modalPolicy() }[which];
    },

    open(which, openerEl) {
      const el = this._map(which);
      if (!el) return;

      this.close();

      this.current = el;
      this.currentKey = String(which || "");
      this._returnFocusEl = openerEl || document.activeElement || null;

      try {
        el.hidden = false;
        el.setAttribute("aria-hidden", "false");
        el.setAttribute("role", el.getAttribute("role") || "dialog");
        el.setAttribute("aria-modal", "true");
      } catch {}

      if (which === "share") Share.refreshUI(true);
      if (which === "proof") Proof.refreshUI?.();
      if (which === "policy") Share.refreshUI(false);

      ScrollLock.lock();

      const panel = $("[data-ff-modal-panel]", el) || el;
      this._panelEl = panel;

      setTimeout(() => {
        try {
          const items = Focus._focusable(panel);
          (items[0] || panel)?.focus?.();
        } catch {}
      }, 0);
    },

    close() {
      const el = this.current;
      if (!el) return;

      try { el.hidden = true; el.setAttribute("aria-hidden", "true"); } catch {}

      this.current = null;
      this.currentKey = "";
      this._panelEl = null;

      ScrollLock.unlock();

      const focusEl = this._returnFocusEl;
      this._returnFocusEl = null;
      try { focusEl?.focus?.(); } catch {}
    },

    init() {
      on(document, "click", (e) => {
        try {
          const shareOpen = e.target.closest?.("[data-ff-share-open]");
          if (shareOpen) { e.preventDefault(); this.open("share", shareOpen); return; }

          const proofOpen = e.target.closest?.("[data-ff-proof-open]");
          if (proofOpen) { e.preventDefault(); this.open("proof", proofOpen); return; }

          const policyOpen = e.target.closest?.("[data-ff-policy-open]");
          if (policyOpen) { e.preventDefault(); this.open("policy", policyOpen); return; }

          const close = e.target.closest?.("[data-ff-modal-close]");
          if (close) { e.preventDefault(); this.close(); return; }

          const cur = this.current;
          if (cur && e.target === cur) { e.preventDefault(); this.close(); }
        } catch {}
      }, true);

      on(document, "keydown", (e) => {
        if (!this.current) return;
        Focus.trapKeydown(e, this._panelEl || this.current, () => this.close());
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // Share tools (unchanged)
  // --------------------------------------------------------------------------
  const Share = {
    shareScriptText() {
      const cfg = Config.data;
      const orgName = String(cfg?.org?.name || "our program");
      const team = State.selectedTeam?.name ? ` (${State.selectedTeam.name})` : "";
      const url = Canonical.shareUrl();
      return `Help support ${orgName}${team} this season — every gift helps. Donate here: ${url}`;
    },

    refreshUI(updateQr = true) {
      const url = Canonical.shareUrl();

      const input = DOM.shareLink();
      if (input) try { input.value = url; } catch {}

      const scriptEl = DOM.shareScript();
      if (scriptEl) {
        const txt = this.shareScriptText();
        try {
          if ("value" in scriptEl) scriptEl.value = txt;
          else scriptEl.textContent = txt;
        } catch {}
      }

      
      if (updateQr) {
        const qrEndpoint = meta("ff-qr-endpoint");
        if (qrEndpoint) {
          // Size-smart QR: use each <img width/height> + DPR for crispness.
          const setQrSrc = (img) => {
            try {
              const w0 = Number(img.getAttribute("width") || 0) || img.naturalWidth || 112;
              const h0 = Number(img.getAttribute("height") || 0) || img.naturalHeight || 112;

              // Bias slightly above DPR=1 for sharpness, cap to avoid giant URLs.
              const dpr = clamp(Math.round((window.devicePixelRatio || 1) * 1.6), 1, 3);
              const w = clamp(Math.round(w0 * dpr), 96, 600);
              const h = clamp(Math.round(h0 * dpr), 96, 600);

              const size = `${w}x${h}`;
              const src = `${qrEndpoint}?size=${encodeURIComponent(size)}&data=${encodeURIComponent(url)}`;
              img.src = src;
            } catch {}
          };

          DOM.qrImgs().forEach(setQrSrc);
        }
      }


      try { Mirror.schedule?.() || Mirror.refresh?.(); } catch {}
    },

    async copyLink() {
      await copyText(Canonical.shareUrl());
      toast("Link copied", "success");
    },

    async copyScript() {
      await copyText(this.shareScriptText());
      toast("Share script copied", "success");
    },

    async nativeShare() {
      const cfg = Config.data;
      const title = String(cfg?.org?.name || "Fundraiser");
      const url = Canonical.shareUrl();
      const text = this.shareScriptText();

      if (navigator.share) {
        try { await navigator.share({ title, text, url }); } catch {}
        return;
      }
      this.copyLink();
    },

    smsShare() {
      const body = encodeURIComponent(this.shareScriptText());
      window.location.href = `sms:?&body=${body}`;
    },

    emailShare() {
      const cfg = Config.data;
      const subject = encodeURIComponent(`Support ${String(cfg?.org?.name || "our program")}`);
      const body = encodeURIComponent(this.shareScriptText());
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    },

    async downloadQr(triggerEl) {
      try {
        const btn = triggerEl?.closest?.("[data-ff-download-qr]") || triggerEl;
        const targetSel = btn?.getAttribute?.("data-ff-download-target") || "";
        
        const img =
          (targetSel ? $(targetSel) : null) ||
          // Prefer the share QR inside the current modal when present
          btn?.closest?.("[data-ff-modal]")?.querySelector?.('[data-ff-qr][data-ff-qr-role="share"]') ||
          btn?.closest?.("[data-ff-modal]")?.querySelector?.("[data-ff-qr]") ||
          // Fallbacks
          DOM.shareQr() ||
          DOM.progressQr();


        if (!img || !img.src) return;

        const r = await fetchWithTimeout(img.src, { mode: "cors" }, 12000);
        if (!r.ok) throw new Error("Could not fetch QR.");
        const blob = await r.blob();
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = "fundraiser-qr.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("QR downloaded", "success");
      } catch {
        try { window.open((triggerEl?.src || triggerEl?.href), "_blank", "noopener"); } catch {}
      }
    },

    applyAttributionFromUrl() {
      const id = Canonical.readSrc?.() || null;
      if (!id) return;
      try { Teams.select(id, { quiet: true }); } catch {}
    },

    init() {
      this.applyAttributionFromUrl();
      try { State.hydrateSelectedTeam?.(); } catch {}
      this.refreshUI(true);

      on(document, "click", (e) => {
        try {
          const t = e.target;

          if (t.closest?.("[data-ff-copy-link]")) { e.preventDefault(); this.copyLink(); return; }
          if (t.closest?.("[data-ff-copy-script]")) { e.preventDefault(); this.copyScript(); return; }
          if (t.closest?.("[data-ff-native-share]")) { e.preventDefault(); this.nativeShare(); return; }
          if (t.closest?.("[data-ff-sms-share]")) { e.preventDefault(); this.smsShare(); return; }
          if (t.closest?.("[data-ff-email-share]")) { e.preventDefault(); this.emailShare(); return; }

          const dl = t.closest?.("[data-ff-download-qr]");
          if (dl) { e.preventDefault(); this.downloadQr(dl); return; }

          if (t.closest?.("[data-ff-team-share]")) {
            e.preventDefault();
            Modals.open("share", t.closest?.("[data-ff-team-share]"));
            return;
          }
        } catch {}
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // Brand + Progress + Countdown (unchanged)
  // --------------------------------------------------------------------------
  const Brand = {
    render() {
      const cfg = Config.data;
      if (!cfg?.org) return;

      const org = cfg.org;
      const setText = (el, txt) => { if (el) try { el.textContent = String(txt ?? ""); } catch {} };

      setText(DOM.orgName(), org.name);
      setText(DOM.footerOrgName(), org.name);
      setText(DOM.orgMeta(), org.meta);
      setText(DOM.footerOrgMeta(), org.meta);

      if (org.seasonPill) setText(DOM.seasonPill(), org.seasonPill);
      if (org.sportPill) setText(DOM.sportPill(), org.sportPill);
      if (org.heroAccentLine && DOM.heroAccentLine()) setText(DOM.heroAccentLine(), org.heroAccentLine);

      if (org.whitelabel) {
        $$("[data-ff-powered]").forEach((x) => { try { x.textContent = ""; } catch {} });
        $$('a[aria-label*="Powered by"]').forEach((a) => { try { a.hidden = true; } catch {} });
      }

      try { Share.refreshUI?.(true); } catch {}
      try { Mirror.schedule?.() || Mirror.refresh?.(); } catch {}
    },
  };

  const Progress = {
    totals() {
      const cfg = Config.data;
      const goal = Number(cfg?.fundraiser?.goalAmount || 0) || 0;
      const raised = Number(cfg?.fundraiser?.raisedAmount || 0) || 0;

      const goalCents = Math.max(0, Math.round(goal * 100));
      const raisedCents = Math.max(0, Math.round(raised * 100));

      return { goalCents, raisedCents };
    },

    render() {
      const cfg = Config.data;
      if (!cfg?.fundraiser || !cfg?.flagship?.defaults) return;

      const { currency, locale } = cfg.flagship.defaults;
      const { goalCents, raisedCents } = this.totals();

      const pct = goalCents > 0 ? clamp(Math.round((raisedCents / goalCents) * 100), 0, 999) : 0;
      const remaining = Math.max(0, goalCents - raisedCents);

      const setText = (el, txt) => { if (el) try { el.textContent = String(txt ?? ""); } catch {} };

      const raisedTxt = formatMoney(raisedCents, currency, locale);
      const goalTxt = formatMoney(goalCents, currency, locale);
      const remainingTxt = formatMoney(remaining, currency, locale);

      setText(DOM.topbarRaised(), raisedTxt);
      setText(DOM.topbarGoal(), goalTxt);

      setText(DOM.raisedBig(), raisedTxt);
      setText(DOM.raisedRow(), raisedTxt);
      setText(DOM.goalRow(), goalTxt);
      setText(DOM.goalPill(), goalTxt);
      setText(DOM.pctText(), String(pct));
      setText(DOM.remainingText(), remainingTxt);

      const bar = DOM.overallBar();
      if (bar) {
        try {
          bar.style.width = `${clamp(pct, 0, 100)}%`;
          bar.setAttribute("aria-valuenow", String(clamp(pct, 0, 100)));
        } catch {}
      }

      setText(DOM.stickyRaised(), raisedTxt);
      setText(DOM.stickyGoal(), goalTxt);

      try { Mirror.schedule?.() || Mirror.refresh?.(); } catch {}
    },
  };

  const Countdown = {
    timer: null,
    deadline: null,

    fmt(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (d > 0) return `${d}d ${h}h`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    },

    stop() { try { clearInterval(this.timer); } catch {} this.timer = null; },

    init() {
      const cfg = Config.data;
      const iso = String(cfg?.fundraiser?.deadlineISO || "").trim();
      if (!iso) return;

      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return;

      this.deadline = d;

      const loc = String(cfg?.flagship?.defaults?.locale || "en-US");
      const setText = (el, txt) => { if (el) try { el.textContent = String(txt ?? ""); } catch {} };

      const tick = () => {
        const ms = this.deadline.getTime() - Date.now();
        const prettyDate = this.deadline.toLocaleDateString(loc);

        if (ms <= 0) {
          setText(DOM.heroCountdown(), "Ended");
          setText(DOM.topbarCountdown(), "Ended");
          setText(DOM.topbarDeadline(), prettyDate);
          setText(DOM.deadlineText(), prettyDate);
          try { Mirror.schedule?.() || Mirror.refresh?.(); } catch {}
          this.stop();
          return;
        }

        const left = this.fmt(ms);

        setText(DOM.heroCountdown(), left);
        setText(DOM.topbarCountdown(), left);
        setText(DOM.topbarDeadline(), prettyDate);
        setText(DOM.deadlineText(), prettyDate);

        try { Mirror.schedule?.() || Mirror.refresh?.(); } catch {}
      };

      tick();
      this.stop();
      this.timer = setInterval(tick, 60 * 1000);
    },
  };

  // --------------------------------------------------------------------------
  // Sticky bar visibility (unchanged)
  // --------------------------------------------------------------------------
  const Sticky = {
    _raf: 0,
    init() {
      const el = DOM.sticky();
      if (!el) return;

      const showAt = Number(el.getAttribute("data-ff-sticky-show-at") || 420) || 420;

      const update = () => {
        this._raf = 0;
        const y = window.scrollY || 0;
        const shouldShow = y > showAt;
        try { el.hidden = !shouldShow; } catch {}
      };

      const schedule = () => {
        if (this._raf) return;
        this._raf = requestAnimationFrame(update);
      };

      on(window, "scroll", schedule, { passive: true });
      on(window, "resize", schedule);
      update();
    },
  };

  // --------------------------------------------------------------------------
  // Section tabs + spy (unchanged)
  // --------------------------------------------------------------------------
  const Spy = {
    _io: null,

    init() {
      const tabs = $$("[data-ff-tab]");
      if (!tabs.length || !("IntersectionObserver" in window)) return;

      try { this._io?.disconnect?.(); } catch {}
      this._io = null;

      const sections = tabs
        .map((a) => {
          const href = a.getAttribute("href") || "";
          if (!href.startsWith("#")) return null;
          const sec = $(href);
          const key = a.getAttribute("data-ff-tab") || href.slice(1);
          return sec ? { a, sec, key } : null;
        })
        .filter(Boolean);

      if (!sections.length) return;

      const setActive = (key) => {
        for (const t of tabs) {
          const isActive = (t.getAttribute("data-ff-tab") || "") === key;
          t.classList.toggle("is-active", isActive);
          if (isActive) t.setAttribute("aria-current", "page");
          else t.removeAttribute("aria-current");
        }

        $$("[data-spy]").forEach((n) => {
          n.classList.toggle("is-active", (n.getAttribute("data-spy") || "") === key);
        });
      };

      const io = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];

          if (!visible) return;

          const found = sections.find((s) => s.sec === visible.target);
          if (found) setActive(found.key);
        },
        { threshold: [0.18, 0.3, 0.45, 0.6], rootMargin: "-10% 0px -70% 0px" }
      );

      sections.forEach((s) => io.observe(s.sec));
      this._io = io;
    },
  };

  // --------------------------------------------------------------------------
  // Teams (template-first card rendering)
  // --------------------------------------------------------------------------
  const Teams = {
    _inited: false,
    _allowedSorts: new Set(["featured", "goal", "recent"]),
    _teamIndex: new Map(),
    _listCache: [],
    _cacheSig: "",
    _lastRenderSig: "",

    _makeSig(cfg) {
      const mode = String(cfg?.org?.allocationMode || "");
      const goal = Number(cfg?.fundraiser?.goalAmount || 0) || 0;
      const raised = Number(cfg?.fundraiser?.raisedAmount || 0) || 0;
      const teams = Array.isArray(cfg?.teams) ? cfg.teams : [];
      const ids = teams.map((t, i) => String(t?.id || `team_${i + 1}`)).join("|");
      return `${mode}::${goal}::${raised}::${teams.length}::${ids}`;
    },

    _rebuildCacheIfNeeded() {
      const cfg = Config.data;
      const sig = this._makeSig(cfg);
      if (sig && sig === this._cacheSig && this._listCache.length) return;

      const raw = Array.isArray(cfg?.teams) ? cfg.teams : [];
      const out = raw.map((t, idx) => {
        const id = String(t?.id || `team_${idx + 1}`).trim();
        return {
          id: id || `team_${idx + 1}`,
          name: String(t?.name || "Team").trim(),
          meta: String(t?.meta || "").trim(),
          photo: String(t?.photo || "").trim(),
          featured: !!t?.featured,
          ask: String(t?.ask || "").trim(),
          goal: Number(t?.goal || 0) || 0,
          raised: Number(t?.raised || 0) || 0,
          createdISO: String(t?.createdISO || t?.created_at || "").trim(),
          restricted: !!t?.restricted,
          needs: !!t?.needs,
        };
      });

      this._teamIndex.clear();
      for (const t of out) this._teamIndex.set(String(t.id), t);

      this._listCache = out;
      this._cacheSig = sig;
    },

    list() { this._rebuildCacheIfNeeded(); return this._listCache.slice(); },

    getById(id) {
      const tid = String(id ?? "").trim();
      if (!tid) return null;
      this._rebuildCacheIfNeeded();
      return this._teamIndex.get(tid) || null;
    },

    currentSort() {
      const wrap = DOM.teamSortWrap();
      const def = String(wrap?.getAttribute("data-ff-team-sort-default") || "featured");
      const selected = wrap ? $(".ff-chip.is-selected,[aria-pressed='true']", wrap) : null;
      const sort = String(selected?.getAttribute("data-ff-sort") || def);
      return this._allowedSorts.has(sort) ? sort : "featured";
    },

    setSelectedUI() {
      const selected = State.selectedTeam;

      const pill = DOM.teamSelectedPill();
      const name = DOM.teamSelectedName();
      const shareBtn = DOM.teamShareBtn();
      const stickyTeam = DOM.stickyTeam();

      const attrib = DOM.attribBox();
      const row = DOM.summaryTeamRow();
      const teamEl = DOM.summaryTeam();

      const has = !!selected;

      if (pill) pill.hidden = !has;
      if (shareBtn) shareBtn.hidden = !has;
      if (stickyTeam) stickyTeam.hidden = !has;

      if (has) {
        if (name) try { name.textContent = selected.name; } catch {}
        if (stickyTeam) {
          const n = $(".ff-num", stickyTeam);
          if (n) try { n.textContent = selected.name; } catch {}
        }
      }

      if (attrib) attrib.hidden = !has;
      if (row) row.hidden = !has;
      if (has && teamEl) try { teamEl.textContent = selected.name; } catch {}

      try { Mirror.schedule?.() || Mirror.refresh?.(); } catch {}
    },

    select(id, opts = {}) {
      const tid = String(id ?? "").trim();
      if (!tid) return;

      const team = this.getById(tid) || (this.list(), this.getById(tid));
      if (!team) return;

      try { State.setSelectedTeam?.(team); } catch {}
      const status = DOM.checkoutStatusText();
      if (status) try { status.textContent = `Attribution — ${State.selectedTeam.name}`; } catch {}

      this.setSelectedUI();
      try { Share.refreshUI?.(true); } catch {}
      try { Donate.renderSummary?.(); } catch {}

      if (!opts.quiet) toast(`Selected: ${State.selectedTeam.name}`, "success", 2200);

      this.render(true);
      try { Stripe.queuePrepare?.(true); } catch {}
    },

    clear(opts = {}) {
      try { State.clearSelectedTeam?.(); } catch {}
      const status = DOM.checkoutStatusText();
      if (status) try { status.textContent = "Ready"; } catch {}

      this.setSelectedUI();
      try { Share.refreshUI?.(true); } catch {}
      try { Donate.renderSummary?.(); } catch {}

      if (!opts.quiet) toast("Selection cleared", "info", 2000);

      this.render(true);
      try { Stripe.queuePrepare?.(true); } catch {}
    },

    _renderCardTemplate(t, data) {
      const tpl = DOM.tplTeamCard();
      if (!tpl) return null;

      const node = Template.clone(tpl);
      if (!node) return null;

      // Let your HTML own structure. We just populate fields.
      
Template.apply(node, data);

      // Safety net: if the HTML template forgot to bind the <img> src via data-ff-attr,
      // we force-set it here so team photos still render.
      try {
        const img =
          node.querySelector?.('.ff-teamcard__img') ||
          node.querySelector?.('[data-ff-team-photo]') ||
          node.querySelector?.('img[data-ff-attr*="src:"]') ||
          node.querySelector?.("img");

        const src = String((data && (data.photo || (data.team && data.team.photo))) || "").trim();
        if (img && src) {
          const cur = String(img.getAttribute("src") || "").trim();
          if (!cur) img.setAttribute("src", src);

          if (!img.getAttribute("alt")) img.setAttribute("alt", String((data && data.name) || "Team"));
          if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
          if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
          if (!img.hasAttribute("referrerpolicy")) img.setAttribute("referrerpolicy", "no-referrer");
        }
      } catch {}

      return node;

    },

    _renderCardFallback(t, data) {
      const card = document.createElement("article");
      const isSelected = !!data.selected;
      card.className = `ff-mini ff-mini--premium ff-teamcard${isSelected ? " is-selected" : ""}`;
      card.setAttribute("role", "listitem");
      card.setAttribute("data-ff-team-card", String(t.id));
      if (isSelected) card.setAttribute("aria-current", "true");

      const img = t.photo
        ? `<img class="ff-teamcard__img" src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
        : "";

      card.innerHTML = `
        ${img}
        <div class="ff-teamcard__body">
          <div class="ff-row ff-row--between ff-ais ff-wrap">
            <div class="ff-minw-0">
              <div class="ff-kicker">${t.featured ? "Featured" : "Team"}</div>
              <div class="ff-card__title">${escapeHtml(t.name)}</div>
              ${t.meta ? `<p class="ff-help ff-muted ff-m-0">${escapeHtml(t.meta)}</p>` : ``}
            </div>

            <div class="ff-row ff-wrap" role="group" aria-label="Team actions">
              <button
                class="ff-btn ff-btn--primary ff-btn--sm"
                type="button"
                data-ff-select-team="${escapeHtml(t.id)}"
                aria-label="${isSelected ? "Selected" : "Select"} ${escapeHtml(t.name)}"
                aria-pressed="${isSelected ? "true" : "false"}"
              >
                ${isSelected ? "Selected" : "Select"}
              </button>
            </div>
          </div>

          <div class="ff-meter ff-mt-2" role="progressbar"
               aria-valuemin="0" aria-valuemax="100"
               aria-valuenow="${data.pct}"
               aria-valuetext="${data.pct}% funded">
            <span class="ff-meter__bar" style="display:block;height:100%;width:${data.pct}%;border-radius:999px;"></span>
          </div>

          <div class="ff-row ff-row--between ff-wrap ff-mt-2">
            <span class="ff-help">Raised <strong class="ff-num">${escapeHtml(data.raisedStr)}</strong></span>
            <span class="ff-help">Goal <strong class="ff-num">${escapeHtml(data.goalStr)}</strong></span>
          </div>
        </div>
      `;
      return card;
    },

    render(force = false) {
      const grid = DOM.teamsGrid();
      if (!grid) return;

      const cfg = Config.data || {};
      const defaults = cfg?.flagship?.defaults || {};
      const currency = String(defaults.currency || "USD");
      const locale = String(defaults.locale || "en-US");

      const skeleton = DOM.teamsSkeleton();
      if (skeleton) skeleton.hidden = false;

      const teams = this.list();
      const q = String(DOM.teamSearch()?.value || "").trim().toLowerCase();
      const sort = this.currentSort();

      const sig = `${teams.length}|${q}|${sort}|${State.selectedTeam?.id || ""}|${String(cfg?.org?.allocationMode || "")}`;
      if (!force && sig === this._lastRenderSig) {
        if (skeleton) skeleton.hidden = true;
        return;
      }
      this._lastRenderSig = sig;

      let list = q
        ? teams.filter((t) => `${t.name} ${t.meta}`.toLowerCase().includes(q))
        : teams.slice();

      const allocationMode = String(cfg?.org?.allocationMode || "club_total").toLowerCase();
      const clubGoalCents = Math.round(Number(cfg?.fundraiser?.goalAmount || 0) * 100);
      const clubRaisedCents = Math.round(Number(cfg?.fundraiser?.raisedAmount || 0) * 100);
      const clubPct = clubGoalCents > 0 ? clamp(Math.round((clubRaisedCents / clubGoalCents) * 100), 0, 999) : 0;

      const pctOfTeam = (t) => {
        const g = Math.round(Number(t.goal || 0) * 100);
        const r = Math.round(Number(t.raised || 0) * 100);
        return g > 0 ? clamp(Math.round((r / g) * 100), 0, 999) : 0;
      };

      const byName = (a, b) => a.name.localeCompare(b.name);

      list.sort((a, b) => {
        if (sort === "recent") {
          const ad = new Date(a.createdISO || 0).getTime() || 0;
          const bd = new Date(b.createdISO || 0).getTime() || 0;
          return (bd - ad) || (Number(b.featured) - Number(a.featured)) || byName(a, b);
        }

        if (sort === "goal") {
          const pa = allocationMode === "club_total" ? clubPct : pctOfTeam(a);
          const pb = allocationMode === "club_total" ? clubPct : pctOfTeam(b);
          return (pb - pa) || (Number(b.featured) - Number(a.featured)) || byName(a, b);
        }

        return (Number(b.featured) - Number(a.featured)) || byName(a, b);
      });

      const empty = DOM.teamsEmpty();
      if (!list.length) {
        try { grid.replaceChildren(); } catch {}
        if (empty) empty.hidden = false;
        const st = DOM.teamsStatus();
        if (st) st.textContent = "No matches";
        if (skeleton) skeleton.hidden = true;
        return;
      }
      if (empty) empty.hidden = true;

      const raisedStrClub = formatMoney(clubRaisedCents, currency, locale);
      const goalStrClub = formatMoney(clubGoalCents, currency, locale);

      const frag = document.createDocumentFragment();

      for (const t of list) {
        const isSelected = String(State.selectedTeam?.id || "") === String(t.id);
        const pct = allocationMode === "club_total" ? clamp(clubPct, 0, 100) : clamp(pctOfTeam(t), 0, 100);

        const raisedStr =
          allocationMode === "club_total"
            ? raisedStrClub
            : formatMoney(Math.round(Number(t.raised || 0) * 100), currency, locale);

        const goalStr =
          allocationMode === "club_total"
            ? goalStrClub
            : formatMoney(Math.round(Number(t.goal || 0) * 100), currency, locale);

        const data = {
          team: t,
          id: t.id,
          name: t.name,
          meta: t.meta,
          photo: t.photo,
          featured: t.featured,
          pct,
          raisedStr,
          goalStr,
          selected: isSelected,
        };

        // Template-first
        const node = this._renderCardTemplate(t, data) || this._renderCardFallback(t, data);
        frag.appendChild(node);
      }

      try { grid.replaceChildren(frag); } catch {}

      const st = DOM.teamsStatus();
      if (st) st.textContent = `${list.length} team${list.length === 1 ? "" : "s"} shown`;

      if (skeleton) skeleton.hidden = true;
    },

    init() {
      if (this._inited) return;
      this._inited = true;

      this._rebuildCacheIfNeeded();

      const search = DOM.teamSearch();
      if (search) on(search, "input", debounce(() => this.render(), 150));

      on(document, "click", (e) => {
        try {
          const t = e.target;

          const chip = t.closest?.("[data-ff-sort]");
          if (chip) {
            const wrap = DOM.teamSortWrap();
            if (wrap && wrap.contains(chip)) {
              e.preventDefault();

              $$("[data-ff-sort]", wrap).forEach((b) => {
                b.classList.remove("is-selected");
                b.setAttribute("aria-pressed", "false");
              });

              chip.classList.add("is-selected");
              chip.setAttribute("aria-pressed", "true");

              this.render(true);
            }
            return;
          }

          const sel = t.closest?.("[data-ff-select-team]");
          if (sel) {
            e.preventDefault();
            this.select(sel.getAttribute("data-ff-select-team"));
            $("#donate")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
            return;
          }

          const card = t.closest?.("[data-ff-team-card]");
          if (card && DOM.teamsGrid()?.contains(card)) {
            const interactive = t.closest?.("button,a,input,textarea,label,select");
            if (!interactive) {
              const id = card.getAttribute("data-ff-team-card");
              if (id) {
                e.preventDefault();
                this.select(id);
                $("#donate")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
              }
            }
            return;
          }

          const clear = t.closest?.("[data-ff-attrib-clear]");
          if (clear) { e.preventDefault(); this.clear(); return; }

          const quickShare = t.closest?.("[data-ff-team-share]");
          if (quickShare) { e.preventDefault(); Modals.open?.("share", quickShare); return; }
        } catch {}
      }, true);

      this.render(true);
      this.setSelectedUI();
    },
  };

  // --------------------------------------------------------------------------
  // Donate summary + quick amount chips (same as v16)
  // --------------------------------------------------------------------------
  const Donate = {
    STRIPE_PCT: 0.029,
    STRIPE_FIXED_CENTS: 30,
    MIN_CENTS: 100,

    coverFeesExactEnabled() {
      return String(meta("ff-cover-fees-exact") || "false").toLowerCase() === "true";
    },

    roundUpExtraCents(donationCents) {
      const c = Number(donationCents || 0) | 0;
      if (c <= 0) return 0;
      const rem = c % 100;
      return rem === 0 ? 0 : (100 - rem);
    },

    feeEstimateCentsSimple(donationCents) {
      const c = Math.max(0, Number(donationCents || 0) | 0);
      return Math.max(0, Math.round(c * this.STRIPE_PCT) + this.STRIPE_FIXED_CENTS);
    },

    feeEstimateCentsExact(donationCents) {
      const donation = Math.max(0, Number(donationCents || 0) | 0);
      const pct = this.STRIPE_PCT;
      const fixed = this.STRIPE_FIXED_CENTS;

      if (pct >= 1) return this.feeEstimateCentsSimple(donation);

      const gross = Math.ceil((donation + fixed) / (1 - pct));
      const fee = Math.max(0, gross - donation);
      return fee;
    },

    feeEstimateCents(donationCents) {
      return this.coverFeesExactEnabled()
        ? this.feeEstimateCentsExact(donationCents)
        : this.feeEstimateCentsSimple(donationCents);
    },

    read() {
      const amountCents = parseMoneyToCents(DOM.amount()?.value);
      const email = String(DOM.email()?.value || "").trim();
      const name = String(DOM.fullName()?.value || "").trim();
      const message = String(DOM.message()?.value || "").trim();
      const anonymous = !!DOM.anonymous()?.checked;
      const coverFees = !!DOM.coverFees()?.checked;
      const roundUp = !!DOM.roundUp()?.checked;
      return { amountCents, email, name, message, anonymous, coverFees, roundUp };
    },

    totals(f) {
      const donationCents = Number(f?.amountCents || 0) | 0;
      const roundUpCents = f?.roundUp ? this.roundUpExtraCents(donationCents) : 0;
      const feeCents = f?.coverFees ? this.feeEstimateCents(donationCents + roundUpCents) : 0;
      const totalCents = Math.max(0, donationCents + roundUpCents + feeCents);
      return { donationCents, roundUpCents, feeCents, totalCents };
    },

    renderSummary() {
      const cfg = Config.data;
      if (!cfg) return;

      const { currency, locale } = cfg.flagship.defaults;
      const f = this.read();
      const { donationCents, roundUpCents, feeCents, totalCents } = this.totals(f);

      const set = (el, txt) => el && (el.textContent = String(txt ?? ""));

      set(DOM.receiptEmail(), f.email || "your email");
      set(DOM.summaryAmount(), donationCents ? formatMoney(donationCents, currency, locale) : "—");
      set(
        DOM.summaryFees(),
        (f.coverFees && donationCents) ? formatMoney(feeCents, currency, locale) : "—"
      );
      set(DOM.summaryTotal(), donationCents ? formatMoney(totalCents, currency, locale) : "—");

      const roundupEl = document.querySelector?.("[data-ff-summary-roundup]");
      if (roundupEl) {
        roundupEl.textContent =
          (f.roundUp && donationCents && roundUpCents) ? formatMoney(roundUpCents, currency, locale) : "—";
      }

      set(
        DOM.stickyGift(),
        donationCents ? formatMoney(donationCents, currency, locale) : formatMoney(0, currency, locale)
      );

      const hint = DOM.stickyHint();
      if (hint) hint.hidden = !(donationCents >= this.MIN_CENTS && isEmail(f.email));

      try { Mirror.refresh(); } catch {}
      try { Proof.refreshUI(); } catch {}
    },

    persist() {
      try {
        const f = this.read();
        const payload = {
          a: Number(f.amountCents || 0) | 0,
          e: String(f.email || ""),
          n: String(f.name || ""),
          an: !!f.anonymous,
          cf: !!f.coverFees,
          ru: !!f.roundUp,
        };
        sessionStorage.setItem("ff:donate", JSON.stringify(payload));
      } catch {}
    },

    restore() {
      try {
        const raw = sessionStorage.getItem("ff:donate");
        if (!raw) return;
        const j = JSON.parse(raw);

        const amt = Number(j?.a || 0) | 0;
        if (amt > 0 && DOM.amount()) DOM.amount().value = String(Math.round(amt / 100));
        if (typeof j?.e === "string" && DOM.email()) DOM.email().value = j.e;
        if (typeof j?.n === "string" && DOM.fullName()) DOM.fullName().value = j.n;

        if (DOM.anonymous()) DOM.anonymous().checked = !!j.an;
        if (DOM.coverFees()) DOM.coverFees().checked = !!j.cf;
        if (DOM.roundUp()) DOM.roundUp().checked = !!j.ru;
      } catch {}
    },

    init() {
      this.restore();

      const rerenderOnly = debounce(() => {
        this.renderSummary();
        this.persist();
      }, 160);

      const maybePrepare = debounce(() => {
        this.renderSummary();
        this.persist();

        const f = this.read();
        const donationCents = Number(f.amountCents || 0) | 0;

        if (donationCents >= this.MIN_CENTS && isEmail(f.email)) {
          try { Stripe.queuePrepare(false); } catch {}
        } else {
          try { Stripe.setStatus("Enter amount + email"); Stripe.setPayEnabled(false); } catch {}
        }
      }, 650);

      on(DOM.amount(), "input", maybePrepare);
      on(DOM.email(), "input", maybePrepare);
      on(DOM.coverFees(), "change", maybePrepare);
      on(DOM.roundUp(), "change", maybePrepare);

      on(DOM.fullName(), "input", rerenderOnly);
      on(DOM.message(), "input", rerenderOnly);
      on(DOM.anonymous(), "change", rerenderOnly);

      on(document, "click", (e) => {
        try {
          const qa = e.target.closest?.("[data-ff-quick-amount]");
          if (qa) {
            e.preventDefault();
            const v = Number(qa.getAttribute("data-ff-quick-amount") || 0);
            if (v > 0 && DOM.amount()) {
              DOM.amount().value = String(v);
              DOM.amount().dispatchEvent(new Event("input", { bubbles: true }));
              toast(`Prefilled ${v}`, "success", 1500);
              $("#donate")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
            }
            return;
          }

          const pf = e.target.closest?.("[data-ff-prefill]");
          if (pf) {
            e.preventDefault();
            const amt = Number(pf.getAttribute("data-ff-prefill-amount") || 0);
            if (amt > 0 && DOM.amount()) {
              DOM.amount().value = String(amt);
              DOM.amount().dispatchEvent(new Event("input", { bubbles: true }));
            }

            State.prefill.purpose = String(pf.getAttribute("data-ff-prefill-purpose") || "sponsor");
            State.prefill.sku = String(pf.getAttribute("data-ff-prefill-sku") || "");

            $("#donate")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
            try { Stripe.queuePrepare(true); } catch {}
            return;
          }
        } catch {}
      }, true);

      on(DOM.donationForm(), "submit", (e) => Stripe.handleSubmit(e));

      this.renderSummary();
    },
  };

  // --------------------------------------------------------------------------
  // Proof modal helpers (unchanged from v16 logic)
  // --------------------------------------------------------------------------
  const Proof = {
    clip(s, max = 240) {
      const t = String(s || "").trim();
      if (t.length <= max) return t;
      return t.slice(0, max - 1).trimEnd() + "…";
    },

    teamLine() {
      const t = State.selectedTeam?.name ? String(State.selectedTeam.name) : "";
      return t ? ` (credited to ${t})` : "";
    },

    scriptText() {
      const cfg = Config.data;
      const org = String(cfg?.org?.name || "our program");
      const url = Canonical.shareUrl();
      const f = Donate.read();

      const donationCents = Number(f.amountCents || 0) | 0;
      const sponsorMode = donationCents >= 100000;

      if (sponsorMode) {
        return this.clip(
          `Sponsor ${org} this season${this.teamLine()} — your support makes a real impact. Sponsor here: ${url}`,
          280
        );
      }

      return this.clip(
        `Help support ${org} this season${this.teamLine()} — every gift helps. Donate here: ${url}`,
        280
      );
    },

    captionText() {
      const cfg = Config.data;
      const org = String(cfg?.org?.name || "our program");
      const url = Canonical.shareUrl();
      const f = Donate.read();

      const team = State.selectedTeam?.name ? ` for ${State.selectedTeam.name}` : "";
      const base = f.amountCents >= 100000
        ? `Proud to sponsor ${org}${team}.`
        : `I just supported ${org}${team}.`;

      return this.clip(`${base} Join me: ${url}`, 280);
    },

    refreshUI() {
      const cfg = Config.data;
      if (!cfg) return;

      const f = Donate.read();
      const { currency, locale } = cfg.flagship.defaults;

      const name = f.anonymous ? "Anonymous" : (f.name || "Your name");
      const amt = f.amountCents ? formatMoney(f.amountCents, currency, locale) : "$0";
      const campaign = String(cfg?.campaign?.name || DOM.proofCampaign()?.textContent || "Season Fund");

      const dn = DOM.proofDonorName();
      const da = DOM.proofAmount();
      const dc = DOM.proofCampaign();
      if (dn) dn.textContent = name;
      if (da) da.textContent = amt;
      if (dc) dc.textContent = campaign;

      const cap = DOM.proofCaption();
      if (cap) {
        const isTextArea = "value" in cap;
        const current = isTextArea ? String(cap.value || "") : String(cap.textContent || "");
        const autofill = String(cap.getAttribute?.("data-ff-autofill") || "") === "1";

        if (autofill || !current.trim()) {
          const next = this.captionText();
          if (isTextArea) cap.value = next;
          else cap.textContent = next;
        }
      }

      const ps = DOM.proofScript();
      if (ps) {
        const next = this.scriptText();
        if ("value" in ps) ps.value = next;
        else ps.textContent = next;
      }
    },

    async copyCaption() {
      const ta = DOM.proofCaption();
      const v = ta ? String(("value" in ta ? ta.value : ta.textContent) || "") : "";
      await copyText(v);
      toast("Caption copied", "success");
    },

    async copyScript() {
      await copyText(this.scriptText());
      toast("Sponsor script copied", "success");
    },

    init() {
      on(document, "click", (e) => {
        try {
          if (e.target.closest?.("[data-ff-copy-caption]")) {
            e.preventDefault();
            this.copyCaption();
            return;
          }

          const s = e.target.closest?.("[data-ff-copy-script]");
          if (s && DOM.modalProof() && DOM.modalProof().contains(s)) {
            e.preventDefault();
            this.copyScript();
          }
        } catch {}
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // Stripe Payment Element (same as v16)
  // --------------------------------------------------------------------------
  const Stripe = {
    stripe: null,
    elements: null,
    paymentElement: null,

    stripePk: "",
    clientSecret: "",
    mountedKey: "",
    preparing: false,
    busy: false,

    pkPromise: null,
    stripeJsPromise: null,
    intentAbort: null,
    _debounced: null,

    endpoints: {
      config: () => meta("ff-payments-config-endpoint") || "/payments/config",
      intent: () => meta("ff-stripe-intent-endpoint") || "/payments/stripe/intent",
      returnUrl: () => {
        const u = meta("ff-stripe-return-url") || meta("ff-canonical") || window.location.href;
        let out = u;
        if (window.location.protocol === "https:" && out.startsWith("http://")) out = "https://" + out.slice(7);
        try { return new URL(out, window.location.origin).toString(); } catch { return window.location.href; }
      },
    },

    enabled() {
      const cfg = Config.data;
      if (!cfg) return false;
      if (cfg.payments && cfg.payments.enabled === false) return false;
      if (cfg.payments?.stripe && cfg.payments.stripe.enabled === false) return false;
      if (!DOM.donationForm() || !this.mountEl()) return false;
      return true;
    },

    mountEl() { return DOM.stripeMountEl(); },

    setStatus(txt) {
      const el = DOM.checkoutStatusText();
      if (el) try { el.textContent = txt || "Ready"; } catch {}
    },

    showError(msg) {
      const box = DOM.payError();
      const t = DOM.payErrorText();
      if (t) try { t.textContent = msg || ""; } catch {}
      if (box) try { box.hidden = !msg; } catch {}
      const ok = DOM.paySuccess();
      if (ok) try { ok.hidden = true; } catch {}
    },

    showSuccess(msg) {
      const box = DOM.paySuccess();
      const t = DOM.paySuccessText();
      if (t) try { t.textContent = msg || "Thank you! Your receipt has been emailed."; } catch {}
      if (box) try { box.hidden = false; } catch {}
      const err = DOM.payError();
      if (err) try { err.hidden = true; } catch {}
    },

    setPayEnabled(enabled) {
      const btn = DOM.payBtn();
      if (btn) try { btn.disabled = !enabled; } catch {}
    },

    setPayBusy(isBusy, label = "") {
      const btn = DOM.payBtn();
      if (!btn) return;
      try {
        if (!btn.dataset.ffLabel) btn.dataset.ffLabel = btn.textContent || "Donate";
        btn.disabled = !!isBusy;
        if (label) btn.textContent = label;
        else btn.textContent = isBusy ? "Processing…" : (btn.dataset.ffLabel || "Donate");
      } catch {}
    },

    keyFor(payload) {
      const team = State.selectedTeam?.id || "";
      const amt = payload.amount_cents || 0;
      const fees = payload.cover_fees ? 1 : 0;
      const round = payload.round_up ? 1 : 0;
      const email = payload.donor?.email || "";
      const theme = document.documentElement.dataset.theme || "";
      const purpose = payload.purpose || "";
      const currency = payload.currency || "";
      const locale = String(Config.data?.flagship?.defaults?.locale || "en-US");
      return `${amt}|${fees}|${round}|${team}|${email}|${theme}|${purpose}|${currency}|${locale}`;
    },

    async loadStripeJs() {
      if (window.Stripe) return;
      if (this.stripeJsPromise) return this.stripeJsPromise;

      const src = meta("ff-stripe-js") || "https://js.stripe.com/v3/";
      this.stripeJsPromise = new Promise((resolve, reject) => {
        try {
          const existing =
            $('script[data-ff-stripe-js="1"]') ||
            Array.from(document.scripts || []).find((s) => (s.src || "").includes("js.stripe.com/v3"));

          if (existing) {
            if (window.Stripe) { resolve(); return; }
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Stripe JS failed to load")), { once: true });
            return;
          }

          const s = document.createElement("script");
          s.src = src;
          s.async = true;
          s.defer = true;
          s.setAttribute("data-ff-stripe-js", "1");

          try {
            const nonceEl =
              document.querySelector("script[nonce]") ||
              document.querySelector('meta[property="csp-nonce"]') ||
              document.querySelector('meta[name="csp-nonce"]');
            const nonce = nonceEl?.getAttribute?.("nonce") || nonceEl?.getAttribute?.("content");
            if (nonce) s.setAttribute("nonce", nonce);
          } catch {}

          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Stripe JS failed to load"));
          document.head.appendChild(s);
        } catch (err) { reject(err); }
      });

      return this.stripeJsPromise;
    },

    async fetchPublishableKey() {
      const fromMeta = meta("ff-stripe-pk");
      if (fromMeta) return fromMeta;

      if (this.pkPromise) return this.pkPromise;
      this.pkPromise = (async () => {
        const r = await fetchWithTimeout(this.endpoints.config(), { credentials: "same-origin" }, 12000);
        if (!r.ok) throw new Error(`payments/config failed (${r.status})`);
        const j = await r.json().catch(() => ({}));
        const pk = String(
          j?.publishableKey || j?.publishable_key || j?.stripePublishableKey || j?.pk || ""
        ).trim();
        if (!pk) throw new Error("Stripe publishable key missing (meta ff-stripe-pk or /payments/config publishableKey).");
        return pk;
      })();

      return this.pkPromise;
    },

    buildAppearance() {
      const theme = String(document.documentElement.dataset.theme || "dark").toLowerCase();
      return { theme: theme === "dark" ? "night" : "stripe" };
    },

    buildPayload() {
      const cfg = Config.data;
      const shell = DOM.shell();
      const f = Donate.read();
      const currency = String(cfg.flagship.defaults.currency || "USD").toLowerCase();

      const payload = {
        amount_cents: Number(f.amountCents || 0) | 0,
        currency,
        donor: {
          email: String(f.email || "").trim().toLowerCase(),
          name: String(f.name || "").trim(),
        },
        cover_fees: !!f.coverFees,
        round_up: !!f.roundUp,
        anonymous: !!f.anonymous,
        message: String(f.message || "").slice(0, 500),
        description: `Donation to ${String(cfg.org?.name || "FutureFunded")}`.slice(0, 250),

        attribution: State.selectedTeam
          ? { team_id: State.selectedTeam.id, team_name: State.selectedTeam.name }
          : undefined,

        purpose: String(State.prefill?.purpose || "").trim() || undefined,
        sku: String(State.prefill?.sku || "").trim() || undefined,

        draft_id: DraftId.get(),

        org_id: cfg.org?.id ?? undefined,
        org_slug: String(cfg.org?.slug || "") || undefined,
        campaign_id: shell?.dataset?.ffCampaign || undefined,

        metadata: {
          ff_version: String(cfg.flagship.version || VERSION),
          ff_canonical: Canonical.baseUrl().toString(),
          ff_env: String(shell?.dataset?.ffEnv || ""),
          ff_whitelabel: String(shell?.dataset?.ffWhitelabel || ""),
        },
      };

      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
      if (payload.metadata) {
        Object.keys(payload.metadata).forEach((k) => payload.metadata[k] === "" && delete payload.metadata[k]);
      }
      return payload;
    },

    validatePayload(payload, { strict = false } = {}) {
      if (!payload.amount_cents || payload.amount_cents < 100) return { ok: false, message: "Enter at least $1.00." };
      if (!payload.donor?.email || !isEmail(payload.donor.email)) {
        return { ok: false, message: strict ? "Enter a valid email for the receipt." : "Enter amount + email" };
      }
      return { ok: true, message: "" };
    },

    teardown() {
      try { this.intentAbort?.abort?.(new Error("teardown")); } catch {}
      this.intentAbort = null;

      try { this.paymentElement?.unmount?.(); } catch {}
      const host = this.mountEl();
      if (host) { try { host.replaceChildren(); } catch {} }

      this.elements = null;
      this.paymentElement = null;
      this.clientSecret = "";
      this.mountedKey = "";
    },

    async createIntent(payload) {
      const v = this.validatePayload(payload, { strict: true });
      if (!v.ok) throw new Error(v.message);

      try { this.intentAbort?.abort?.(new Error("superseded")); } catch {}
      this.intentAbort = new AbortController();

      const csrf = meta("csrf-token");
      const headers = { "Content-Type": "application/json" };
      if (csrf) headers["X-CSRFToken"] = csrf;

      const r = await fetchWithTimeout(
        this.endpoints.intent(),
        {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify(payload),
          signal: this.intentAbort.signal,
        },
        15000
      );

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || !j.ok) {
        const msg = j?.error?.message || j?.message || `Payment setup failed (${r.status || "?"}).`;
        throw new Error(msg);
      }

      const cs = j.client_secret || j.clientSecret;
      if (!cs) throw new Error("Server did not return client_secret.");

      return {
        clientSecret: cs,
        publishableKey: String(j.publishable_key || j.publishableKey || "").trim(),
        donationId: j.donationId || j.donation_id || null,
      };
    },

    async mountIfNeeded(force = false) {
      if (!this.enabled()) return;

      const host = this.mountEl();
      if (!host) return;

      const payload = this.buildPayload();
      const v = this.validatePayload(payload, { strict: false });

      if (!v.ok) {
        this.setStatus(v.message || "Ready");
        this.setPayEnabled(false);
        return;
      }

      const key = this.keyFor(payload);

      if (!force && this.mountedKey === key && host.childElementCount > 0) {
        this.setStatus("Ready");
        this.setPayEnabled(true);
        return;
      }

      this.setStatus("Loading…");
      this.showError("");
      this.setPayEnabled(false);
      this.teardown();

      await this.loadStripeJs();

      const intent = await this.createIntent(payload);
      const pk = intent.publishableKey || (await this.fetchPublishableKey());
      this.clientSecret = intent.clientSecret;

      if (!this.stripe || this.stripePk !== pk) {
        try { this.stripe = window.Stripe(pk); this.stripePk = pk; }
        catch { throw new Error("Stripe initialization failed."); }
      }

      const locale = String(Config.data.flagship.defaults.locale || "en-US");
      try {
        this.elements = this.stripe.elements({
          appearance: this.buildAppearance(),
          locale,
          clientSecret: this.clientSecret,
        });

        this.paymentElement = this.elements.create("payment", { layout: "tabs" });
        this.paymentElement.mount(host);
      } catch (err) {
        this.teardown();
        throw err;
      }

      this.mountedKey = key;
      this.setStatus("Ready");
      this.setPayEnabled(true);
    },

    queuePrepare(force = false) {
      if (!this.enabled()) return;
      if (this.preparing || this.busy) return;

      if (!this._debounced) {
        this._debounced = debounce(async (f) => {
          if (this.preparing || this.busy) return;
          try {
            this.preparing = true;
            await this.mountIfNeeded(!!f);
          } catch (e) {
            this.setStatus("Ready");
            this.showError(e?.message || "Payment setup failed.");
            this.setPayEnabled(true);
          } finally {
            this.preparing = false;
          }
        }, 350);
      }

      this._debounced(force);
    },

    async handleSubmit(e) {
      try { e.preventDefault(); } catch {}
      if (!this.enabled() || this.busy) return;

      this.busy = true;
      this.showError("");
      this.setPayBusy(true, "Processing…");
      this.setStatus("Processing…");

      try {
        const payload = this.buildPayload();
        const v = this.validatePayload(payload, { strict: true });
        if (!v.ok) throw new Error(v.message);

        await this.mountIfNeeded(true);

        if (this.elements && typeof this.elements.submit === "function") {
          const res = await this.elements.submit();
          if (res?.error) throw new Error(res.error.message || "Check your payment details.");
        }

        const { error, paymentIntent } = await this.stripe.confirmPayment({
          elements: this.elements,
          redirect: "if_required",
          confirmParams: { return_url: this.endpoints.returnUrl() },
        });

        if (error) throw new Error(error.message || "Payment confirmation failed.");

        if (paymentIntent?.status) {
          const pill = DOM.checkoutMethodPill();
          if (pill) try { pill.hidden = false; } catch {}

          const method =
            (paymentIntent.payment_method_types && paymentIntent.payment_method_types[0]) || "Stripe";
          const t = DOM.checkoutMethodText();
          if (t) t.textContent = method;
        }

        const st = paymentIntent?.status || "";
        if (st && st !== "succeeded" && st !== "processing") {
          throw new Error("Payment needs more steps. Please try again.");
        }

        this.setStatus("Complete");
        this.showSuccess("Payment successful. Your receipt has been emailed.");
        toast("Payment complete ✅", "success");

        try { Modals.close(); } catch {}
        DraftId.clear();

        Progress.render();
        try { Proof.refreshUI(); } catch {}
      } catch (err) {
        this.setStatus("Ready");
        this.showError(err?.message || "Payment failed. Please try again.");
      } finally {
        this.busy = false;
        this.setPayBusy(false);
        this.setPayEnabled(true);
      }
    },

    init() {
      if (!this.enabled()) {
        this.setStatus("Payments disabled");
        this.setPayEnabled(false);
        return;
      }

      this.setStatus("Enter amount + email");
      this.setPayEnabled(false);

      const form = DOM.donationForm();
      if (form) on(form, "focusin", () => this.queuePrepare(false), true);

      on(window, "hashchange", () => {
        try { if (window.location.hash === "#donate") this.queuePrepare(false); } catch {}
      });
      if (window.location.hash === "#donate") this.queuePrepare(false);
    },
  };

  // --------------------------------------------------------------------------
  // Scroll progress indicator (unchanged)
  // --------------------------------------------------------------------------
  const ScrollProgress = {
    init() {
      const bar = $("[data-ff-scroll-progress]");
      if (!bar) return;

      let ticking = false;

      const update = () => {
        ticking = false;
        const doc = document.documentElement;

        const scrollHeight = doc.scrollHeight || 1;
        const viewport = window.innerHeight || 1;
        const max = Math.max(1, scrollHeight - viewport);

        const y = window.scrollY || doc.scrollTop || 0;
        const pct = clamp(Math.round((y / max) * 100), 0, 100);

        try { bar.style.width = `${pct}%`; bar.setAttribute("aria-valuenow", String(pct)); } catch {}
      };

      const request = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      };

      on(window, "scroll", request, { passive: true });
      on(window, "resize", request);
      on(window, "orientationchange", request);

      request();
    },
  };

  // --------------------------------------------------------------------------
  // Smooth scroll (unchanged)
  // --------------------------------------------------------------------------
  const Smooth = {
    init() {
      const reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

      on(document, "click", (e) => {
        try {
          const a = e.target.closest?.('a[href^="#"]');
          if (!a) return;
          if (a.hasAttribute("data-ff-no-smooth")) return;

          const href = a.getAttribute("href") || "";
          if (!href || href === "#") return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

          const target = $(href);
          if (!target) return;

          e.preventDefault();

          target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

          try { history.pushState(null, "", href); } catch {}
          try {
            if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
          } catch {}

          if (a.hasAttribute("data-ff-drawer-close")) {
            try { Drawer.close(); } catch {}
          }
        } catch {}
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // Receipt resend hook (unchanged)
  // --------------------------------------------------------------------------
  const Receipt = {
    _busy: false,

    async resend() {
      if (this._busy) return;

      const endpoint = meta("ff-resend-receipt-endpoint");
      const email = String(DOM.email()?.value || "").trim();
      if (!email || !isEmail(email)) {
        toast("Enter your receipt email first", "info");
        return;
      }

      this._busy = true;

      const btn = $("[data-ff-resend-receipt]");
      const prev = btn?.textContent || "";
      if (btn) { try { btn.disabled = true; btn.textContent = "Sending…"; } catch {} }

      try {
        if (!endpoint) {
          const support = meta("ff-support-email") || "support@getfuturefunded.com";
          const subj = encodeURIComponent("Resend donation receipt");
          const body = encodeURIComponent(
            `Hi — please resend my receipt to: ${email}\n\nFundraiser: ${Canonical.baseUrl().toString()}`
          );
          window.location.href = `mailto:${support}?subject=${subj}&body=${body}`;
          return;
        }

        const csrf = meta("csrf-token");
        const headers = { "Content-Type": "application/json" };
        if (csrf) headers["X-CSRFToken"] = csrf;

        const r = await fetchWithTimeout(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({
            email,
            url: Canonical.baseUrl().toString(),
            draft_id: DraftId.get(),
          }),
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(j?.message || "Could not resend receipt.");

        toast("Receipt resend requested ✅", "success");
      } catch (e) {
        toast(e?.message || "Could not resend receipt.", "error");
      } finally {
        this._busy = false;
        if (btn) { try { btn.disabled = false; btn.textContent = prev || "Resend receipt"; } catch {} }
      }
    },

    init() {
      on(document, "click", (e) => {
        const b = e.target.closest?.("[data-ff-resend-receipt]");
        if (!b) return;
        e.preventDefault();
        this.resend();
      }, true);
    },
  };

  // --------------------------------------------------------------------------
  // App init
  // --------------------------------------------------------------------------
  const App = {
    init() {
      try {
        Config.load();

        Theme.init();
        Dismiss.init();
        Drawer.init();
        Modals.init();
        Mirror.init();

        Proof.init();
        Share.init();

        Smooth.init();
        ScrollProgress.init();

        Brand.render();
        Progress.render();
        Countdown.init();

        Teams.init();
        Donate.init();
        Stripe.init();

        Sticky.init();
        Spy.init();

        Receipt.init();

        if (State.selectedTeam) try { Stripe.queuePrepare(true); } catch {}
      } catch (e) {
        console.error(`${APP} init failed`, e);
        toast("App failed to initialize. Refresh the page.", "error", 6000);
      }
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init(), { once: true });
  } else {
    App.init();
  }
})();

// Collapse layouts that reserve an empty aside column.
(() => {
  const isMeaningful = (el) => {
    if (!el) return false;
    // ignore whitespace + templates/scripts
    return !!el.querySelector(':scope > *:not(template):not(script)');
  };

  document.querySelectorAll('.ff-split').forEach((wrap) => {
    const aside = wrap.querySelector('.ff-split__aside');
    if (aside && !isMeaningful(aside)) wrap.classList.add('ff-split--solo');
  });
})();
