// donation.refactored.js
// UI + server-intent wiring only. Emits events for a separate stripe-listener to handle Stripe Elements.

(function () {
  "use strict";

  // --- small DOM helpers ---
  function qs(s, p) { return (p || document).querySelector(s); }
  function qsa(s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); }
  function toInt(v, fallback) { var n = parseInt(String(v||"").replace(/[^0-9\-]/g,''),10); return isNaN(n) ? (fallback||0) : n; }

  // DOM hooks (IDs must match your markup)
  var donationSection = qs("#ff-donation");
  var donationForm = qs("#ff-donation-form");
  var toPaymentBtn = qs("#ff-to-payment-btn");
  var payBtn = qs("#ff-pay-btn");
  var formError = qs("#ff-form-error");
  var paymentShell = qs("#ff-payment-shell");
  var paymentSummary = qs("#ff-payment-summary");
  var successBox = qs("#ff-payment-success");

  var amountInput = qs("#ff-amount-input");
  var quickAmountBtns = qsa(".ff-js-quick-amount");
  var frequencyPills = qsa(".ff-js-frequency");
  var frequencyInput = qs("#ff-frequency-input");

  var donorNameInput = qs("#ff-donor-name");
  var donorEmailInput = qs("#ff-donor-email");
  var donorNoteInput = qs("#ff-donor-note");

  if (!donationSection || !donationForm) return; // nothing to do

  // config from DOM
  var orgName = donationSection.dataset.orgName || "";
  var defaultAmount = Number(donationSection.dataset.defaultAmount || 75);
  var minAmount = Number(donationSection.dataset.minAmount || 1);
  var createIntentEndpoint = donationSection.datasetStripeCreateIntentUrl || donationSection.dataset.createIntentUrl || "/payments/stripe/intent";

  // UI init
  if (!amountInput.value) amountInput.value = defaultAmount;
  if (frequencyInput && !frequencyInput.value) frequencyInput.value = "once";
  if (payBtn) { payBtn.disabled = true; payBtn.setAttribute("aria-disabled","true"); payBtn.dataset.state = "disabled"; }
  if (formError) { formError.style.display = "none"; formError.textContent = ""; }

  // helpers
  function showError(msg) {
    if (!formError) return;
    formError.style.display = "block";
    formError.textContent = msg || "Something went wrong. Please try again.";
  }
  function clearError() {
    if (!formError) return;
    formError.textContent = "";
    formError.style.display = "none";
  }
  function setLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = "Processing…";
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    } else {
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
    }
  }
  function updateSummary() {
    if (!paymentSummary) return;
    var amount = Number(amountInput.value || defaultAmount);
    var frequency = (frequencyInput && frequencyInput.value === "monthly") ? "monthly" : "one-time";
    var freqLabel = frequency === "monthly" ? "monthly gift" : "one-time gift";
    paymentSummary.innerHTML = "You’re supporting " + (orgName || "this team") + " with a <strong>$" + Math.round(amount) + "</strong> " + freqLabel + ".";
  }

  // quick amounts
  quickAmountBtns.forEach(function (btn) {
    btn.addEventListener("click", function (evt) {
      var amt = btn.dataset.amount || btn.getAttribute("data-amount");
      if (!amt) return;
      amountInput.value = amt;
      updateSummary();
      amountInput.focus();
    });
  });

  // frequency pills
  frequencyPills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      frequencyPills.forEach(function (p) { p.classList.remove("ff-frequency-pill--active"); p.setAttribute("aria-pressed", "false"); });
      pill.classList.add("ff-frequency-pill--active");
      pill.setAttribute("aria-pressed", "true");
      if (frequencyInput) frequencyInput.value = pill.dataset.frequency || "once";
      updateSummary();
    });
  });

  // build donation state snapshot
  function buildDonationState() {
    return {
      amount: Number(amountInput.value || defaultAmount),
      frequency: (frequencyInput && frequencyInput.value) || "once",
      name: (donorNameInput && donorNameInput.value.trim()) || "",
      email: (donorEmailInput && donorEmailInput.value.trim()) || "",
      note: (donorNoteInput && donorNoteInput.value.trim()) || "",
      org: orgName
    };
  }

  // create intent (server call)
  async function createIntent(payload) {
    var endpoint = donationSection.getAttribute("data-stripe-create-intent-url") || createIntentEndpoint || "/payments/stripe/intent";
    var res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok) {
      var msg = (json && (json.error && (json.error.message || json.error)) ) || (json && json.message) || ("Server returned " + res.status);
      throw new Error(msg);
    }
    return json;
  }

  // reveal payment UI
  function activatePaymentStep() {
    if (paymentShell) {
      paymentShell.classList.remove("ff-payment-shell--inactive");
      paymentShell.setAttribute("aria-busy", "false");
    }
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.setAttribute("aria-disabled", "false");
      payBtn.dataset.state = "ready";
    }
    // focus the payment heading for accessibility
    var title = qs("#ff-payment-summary");
    if (title) {
      title.setAttribute("tabindex", "-1");
      title.focus({preventScroll: true});
      setTimeout(function(){ title.removeAttribute("tabindex"); }, 800);
    }
  }

  // donation form submit => create server PaymentIntent, emit event for stripe-listener
  donationForm.addEventListener("submit", async function (evt) {
    evt.preventDefault();
    clearError();
    updateSummary();

    var state = buildDonationState();
    if (!state.name) return showError("Please enter your name.");
    if (!state.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.email)) return showError("Please enter a valid email for your receipt.");
    if (!state.amount || state.amount < minAmount) return showError("Please enter at least $" + minAmount + ".");

    setLoading(toPaymentBtn, true);

    try {
      var payload = {
        amount: state.amount,
        currency: "usd",
        frequency: state.frequency,
        metadata: {
          donor_name: state.name,
          donor_email: state.email,
          note: state.note || "",
          team: orgName,
          campaign: donationSection.dataset.campaign || "season_fundraiser_2025",
          source: "web",
        }
      };

      var result = await createIntent(payload);

      // store response globally for debug or listeners
      window.ffPaymentIntentResponse = result || {};

      // emit event for stripe-listener (preferred)
      var ev = new CustomEvent("ff:paymentIntentCreated", { detail: result });
      document.dispatchEvent(ev);

      // Activate payment panel (stripe-listener should mount element on its own)
      activatePaymentStep();

      // If stripe-listener is not present, show a helpful message in the UI (fail-safe)
      if (!window.__ff_payment_confirm_handler_attached) {
        // allow pay button but warn that stripe-listener is missing
        showError("Checkout initialized but payment UI is not available. Include stripe-listener.js and stripe.js on this page.");
      }
    } catch (err) {
      console.error("createIntent error:", err);
      showError(err && err.message ? err.message : "Unable to start secure checkout.");
    } finally {
      setLoading(toPaymentBtn, false);
    }
  });

  // pay -> dispatch confirm event (stripe-listener will handle actual confirm)
  if (payBtn) {
    payBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      clearError();

      var state = buildDonationState();

      if (!window.__ff_payment_confirm_handler_attached) {
        // local fallback: if stripe is present and stripe-listener not attached you may handle it here,
        // but we purposely avoid mounting Stripe in this file to prevent duplicates.
        return showError("Payment is not ready. If you manage Stripe here, include stripe-listener.js or mount Stripe on this page.");
      }

      // let listener confirm payment
      var confirmEvent = new CustomEvent("ff:paymentConfirmRequested", { detail: { donationState: state } });
      document.dispatchEvent(confirmEvent);
    });
  }

  // expose a tiny public API for debugging / headless triggers
  window.FFDonation = window.FFDonation || {
    createIntent: function(payload){ return createIntent(payload); },
    lastIntentResponse: function(){ return window.ffPaymentIntentResponse || null; },
    updateSummary: updateSummary
  };

  // initial summary
  updateSummary();
})();

