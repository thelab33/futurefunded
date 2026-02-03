/* ============================================================================
   FutureFunded — Premium Flex Pack (v17.2a)
   - No HTML changes required (injects what it needs)
   - Uses your existing data-ff-* hooks
============================================================================ */
(() => {
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $  = (sel, root = document) => root.querySelector(sel);

  const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------------------- Toasts -------------------- */
  function ensureToastsMount() {
    let mount = $(".ff-toasts");
    if (!mount) {
      mount = document.createElement("div");
      mount.className = "ff-toasts";
      mount.setAttribute("aria-live", "polite");
      mount.setAttribute("aria-atomic", "true");
      document.body.appendChild(mount);
    }
    return mount;
  }

  function toast({ title = "Done", msg = "", tone = "info", ms = 2200 } = {}) {
    const mount = ensureToastsMount();
    const el = document.createElement("div");
    el.className = `ff-toast ff-toast--${tone}`;
    el.innerHTML = `
      <div class="ff-toast__title">${escapeHtml(title)}</div>
      ${msg ? `<div class="ff-toast__msg">${escapeHtml(msg)}</div>` : ""}
    `;
    mount.appendChild(el);

    window.setTimeout(() => {
      el.classList.add("is-leaving");
      window.setTimeout(() => el.remove(), prefersReduced() ? 0 : 180);
    }, ms);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /* -------------------- Copy link / Copy blurb -------------------- */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", msg: "Link copied to clipboard.", tone: "good" });
      return true;
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast({ title: ok ? "Copied" : "Copy failed", msg: ok ? "Link copied." : "Please copy manually.", tone: ok ? "good" : "bad" });
      return ok;
    }
  }

  function wireCopyButtons() {
    $$(".ff-btn[data-ff-copy-link], button[data-ff-copy-link]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = buildShareUrlFromState() || window.location.href;
        await copyText(url);
        // also populate share modal input if present
        const input = $("[data-ff-share-url]");
        if (input) input.value = url;
      });
    });

    const copyBlurbBtn = $("[data-ff-copy-blurb], [data-ff-copy-script]");
    const blurb = $("[data-ff-share-blurb], [data-ff-share-script]");
    if (copyBlurbBtn && blurb) {
      copyBlurbBtn.addEventListener("click", () => copyText(blurb.value || blurb.textContent || ""));
    }
  }

  /* -------------------- Native share -------------------- */
  function wireNativeShare() {
    const btn = $("[data-ff-native-share]");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const url = buildShareUrlFromState() || window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
          toast({ title: "Shared", msg: "Thanks for spreading the word 💫", tone: "good" });
        } catch {
          // user canceled
        }
      } else {
        await copyText(url);
      }
    });
  }

  /* -------------------- Theme toggle (inject) -------------------- */
  function getTheme() {
    return document.documentElement.getAttribute("data-theme") || "";
  }
  function setTheme(t) {
    if (!t) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("ff_theme", t);
  }
  function initTheme() {
    const saved = localStorage.getItem("ff_theme");
    if (saved !== null) setTheme(saved);

    // Inject a toggle into any obvious action rows
    const spots = [
      $(".ff-header__actions"),
      $("[aria-label='Fundraiser tools']"),
      $("[aria-label='Primary drawer actions']"),
    ].filter(Boolean);

    if (!spots.length) return;

    spots.forEach((spot) => {
      if (spot.querySelector("[data-ff-theme-toggle]")) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ff-btn ff-btn--ghost ff-btn--sm";
      b.setAttribute("data-ff-theme-toggle", "");
      b.setAttribute("aria-pressed", getTheme() === "dark" ? "true" : "false");
      b.textContent = getTheme() === "dark" ? "Light mode" : "Dark mode";
      b.addEventListener("click", () => {
        const next = getTheme() === "dark" ? "" : "dark";
        setTheme(next);
        b.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
        b.textContent = next === "dark" ? "Light mode" : "Dark mode";
        toast({ title: "Theme updated", msg: next === "dark" ? "Dark mode on." : "Light mode on.", tone: "info" });
      });
      spot.appendChild(b);
    });
  }

  /* -------------------- Scroll progress bar -------------------- */
  function initScrollProgress() {
    const bar = $(".ff-scroll span");
    if (!bar) return;

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? (doc.scrollTop / max) * 100 : 0;
      bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;

      const chrome = $(".ff-chrome");
      if (chrome) chrome.setAttribute("data-scrolled", doc.scrollTop > 10 ? "true" : "false");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* -------------------- Back to top (ARIA correct) -------------------- */
  function initBackToTop() {
    const btn = $("[data-ff-backtotop]");
    if (!btn) return;

    const onScroll = () => {
      const show = window.scrollY > 700;
      btn.hidden = false; // keep in DOM (your CSS handles hidden state)
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    btn.addEventListener("click", (e) => {
      // allow normal anchor behavior but smooth if allowed
      if (!prefersReduced()) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        const top = $("#top");
        if (top) top.focus?.();
      }
    });
  }

  /* -------------------- Scrollspy for mobile tabs + anchors -------------------- */
  function initScrollSpy() {
    const tabLinks = $$("[data-ff-tab-link]");
    if (!tabLinks.length) return;

    const ids = tabLinks
      .map((a) => (a.getAttribute("href") || "").replace("#", ""))
      .filter(Boolean);

    const sections = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!sections.length) return;

    const setActive = (id) => {
      tabLinks.forEach((a) => {
        const is = (a.getAttribute("href") || "") === `#${id}`;
        if (is) {
          a.setAttribute("aria-current", "page");
          a.dataset.active = "true";
        } else {
          a.removeAttribute("aria-current");
          delete a.dataset.active;
        }
      });
    };

    const io = new IntersectionObserver((entries) => {
      // pick the most visible
      const best = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best?.target?.id) setActive(best.target.id);
    }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.08, 0.16, 0.25] });

    sections.forEach((s) => io.observe(s));
  }

  /* -------------------- Sticky Donate bar (mobile) -------------------- */
  function initStickyDonate() {
    const donateSection = $("#donate");
    if (!donateSection) return;

    // create bar
    const bar = document.createElement("div");
    bar.className = "ff-stickyDonate";
    bar.setAttribute("data-ff-sticky-donate", "");
    bar.innerHTML = `
      <div class="ff-stickyDonate__row">
        <div class="ff-stickyDonate__meta">
          <b>Ready to donate?</b>
          <span>Secure checkout • Instant receipt</span>
        </div>
        <a class="ff-btn ff-btn--primary" href="#donate" data-ff-donate-cta>Donate</a>
      </div>
    `;
    document.body.appendChild(bar);

    const io = new IntersectionObserver((entries) => {
      const visible = entries[0]?.isIntersecting;
      // show bar when donate section not visible
      bar.classList.toggle("is-on", !visible);
    }, { threshold: 0.12 });

    io.observe(donateSection);
  }

  /* -------------------- State: URL + localStorage persistence -------------------- */
  function getStateFromPage() {
    const amount = $("[data-ff-amount]")?.value?.trim() || "";
    const email  = $("[data-ff-email]")?.value?.trim() || "";
    const anon   = !!$("[data-ff-anonymous]")?.checked;
    const fees   = !!$("[data-ff-cover-fees]")?.checked;

    const teamName = $("[data-ff-team-selected-name]")?.textContent?.trim() || "";
    const teamSelected = !!$("[data-ff-team-selected]") && !$("[data-ff-team-selected]")?.hasAttribute("hidden");

    // if you have a team id in JS, store it too; for now name is share-safe fallback
    return {
      amount,
      email,
      anon: anon ? "1" : "",
      fees: fees ? "1" : "",
      team: teamSelected ? teamName : "",
      // utm capture
      utm_source: getQuery("utm_source"),
      utm_medium: getQuery("utm_medium"),
      utm_campaign: getQuery("utm_campaign"),
      utm_content: getQuery("utm_content"),
      utm_term: getQuery("utm_term"),
    };
  }

  function saveState() {
    const st = getStateFromPage();
    localStorage.setItem("ff_state", JSON.stringify(st));
  }

  function loadState() {
    // prefer URL state for share links
    const urlState = {
      amount: getQuery("amount"),
      team: getQuery("team"),
      anon: getQuery("anon"),
      fees: getQuery("fees"),
      email: getQuery("email"),
    };

    let ls = {};
    try { ls = JSON.parse(localStorage.getItem("ff_state") || "{}"); } catch {}

    const st = { ...ls, ...Object.fromEntries(Object.entries(urlState).filter(([,v]) => v != null && v !== "")) };

    if (st.amount && $("[data-ff-amount]")) $("[data-ff-amount]").value = st.amount;
    if (st.email && $("[data-ff-email]")) $("[data-ff-email]").value = st.email;
    if ($("[data-ff-anonymous]") && st.anon != null) $("[data-ff-anonymous]").checked = st.anon === "1";
    if ($("[data-ff-cover-fees]") && st.fees != null) $("[data-ff-cover-fees]").checked = st.fees === "1";

    // Team selection: if your existing JS exposes a selector by name/id, call it here.
    // For now we just surface it in share modal + summary.
    if (st.team) {
      const pill = $("[data-ff-team-selected]");
      const name = $("[data-ff-team-selected-name]");
      if (pill && name) {
        name.textContent = st.team;
        pill.hidden = false;
      }
      const teamRow = $("[data-ff-id='summaryTeamRow']");
      const teamVal = $("[data-ff-id='summaryTeam']");
      if (teamRow && teamVal) {
        teamRow.hidden = false;
        teamVal.textContent = st.team;
      }
    }
  }

  function buildShareUrlFromState() {
    const st = getStateFromPage();
    const url = new URL(window.location.href);
    // keep path but reset query
    url.search = "";

    const params = new URLSearchParams();
    if (st.amount) params.set("amount", st.amount);
    if (st.team)   params.set("team", st.team);
    if (st.anon)   params.set("anon", st.anon);
    if (st.fees)   params.set("fees", st.fees);

    // keep UTMs if present
    ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach((k) => {
      if (st[k]) params.set(k, st[k]);
    });

    url.search = params.toString();
    return url.toString();
  }

  function getQuery(k) {
    return new URLSearchParams(window.location.search).get(k);
  }

  function wirePersistence() {
    // load once
    loadState();

    // save on meaningful changes
    ["input","change"].forEach((ev) => {
      document.addEventListener(ev, (e) => {
        const t = e.target;
        if (!t) return;
        if (
          t.matches("[data-ff-amount],[data-ff-email],[data-ff-anonymous],[data-ff-cover-fees],[data-ff-message],[data-ff-name]")
        ) {
          saveState();
        }
      }, { passive: true });
    });

    // update share url input live when share modal opens (if your modal code toggles aria-hidden)
    const shareModal = $("#ffShareModal");
    if (shareModal) {
      const mo = new MutationObserver(() => {
        const open = shareModal.getAttribute("aria-hidden") === "false";
        if (open) {
          const input = $("[data-ff-share-url]");
          if (input) input.value = buildShareUrlFromState();
        }
      });
      mo.observe(shareModal, { attributes: true, attributeFilter: ["aria-hidden"] });
    }
  }

  /* -------------------- Lightweight form validation (pro feel) -------------------- */
  function initFormValidation() {
    const form = $("[data-ff-donate-form]");
    if (!form) return;

    const amountEl = $("[data-ff-amount]");
    const emailEl  = $("[data-ff-email]");

    const setErr = (el, msg) => {
      if (!el) return;
      el.classList.add("is-error");
      let help = el.parentElement?.querySelector(".ff-fieldError");
      if (!help) {
        help = document.createElement("div");
        help.className = "ff-fieldError";
        el.parentElement?.appendChild(help);
      }
      help.textContent = msg;
    };

    const clearErr = (el) => {
      if (!el) return;
      el.classList.remove("is-error");
      const help = el.parentElement?.querySelector(".ff-fieldError");
      if (help) help.remove();
    };

    const parseAmount = (v) => {
      const n = Number(String(v).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    form.addEventListener("submit", (e) => {
      clearErr(amountEl); clearErr(emailEl);

      const amt = parseAmount(amountEl?.value || "");
      const email = (emailEl?.value || "").trim();

      let ok = true;
      if (amt < 1) { ok = false; setErr(amountEl, "Enter a donation amount of at least $1."); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ok = false; setErr(emailEl, "Enter a valid email for your receipt."); }

      if (!ok) {
        e.preventDefault();
        toast({ title: "Check the form", msg: "Fix the highlighted fields to continue.", tone: "bad" });
        // focus first invalid
        (amountEl?.classList.contains("is-error") ? amountEl : emailEl)?.focus?.();
      }
    });

    // Nice: auto-format amount on blur
    if (amountEl) {
      amountEl.addEventListener("blur", () => {
        const n = parseAmount(amountEl.value);
        if (n > 0) amountEl.value = String(n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));
      });
    }
  }

  /* -------------------- Optional: auto refresh sponsors when visible -------------------- */
  function initAutoRefresh() {
    const refreshBtn = $("[data-ff-refresh-sponsors]");
    const sponsorsSection = $("#sponsors");
    if (!refreshBtn || !sponsorsSection) return;

    let tick = null;
    const start = () => {
      if (tick) return;
      tick = window.setInterval(() => {
        // only refresh if section likely visible-ish
        const r = sponsorsSection.getBoundingClientRect();
        const near = r.top < window.innerHeight * 1.2 && r.bottom > -window.innerHeight * 0.2;
        if (near) refreshBtn.click();
      }, 25000); // every 25s
    };
    const stop = () => { if (tick) window.clearInterval(tick); tick = null; };

    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
    start();
  }

  /* -------------------- Init -------------------- */
  function init() {
    wireCopyButtons();
    wireNativeShare();
    initTheme();
    initScrollProgress();
    initBackToTop();
    initScrollSpy();
    initStickyDonate();
    wirePersistence();
    initFormValidation();
    initAutoRefresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
