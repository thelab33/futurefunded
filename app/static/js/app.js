/* ff-app.js — FutureFunded Flagship v7 (compat-first)
   Works with the exact HTML you pasted (IDs + data-ff-* hooks).
   - No build tools
   - Defensive selectors (won’t crash if some blocks are removed)
   - Demo-mode checkout (simulated) unless you wire Stripe/PayPal backend
*/

(() => {
  "use strict";

  /* -----------------------------
   * Tiny utils
   * --------------------------- */
  const d = document;
  const root = d.documentElement;

  const $ = (sel, ctx = d) => ctx.querySelector(sel);
  const $$ = (sel, ctx = d) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const now = () => Date.now();
  const uid = () => (crypto?.randomUUID?.() || `${Math.random().toString(16).slice(2)}-${Date.now()}`);

  const money = (n) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n || 0));

  const safeJSON = (s, fallback) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };

  const storage = {
    get(key, fallback) {
      const v = localStorage.getItem(key);
      return v == null ? fallback : safeJSON(v, fallback);
    },
    set(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    },
    del(key) {
      localStorage.removeItem(key);
    }
  };

  const isHttpUrl = (v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const escapeHTML = (str) =>
    String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  /* -----------------------------
   * Toasts
   * --------------------------- */
  function toast(msg, kind = "info") {
    const host = $("#toastRegion") || d.body;
    const el = d.createElement("div");
    el.className = `ff-toast__item ff-toast__item--${kind}`;
    el.setAttribute("role", "status");
    el.innerHTML = `<div class="ff-toast__text">${escapeHTML(msg)}</div>`;
    // If your CSS doesn’t style these, it still works (basic block).
    el.style.cssText ||= `
      margin:10px 0;padding:10px 12px;border-radius:14px;
      background:rgba(15,22,33,.96);border:1px solid rgba(255,255,255,.12);
      color:#fff;max-width:min(720px,calc(100vw - 32px));box-shadow:0 18px 60px rgba(0,0,0,.5);
    `;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  /* -----------------------------
   * Config (override with window.__FF_CONFIG)
   * --------------------------- */
  const shell = $("[data-ff-shell]");
  const tier = shell?.getAttribute("data-ff-tier") || "standard";
  const isPremium = tier === "premium";

  const BASE_URL =
    ($('link[rel="canonical"]')?.getAttribute("href") || "").trim() || location.href;

  const DEFAULT_CONFIG = {
    org: {
      name: "FutureFunded Program",
      meta: "City • State",
      seasonPill: "Season Fund",
      sportPill: "Youth program",
      heroOrgLine: "Organization • Fundraiser",
      heroAccentLine: "Keep kids playing.",
      heroCopy:
        "Your gift covers gym time, travel, and gear so families aren’t carrying the full load. Sponsors get premium recognition.",
      footerTagline: "Fuel the season. Fund the future."
    },
    fundraiser: {
      goalAmount: 5000,
      deadlineISO: "", // e.g. "2026-02-15T23:59:59-06:00" (optional)
      announcement: {
        enabled: true,
        text: "Help us hit our goal this week — every share counts."
      }
    },
    match: {
      enabled: false,
      multiplier: 2,
      endsAtISO: "" // e.g. "2026-01-20T20:00:00-06:00"
    },
    fees: {
      percent: 0.029,
      fixed: 0.3
    },
    share: {
      url: "",
      caption:
        "We’re raising funds for our youth program. Every donation helps with travel, gym time, and gear. Donate here:",
      sponsorCaption:
        "Local business spotlight! Sponsor our youth program and get recognized on our sponsor wall + leaderboard:",
      successCaption:
        "I just donated to support this youth program — help us finish strong:"
    },
    impact: [
      {
        title: "Gym time",
        desc: "Covers practice space and facilities.",
        amount: 75,
        note: "Cover gym time for the week."
      },
      {
        title: "Tournament fees",
        desc: "Keeps kids competing this season.",
        amount: 150,
        note: "Help cover tournament fees."
      },
      {
        title: "Travel support",
        desc: "Fuel + vans + meals for away games.",
        amount: 500,
        note: "Support travel for the team."
      },
      {
        title: "Scholarship",
        desc: "Helps families who need support.",
        amount: 250,
        note: "Sponsor a scholarship spot."
      }
    ],
    allocation: [
      { label: "Travel", pct: 40 },
      { label: "Gym / facilities", pct: 25 },
      { label: "Gear / uniforms", pct: 20 },
      { label: "Scholarships", pct: 15 }
    ],
    sponsorTiers: [
      {
        id: "bronze",
        name: "Bronze Sponsor",
        amount: 250,
        perks: ["Name on sponsor wall", "Thank-you post"],
        slots: 999
      },
      {
        id: "silver",
        name: "Silver Sponsor",
        amount: 500,
        perks: ["Logo + link on wall", "Leaderboard placement"],
        slots: 50
      },
      {
        id: "gold",
        name: "Gold Sponsor",
        amount: 1000,
        perks: ["Featured placement", "Hero rotation (Premium)"],
        slots: 25
      }
    ],
    teams: [
      {
        id: "all",
        name: "All teams",
        meta: "Support the full program",
        goal: 5000,
        raised: 0,
        featured: true,
        needs: true,
        restricted: false,
        slotsLeft: 0,
        ask: "Suggested ask: “Help us with tournament fees this month.”"
      },
      {
        id: "12u",
        name: "12U • Lightning",
        meta: "12U • Coach Sam",
        goal: 1500,
        raised: 350,
        featured: true,
        needs: true,
        restricted: false,
        slotsLeft: 6,
        ask: "Suggested ask: “Help 12U cover travel this month.”"
      },
      {
        id: "14u",
        name: "14U • Elite",
        meta: "14U • Coach Alex",
        goal: 2000,
        raised: 900,
        featured: false,
        needs: false,
        restricted: false,
        slotsLeft: 3,
        ask: "Suggested ask: “Help 14U with gym time + gear.”"
      },
      {
        id: "hs",
        name: "High School • Varsity",
        meta: "HS • Coach Jordan",
        goal: 2500,
        raised: 1200,
        featured: false,
        needs: false,
        restricted: true,
        slotsLeft: 0,
        ask: "Suggested ask: “Support Varsity tournament fees.”"
      }
    ]
  };

  const CONFIG = (() => {
    const cfg = window.__FF_CONFIG && typeof window.__FF_CONFIG === "object" ? window.__FF_CONFIG : {};
    // shallow-ish merge for predictable overrides
    const merged = {
      ...DEFAULT_CONFIG,
      ...cfg,
      org: { ...DEFAULT_CONFIG.org, ...(cfg.org || {}) },
      fundraiser: { ...DEFAULT_CONFIG.fundraiser, ...(cfg.fundraiser || {}) },
      match: { ...DEFAULT_CONFIG.match, ...(cfg.match || {}) },
      fees: { ...DEFAULT_CONFIG.fees, ...(cfg.fees || {}) },
      share: { ...DEFAULT_CONFIG.share, ...(cfg.share || {}) }
    };
    merged.impact = Array.isArray(cfg.impact) ? cfg.impact : DEFAULT_CONFIG.impact;
    merged.allocation = Array.isArray(cfg.allocation) ? cfg.allocation : DEFAULT_CONFIG.allocation;
    merged.sponsorTiers = Array.isArray(cfg.sponsorTiers) ? cfg.sponsorTiers : DEFAULT_CONFIG.sponsorTiers;
    merged.teams = Array.isArray(cfg.teams) ? cfg.teams : DEFAULT_CONFIG.teams;
    return merged;
  })();

  /* -----------------------------
   * Data (local demo mode)
   * --------------------------- */
  const KEYS = {
    theme: "ff_theme",
    announceDismissed: "ff_announce_dismissed_v7",
    topbarDismissed: "ff_topbar_dismissed_v7",
    store: "ff_store_v7"
  };

  const store = storage.get(KEYS.store, null) || {
    gifts: [
      // seed a few (feel free to remove)
      { id: uid(), type: "donation", amount: 75, name: "Jordan P.", note: "Go team!", teamId: "all", ts: now() - 864e5 * 2 },
      { id: uid(), type: "sponsor", amount: 500, company: "Acme Dental", website: "https://example.com", tierId: "silver", teamId: "all", ts: now() - 864e5 * 4 }
    ]
  };

  function saveStore() {
    storage.set(KEYS.store, store);
  }

  /* -----------------------------
   * Premium-only visibility
   * --------------------------- */
  function applyPremiumVisibility() {
    $$("[data-ff-premium-only]").forEach((el) => {
      // Keep any explicit `hidden` in template for standard mode.
      if (isPremium) el.hidden = false;
      else el.hidden = true;
    });

    // Updates section is premium-only
    const updates = $("[data-ff-updates]");
    if (updates) updates.hidden = !isPremium;
  }

  /* -----------------------------
   * Theme toggle (uses ff_theme)
   * --------------------------- */
  function setTheme(t) {
    if (t !== "dark" && t !== "light") return;
    try {
      localStorage.setItem(KEYS.theme, t);
    } catch {}
    root.setAttribute("data-theme", t);
    const btn = $("[data-ff-theme-toggle]");
    if (btn) {
      btn.setAttribute("aria-pressed", String(t === "dark"));
      btn.textContent = t === "dark" ? "☾" : "☀";
    }
  }

  function initThemeToggle() {
    const btn = $("[data-ff-theme-toggle]");
    if (!btn) return;
    on(btn, "click", () => {
      const cur = root.getAttribute("data-theme") || "dark";
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }

  /* -----------------------------
   * Announcement + Topbar dismiss
   * --------------------------- */
  function initAnnouncement() {
    const wrap = $("[data-ff-announcement]");
    if (!wrap) return;

    const dismissed = storage.get(KEYS.announceDismissed, false);
    const enabled = !!CONFIG.fundraiser.announcement?.enabled;
    const text = (CONFIG.fundraiser.announcement?.text || "").trim();

    const textEl = $("#announcementText");
    if (textEl) textEl.textContent = text;

    wrap.hidden = !(enabled && text && !dismissed);

    const dismissBtn = $("[data-ff-announcement-dismiss]");
    on(dismissBtn, "click", () => {
      storage.set(KEYS.announceDismissed, true);
      wrap.hidden = true;
    });
  }

  function initTopbar() {
    const topbar = $("[data-ff-topbar]");
    if (!topbar) return;
    const dismissed = storage.get(KEYS.topbarDismissed, false);
    topbar.hidden = !!dismissed;

    const dismissBtn = $("[data-ff-topbar-dismiss]");
    on(dismissBtn, "click", () => {
      storage.set(KEYS.topbarDismissed, true);
      topbar.hidden = true;
    });
  }

  /* -----------------------------
   * Drawer (mobile)
   * --------------------------- */
  function setDrawer(open) {
    const drawer = $("[data-ff-drawer]");
    if (!drawer) return;
    const panel = $("[data-ff-drawer-panel]", drawer);
    const btn = $("[data-ff-drawer-open]");
    const willOpen = !!open;

    drawer.hidden = !willOpen;
    drawer.setAttribute("aria-hidden", String(!willOpen));
    if (btn) btn.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) panel?.focus?.();
  }

  function initDrawer() {
    on($("[data-ff-drawer-open]"), "click", () => setDrawer(true));
    $$("[data-ff-drawer-close]").forEach((b) => on(b, "click", () => setDrawer(false)));
    on(d, "keydown", (e) => {
      if (e.key === "Escape") setDrawer(false);
    });
  }

  /* -----------------------------
   * Modal system (share/kit/checkout/success)
   * --------------------------- */
  function getModal(name) {
    return $(`[data-ff-modal="${name}"]`);
  }

  function setModal(name, open) {
    const modal = getModal(name);
    if (!modal) return;

    const panel = $("[data-ff-modal-panel]", modal);
    modal.hidden = !open;
    modal.setAttribute("aria-hidden", String(!open));
    if (open) panel?.focus?.();
  }

  function initModals() {
    // Close buttons/backdrops
    $$("[data-ff-modal-close]").forEach((btn) => {
      on(btn, "click", () => {
        const modal = btn.closest("[data-ff-modal]");
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
      });
    });

    // Escape closes any open modal
    on(d, "keydown", (e) => {
      if (e.key !== "Escape") return;
      $$('[data-ff-modal]:not([hidden])').forEach((m) => {
        m.hidden = true;
        m.setAttribute("aria-hidden", "true");
      });
    });
  }

  /* -----------------------------
   * Copy / Share helpers
   * --------------------------- */
  function shareUrl() {
    return (CONFIG.share.url || "").trim() || BASE_URL || location.href;
  }

  async function copyText(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      toast("Copied.");
      return true;
    } catch {
      // fallback
      const ta = d.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      d.body.appendChild(ta);
      ta.select();
      try {
        d.execCommand("copy");
        toast("Copied.");
        return true;
      } catch {
        toast("Copy failed. Please copy manually.", "error");
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  async function nativeShare({ title, text, url }) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch {
        return false;
      }
    }
    await copyText(url);
    return false;
  }

  function initShareButtons() {
    // Open share modal
    $$("[data-ff-share-open]").forEach((btn) =>
      on(btn, "click", () => {
        hydrateShareModal();
        setModal("share", true);
      })
    );

    // Copy link
    $$("[data-ff-copy-link]").forEach((btn) =>
      on(btn, "click", async () => {
        await copyText(shareUrl());
      })
    );

    // Native share buttons inside modals
    $$("[data-ff-native-share]").forEach((btn) =>
      on(btn, "click", async () => {
        const url = shareUrl();
        const title = CONFIG.org.name;
        const text = CONFIG.share.caption;
        await nativeShare({ title, text, url });
      })
    );

    // Copy caption (share modal)
    on($("[data-ff-copy-caption]"), "click", async () => {
      const cap = $("#shareCaption")?.value || CONFIG.share.caption;
      await copyText(cap);
    });

    // Sponsor kit open
    $$("[data-ff-sponsor-kit-open]").forEach((btn) =>
      on(btn, "click", () => {
        hydrateSponsorKitModal();
        setModal("sponsorKit", true);
      })
    );

    // Sponsor kit copy caption
    on($("[data-ff-copy-kit-caption]"), "click", async () => {
      const cap = $("#kitCaption")?.value || CONFIG.share.sponsorCaption;
      await copyText(cap);
    });
  }

  /* -----------------------------
   * Hydrate share + kit modals
   * --------------------------- */
  function hydrateShareModal() {
    const url = shareUrl();
    const cap = `${CONFIG.share.caption} ${url}`.trim();

    const linkInput = $("#shareLink");
    const capInput = $("#shareCaption");
    const qr = $("#shareQr");

    if (linkInput) linkInput.value = url;
    if (capInput) capInput.value = cap;

    if (qr && qr.tagName === "IMG") {
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(
        url
      )}`;
    }
  }

  function hydrateSponsorKitModal() {
    const url = shareUrl();
    const linkInput = $("#kitLink");
    if (linkInput) linkInput.value = url;

    // Tier list
    const host = $("#kitTierList");
    if (host) {
      host.innerHTML = "";
      const frag = d.createDocumentFragment();
      CONFIG.sponsorTiers.forEach((t) => {
        const row = d.createElement("div");
        row.className = "ff-notice";
        row.innerHTML = `
          <div class="ff-row ff-row--between" style="align-items:flex-start;gap:12px">
            <div style="min-width:0">
              <div class="ff-kicker">${escapeHTML(t.name)}</div>
              <div class="ff-help" style="margin-top:6px">${(t.perks || []).map(escapeHTML).join(" • ")}</div>
            </div>
            <strong class="ff-num">${money(t.amount)}</strong>
          </div>`;
        frag.appendChild(row);
      });
      host.appendChild(frag);
    }

    // Caption
    const caption = `${CONFIG.share.sponsorCaption} ${url}`.trim();
    const capInput = $("#kitCaption");
    if (capInput) capInput.value = caption;
  }

  /* -----------------------------
   * Static text bindings (org)
   * --------------------------- */
  function bindOrg() {
    const o = CONFIG.org;

    const setTxt = (id, val) => {
      const el = $(`#${id}`);
      if (el && val != null) el.textContent = String(val);
    };

    setTxt("orgName", o.name);
    setTxt("orgMeta", o.meta);
    setTxt("heroOrgLine", o.heroOrgLine);
    setTxt("heroAccentLine", o.heroAccentLine);
    setTxt("heroCopy", o.heroCopy);

    setTxt("seasonPill", o.seasonPill);
    setTxt("sportPill", o.sportPill);

    setTxt("footerOrgName", o.name);
    setTxt("footerLegalName", o.name);
    setTxt("footerTagline", o.footerTagline);

    setTxt("stickyOrg", o.name);

    // Footer year
    const y = $("#footerYear");
    if (y) y.textContent = String(new Date().getFullYear());

    // Clone header logo into footer (optional)
    const heroLogo = $("#heroLogo");
    const footerLogo = $("#footerBrandLogo");
    if (heroLogo && footerLogo && heroLogo.getAttribute("src")) {
      footerLogo.setAttribute("src", heroLogo.getAttribute("src"));
    }
  }

  /* -----------------------------
   * Compute totals + progress
   * --------------------------- */
  function goalAmount() {
    return Number(CONFIG.fundraiser.goalAmount || 0);
  }

  function totals() {
    // Gifts can be donation or sponsor (both count toward raised)
    const raised = store.gifts.reduce((a, g) => a + Number(g.amount || 0), 0);
    const donors = store.gifts.filter((g) => g.type === "donation").length;
    const sponsorCount = store.gifts.filter((g) => g.type === "sponsor").length;

    const donationAmounts = store.gifts.filter((g) => g.type === "donation").map((g) => Number(g.amount || 0));
    const avgGift = donationAmounts.length
      ? donationAmounts.reduce((a, n) => a + n, 0) / donationAmounts.length
      : 0;

    return { raised, donors, sponsorCount, avgGift };
  }

  function daysLeft() {
    const iso = (CONFIG.fundraiser.deadlineISO || "").trim();
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    const diff = t - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  function nextMilestone(raised, goal) {
    if (goal <= 0) return null;
    const marks = [0.25, 0.5, 0.75, 1].map((p) => Math.round(goal * p));
    const next = marks.find((m) => m > raised);
    if (!next) return null;
    return next;
  }

  function renderProgress() {
    const g = goalAmount();
    const { raised, donors, sponsorCount, avgGift } = totals();
    const pct = g > 0 ? clamp((raised / g) * 100, 0, 100) : 0;

    // Pills + hero console
    const set = (id, val) => {
      const el = $(`#${id}`);
      if (el) el.textContent = val;
    };

    set("raisedBig", money(raised));
    set("raisedRow", money(raised));
    set("goalRow", money(g));
    set("goalPill", money(g));
    set("pctText", String(Math.round(pct)));

    const remaining = Math.max(0, g - raised);
    set("remainingText", money(remaining));

    const donorsEl = $("#donorsText");
    if (donorsEl) donorsEl.textContent = String(donors);

    const avgEl = $("#avgGiftText");
    if (avgEl) avgEl.textContent = money(avgGift);

    // Deadline
    const dl = daysLeft();
    const daysEl = $("#daysLeftText");
    const stickyDays = $("#stickyDays");
    const deadlineText = $("#deadlineText");
    if (dl == null) {
      if (daysEl) daysEl.textContent = "—";
      if (stickyDays) stickyDays.textContent = "—";
      if (deadlineText) deadlineText.textContent = "No deadline";
    } else {
      if (daysEl) daysEl.textContent = String(dl);
      if (stickyDays) stickyDays.textContent = `${dl} days left`;
      if (deadlineText) deadlineText.textContent = `${dl} days left`;
    }

    // Next milestone
    const nm = nextMilestone(raised, g);
    const nmEl = $("#nextMilestoneText");
    if (nmEl) nmEl.textContent = nm ? money(nm) : "Goal hit";

    // Overall meter
    const meter = $("[data-ff-meter='overall']");
    const bar = $("#overallBar");
    if (bar) bar.style.width = `${pct}%`;

    if (meter) {
      meter.setAttribute("aria-valuenow", String(Math.round(pct)));
      meter.setAttribute("aria-valuetext", `${Math.round(pct)}% funded`);
    }

    // Last updated
    const last = $("#lastUpdatedInline");
    const last2 = $("#lastUpdatedText");
    const stamp = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    if (last) last.textContent = stamp;
    if (last2) last2.textContent = `Updated — ${stamp}`;

    // Sticky bar
    const sticky = $("#stickyDonate");
    const stickyRaised = $("#stickyRaised");
    const stickyGoal = $("#stickyGoal");
    const stickyPct = $("#stickyPct");
    const stickyBar = $("#stickyBar");
    if (stickyRaised) stickyRaised.textContent = money(raised);
    if (stickyGoal) stickyGoal.textContent = money(g);
    if (stickyPct) stickyPct.textContent = `${Math.round(pct)}%`;
    if (stickyBar) stickyBar.style.width = `${pct}%`;

    // Match pills (if enabled)
    const matchOn = !!CONFIG.match.enabled && !!CONFIG.match.endsAtISO;
    $("#matchPill") && ($("#matchPill").hidden = !matchOn);
    $("#heroMatchPill") && ($("#heroMatchPill").hidden = !matchOn);
    $("#donateMatchPill") && ($("#donateMatchPill").hidden = !matchOn);
    $("#summaryMatchPill") && ($("#summaryMatchPill").hidden = !matchOn);
    $("#kitMatchPill") && ($("#kitMatchPill").hidden = !matchOn);

    // Show sponsor slots in footer (optional, uses smallest tier slotsLeft concept)
    const footerSlots = $("#footerSponsorSlots");
    const footerSlotsNum = $("#footerSponsorSlotsNum");
    if (footerSlots && footerSlotsNum) {
      const totalSlots = CONFIG.sponsorTiers.reduce((a, t) => a + (Number(t.slots || 0) || 0), 0);
      if (totalSlots > 0) {
        footerSlots.hidden = false;
        footerSlotsNum.textContent = String(totalSlots);
      } else {
        footerSlots.hidden = true;
      }
    }
  }

  /* -----------------------------
   * Recent gifts list
   * --------------------------- */
  function renderGifts() {
    const host = $("#giftsList");
    if (!host) return;

    const gifts = [...store.gifts].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8);
    host.innerHTML = "";

    if (!gifts.length) {
      host.innerHTML = `<div class="ff-help">Be the first to donate.</div>`;
      return;
    }

    const frag = d.createDocumentFragment();
    gifts.forEach((g) => {
      const row = d.createElement("div");
      row.className = "ff-notice";
      const who =
        g.type === "sponsor"
          ? (g.company || "Sponsor")
          : (g.name || "Donor");

      const sub =
        g.type === "sponsor"
          ? `Sponsor • ${tierNameFromId(g.tierId) || "Tier"}`
          : `Donation${g.teamId && g.teamId !== "all" ? ` • Team: ${teamName(g.teamId)}` : ""}`;

      row.innerHTML = `
        <div class="ff-row ff-row--between" style="align-items:flex-start;gap:12px">
          <div style="min-width:0">
            <div class="ff-kicker">${escapeHTML(who)}</div>
            <div class="ff-help" style="margin-top:6px">${escapeHTML(sub)}${g.note ? ` • “${escapeHTML(g.note)}”` : ""}</div>
          </div>
          <strong class="ff-num">${money(g.amount)}</strong>
        </div>`;
      frag.appendChild(row);
    });

    host.appendChild(frag);
  }

  /* -----------------------------
   * Impact cards + Allocation
   * --------------------------- */
  function setPrefill(amount, note, opts = {}) {
    const amt = Number(amount || 0);
    if (amt > 0) {
      const amountInput = $("#amountInput");
      if (amountInput) amountInput.value = String(Math.round(amt));
      $("#donatePrefillPill") && ($("#donatePrefillPill").hidden = false);
      $("#impactPrefillPill") && ($("#impactPrefillPill").hidden = false);
      // also clear tier selection if this is not tier-driven
      if (!opts.keepTier) clearTierSelection();
      updateDonationSummary();
    }
    if (note && $("#noteInput")) $("#noteInput").value = String(note);
  }

  function renderImpact() {
    const host = $("#impactGrid");
    if (!host) return;

    host.innerHTML = "";
    const frag = d.createDocumentFragment();

    CONFIG.impact.forEach((c) => {
      const card = d.createElement("button");
      card.type = "button";
      card.className = "ff-card ff-card--lift ff-pad";
      card.style.textAlign = "left";
      card.setAttribute("aria-label", `Select impact: ${c.title}`);

      card.innerHTML = `
        <div class="ff-row ff-row--between" style="align-items:flex-start;gap:12px">
          <div style="min-width:0">
            <div class="ff-kicker">${escapeHTML(c.title)}</div>
            <div class="ff-card__title" style="margin-top:6px">${money(c.amount)}</div>
            <p class="ff-help" style="margin-top:8px">${escapeHTML(c.desc)}</p>
          </div>
          <span class="ff-pill ff-pill--accent">Prefill</span>
        </div>`;

      on(card, "click", () => {
        setPrefill(c.amount, c.note);
        $("#donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
        toast("Prefilled donation.");
      });

      frag.appendChild(card);
    });

    host.appendChild(frag);
  }

  function renderAllocation() {
    const host = $("#allocationList");
    if (!host) return;

    host.innerHTML = "";
    const frag = d.createDocumentFragment();

    CONFIG.allocation.forEach((a) => {
      const row = d.createElement("div");
      row.className = "ff-mini";
      const pct = clamp(Number(a.pct || 0), 0, 100);

      row.innerHTML = `
        <div class="ff-row ff-row--between" style="align-items:flex-end">
          <div>
            <div class="ff-kicker">${escapeHTML(a.label)}</div>
            <div class="ff-help" style="margin-top:6px">${pct}%</div>
          </div>
          <strong class="ff-num">${pct}%</strong>
        </div>
        <div class="ff-meter" style="margin-top:10px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${pct}%">
          <span style="width:${pct}%"></span>
        </div>`;
      frag.appendChild(row);
    });

    host.appendChild(frag);
  }

  /* -----------------------------
   * Sponsors section (tiers + leaderboard + wall)
   * --------------------------- */
  function tierNameFromId(id) {
    return CONFIG.sponsorTiers.find((t) => t.id === id)?.name || "";
  }

  function renderSponsorTiers() {
    const host = $("#sponsorTiers");
    if (!host) return;

    host.innerHTML = "";
    const frag = d.createDocumentFragment();

    CONFIG.sponsorTiers.forEach((t) => {
      const card = d.createElement("div");
      card.className = "ff-notice";
      card.setAttribute("role", "listitem");

      card.innerHTML = `
        <div class="ff-row ff-row--between" style="align-items:flex-start;gap:12px">
          <div style="min-width:0">
            <div class="ff-kicker">${escapeHTML(t.name)}</div>
            <p class="ff-help" style="margin-top:6px">${(t.perks || []).map(escapeHTML).join(" • ")}</p>
            <div class="ff-row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
              <button class="ff-btn ff-btn--primary ff-btn--sm" type="button" data-ff-select-tier="${escapeHTML(t.id)}">
                Select tier
              </button>
              <button class="ff-btn ff-btn--ghost ff-btn--sm" type="button" data-ff-share-open>
                Share
              </button>
            </div>
          </div>
          <strong class="ff-num">${money(t.amount)}</strong>
        </div>`;

      frag.appendChild(card);
    });

    host.appendChild(frag);

    // click binding
    $$("[data-ff-select-tier]").forEach((b) => {
      on(b, "click", () => {
        const id = b.getAttribute("data-ff-select-tier");
        selectSponsorTier(id);
        $("#donate")?.scrollIntoView({ behavior: "smooth", block: "start" });
        toast("Sponsor tier selected.");
      });
    });
  }

  function sponsorsFromGifts() {
    const sponsors = store.gifts
      .filter((g) => g.type === "sponsor")
      .map((g) => ({
        company: g.company || "Sponsor",
        amount: Number(g.amount || 0),
        tierId: g.tierId || "",
        website: g.website || "",
        logoUrl: g.logoUrl || "",
        preferred: !!g.preferred
      }));

    sponsors.sort((a, b) => b.amount - a.amount);
    return sponsors;
  }

  function renderSponsorLeaderboard() {
    const host = $("#sponsorLeaderboard");
    if (!host) return;

    const sponsors = sponsorsFromGifts();
    host.innerHTML = "";

    if (!sponsors.length) {
      host.innerHTML = `<div class="ff-help">Be the first sponsor.</div>`;
    } else {
      const frag = d.createDocumentFragment();
      sponsors.slice(0, 10).forEach((s, i) => {
        const row = d.createElement("div");
        row.className = "ff-notice";
        const tierName = tierNameFromId(s.tierId) || "Sponsor";
        row.innerHTML = `
          <div class="ff-row ff-row--between" style="align-items:flex-start;gap:12px">
            <div style="min-width:0">
              <div class="ff-kicker">#${i + 1} • ${escapeHTML(s.company)}</div>
              <div class="ff-help" style="margin-top:6px">${escapeHTML(tierName)}</div>
            </div>
            <strong class="ff-num">${money(s.amount)}</strong>
          </div>`;
        frag.appendChild(row);
      });
      host.appendChild(frag);

      // spotlight
      const top = sponsors[0];
      const spot = $("#sponsorSpotlight");
      if (spot) {
        spot.hidden = false;
        $("#spotlightName") && ($("#spotlightName").textContent = top.company || "—");
        const link = $("#spotlightLink");
        if (link && top.website && isHttpUrl(top.website)) {
          link.hidden = false;
          link.href = top.website;
        } else if (link) {
          link.hidden = true;
        }
      }
    }
  }

  function renderSponsorWall() {
    const host = $("#sponsorWall");
    if (!host) return;

    const sponsors = sponsorsFromGifts();
    host.innerHTML = "";

    if (!sponsors.length) {
      host.innerHTML = `<div class="ff-help">Sponsors appear here after checkout.</div>`;
      return;
    }

    const frag = d.createDocumentFragment();
    sponsors.slice(0, 12).forEach((s) => {
      const tile = d.createElement("a");
      tile.className = "ff-mini";
      tile.setAttribute("role", "listitem");
      tile.href = s.website && isHttpUrl(s.website) ? s.website : "#";
      tile.target = s.website && isHttpUrl(s.website) ? "_blank" : "";
      tile.rel = s.website && isHttpUrl(s.website) ? "noopener" : "";
      tile.style.textDecoration = "none";

      const initials = (s.company || "SP").trim().slice(0, 2).toUpperCase();
      const logo = s.logoUrl && isHttpUrl(s.logoUrl)
        ? `<img alt="${escapeHTML(s.company)} logo" src="${escapeHTML(s.logoUrl)}" style="width:42px;height:42px;border-radius:14px;object-fit:cover" />`
        : `<div class="ff-pill ff-pill--accent" aria-hidden="true">${escapeHTML(initials)}</div>`;

      tile.innerHTML = `
        <div class="ff-row" style="gap:10px;align-items:center">
          ${logo}
          <div style="min-width:0">
            <div class="ff-kicker">${escapeHTML(s.company)}</div>
            <div class="ff-help" style="margin-top:6px">${money(s.amount)}</div>
          </div>
        </div>`;

      frag.appendChild(tile);
    });

    host.appendChild(frag);
  }

  /* -----------------------------
   * Teams section (render/filter/search/sort)
   * --------------------------- */
  function teamName(id) {
    return CONFIG.teams.find((t) => t.id === id)?.name || "All teams";
  }

  const teamUI = {
    filter: "all",
    search: "",
    sort: "featured"
  };

  function computeTeamCounts(list) {
    const all = list.filter((t) => t.id !== "all");
    const featured = all.filter((t) => !!t.featured).length;
    const needs = all.filter((t) => !!t.needs).length;
    return { total: all.length, featured, needs };
  }

  function renderTeamCounts() {
    const c = computeTeamCounts(CONFIG.teams);
    $("#teamsCount") && ($("#teamsCount").textContent = String(c.total));
    $("#teamsFeaturedCount") && ($("#teamsFeaturedCount").textContent = String(c.featured));
    $("#teamsNeedsCount") && ($("#teamsNeedsCount").textContent = String(c.needs));
  }

  function hydrateTeamSelect() {
    const sel = $("#teamSelect");
    if (!sel) return;
    sel.innerHTML = "";

    CONFIG.teams.forEach((t) => {
      const opt = d.createElement("option");
      opt.value = t.id;
      opt.textContent =
        t.id === "all" ? "All teams • Support the full program" : t.name;
      sel.appendChild(opt);
    });
  }

  function teamListFiltered() {
    let list = CONFIG.teams.filter((t) => t.id !== "all");

    if (teamUI.filter === "featured") list = list.filter((t) => !!t.featured);
    if (teamUI.filter === "needs") list = list.filter((t) => !!t.needs);

    if (teamUI.search.trim()) {
      const q = teamUI.search.trim().toLowerCase();
      list = list.filter((t) => (t.name + " " + t.meta).toLowerCase().includes(q));
    }

    const sort = teamUI.sort;
    const byName = (a, b) => a.name.localeCompare(b.name);
    const byRaised = (a, b) => Number(b.raised || 0) - Number(a.raised || 0);
    const byNeeds = (a, b) => Number(!!b.needs) - Number(!!a.needs);
    const byFeatured = (a, b) => Number(!!b.featured) - Number(!!a.featured);
    const byNew = (a, b) => (String(b.id) > String(a.id) ? 1 : -1); // placeholder

    if (sort === "name") list.sort(byName);
    else if (sort === "raised") list.sort(byRaised);
    else if (sort === "needs") list.sort((a, b) => byNeeds(a, b) || byRaised(a, b));
    else if (sort === "new") list.sort(byNew);
    else list.sort((a, b) => byFeatured(a, b) || byNeeds(a, b) || byRaised(a, b));

    return list;
  }

  function renderTeams() {
    const host = $("#teamsGrid");
    const tpl = $("#teamCardTpl");
    if (!host || !tpl) return;

    const list = teamListFiltered();

    host.innerHTML = "";
    const empty = $("#teamsEmpty");
    if (empty) empty.hidden = list.length > 0;

    const restrictedNotice = $("#teamsRestrictedNotice");
    if (restrictedNotice) restrictedNotice.hidden = !list.some((t) => !!t.restricted);

    const frag = d.createDocumentFragment();
    list.forEach((t) => {
      const node = tpl.content.firstElementChild.cloneNode(true);

      node.setAttribute("data-team-id", t.id);
      node.querySelector("[data-team-name]") && (node.querySelector("[data-team-name]").textContent = t.name);
      node.querySelector("[data-team-meta]") && (node.querySelector("[data-team-meta]").textContent = t.meta);

      const bFeatured = node.querySelector("[data-team-badge-featured]");
      const bNeeds = node.querySelector("[data-team-badge-needs]");
      const bRestricted = node.querySelector("[data-team-badge-restricted]");
      if (bFeatured) bFeatured.hidden = !t.featured;
      if (bNeeds) bNeeds.hidden = !t.needs;
      if (bRestricted) bRestricted.hidden = !t.restricted;

      // Sponsor slots
      const slotsWrap = node.querySelector("[data-team-slots]");
      if (slotsWrap) {
        const hasSlots = Number(t.slotsLeft || 0) > 0;
        slotsWrap.hidden = !hasSlots;
        const slotsNum = node.querySelector("[data-team-slots-left]");
        if (slotsNum) slotsNum.textContent = String(t.slotsLeft || 0);
      }

      // Meter
      const meter = node.querySelector("[data-team-meter]");
      const bar = node.querySelector("[data-team-bar]");
      const raised = Number(t.raised || 0);
      const goal = Number(t.goal || 0);
      const pct = goal > 0 ? clamp((raised / goal) * 100, 0, 100) : 0;

      node.querySelector("[data-team-raised]") && (node.querySelector("[data-team-raised]").textContent = money(raised));
      node.querySelector("[data-team-goal]") && (node.querySelector("[data-team-goal]").textContent = money(goal));
      node.querySelector("[data-team-pct]") && (node.querySelector("[data-team-pct]").textContent = String(Math.round(pct)));

      if (bar) bar.style.width = `${pct}%`;
      if (meter) {
        meter.setAttribute("aria-valuenow", String(Math.round(pct)));
        meter.setAttribute("aria-valuetext", `${Math.round(pct)}% funded`);
      }

      // Ask
      node.querySelector("[data-team-ask]") && (node.querySelector("[data-team-ask]").textContent = t.ask || "");

      // Actions
      const donateA = node.querySelector("[data-team-donate]");
      if (donateA) donateA.setAttribute("data-ff-team-tag", t.id);

      // Share/copy can include a team query param
      const teamUrl = (() => {
        try {
          const u = new URL(shareUrl(), location.href);
          u.searchParams.set("team", t.id);
          return u.toString();
        } catch {
          return shareUrl();
        }
      })();

      on(node.querySelector("[data-team-share]"), "click", () => {
        // open share modal but swap caption/link to team-specific
        hydrateShareModal();
        const linkInput = $("#shareLink");
        const capInput = $("#shareCaption");
        if (linkInput) linkInput.value = teamUrl;
        if (capInput) capInput.value = `${CONFIG.share.caption} ${teamUrl}`.trim();
        setModal("share", true);
      });

      on(node.querySelector("[data-team-copy]"), "click", async () => {
        await copyText(teamUrl);
      });

      frag.appendChild(node);
    });

    host.appendChild(frag);
  }

  function initTeamsControls() {
    const seg = $("#teamFilter");
    if (seg) {
      $$("button[data-team-filter]", seg).forEach((btn) => {
        on(btn, "click", () => {
          const v = btn.getAttribute("data-team-filter");
          teamUI.filter = v || "all";
          $$("button[data-team-filter]", seg).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
          $("#teamsFilterPill") && ($("#teamsFilterPill").textContent =
            v === "featured" ? "Featured" : v === "needs" ? "Needs support" : "All teams");
          renderTeams();
        });
      });
    }

    on($("#teamSearch"), "input", (e) => {
      teamUI.search = e.target.value || "";
      renderTeams();
    });

    on($("#teamSort"), "change", (e) => {
      teamUI.sort = e.target.value || "featured";
      renderTeams();
    });

    // Team-tag quick donate buttons
    $$("[data-ff-team-tag]").forEach((a) => {
      on(a, "click", () => {
        const id = a.getAttribute("data-ff-team-tag") || "all";
        setSelectedTeam(id);
      });
    });
  }

  function pickTeamSpotlight() {
    const card = $("#teamSpotlightCard");
    if (!card) return;

    const featured = CONFIG.teams.filter((t) => t.id !== "all" && t.featured);
    const needs = CONFIG.teams.filter((t) => t.id !== "all" && t.needs);

    const pick = (needs[0] || featured[0] || CONFIG.teams.find((t) => t.id !== "all")) || null;
    if (!pick) return;

    card.hidden = false;
    $("#teamSpotlightName") && ($("#teamSpotlightName").textContent = pick.name);
    $("#teamSpotlightDonate") && ($("#teamSpotlightDonate").setAttribute("data-ff-team-tag", pick.id));
    $("#teamSpotlightDonate") && ($("#teamSpotlightDonate").setAttribute("href", "#donate"));
  }

  /* -----------------------------
   * Donation form logic
   * --------------------------- */
  const donation = {
    baseAmount: 0,
    teamId: "all",
    tierId: "",
    freq: "once",
    payMethod: "stripe"
  };

  function clearTierSelection() {
    donation.tierId = "";
    $("#selectedTierId") && ($("#selectedTierId").value = "");
    $("#tierNotice") && ($("#tierNotice").hidden = true);
    $("#sponsorFieldsWrap") && ($("#sponsorFieldsWrap").hidden = true);
    $("#recognitionNotice") && ($("#recognitionNotice").hidden = true);
    $("#sponsorUpsell") && ($("#sponsorUpsell").hidden = true);
  }

  function selectSponsorTier(tierId) {
    const t = CONFIG.sponsorTiers.find((x) => x.id === tierId);
    if (!t) return;

    donation.tierId = tierId;
    $("#selectedTierId") && ($("#selectedTierId").value = tierId);

    setPrefill(t.amount, `Sponsoring at the ${t.name} level.`, { keepTier: true });

    $("#tierNotice") && ($("#tierNotice").hidden = false);
    $("#tierName") && ($("#tierName").textContent = t.name);

    // show sponsor fields + recognition
    $("#sponsorFieldsWrap") && ($("#sponsorFieldsWrap").hidden = false);
    $("#recognitionNotice") && ($("#recognitionNotice").hidden = false);

    updateDonationSummary();
  }

  function setSelectedTeam(teamId) {
    donation.teamId = teamId || "all";
    $("#selectedTeamId") && ($("#selectedTeamId").value = donation.teamId);

    // select in dropdown
    const sel = $("#teamSelect");
    if (sel) sel.value = donation.teamId;

    // update summary
    $("#summaryTeam") && ($("#summaryTeam").textContent = teamName(donation.teamId));
    updateDonationSummary();
  }

  function readAmountInput() {
    const raw = ($("#amountInput")?.value || "").replace(/[^\d.]/g, "");
    const n = Math.round(Number(raw || 0));
    donation.baseAmount = Number.isFinite(n) ? n : 0;
    return donation.baseAmount;
  }

  function applyRoundUp(amount) {
    const roundUp = !!$("#roundUp")?.checked;
    if (!roundUp) return amount;
    const next5 = Math.ceil(amount / 5) * 5;
    return Math.max(amount, next5);
  }

  function applyCoverFees(amount) {
    const cover = !!$("#coverFees")?.checked;
    const notice = $("#coversNotice");
    const text = $("#coversText");

    if (!cover) {
      if (notice) notice.hidden = true;
      return amount;
    }

    const p = Number(CONFIG.fees.percent || 0);
    const f = Number(CONFIG.fees.fixed || 0);
    // gross-up: donor pays X such that net after fees ~= amount
    // net = X - (X*p + f) => X*(1-p) - f = amount => X = (amount + f)/(1-p)
    const gross = (amount + f) / (1 - p);
    const extra = Math.max(0, gross - amount);
    const total = Math.round(gross * 100) / 100;

    if (notice) notice.hidden = false;
    if (text) text.textContent = `Adds ~${money(extra)} to help cover processing fees.`;

    return total;
  }

  function effectiveTotal() {
    let amt = readAmountInput();
    amt = applyRoundUp(amt);
    const total = applyCoverFees(amt);
    return total;
  }

  function updateDonationSummary() {
    const amt = readAmountInput();
    const freq = donation.freq;
    const teamId = ($("#teamSelect")?.value || donation.teamId || "all");
    donation.teamId = teamId;
    $("#selectedTeamId") && ($("#selectedTeamId").value = teamId);

    const total = effectiveTotal();

    // hidden fields
    $("#frequencyHidden") && ($("#frequencyHidden").value = freq);
    $("#ffTotalHidden") && ($("#ffTotalHidden").value = String(total));
    $("#payMethodHidden") && ($("#payMethodHidden").value = donation.payMethod);

    // summary panel
    $("#summaryAmount") && ($("#summaryAmount").textContent = money(amt || 0));
    $("#summaryTotal") && ($("#summaryTotal").textContent = money(total || 0));
    $("#summaryFreq") && ($("#summaryFreq").textContent = freq === "monthly" ? "Monthly" : "One-time");
    $("#summaryTeam") && ($("#summaryTeam").textContent = teamName(teamId));

    // sponsor tier fields: show when tier selected OR amount is sponsor-ish
    const sponsorWrap = $("#sponsorFieldsWrap");
    const sponsorUpsell = $("#sponsorUpsell");
    const recognition = $("#recognitionNotice");
    const tierSelected = !!donation.tierId;

    if (sponsorWrap) sponsorWrap.hidden = !tierSelected;
    if (recognition) recognition.hidden = !tierSelected;
    if (sponsorUpsell) sponsorUpsell.hidden = tierSelected || (amt < 250);

    // match notice (optional)
    const matchOn = !!CONFIG.match.enabled && !!CONFIG.match.endsAtISO;
    const matchNotice = $("#matchNotice");
    if (matchNotice) matchNotice.hidden = !matchOn;

    // donate CTA enablement (soft)
    const openBtns = $$("[data-ff-open-checkout]");
    const ok = Number(total) > 0;
    openBtns.forEach((b) => b && b.toggleAttribute("disabled", !ok));
  }

  function initDonationControls() {
    // Amount changes
    on($("#amountInput"), "input", updateDonationSummary);

    // Quick amount chips (progress + sticky)
    $$("[data-quick-amount]").forEach((b) => {
      on(b, "click", () => {
        const amt = Number(b.getAttribute("data-quick-amount") || 0);
        // Sponsor $1,000 chip should also set sponsor tier if exists
        if (amt >= 1000) {
          const tier = CONFIG.sponsorTiers.find((t) => Number(t.amount) === amt) || CONFIG.sponsorTiers[CONFIG.sponsorTiers.length - 1];
          if (tier) selectSponsorTier(tier.id);
          else setPrefill(amt, "Sponsoring this fundraiser.", { keepTier: true });
        } else {
          setPrefill(amt, "");
        }
        $$("[data-quick-amount]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        toast("Amount selected.");
      });
    });

    // Frequency seg
    const seg = $("#donateFreqSeg");
    if (seg) {
      $$("button[data-freq]", seg).forEach((btn) => {
        on(btn, "click", () => {
          const f = btn.getAttribute("data-freq") || "once";
          donation.freq = f === "monthly" ? "monthly" : "once";
          $$("button[data-freq]", seg).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
          updateDonationSummary();
        });
      });
    }

    // Payment method chips
    $$("[data-pay-method]").forEach((btn) => {
      on(btn, "click", () => {
        const m = btn.getAttribute("data-pay-method") === "paypal" ? "paypal" : "stripe";
        donation.payMethod = m;

        $$("[data-pay-method]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        $("#paypalPaymentWrap") && ($("#paypalPaymentWrap").hidden = m !== "paypal");
        $("#stripePaymentWrap") && ($("#stripePaymentWrap").hidden = m !== "stripe");

        updateDonationSummary();
      });
    });

    // Team select
    on($("#teamSelect"), "change", (e) => {
      setSelectedTeam(e.target.value || "all");
    });

    // Round up / cover fees
    on($("#roundUp"), "change", updateDonationSummary);
    on($("#coverFees"), "change", updateDonationSummary);

    // Anonymous
    on($("#donorAnonymous"), "change", () => {
      const anon = !!$("#donorAnonymous")?.checked;
      if (anon) $("#nameInput") && ($("#nameInput").value = "");
    });

    // Sponsor URL validation hints (website/logo)
    on($("#websiteInput"), "blur", () => {
      const v = ($("#websiteInput")?.value || "").trim();
      if (!isHttpUrl(v)) toast("Website must be http(s).", "error");
    });
    on($("#logoUrlInput"), "blur", () => {
      const v = ($("#logoUrlInput")?.value || "").trim();
      if (!isHttpUrl(v)) toast("Logo URL must be http(s).", "error");
    });
  }

  /* -----------------------------
   * Checkout flow (demo)
   * - Opens checkout modal
   * - Validates form
   * - Simulates payment success
   * --------------------------- */
  function showFormError(msg) {
    const el = $("#formError");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
  }

  function clearFormError() {
    const el = $("#formError");
    if (el) el.hidden = true;
    const amountErr = $("#amountErr");
    if (amountErr) amountErr.hidden = true;
  }

  function validateDonation() {
    clearFormError();

    const total = effectiveTotal();
    if (!total || total <= 0) {
      $("#amountErr") && ($("#amountErr").hidden = false);
      showFormError("Enter a valid amount.");
      return { ok: false };
    }

    const email = ($("#emailInput")?.value || "").trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      showFormError("Enter a valid email for your receipt.");
      return { ok: false };
    }

    // Sponsor fields if tier selected
    if (donation.tierId) {
      const company = ($("#companyInput")?.value || "").trim();
      const website = ($("#websiteInput")?.value || "").trim();
      const logoUrl = ($("#logoUrlInput")?.value || "").trim();

      if (!company) {
        showFormError("Sponsor name is required for sponsor tiers.");
        return { ok: false };
      }
      if (!isHttpUrl(website) || !isHttpUrl(logoUrl)) {
        showFormError("Sponsor website/logo must be valid http(s) URLs.");
        return { ok: false };
      }
    }

    return { ok: true, total };
  }

  function hydrateCheckoutModal() {
    const email = ($("#emailInput")?.value || "").trim();
    const total = effectiveTotal();
    const freq = donation.freq === "monthly" ? "Monthly" : "One-time";
    const team = teamName(donation.teamId);

    // Clear modal error
    const err = $("#checkoutModalError");
    if (err) err.hidden = true;

    // Enable pay button
    const payBtn = $("#payNowBtn");
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.setAttribute("aria-disabled", "false");
      payBtn.textContent = `Pay now • ${money(total)}`;
    }

    // Also prime idempotency key
    $("#ffIdemHidden") && ($("#ffIdemHidden").value = uid());

    // If you want to show details in modal, you can add IDs later; not required.
    // Success modal details are set on completion.
    return { email, total, freq, team };
  }

  function setCheckoutProcessing(onState) {
    const p = $("#checkoutProcessing");
    const payBtn = $("#payNowBtn");
    if (p) p.hidden = !onState;
    if (payBtn) {
      payBtn.disabled = onState;
      payBtn.setAttribute("aria-disabled", String(onState));
    }
  }

  function recordGift({ total }) {
    const ts = now();
    const teamId = donation.teamId || "all";
    const freq = donation.freq || "once";

    const isSponsor = !!donation.tierId;
    const anonymous = !!$("#donorAnonymous")?.checked;

    const nameInput = ($("#nameInput")?.value || "").trim();
    const note = ($("#noteInput")?.value || "").trim();

    if (isSponsor) {
      store.gifts.push({
        id: uid(),
        type: "sponsor",
        amount: Number(total),
        tierId: donation.tierId,
        teamId,
        freq,
        email: ($("#emailInput")?.value || "").trim(),
        company: ($("#companyInput")?.value || "").trim(),
        website: ($("#websiteInput")?.value || "").trim(),
        logoUrl: ($("#logoUrlInput")?.value || "").trim(),
        preferred: !!$("#sponsorPreferred")?.checked,
        public: !!$("#sponsorPublic")?.checked,
        note,
        ts
      });
    } else {
      store.gifts.push({
        id: uid(),
        type: "donation",
        amount: Number(total),
        teamId,
        freq,
        email: ($("#emailInput")?.value || "").trim(),
        name: anonymous ? "Anonymous" : (nameInput || "Donor"),
        note,
        ts
      });
    }

    // Update team raised in config (demo-mode only)
    const team = CONFIG.teams.find((t) => t.id === teamId);
    if (team && teamId !== "all") team.raised = Number(team.raised || 0) + Number(total || 0);

    saveStore();
  }

  function openCheckout() {
    const v = validateDonation();
    if (!v.ok) return;

    hydrateCheckoutModal();
    setModal("checkout", true);
  }

  function completeCheckout() {
    const v = validateDonation();
    if (!v.ok) {
      const err = $("#checkoutModalError");
      if (err) {
        err.hidden = false;
        err.textContent = "Please fix the donation form details before paying.";
      }
      setModal("checkout", false);
      return;
    }

    setCheckoutProcessing(true);

    // Demo delay
    setTimeout(() => {
      recordGift({ total: v.total });

      setCheckoutProcessing(false);
      setModal("checkout", false);

      hydrateSuccessModal(v.total);
      setModal("success", true);

      // Re-render key sections
      renderProgress();
      renderGifts();
      renderSponsorTiers();
      renderSponsorLeaderboard();
      renderSponsorWall();
      renderTeams();

      toast("Donation recorded (demo mode).");
    }, 900);
  }

  function hydrateSuccessModal(total) {
    const email = ($("#emailInput")?.value || "").trim();
    const team = teamName(donation.teamId);
    const freqText = donation.freq === "monthly" ? "Monthly" : "One-time";

    $("#successEmail") && ($("#successEmail").textContent = email || "—");
    $("#successAmount") && ($("#successAmount").textContent = money(total));
    $("#successFrequency") && ($("#successFrequency").textContent = freqText);
    $("#successTeam") && ($("#successTeam").textContent = team);

    // caption
    const url = shareUrl();
    const cap = `${CONFIG.share.successCaption} ${url}`.trim();
    const capEl = $("#successCaption");
    if (capEl) capEl.value = cap;

    // sponsor CTA
    const sponsorCta = $("#successSponsorCta");
    if (sponsorCta) sponsorCta.hidden = false;

    // Buttons
    on($("#successCopy"), "click", async () => copyText(url));
    on($("[data-ff-success-copy-caption]"), "click", async () => copyText(capEl?.value || cap));
    on($("#successShare"), "click", async () => {
      await nativeShare({ title: CONFIG.org.name, text: capEl?.value || cap, url });
    });
  }

  function initCheckoutButtons() {
    $$("[data-ff-open-checkout]").forEach((btn) => on(btn, "click", openCheckout));
    on($("[data-ff-pay-now]"), "click", completeCheckout);
  }

  /* -----------------------------
   * Match countdown (optional)
   * --------------------------- */
  function initMatchCountdown() {
    const matchOn = !!CONFIG.match.enabled && !!CONFIG.match.endsAtISO;
    if (!matchOn) return;

    const end = new Date(CONFIG.match.endsAtISO).getTime();
    if (!Number.isFinite(end)) return;

    const out = $("#matchCountdown");
    const pill = $("#countdownPill");

    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) {
        out && (out.textContent = "Match ended");
        pill && (pill.hidden = true);
        $("#matchPill") && ($("#matchPill").hidden = true);
        return;
      }

      const s = Math.floor(diff / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const txt = h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;

      out && (out.textContent = `Ends in ${txt}`);
      pill && (pill.hidden = false);
      $("#matchPill") && ($("#matchPill").hidden = false);
    };

    tick();
    setInterval(tick, 1000);
  }

  /* -----------------------------
   * Scroll UX (progress bar, sticky donate, back-to-top)
   * --------------------------- */
  function initScrollUX() {
    const scrollBar = $("#scrollProgressBar");
    const back = $("#backToTop");
    const sticky = $("#stickyDonate");

    const hero = $("[data-ff-hero]");
    const heroTop = () => hero?.getBoundingClientRect()?.bottom || 0;

    const tick = () => {
      const doc = d.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const y = doc.scrollTop || d.body.scrollTop || 0;
      const pct = max > 0 ? clamp((y / max) * 100, 0, 100) : 0;

      if (scrollBar) scrollBar.style.width = `${pct}%`;
      if (back) back.hidden = y < 800;

      if (sticky) {
        const show = heroTop() < 0;
        sticky.hidden = !show;
      }
    };

    tick();
    on(window, "scroll", tick, { passive: true });

    on(back, "click", () => {
      $("#top")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // Mobile tabs: highlight active section (lightweight)
    const tabs = $$("[data-ff-mobile-tabs] .ff-tab");
    const sections = ["progress", "impact", "teams", "donate"]
      .map((id) => ({ id, el: $(`#${id}`) }))
      .filter((x) => x.el);

    const setActive = (id) => {
      tabs.forEach((t) => t.classList.toggle("is-active", t.getAttribute("href") === `#${id}`));
    };

    if (sections.length && tabs.length) {
      const obs = new IntersectionObserver(
        (entries) => {
          const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (vis?.target?.id) setActive(vis.target.id);
        },
        { root: null, threshold: [0.2, 0.35, 0.5] }
      );
      sections.forEach((s) => obs.observe(s.el));
    }
  }

  /* -----------------------------
   * Wire sponsor tier selection from other CTAs
   * --------------------------- */
  function initSponsorTierSelectionRouting() {
    // If URL contains ?tier=gold etc, preselect on load
    try {
      const u = new URL(location.href);
      const tierId = u.searchParams.get("tier");
      if (tierId && CONFIG.sponsorTiers.some((t) => t.id === tierId)) {
        selectSponsorTier(tierId);
      }

      const teamId = u.searchParams.get("team");
      if (teamId && CONFIG.teams.some((t) => t.id === teamId)) {
        setSelectedTeam(teamId);
      }
    } catch {}
  }

  /* -----------------------------
   * Init
   * --------------------------- */
  function init() {
    applyPremiumVisibility();

    bindOrg();
    initThemeToggle();
    initAnnouncement();
    initTopbar();

    initDrawer();
    initModals();
    initShareButtons();

    renderImpact();
    renderAllocation();

    renderSponsorTiers();
    renderSponsorLeaderboard();
    renderSponsorWall();

    renderTeamCounts();
    hydrateTeamSelect();
    initTeamsControls();
    pickTeamSpotlight();
    renderTeams();

    renderProgress();
    renderGifts();

    initDonationControls();
    initCheckoutButtons();
    initMatchCountdown();
    initScrollUX();
    initSponsorTierSelectionRouting();

    // Keep summary synced initially
    updateDonationSummary();

    // “PayPal chip” visibility: only show if you actually enable PayPal later
    // (Here we leave it visible; you can hide it by setting a config flag.)
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();



/* ---- FF PATCH: Team Images ---- */
(function () {
  try {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-team-card]').forEach(card => {
        const img = card.querySelector('[data-team-image]');
        if (!img) return;
        const src = img.getAttribute('data-src') || img.getAttribute('src');
        if (src) img.src = src;
      });
    });
  } catch (e) {
    console.warn('[FF] Team image patch skipped', e);
  }
})();
