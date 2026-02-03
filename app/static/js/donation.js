// donation.refactored.js
// Refactored donation.js — idempotent Payment Element mount, better errors, accessibility, and UX guards.

let stripe = null;
let elements = null;
let paymentElement = null;
let clientSecret = null;

// DOM hooks (must match your markup)
const donationSection = document.getElementById("ff-donation");
const donationForm = document.getElementById("ff-donation-form");
const toPaymentBtn = document.getElementById("ff-to-payment-btn");
const payBtn = document.getElementById("ff-pay-btn");
const formError = document.getElementById("ff-form-error");
const paymentShell = document.getElementById("ff-payment-shell");
const paymentSummary = document.getElementById("ff-payment-summary");
const successBox = document.getElementById("ff-payment-success");

const amountInput = document.getElementById("ff-amount-input");
const quickAmountBtns = document.querySelectorAll(".ff-js-quick-amount");
const frequencyPills = document.querySelectorAll(".ff-js-frequency");
const frequencyInput = document.getElementById("ff-frequency-input");

const donorNameInput = document.getElementById("ff-donor-name");
const donorEmailInput = document.getElementById("ff-donor-email");
const donorNoteInput = document.getElementById("ff-donor-note");

// guard: only init if donation section & form present
if (donationSection && donationForm) {
  const orgName = donationSection.dataset.orgName || "";
  const defaultAmount = Number(donationSection.dataset.defaultAmount || 75);
  const minAmount = Number(donationSection.dataset.minAmount || 1);

  // initialize UI
  if (!amountInput.value) amountInput.value = defaultAmount;
  if (frequencyInput && !frequencyInput.value) frequencyInput.value = "once";
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.setAttribute("aria-disabled", "true");
    payBtn.dataset.state = "disabled";
  }

  // Quick amount buttons
  quickAmountBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      amountInput.value = btn.dataset.amount;
      amountInput.focus();
      updateSummary();
    });
  });

  // Frequency pills (once / monthly)
  frequencyPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      frequencyPills.forEach((p) => p.classList.remove("ff-frequency-pill--active"));
      frequencyPills.forEach((p) => p.setAttribute("aria-pressed", "false"));

      pill.classList.add("ff-frequency-pill--active");
      pill.setAttribute("aria-pressed", "true");
      if (frequencyInput) frequencyInput.value = pill.dataset.frequency || "once";
      updateSummary();
    });
  });

  // helper UI functions
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
      button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = "Processing…";
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    } else {
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
      }
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
    }
  }

  function updateSummary() {
    if (!paymentSummary) return;
    const amount = Number(amountInput.value || defaultAmount);
    const frequency = (frequencyInput && frequencyInput.value === "monthly") ? "monthly" : "one-time";
    const freqLabel = frequency === "monthly" ? "monthly gift" : "one-time gift";
    paymentSummary.innerHTML = `You’re supporting ${orgName} with a <strong>$${amount.toFixed(0)}</strong> ${freqLabel}.`;
  }

  // Payment Element helpers (idempotent)
  function ensureStripe(publishableKey) {
    if (!publishableKey) {
      showError("Payment configuration missing.");
      return false;
    }
    if (!window.Stripe) {
      showError("Stripe.js not loaded.");
      return false;
    }
    if (!stripe || (stripe && stripe._publishableKey !== publishableKey)) {
      stripe = window.Stripe(publishableKey);
      // store key on instance to detect mismatch
      stripe._publishableKey = publishableKey;
    }
    return true;
  }

  async function initPaymentElement(secret) {
    if (!secret) throw new Error("Missing client secret.");
    clientSecret = secret;

    // unmount previous element safely (if any)
    try {
      if (paymentElement && typeof paymentElement.unmount === "function") {
        paymentElement.unmount();
      }
      paymentElement = null;
      elements = null;
    } catch (e) {
      // ignore unmount errors
    }

    // set appearance to match theme — tweak as desired
    const appearance = {
      theme: "stripe",
      variables: {
        colorPrimary: "#16a34a",
        colorBackground: "#ffffff",
        colorText: "#0b1220",
        borderRadius: "12px"
      }
    };

    elements = stripe.elements({ clientSecret: clientSecret, appearance });
    paymentElement = elements.create("payment", { layout: "tabs" });

    const mountTarget = document.getElementById("ff-card-element");
    if (!mountTarget) throw new Error("#ff-card-element not found for Stripe mount.");
    mountTarget.innerHTML = ""; // ensure clean mount
    paymentElement.mount(mountTarget);

    // wire change events => enable pay button when element has data
    elements.on("change", (evt) => {
      // Payment Element: if element thinks it's complete, enable the pay button
      // (evt.complete signals the element has valid input)
      if (payBtn) {
        if (evt && typeof evt.complete !== "undefined") {
          payBtn.disabled = !evt.complete;
          payBtn.setAttribute("aria-disabled", (!evt.complete).toString());
          payBtn.dataset.state = evt.complete ? "ready" : "disabled";
        } else {
          // fallback: enable once non-empty
          payBtn.disabled = !!(evt && evt.empty);
          payBtn.setAttribute("aria-disabled", (!!evt && !!evt.empty).toString());
        }
      }
    });

    // small accessibility focus: focus payment header
    try {
      const title = document.getElementById("ff-payment-summary");
      if (title) {
        title.setAttribute("tabindex", "-1");
        title.focus({ preventScroll: true });
        setTimeout(() => title.removeAttribute("tabindex"), 800);
      }
    } catch (e) { /* noop */ }
  }

  // Create PaymentIntent by calling your server
  async function createIntent(payload) {
    const endpoint = "/payments/stripe/intent"; // your existing endpoint
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin"
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json && (json.error?.message || json.error)) || `Server returned ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  // Activate payment panel UI
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
  }

  // STEP 1: submit donor info -> create PaymentIntent
  donationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    updateSummary();

    const amount = Number(amountInput.value);
    const frequency = frequencyInput.value || "once";
    const name = donorNameInput.value.trim();
    const email = donorEmailInput.value.trim();
    const note = donorNoteInput.value.trim();

    if (!name) return showError("Please enter your name.");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError("Please enter a valid email for your receipt.");
    if (!amount || amount < minAmount) return showError(`Please enter at least $${minAmount}.`);

    setLoading(toPaymentBtn, true);

    try {
      const payload = {
        amount,
        currency: "usd",
        metadata: {
          donor_name: name,
          donor_email: email,
          note,
          team: orgName,
          campaign: "season_fundraiser_2025",
          source: "web_modal",
          frequency
        }
      };

      const data = await createIntent(payload);
      // server should return publishable_key and client_secret (or publishableKey/clientSecret)
      const publishableKey = data.publishable_key || data.publishableKey || data.publishable;
      const secret = data.client_secret || data.clientSecret;

      if (!publishableKey || !secret) {
        throw new Error("Payment configuration missing from server response.");
      }

      // ensure stripe instance uses the server-provided key (idempotent)
      if (!ensureStripe(publishableKey)) {
        throw new Error("Stripe initialization failed.");
      }

      // store client secret and initialize element
      clientSecret = secret;
      await initPaymentElement(clientSecret);

      activatePaymentStep();
      // analytics hook
      try { window.dataLayer && window.dataLayer.push({ event: "start_checkout", amount }); } catch (e) {}
    } catch (err) {
      console.error("create intent error:", err);
      showError(err.message || "Unable to start secure checkout.");
    } finally {
      setLoading(toPaymentBtn, false);
    }
  });

  // STEP 2: complete payment
  if (payBtn) {
    payBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      clearError();

      if (!stripe || !elements || !clientSecret) {
        return showError("Secure checkout isn’t ready yet. Please try again.");
      }

      setLoading(payBtn, true);

      try {
        // Use confirmPayment with Payment Element (redirect if required)
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            receipt_email: donorEmailInput.value.trim(),
            // optional return_url: your configured return URL for redirects
          },
          redirect: "if_required"
        });

        // result can include error or paymentIntent
        if (result.error) {
          // user or network error
          return showError(result.error.message || "Payment could not be completed.");
        }

        if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
          handleSuccess(result.paymentIntent);
        } else {
          // If redirect was required, stripe will have redirected; otherwise we may be in a pending state
          // Handle pending states gracefully
          if (result.paymentIntent && result.paymentIntent.status) {
            const st = result.paymentIntent.status;
            if (st === "requires_action" || st === "processing") {
              showError("Payment requires additional steps. If you were redirected, complete any prompts and return to this page.");
            } else {
              showError("We couldn’t confirm the payment. Please check your payment details and try again.");
            }
          } else {
            showError("Unexpected payment state. Please contact support.");
          }
        }
      } catch (err) {
        console.error("confirm payment error:", err);
        showError("Something went wrong while completing your payment.");
      } finally {
        setLoading(payBtn, false);
      }
    });
  }

  // success handling (UI only)
  function handleSuccess(paymentIntent) {
    if (!paymentIntent) return;
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.setAttribute("aria-disabled", "true");
      payBtn.dataset.state = "complete";
    }

    const donorName = donorNameInput.value.trim() || "there";
    const amount = (paymentIntent.amount / 100).toFixed(0);

    const nameEl = document.getElementById("ff-success-name");
    const amountEl = document.getElementById("ff-success-amount");
    const progressEl = document.getElementById("ff-success-progress-line");

    if (nameEl) nameEl.textContent = donorName;
    if (amountEl) amountEl.textContent = `$${amount}`;
    if (progressEl) progressEl.textContent = "Your gift is already on its way to the team.";

    if (successBox) successBox.hidden = false;

    // update local UI - optimistic (no server fetch)
    try {
      const amt = Number(amount) || 0;
      // small campaign update routine (if you track raised/supporters in data attributes)
      const raisedEl = document.getElementById("ff-chip-raised");
      const supportersEl = document.getElementById("ff-chip-supporters");
      if (raisedEl) {
        const prev = Number((raisedEl.textContent || "").replace(/[^0-9]/g, "")) || 0;
        raisedEl.textContent = `$${prev + amt}`;
      }
      if (supportersEl) {
        const prev = Number(supportersEl.textContent) || 0;
        supportersEl.textContent = prev + 1;
      }
      try { window.dataLayer && window.dataLayer.push({ event: 'donation_completed', amount: amt }); } catch(e){}
    } catch (e) { /* ignore */ }
  }
} // end guard

<!-- Stripe JS (external; CSP should allow https://js.stripe.com) -->
<script src="https://js.stripe.com/v3/"></script>
