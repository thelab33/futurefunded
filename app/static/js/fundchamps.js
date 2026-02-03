/* =====================================
   FundChamps Interactive Layer (production)
   ===================================== */

(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const fmtUsd = (n) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const getParam = (key) => new URLSearchParams(location.search).get(key);

  /* ---------- IMPACT TILE LOGIC ---------- */
  function setupImpactTiles() {
    const tiles = $$("[data-impact-tile]");
    if (!tiles.length) return;

    const amountInput = $("#donor-amount"); // optional quick form
    const donateLinks = $$("[data-donate-link]");

    const selectTile = (tile) => {
      const amount = Number(tile.getAttribute("data-impact-amount") || 0);

      // Visual state + a11y
      tiles.forEach((t) => {
        t.classList.remove("is-selected");
        t.setAttribute("aria-pressed", "false");
      });
      tile.classList.add("is-selected");
      tile.setAttribute("aria-pressed", "true");

      // Prefill optional amount input
      if (amountInput) amountInput.value = amount;

      // Update ALL donate links with ?amount=, but only change label
      // on non-tier buttons (skip if href already contains "tier=").
      donateLinks.forEach((btn) => {
        try {
          const url = new URL(btn.getAttribute("href"), window.location.origin);
          url.searchParams.set("amount", String(amount));
          btn.setAttribute("href", url.pathname + url.search);

          // Update label if this isn’t a tier button
          if (!/[\?&]tier=/.test(url.search)) {
            const base = btn.dataset.baseLabel || btn.textContent.trim() || "Donate";
            if (!btn.dataset.baseLabel) btn.dataset.baseLabel = base; // cache original
            btn.textContent = `${base.replace(/Donate.*/i, "Donate")} ${fmtUsd(amount)}`;
          }
        } catch {
          /* no-op */
        }
      });

      // Subtle pulse
      tile.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }],
        { duration: 180, easing: "ease-out" }
      );
    };

    // Click + keyboard
    tiles.forEach((tile) => {
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-pressed", "false");
      tile.addEventListener("click", () => selectTile(tile));
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTile(tile);
        }
      });
    });

    // Deep link preselect ?amount=
    const qAmount = Number(getParam("amount") || 0);
    if (qAmount > 0) {
      const match = tiles.find((t) => Number(t.getAttribute("data-impact-amount")) === qAmount);
      if (match) selectTile(match);
    }
  }

  /* ---------- PROGRESS BAR ANIMATION ---------- */
  function setupProgressAnimation() {
    const bars = $$(".progress-fill");
    if (!bars.length) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const animate = (el) => {
      const target = Number(el.dataset.target || 0);
      if (prefersReduced) {
        el.style.width = `${target}%`;
        return;
      }
      el.style.width = "0%";
      requestAnimationFrame(() => {
        el.style.transition = "width 1000ms cubic-bezier(0.4,0,0.2,1)";
        el.style.width = `${Math.min(100, Math.max(0, target))}%`;
      });
    };

    // Use IntersectionObserver so it animates when visible
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    bars.forEach((bar) => io.observe(bar));
  }

  /* ---------- SHARE (Web Share API + fallback) ---------- */
  function setupShare() {
    const btns = $$("[data-share]");
    if (!btns.length) return;

    const announce = (msg) => {
      let region = $("#fc-aria-live");
      if (!region) {
        region = document.createElement("div");
        region.id = "fc-aria-live";
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        region.className = "sr-only";
        document.body.appendChild(region);
      }
      region.textContent = msg;
    };

    const shareText =
      document.querySelector("meta[name='description']")?.getAttribute("content") ||
      "Help fund our youth basketball team’s season!";

    btns.forEach((btn) =>
      btn.addEventListener("click", async () => {
        const shareData = {
          title: document.title,
          text: shareText,
          url: window.location.href,
        };

        if (navigator.share) {
          try {
            await navigator.share(shareData);
            announce("Thanks for sharing!");
          } catch {
            /* user cancelled */
          }
        } else {
          try {
            await navigator.clipboard.writeText(shareData.url);
            announce("Link copied to clipboard.");
            // Optional toast UX
            const toast = document.createElement("div");
            toast.textContent = "Link copied! Share it with your friends.";
            toast.className =
              "fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-3 py-2 rounded-md shadow z-50";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 1800);
          } catch {
            alert("Copy this link: " + shareData.url);
          }
        }
      })
    );
  }

  /* ---------- STRIPE CHECKOUT (prefill + loading states) ---------- */
  function setupCheckoutForm() {
    const form = $("#donation-form");
    if (!form) return;

    let submitting = false;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitting) return;
      submitting = true;

      const amount = Number(form.amount?.value || 0);
      const name = String(form.name?.value || "").trim();
      const email = String(form.email?.value || "").trim();

      if (!amount || amount <= 0 || !email) {
        alert("Please enter a valid amount and email.");
        submitting = false;
        return;
      }

      const btn = form.querySelector("button[type='submit']");
      const labelDefault = btn?.querySelector(".donate-label-default");
      const labelLoading = btn?.querySelector(".donate-label-loading");

      if (btn) btn.disabled = true;
      if (labelDefault) labelDefault.style.display = "none";
      if (labelLoading) labelLoading.style.display = "inline";

      try {
        const res = await fetch("/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, name, email }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.url) {
          window.location.assign(data.url);
        } else {
          throw new Error("Stripe session not returned");
        }
      } catch (err) {
        const el = $("#donation-error");
        if (el) el.textContent = "Something went wrong. Please try again.";
      } finally {
        if (btn) btn.disabled = false;
        if (labelDefault) labelDefault.style.display = "inline";
        if (labelLoading) labelLoading.style.display = "none";
        submitting = false;
      }
    });
  }

  /* ---------- STICKY DONATE (scroll to Impact tiles) ---------- */
  function setupStickyDonate() {
    const sticky = "[data-sticky-donate]";
    const btn = $(sticky);
    const target = $("#impact") || $("#hero");

    if (!btn || !target) return;

    btn.addEventListener("click", () => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ---------- NICE-TO-HAVES ---------- */
  function setupSmoothAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (!id || id === "#") return;
        const el = $(id);
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function setupHeroEntrance() {
    const hero = $("#hero");
    if (!hero) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    hero.style.willChange = "opacity, transform";
    hero.animate(
      [
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
    );
  }

  /* ---------- INIT ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    setupImpactTiles();
    setupProgressAnimation();
    setupShare();
    setupCheckoutForm();
    setupStickyDonate();
    setupSmoothAnchors();
    setupHeroEntrance();
  });
})();

