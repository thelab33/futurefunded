(() => {
  "use strict";

  /**
   * ff-inline-legacy.js (refactor)
   * v14.2.2 goals:
   * - zero conflict with ff-app.js (skip overlap when app present)
   * - CSP-safe (no inline JS required)
   * - keep share link synced + caption copy fallback
   * - add data-ff-team-controls-form submit prevention
   * - optional action-sheet long-press UX
   */

  // One-time guard (namespaced, versioned)
  const GUARD = "__FF_INLINE_LEGACY_V14_2_2_LOADED";
  if (window[GUARD]) return;
  window[GUARD] = true;

  // --- Helpers ---
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts || false); };

  const hasFF = (fn) => !!(window.FF && typeof window.FF[fn] === "function");

  // Detect the primary app (avoid binding overlaps)
  const APP_PRESENT =
    !!window.__FF_APP_V14_2_LOADED ||
    !!window.__FF_APP_V14_LOADED ||
    !!window.__FF_APP_V13_LOADED ||
    (window.FF && typeof window.FF.buildShareUrl === "function"); // strongest safe signal

  const setHidden = (el, hidden) => {
    if (!el) return;
    const v = !!hidden;
    el.hidden = v;
    el.setAttribute("aria-hidden", v ? "true" : "false");
    try { el.inert = v; } catch (_) {}
  };

  // --- Toasts (prefers FF.toast). No innerHTML. ---
  const toast = (msg, kind = "info") => {
    try {
      if (hasFF("toast")) {
        window.FF.toast(String(msg ?? ""), String(kind || "info"));
        return;
      }

      const host = qs("[data-ff-toasts]");
      if (!host) return;

      setHidden(host, false);

      const k = String(kind || "info");
      const t = document.createElement("div");
      t.className = `ff-toast ff-toast--${k}`;
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");

      const a = document.createElement("div");
      a.className = "ff-kicker";
      a.textContent = k;

      const b = document.createElement("div");
      b.className = "ff-help";
      b.textContent = String(msg ?? "");

      t.appendChild(a);
      t.appendChild(b);

      // light animation without classes (keeps CSS optional)
      t.style.opacity = "0";
      t.style.transform = "translateY(6px)";
      host.appendChild(t);

      requestAnimationFrame(() => {
        t.style.opacity = "1";
        t.style.transform = "translateY(0)";
      });

      window.setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateY(-2px)";
      }, 2400);

      window.setTimeout(() => {
        try { host.removeChild(t); } catch (_) {}
        if (!host.children.length) setHidden(host, true);
      }, 2900);
    } catch (_) {}
  };

  // --- Share URL ---
  const sanitizeUrl = (raw) => {
    try {
      const u = new URL(String(raw || window.location.href));
      [
        "payment_intent","payment_intent_client_secret","redirect_status",
        "token","PayerID","payerId","order_id","orderID","paymentId"
      ].forEach((k) => u.searchParams.delete(k));
      return u.toString();
    } catch (_) {
      return String(raw || window.location.href);
    }
  };

  const getShareUrl = () => {
    try {
      if (hasFF("buildShareUrl")) {
        const u = window.FF.buildShareUrl();
        if (u) return sanitizeUrl(String(u));
      }
    } catch (_) {}
    return sanitizeUrl(window.location.href);
  };

  const syncShareLink = () => {
    const input = qs("#shareLink");
    if (input) input.value = getShareUrl();
  };

  const observeShareModal = () => {
    const modal = qs("#ffShareModal");
    if (!modal || !window.MutationObserver) return;
    if (modal.__ffObs_shareSync_v1422) return;
    modal.__ffObs_shareSync_v1422 = true;

    const obs = new MutationObserver(() => {
      if (!modal.hidden) syncShareLink();
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  };

  // --- Clipboard ---
  const copyText = async (text) => {
    const s = String(text ?? "");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch (_) {}

    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  };

  // --- Year stamp ---
  const stampYear = () => {
    try {
      const yel = qs("#ffYear");
      if (yel) yel.textContent = String(new Date().getFullYear());
    } catch (_) {}
  };

  // --- Proof caption copy (fallback) ---
  const bindCopyCaption = () => {
    // If the app ever provides FF.copyCaption, avoid overlap.
    if (hasFF("copyCaption")) return;

    const btn = qs("[data-ff-copy-caption]");
    if (!btn || btn.__ffBound_copyCaption_v1422) return;
    btn.__ffBound_copyCaption_v1422 = true;

    on(btn, "click", async () => {
      const el = qs("#proofCaption");
      const ok = await copyText(el ? el.value : "");
      toast(ok ? "Caption copied." : "Copy failed.", ok ? "success" : "error");
    });
  };

  // --- Shell-only share buttons (SKIP if app present to prevent double-binding) ---
  const bindShellShareFallbacks = () => {
    if (APP_PRESENT) return;

    // Copy fundraiser link
    qsa("[data-ff-copy-link]").forEach((btn) => {
      if (btn.__ffBound_copyLink_v1422) return;
      btn.__ffBound_copyLink_v1422 = true;

      on(btn, "click", async () => {
        const ok = await copyText(getShareUrl());
        toast(ok ? "Link copied." : "Copy failed.", ok ? "success" : "error");
      });
    });

    // Team share button support
    const getTeamShareUrl = () => {
      try {
        if (hasFF("buildTeamShareUrl")) {
          const u = window.FF.buildTeamShareUrl();
          if (u) return sanitizeUrl(String(u));
        }
      } catch (_) {}

      const btn = qs("[data-ff-team-share]");
      const ds = btn && btn.dataset ? (btn.dataset.teamUrl || btn.dataset.ffTeamUrl || "") : "";
      if (ds) return sanitizeUrl(ds);

      return getShareUrl();
    };

    qsa("[data-ff-team-share]").forEach((btn) => {
      if (btn.__ffBound_teamShare_v1422) return;
      btn.__ffBound_teamShare_v1422 = true;

      on(btn, "click", async () => {
        const url = getTeamShareUrl();
        const ok = await copyText(url);
        toast(ok ? "Team link copied." : "Copy failed.", ok ? "success" : "error");
      });
    });

    // SMS / Email share
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || "");

    qsa("[data-ff-sms-share]").forEach((btn) => {
      if (btn.__ffBound_smsShare_v1422) return;
      btn.__ffBound_smsShare_v1422 = true;

      on(btn, "click", () => {
        const url = getShareUrl();
        const text = encodeURIComponent(`Support this fundraiser: ${url}`);
        window.location.href = isIOS() ? `sms:&body=${text}` : `sms:?&body=${text}`;
      });
    });

    qsa("[data-ff-email-share]").forEach((btn) => {
      if (btn.__ffBound_emailShare_v1422) return;
      btn.__ffBound_emailShare_v1422 = true;

      on(btn, "click", () => {
        const url = getShareUrl();
        const subject = encodeURIComponent("Support our fundraiser");
        const body = encodeURIComponent(`Here’s the link to donate:\n\n${url}\n\nThank you!`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      });
    });
  };

  // --- data-ff-team-controls-form (CSP-safe submit prevention) ---
  const bindTeamControlsForm = () => {
    const form = qs("[data-ff-team-controls-form]");
    if (!form || form.__ffBound_teamControlsForm_v1422) return;
    form.__ffBound_teamControlsForm_v1422 = true;

    on(form, "submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const search = qs("[data-ff-team-search], #teamSearch", form);
      if (search && typeof search.focus === "function") {
        try { search.focus({ preventScroll: true }); } catch (_) { search.focus(); }
      }
    });

    const search = qs("[data-ff-team-search], #teamSearch", form);
    if (search && !search.__ffBound_enterKey_v1422) {
      search.__ffBound_enterKey_v1422 = true;
      on(search, "keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }
  };

  // --- Mirror numbers (SKIP if app present to avoid redundant observers) ---
  const bindMirrors = () => {
    if (APP_PRESENT) return;

    const pickText = (...sels) => {
      for (const sel of sels) {
        const el = qs(sel);
        if (!el) continue;
        const t = (el.textContent || "").trim();
        if (t) return t;
      }
      return "";
    };

    const mirror = (fromCandidates, toSel) => {
      const to = qs(toSel);
      if (!to) return;

      const sync = () => {
        const t = pickText(...fromCandidates);
        if (t) to.textContent = t;
      };

      try {
        if (window.MutationObserver) {
          fromCandidates.forEach((sel) => {
            const from = qs(sel);
            if (!from) return;
            const obs = new MutationObserver(sync);
            obs.observe(from, { childList: true, characterData: true, subtree: true });
          });
        }
      } catch (_) {}

      sync();
    };

    mirror(["[data-ff-raised]", "#raisedRow", "#topbarRaised", "#raisedBig"], "#stickyRaised");
    mirror(["[data-ff-goal]", "#goalRow", "#topbarGoal", "#goalPill"], "#stickyGoal");
    mirror(["[data-ff-raised]", "#raisedRow", "#raisedBig"], "#ffSheetRaised");
    mirror(["[data-ff-remaining]", "#remainingText"], "#ffSheetRemaining");
  };

  // --- Action sheet (safe even with app present) ---
  const bindActionSheet = () => {
    const sheet = qs("[data-ff-sheet]");
    if (!sheet) return;

    const state = { lastFocus: null };

    const openSheet = () => {
      try { state.lastFocus = document.activeElement; } catch (_) {}
      setHidden(sheet, false);
      const panel = qs(".ff-sheet__panel", sheet);
      if (panel && typeof panel.focus === "function") {
        try { panel.focus(); } catch (_) {}
      }
    };

    const closeSheet = () => {
      setHidden(sheet, true);
      const lf = state.lastFocus;
      state.lastFocus = null;
      if (lf && typeof lf.focus === "function") {
        try { lf.focus(); } catch (_) {}
      }
    };

    qsa("[data-ff-sheet-close]").forEach((btn) => {
      if (btn.__ffBound_sheetClose_v1422) return;
      btn.__ffBound_sheetClose_v1422 = true;
      on(btn, "click", closeSheet);
    });

    on(document, "keydown", (e) => {
      if (e.key === "Escape" && !sheet.hidden) {
        try { e.preventDefault(); } catch (_) {}
        closeSheet();
      }
    });

    // Long-press donate CTA -> open sheet (coarse pointers only)
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) return;

    const HOLD_MS = 420;
    const supportsPointer = "PointerEvent" in window;

    qsa("[data-ff-donate-cta]").forEach((el) => {
      if (el.__ffBound_holdSheet_v1422) return;
      el.__ffBound_holdSheet_v1422 = true;

      let t = null;
      const clear = () => { if (t) { clearTimeout(t); t = null; } };

      if (supportsPointer) {
        on(el, "pointerdown", (ev) => {
          if (ev.isPrimary === false) return;
          clear();
          t = setTimeout(() => {
            el.__ffSkipNextClick_v1422 = true;
            openSheet();
            setTimeout(() => { el.__ffSkipNextClick_v1422 = false; }, 650);
            try { ev.preventDefault(); } catch (_) {}
          }, HOLD_MS);
        });

        on(el, "pointerup", clear);
        on(el, "pointercancel", clear);
        on(el, "pointerleave", clear);

        // Capture-phase click cancel for the "held" click only
        on(el, "click", (e) => {
          if (el.__ffSkipNextClick_v1422) {
            try { e.preventDefault(); } catch (_) {}
            try { e.stopPropagation(); } catch (_) {}
          }
        }, true);
      }
    });
  };

  // --- Tabs + Back-to-top integration (SKIP if app present to avoid conflicts) ---
  const bindTabsAndBackToTop = () => {
    if (APP_PRESENT) return;

    const tabs = qs("[data-ff-tabs]");
    const btnTop = qs("[data-ff-backtotop]");
    if (!tabs && !btnTop) return;

    const links = tabs ? Array.from(tabs.querySelectorAll("a.ff-tab[href^='#']")) : [];
    const ids = links.map(a => (a.getAttribute("href") || "").slice(1)).filter(Boolean);
    const sections = ids.map(id => document.getElementById(id)).filter(Boolean);

    const setActive = (id) => {
      links.forEach(a => {
        const active = a.getAttribute("href") === "#" + id;
        a.classList.toggle("is-active", active);
        if (active) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };

    const showTop = (show) => {
      if (!btnTop) return;
      btnTop.hidden = !show;
      btnTop.setAttribute("aria-hidden", show ? "false" : "true");
    };

    if ("IntersectionObserver" in window && sections.length) {
      const io = new IntersectionObserver((entries) => {
        const vis = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis && vis.target && vis.target.id) setActive(vis.target.id);
      }, { threshold: [0.22, 0.33, 0.5, 0.66] });
      sections.forEach(s => io.observe(s));
    } else if (ids[0]) {
      setActive(ids[0]);
    }

    on(window, "scroll", () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      showTop(y > 520);
    }, { passive: true });

    try { showTop((window.scrollY || 0) > 520); } catch (_) {}
  };

  // --- Boot ---
  const boot = () => {
    stampYear();
    observeShareModal();
    bindCopyCaption();
    bindShellShareFallbacks();     // only when APP not present
    bindTeamControlsForm();        // always safe + CSP-friendly
    bindMirrors();                 // only when APP not present
    bindActionSheet();             // safe even when APP present
    bindTabsAndBackToTop();        // only when APP not present
    // ensure shareLink is sane at least once
    try { syncShareLink(); } catch (_) {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

