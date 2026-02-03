// /static/js/fc-app.js
(function () {
  "use strict";

  const doc = document;

  // ---------- Small helpers ----------
  const $ = (sel, root = doc) => root.querySelector(sel);
  const $$ = (sel, root = doc) => Array.from(root.querySelectorAll(sel));

  const LS = window.localStorage;
  const THEME_KEY = "fc:theme";
  const ANNOUNCEMENT_KEY_PREFIX = "fc:announcement:";
  const PREF_GIFT_KEY = "fc:gift:last";

  let selectedGiftAmount = null;
  let selectedGiftText = "";

  function safeNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  // ---------- Progress bar animations ----------
  function initProgress() {
    const heroFill = $(".fc-progress-fill");
    const miniFill = $(".fc-mini-progress-fill");

    const animate = (el) => {
      if (!el) return;
      const target = safeNumber(el.dataset.target || el.getAttribute("data-target"));
      const pct = Math.max(0, Math.min(target, 100));
      // kick animation after a short delay so CSS transition fires
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.width = pct + "%";
        });
      });
    };

    animate(heroFill);
    animate(miniFill);
  }

  // ---------- Gift tiles + preview ----------
  function initGiftTiles() {
    const tiles = $$(".fc-gift-pill");
    if (!tiles.length) return;

    const previewLabel = $(".fc-preview-label");

    const applySelectionStyles = (activeTile) => {
      tiles.forEach((tile) => {
        tile.classList.toggle("is-selected", tile === activeTile);
      });
    };

    const updatePreview = () => {
      if (!previewLabel) return;
      if (!selectedGiftAmount) {
        previewLabel.style.display = "none";
        previewLabel.textContent = "";
        return;
      }
      previewLabel.textContent =
        `$${selectedGiftAmount.toLocaleString()} • ` +
        (selectedGiftText || "Suggested gift");
      previewLabel.style.display = "inline-flex";
    };

    const preselectFromStorage = () => {
      if (!LS) return;
      const saved = LS.getItem(PREF_GIFT_KEY);
      if (!saved) return;
      const match = tiles.find(
        (t) => safeNumber(t.dataset.impactAmount) === safeNumber(saved)
      );
      if (match) {
        selectedGiftAmount = safeNumber(saved);
        selectedGiftText = match.dataset.impactText || "";
        applySelectionStyles(match);
        updatePreview();
      }
    };

    tiles.forEach((tile) => {
      tile.addEventListener("click", () => {
        const amt = safeNumber(tile.dataset.impactAmount);
        selectedGiftAmount = amt > 0 ? amt : null;
        selectedGiftText = tile.dataset.impactText || "";

        applySelectionStyles(tile);
        updatePreview();

        if (LS && selectedGiftAmount) {
          LS.setItem(PREF_GIFT_KEY, String(selectedGiftAmount));
        }
      });
    });

    preselectFromStorage();
  }

  // ---------- Recurring toggle ----------
  function initRecurringToggle() {
    const checkbox = $("#fcRecurringToggle");
    if (!checkbox) return;

    const updateLabel = () => {
      const label = checkbox.closest(".fc-recurring-toggle");
      if (!label) return;
      label.setAttribute(
        "aria-pressed",
        checkbox.checked ? "true" : "false"
      );
    };

    checkbox.addEventListener("change", updateLabel);
    updateLabel();
  }

  function isRecurringEnabled() {
    const checkbox = $("#fcRecurringToggle");
    return checkbox && checkbox.checked;
  }

  // ---------- Donate links: add amount & recurring params ----------
  function initDonateLinks() {
    const donateLinks = $$('a[data-cta*="donate"]');
    if (!donateLinks.length) return;

    donateLinks.forEach((link) => {
      // Preserve original href for reuse
      if (!link.dataset.baseHref) {
        link.dataset.baseHref = link.getAttribute("href") || "/";
      }

      link.addEventListener("click", (evt) => {
        const baseHref = link.dataset.baseHref || "/";
        try {
          const url = new URL(baseHref, window.location.origin);

          if (selectedGiftAmount) {
            url.searchParams.set("amount", String(selectedGiftAmount));
          }
          if (isRecurringEnabled()) {
            url.searchParams.set("frequency", "monthly");
          }

          // Example: mark source CTA (hero-donate, final-donate, etc.)
          const ctaId = link.dataset.cta;
          if (ctaId) {
            url.searchParams.set("source", ctaId);
          }

          evt.preventDefault();
          window.location.href = url.toString();
        } catch (err) {
          // If URL parsing fails, just let the normal navigation happen.
        }
      });
    });
  }

  // ---------- Announcement dismiss w/ localStorage ----------
  function initAnnouncement() {
    const bar = doc.querySelector("[data-announcement-id]");
    if (!bar) return;

    const id = bar.getAttribute("data-announcement-id");
    const storageKey = ANNOUNCEMENT_KEY_PREFIX + id;

    if (LS && LS.getItem(storageKey) === "dismissed") {
      bar.remove();
      return;
    }

    const closeBtn = bar.querySelector("[data-announcement-dismiss]");
    if (!closeBtn) return;

    closeBtn.addEventListener("click", () => {
      bar.remove();
      if (LS) {
        LS.setItem(storageKey, "dismissed");
      }
    });
  }

  // ---------- Theme toggle ----------
  function initThemeToggle() {
    const btn = $("#fcThemeToggle");
    if (!btn) return;

    const root = doc.body;

    const applyTheme = (theme) => {
      root.classList.remove("fc-theme-gold", "fc-theme-night");
      if (theme === "night") {
        root.classList.add("fc-theme-night");
      } else {
        root.classList.add("fc-theme-gold");
      }
    };

    const saved = LS && LS.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    }

    btn.addEventListener("click", () => {
      const next =
        root.classList.contains("fc-theme-night") ? "gold" : "night";
      applyTheme(next);
      if (LS) {
        LS.setItem(THEME_KEY, next);
      }
    });
  }

  // ---------- Bottom nav: scroll + active state ----------
  function initBottomNav() {
    const items = $$(".bottom-nav-item[data-nav-target]");
    if (!items.length) return;

    const scrollToTarget = (targetId) => {
      const target = doc.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    items.forEach((item) => {
      item.addEventListener("click", () => {
        const targetId = item.dataset.navTarget;
        if (targetId) scrollToTarget(targetId);
      });
    });

    // Active state based on scroll position
    const sectionIds = items.map((i) => i.dataset.navTarget).filter(Boolean);
    const sectionMap = new Map();
    sectionIds.forEach((id) => {
      const el = doc.getElementById(id);
      if (el) sectionMap.set(id, el);
    });

    if (!sectionMap.size || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          items.forEach((item) => {
            item.classList.toggle(
              "bottom-nav-item--active",
              item.dataset.navTarget === id
            );
          });
        });
      },
      {
        root: null,
        threshold: 0.2,
      }
    );

    sectionMap.forEach((el) => observer.observe(el));
  }

  // ---------- Deadline countdown ----------
  function initDeadlineCountdown() {
    const el = $("#deadlineCountdown");
    if (!el) return;
    const iso = el.dataset.deadline;
    if (!iso) return;

    const deadline = new Date(iso);
    if (!deadline.getTime()) return;

    const update = () => {
      const now = new Date();
      const diffMs = deadline.getTime() - now.getTime();

      if (diffMs <= 0) {
        el.textContent = "Ends soon";
        return;
      }

      const totalMinutes = Math.floor(diffMs / 60000);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

      if (days > 1) {
        el.textContent = `${days} days left`;
      } else if (days === 1) {
        el.textContent = "1 day left";
      } else if (hours > 1) {
        el.textContent = `${hours} hours left`;
      } else if (hours === 1) {
        el.textContent = "1 hour left";
      } else {
        el.textContent = "Less than an hour left";
      }
    };

    update();
    setInterval(update, 60_000);
  }

  // ---------- Boot ----------
  function boot() {
    initProgress();
    initGiftTiles();
    initRecurringToggle();
    initDonateLinks();
    initAnnouncement();
    initThemeToggle();
    initBottomNav();
    initDeadlineCountdown();
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

