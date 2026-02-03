(() => {
  "use strict";

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function smoothScrollTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function showToast(message) {
    const toast = document.getElementById("app-toast");
    if (!toast) {
      try {
        alert(message);
      } catch (e) {}
      return;
    }
    const textNode = toast.querySelector(".toast__text");
    if (textNode && message) textNode.textContent = message;

    toast.hidden = false;
    // Force reflow for transition
    void toast.offsetWidth;
    toast.classList.add("toast--visible");

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove("toast--visible");
      setTimeout(() => {
        toast.hidden = true;
      }, 180);
    }, 2600);
  }

  function getBodyData() {
    const body = document.body;
    const n = (v) => {
      const num = parseFloat(v);
      return Number.isFinite(num) ? num : 0;
    };
    return {
      body,
      raised: n(body.dataset.raised),
      goal: n(body.dataset.goal),
      progress: n(body.dataset.progress),
    };
  }

  // HEADER THEME TOGGLE
  function initThemeToggle() {
    const btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const doc = document.documentElement;
      const current = doc.dataset.theme === "light" ? "light" : "dark";
      const next = current === "dark" ? "light" : "dark";
      doc.dataset.theme = next;
      try {
        localStorage.setItem("fc-theme", next);
      } catch (e) {}
    });
  }

  // CTA SCROLL BUTTONS
  function initScrollTargets() {
    document.querySelectorAll("[data-scroll-target]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.getAttribute("data-scroll-target");
        if (!id) return;
        smoothScrollTo(id);
      });
    });
  }

  // BOTTOM NAV
  function initBottomNav() {
    const buttons = document.querySelectorAll(".app-nav__btn[data-tab-target]");
    if (!buttons.length) return;

    const setActive = (activeBtn) => {
      buttons.forEach((btn) =>
        btn.classList.toggle(
          "app-nav__btn--active",
          btn === activeBtn && !btn.classList.contains("app-nav__btn--primary")
        )
      );
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-tab-target");
        if (id) smoothScrollTo(id);
        if (!btn.classList.contains("app-nav__btn--primary")) {
          setActive(btn);
        }
      });
    });
  }

  // QUICK AMOUNT + IMPACT TILES
  function initAmounts() {
    const amountInput = document.getElementById("donation-amount");
    if (!amountInput) return;
    const donateSection = document.getElementById("donate");

    const allButtons = document.querySelectorAll("[data-amount]");

    const setSelected = (target) => {
      allButtons.forEach((btn) =>
        btn.classList.toggle("pill--selected", btn === target)
      );
    };

    allButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-amount");
        const val = Number(raw);
        if (!Number.isFinite(val) || val <= 0) return;
        amountInput.value = val.toFixed(2);
        setSelected(btn);
        amountInput.focus({ preventScroll: true });
        if (donateSection) smoothScrollTo("donate");
      });
    });
  }

  // FREQUENCY PILLS
  function initFrequency() {
    const freqInput = document.getElementById("donation-frequency");
    const hint = document.getElementById("frequency-help");
    const pills = document.querySelectorAll("[data-frequency]");
    if (!freqInput || !pills.length) return;

    const copy = {
      once: "One-time gifts are huge. Monthly support keeps things steady all season.",
      monthly:
        "Monthly support stretches the impact of your gift across the whole season.",
    };

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const value = pill.getAttribute("data-frequency") || "once";
        freqInput.value = value;

        pills.forEach((p) => {
          const active = p === pill;
          p.classList.toggle("pill--selected", active);
          p.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (hint && copy[value]) hint.textContent = copy[value];
      });
    });
  }

  // SHARE / COPY
  function initShare() {
    const buttons = document.querySelectorAll("[data-share-link]");
    if (!buttons.length) return;

    const body = document.body;
    const shareUrl = body.dataset.shareUrl || window.location.href;
    const shareTitle =
      body.dataset.shareTitle || document.title || "Support this fundraiser";
    const shareDesc =
      body.dataset.shareDesc ||
      "Help fuel the season for this youth team, school, or club.";

    function copyFallback() {
      const temp = document.createElement("input");
      temp.value = shareUrl;
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand("copy");
        showToast("Link copied — share it with friends and sponsors.");
      } catch (e) {
        showToast(
          "Couldn’t copy automatically — use your browser share or long-press."
        );
      } finally {
        document.body.removeChild(temp);
      }
    }

    function handleShare() {
      if (navigator.share) {
        navigator
          .share({ title: shareTitle, text: shareDesc, url: shareUrl })
          .catch(() => {});
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() =>
            showToast("Link copied — share it with friends and sponsors.")
          )
          .catch(copyFallback);
        return;
      }

      copyFallback();
    }

    buttons.forEach((btn) => btn.addEventListener("click", handleShare));
  }

  // ANNOUNCEMENT DISMISS
  function initAnnouncement() {
    const bar = document.querySelector("[data-announcement-id]");
    if (!bar) return;

    const id = bar.getAttribute("data-announcement-id") || "announcement";
    const storageKey = "fc-announcement-dismissed:" + id;

    try {
      if (localStorage.getItem(storageKey) === "1") {
        bar.style.display = "none";
        return;
      }
    } catch (e) {}

    const closeBtn = bar.querySelector("[data-announcement-close]");
    if (!closeBtn) return;

    closeBtn.addEventListener("click", () => {
      bar.style.display = "none";
      try {
        localStorage.setItem(storageKey, "1");
      } catch (e) {}
    });
  }

  // DEADLINE COUNTDOWN
  function initCountdown() {
    const label = document.querySelector("[data-countdown-label]");
    const iso = document.body.dataset.deadline;
    if (!label || !iso) return;

    function format() {
      const end = new Date(iso);
      if (isNaN(end.getTime())) {
        label.textContent = "Campaign timing TBA";
        return;
      }
      const diff = end.getTime() - Date.now();
      if (diff <= 0) {
        label.textContent = "Campaign ending soon";
        return;
      }
      const total = Math.floor(diff / 1000);
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const mins = Math.floor((total % 3600) / 60);

      if (days > 0) {
        label.textContent = `${days}d · ${String(hours).padStart(2, "0")}h left`;
      } else if (hours > 0) {
        label.textContent = `${hours}h ${mins}m left`;
      } else {
        label.textContent = `${mins}m left`;
      }
    }

    format();
    setInterval(format, 60000);
  }

  // STRIPE INLINE FLOW
  function initDonationFlow() {
    const form = document.getElementById("donation-form");
    const step1 = document.getElementById("donation-step-1");
    const step2 = document.getElementById("donation-step-2");
    const stepperSteps = document.querySelectorAll(".stepper__step");
    const nextBtn = document.getElementById("donation-next");
    const formError = document.getElementById("donation-error");
    const payError = document.getElementById("payment-error");
    const payBtn = document.getElementById("payment-submit");
    const summaryEl = document.getElementById("payment-summary");
    const paymentElementContainer = document.getElementById("payment-element");
    const successBox = document.getElementById("payment-success");
    const successName = document.getElementById("success-name");
    const successAmount = document.getElementById("success-amount");
    const successPrev = document.getElementById("success-prev-pct");
    const successNew = document.getElementById("success-new-pct");
    const successLine = document.getElementById("success-progress-line");

    if (
      !form ||
      !step1 ||
      !step2 ||
      !nextBtn ||
      !formError ||
      !payError ||
      !payBtn ||
      !summaryEl ||
      !paymentElementContainer
    ) {
      return;
    }

    let stripe = null;
    let elements = null;
    let paymentElement = null;
    let clientSecret = null;
    let isCreatingIntent = false;
    let isConfirming = false;
    const state = {
      name: "",
      email: "",
      amount: 0,
      frequency: "once",
    };

    const setStep = (n) => {
      stepperSteps.forEach((node) => {
        const stepNum = node.getAttribute("data-step");
        node.classList.toggle("stepper__step--active", String(n) === stepNum);
      });
    };

    const setFormError = (msg) => {
      if (!msg) {
        formError.hidden = true;
        formError.textContent = "";
        return;
      }
      formError.hidden = false;
      formError.textContent = msg;
      formError.focus();
    };

    const setPayError = (msg) => {
      if (!msg) {
        payError.hidden = true;
        payError.textContent = "";
        return;
      }
      payError.hidden = false;
      payError.textContent = msg;
      payError.focus();
    };

    const setBusy = (isBusy) => {
      form.setAttribute("aria-busy", isBusy ? "true" : "false");
      form.classList.toggle("is-busy", !!isBusy);
      nextBtn.disabled = !!isBusy;
    };

    const formatCurrency = (amount) =>
      "$" + (Number(amount) || 0).toFixed(2);

    async function handleStep1(e) {
      e.preventDefault();
      setFormError("");
      setPayError("");

      const name = (form.name.value || "").trim();
      const email = (form.email.value || "").trim();
      const rawAmount = (form.amount.value || "").trim();
      const frequency =
        document.getElementById("donation-frequency")?.value || "once";

      const amount = parseFloat(rawAmount);

      if (!name || !email || email.indexOf("@") === -1 || !amount || amount <= 0) {
        setFormError(
          "Please share your name, a valid email, and a positive amount to continue."
        );
        return;
      }

      if (typeof Stripe === "undefined") {
        setFormError("Payment library failed to load. Please refresh and try again.");
        return;
      }

      if (isCreatingIntent) return;
      isCreatingIntent = true;
      setBusy(true);
      nextBtn.textContent = "Preparing secure payment…";

      state.name = name;
      state.email = email;
      state.amount = amount;
      state.frequency = frequency;

      const formData = new FormData(form);
      formData.set("amount", Math.round(amount * 100).toString()); // cents
      formData.set("frequency", frequency);
      formData.set("method", "stripe");
      const payload = Object.fromEntries(formData.entries());
      payload.currency = "usd";

      try {
        const res = await fetch("/payments/stripe/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        let json = {};
        try {
          json = await res.json();
        } catch (e) {
          json = {};
        }

        if (!res.ok || !json.client_secret || !json.publishable_key) {
          setFormError("We couldn’t start checkout. Please try again.");
          return;
        }

        clientSecret = json.client_secret;
        stripe = Stripe(json.publishable_key);
        elements = stripe.elements({ clientSecret });
        paymentElement = elements.create("payment");
        paymentElement.mount(paymentElementContainer);

        // Lock basic fields
        form.name.readOnly = true;
        form.email.readOnly = true;
        form.amount.readOnly = true;

        // Step 2 visible
        step2.hidden = false;
        step2.setAttribute("aria-hidden", "false");
        setStep(2);

        summaryEl.innerHTML =
          'You’re supporting <strong>' +
          (document.body.dataset.org || "this program") +
          "</strong> with a <strong>" +
          formatCurrency(amount) +
          "</strong> " +
          (frequency === "monthly" ? "monthly gift." : "contribution.");

      } catch (err) {
        setFormError("Network error. Please check your connection and try again.");
      } finally {
        isCreatingIntent = false;
        setBusy(false);
        nextBtn.textContent = "Continue to secure payment";
      }
    }

    async function handlePayment() {
      if (!stripe || !elements || !paymentElement || isConfirming) {
        setPayError("Payment is not ready yet. Try reloading this page.");
        return;
      }

      setPayError("");
      isConfirming = true;
      payBtn.disabled = true;
      payBtn.textContent = "Processing…";

      try {
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: window.location.href,
          },
          redirect: "if_required",
        });

        if (result.error) {
          setPayError(result.error.message || "Could not confirm payment.");
          payBtn.disabled = false;
          payBtn.textContent = "Complete secure payment";
          return;
        }

        const intent = result.paymentIntent;
        if (!intent || intent.status !== "succeeded") {
          setPayError("Something unexpected happened. Please try again.");
          payBtn.disabled = false;
          payBtn.textContent = "Complete secure payment";
          return;
        }

        // Success UI
        if (successName) successName.textContent = state.name || "friend";
        if (successAmount) successAmount.textContent = formatCurrency(state.amount);
        if (successBox) {
          successBox.hidden = false;
          successBox.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "center",
          });
        }
        payBtn.textContent = "Payment complete";

        // Update progress line (simple local calc)
        const { body, raised, goal } = getBodyData();
        if (goal > 0 && successPrev && successNew && successLine) {
          const prevPct = Math.round((raised / goal) * 100);
          const newRaised = raised + (state.amount || 0);
          const newPct = Math.min(100, Math.round((newRaised / goal) * 100));

          successPrev.textContent = prevPct;
          successNew.textContent = newPct;
          successLine.hidden = false;

          body.dataset.raised = String(newRaised);
          body.dataset.progress = String(newPct);

          // Update progress bars + text
          updateProgressUI(newPct, newRaised, goal);
        }
      } catch (err) {
        setPayError("Unexpected error while processing your payment.");
        payBtn.disabled = false;
        payBtn.textContent = "Complete secure payment";
      } finally {
        isConfirming = false;
      }
    }

    function updateProgressUI(pct, raised, goal) {
      const percent = Math.min(100, Math.max(0, pct || 0));
      const moneyRaised = raised || 0;

      // Update bars
      document.querySelectorAll("[data-progress-bar]").forEach((bar) => {
        const fill = bar.querySelector(".progress-bar__fill, .footer-bar__fill");
        if (fill) {
          fill.style.width = percent + "%";
        }
        bar.setAttribute("aria-valuenow", String(Math.round(percent)));
        bar.setAttribute("aria-valuetext", `${Math.round(percent)}% funded`);
      });

      // Update text labels
      const pctEls = document.querySelectorAll(".js-progress-pct");
      pctEls.forEach((el) => {
        el.textContent = Math.round(percent) + "%";
      });

      const moneyEls = document.querySelectorAll(".js-progress-money");
      const goalText = isFinite(goal)
        ? "$" + goal.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : "";
      moneyEls.forEach((el) => {
        el.textContent =
          "$" +
          moneyRaised.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          }) +
          (goalText ? ` raised of ${goalText}` : "");
      });
    }

    form.addEventListener("submit", handleStep1);
    payBtn.addEventListener("click", handlePayment);
  }

  // WAYS-TO-GIVE TABS
  function initWaysTabs() {
    const tabs = document.querySelectorAll("[data-ways-tab]");
    const panels = document.querySelectorAll("[data-ways-panel]");
    if (!tabs.length || !panels.length) return;

    const show = (name) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.waysTab === name;
        tab.classList.toggle("tab-switch__tab--active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        const active = panel.dataset.waysPanel === name;
        panel.hidden = !active;
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const name = tab.dataset.waysTab;
        if (!name) return;
        show(name);
      });
    });

    show("online");
  }

  function init() {
    initThemeToggle();
    initScrollTargets();
    initBottomNav();
    initAmounts();
    initFrequency();
    initShare();
    initAnnouncement();
    initCountdown();
    initDonationFlow();
    initWaysTabs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

