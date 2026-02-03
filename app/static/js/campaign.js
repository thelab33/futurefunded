(() => {
  "use strict";

  // Helper: safely parse amount from string
  function parseAmount(raw) {
    const val = parseFloat(String(raw).replace(/[^\d.]/g, ""));
    return Number.isFinite(val) && val > 0 ? val : null;
  }

  // ======================
  // Mobile nav toggle
  // ======================

  (function initNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const list = document.querySelector("[data-nav-list]");
    if (!toggle || !list) return;

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      toggle.setAttribute("aria-expanded", String(next));
      list.classList.toggle("nav-list--open", next);
    });

    // Close menu when clicking a link (mobile)
    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName.toLowerCase() === "a") {
        toggle.setAttribute("aria-expanded", "false");
        list.classList.remove("nav-list--open");
      }
    });
  })();

  // ======================
  // Announcement dismiss
  // ======================

  (function initAnnouncement() {
    const bar = document.querySelector("[data-announcement-id]");
    if (!bar) return;
    const id = bar.getAttribute("data-announcement-id") || "campaign-announcement";
    const key = "fc-announcement:" + id;

    try {
      if (localStorage.getItem(key) === "hidden") {
        bar.hidden = true;
        return;
      }
    } catch {
      // ignore storage errors
    }

    const closeBtn = bar.querySelector("[data-announcement-close]");
    if (!closeBtn) return;

    closeBtn.addEventListener("click", () => {
      bar.hidden = true;
      try {
        localStorage.setItem(key, "hidden");
      } catch {
        /* ignore */
      }
    });
  })();

  // ======================
  // Countdown
  // ======================

  (function initCountdowns() {
    const nodes = document.querySelectorAll("[data-countdown]");
    if (!nodes.length) return;

    function formatCountdown(deadline) {
      const now = new Date();
      const end = new Date(deadline);
      if (Number.isNaN(end.getTime())) return "Campaign date coming soon";

      const diff = end.getTime() - now.getTime();
      if (diff <= 0) return "Campaign ended";

      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);

      if (days > 0) return `${days}d ${hours}h left`;
      if (hours > 0) return `${hours}h ${mins}m left`;
      return `${mins}m left`;
    }

    function tick(node) {
      const deadline = node.getAttribute("data-deadline");
      if (!deadline) return;
      node.textContent = formatCountdown(deadline);
    }

    nodes.forEach((node) => {
      tick(node);
      window.setInterval(() => tick(node), 60000);
    });
  })();

  // ======================
  // Share link copy
  // ======================

  (function initShare() {
    const btn = document.querySelector("[data-share-link]");
    if (!btn) return;

    const originalLabel = btn.textContent || "Share link";
    const SHARE_URL =
      (window.FUNDRAISER_CONFIG && window.FUNDRAISER_CONFIG.share && window.FUNDRAISER_CONFIG.share.url) ||
      window.location.href;

    function setTemporaryLabel(text) {
      btn.textContent = text;
      window.setTimeout(() => {
        btn.textContent = originalLabel;
      }, 1800);
    }

    btn.addEventListener("click", () => {
      if (navigator.share) {
        // Use native share when available
        navigator
          .share({
            title: document.title,
            text: window.FUNDRAISER_CONFIG?.share?.title || "",
            url: SHARE_URL,
          })
          .catch(() => {
            // User cancelled or share failed – silently ignore
          });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(SHARE_URL)
          .then(() => setTemporaryLabel("Link copied ✓"))
          .catch(() => setTemporaryLabel("Copy failed"));
      } else {
        // Fallback: temporary input
        const input = document.createElement("input");
        input.value = SHARE_URL;
        document.body.appendChild(input);
        input.select();
        try {
          document.execCommand("copy");
          setTemporaryLabel("Link copied ✓");
        } catch {
          setTemporaryLabel("Copy failed");
        }
        document.body.removeChild(input);
      }
    });
  })();

  // ======================
  // Amount presets & impact tiles
  // ======================

  (function initAmountPresets() {
    const amountInput = document.getElementById("donation-amount");
    if (!amountInput) return;

    function setAmountFromPreset(btn) {
      const raw = btn.getAttribute("data-amount-preset");
      const val = parseAmount(raw);
      if (!val) return;
      amountInput.value = val.toFixed(2);
      amountInput.focus();
    }

    const presetButtons = document.querySelectorAll("[data-amount-preset]");
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => setAmountFromPreset(btn));
    });
  })();

  // ======================
  // Frequency toggle
  // ======================

  (function initFrequencyToggle() {
    const group = document.querySelector(".toggle-group");
    const hidden = document.getElementById("donation-frequency");
    if (!group || !hidden) return;

    const buttons = group.querySelectorAll(".toggle");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.getAttribute("data-frequency") || "once";
        hidden.value = value;

        buttons.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle("is-active", isActive);
          b.setAttribute("aria-pressed", String(isActive));
        });
      });
    });
  })();

  // ======================
  // Inline donation stepper
  // ======================

  (function initDonationStepper() {
    const form = document.getElementById("donation-form");
    if (!form) return;

    const step1 = form.querySelector('[data-step="1"]');
    const step2 = form.querySelector('[data-step="2"]');
    const nextBtn = document.getElementById("donation-next");
    const payBtn = document.getElementById("donation-pay");
    const errorEl = document.getElementById("donation-error");
    const paymentErrorEl = document.getElementById("payment-error");
    const summaryText = document.getElementById("donation-summary");
    const nameInput = document.getElementById("donor-name");
    const emailInput = document.getElementById("donor-email");
    const amountInput = document.getElementById("donation-amount");
    const frequencyInput = document.getElementById("donation-frequency");

    if (!step1 || !step2 || !nextBtn || !nameInput || !emailInput || !amountInput) return;

    function setError(message) {
      if (!errorEl) return;
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = "";
      } else {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
    }

    nextBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setError("");

      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const amountVal = parseAmount(amountInput.value);

      const errors = [];
      if (!name) errors.push("your name");
      if (!email || !email.includes("@")) errors.push("a valid email");
      if (!amountVal) errors.push("a positive amount");

      if (errors.length) {
        const list = errors.join(", ").replace(/, ([^,]*)$/, " and $1");
        setError(`Please add ${list} to continue.`);
        return;
      }

      // Build summary
      if (summaryText) {
        const freq = frequencyInput?.value === "monthly" ? " monthly" : "";
        summaryText.innerHTML = `You’re giving <strong>$${amountVal.toFixed(
          2
        )}</strong>${freq} to support ${window.FUNDRAISER_CONFIG?.orgTeamName || "this program"}.`;
      }

      // Show step 2
      step1.hidden = true;
      step2.hidden = false;
      step2.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (payBtn && paymentErrorEl) {
      payBtn.addEventListener("click", (event) => {
        event.preventDefault();
        paymentErrorEl.hidden = false;
        paymentErrorEl.textContent =
          "This step is ready for your real payments integration. Mount Stripe or PayPal here in the platform admin to go live.";
      });
    }
  })();

  // ======================
  // Mobile donate bar
  // ======================

  (function initMobileDonate() {
    const bar = document.querySelector("[data-mobile-donate]");
    if (!bar) return;

    function update() {
      const threshold = 360;
      const visible = window.scrollY > threshold;
      bar.classList.toggle("mobile-donate--visible", visible);
    }

    window.addEventListener("scroll", update, { passive: true });
    update();
  })();

  // ======================
  // Footer year (in case backend doesn't set)
  // ======================

  (function ensureFooterYear() {
    const yearNode = document.getElementById("footer-year");
    if (!yearNode) return;
    if (!yearNode.textContent || yearNode.textContent.trim() === "") {
      yearNode.textContent = String(new Date().getFullYear());
    }
  })();
})();

