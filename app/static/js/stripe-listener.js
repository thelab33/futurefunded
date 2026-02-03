// stripe-listener.js
// Small, focused listener that mounts Payment Element and confirms payments.
// Requires stripe.js to be loaded on the page (https://js.stripe.com/v3/)

(function () {
  "use strict";

  if (!window.Stripe) {
    // Wait a short while for stripe.js if it's loading async; otherwise log and bail.
    var tries = 0;
    var waitForStripe = function () {
      tries++;
      if (window.Stripe) { attachHandlers(); return; }
      if (tries > 20) { console.warn("stripe-listener: stripe.js not available."); return; }
      setTimeout(waitForStripe, 150);
    };
    waitForStripe();
  } else {
    attachHandlers();
  }

  function attachHandlers() {
    var stripe = null;
    var elements = null;
    var paymentElement = null;
    var clientSecret = null;
    var publishable = null;

    // mark that a handler is attached (donation.js checks this)
    window.__ff_payment_confirm_handler_attached = true;

    document.addEventListener("ff:paymentIntentCreated", function (e) {
      var payload = (e && e.detail) || window.ffPaymentIntentResponse || {};
      clientSecret = payload.client_secret || payload.clientSecret || null;
      publishable = payload.publishable_key || payload.publishableKey || payload.publishable || null;

      if (!clientSecret || !publishable) {
        console.error("stripe-listener: missing publishable_key or client_secret", payload);
        // show a UI error if possible
        var formErr = document.getElementById("ff-form-error");
        if (formErr) formErr.textContent = "Payment setup incomplete. Contact support.";
        return;
      }

      try {
        // initialize stripe instance idempotently
        if (!stripe || stripe._publishableKey !== publishable) {
          stripe = Stripe(publishable);
          stripe._publishableKey = publishable;
        }
        // if already mounted with same clientSecret, skip re-mount
        if (elements && paymentElement && clientSecret === (elements._clientSecret)) {
          // already initialized for this intent
          return;
        }
        // (re)create elements bound to this client secret
        elements = stripe.elements({ clientSecret: clientSecret });
        elements._clientSecret = clientSecret;

        // clean previous mount
        var mount = document.getElementById("ff-card-element");
        if (!mount) {
          console.error("stripe-listener: missing mount node #ff-card-element");
          return;
        }
        mount.innerHTML = "";

        paymentElement = elements.create("payment", { layout: "tabs" });
        paymentElement.mount("#ff-card-element");

        // enable pay button when element ready/complete
        elements.on("change", function (evt) {
          var payBtn = document.getElementById("ff-pay-btn");
          if (!payBtn) return;
          var ready = !evt.empty && (evt.complete || evt.ready);
          payBtn.disabled = !ready;
          if (ready) {
            payBtn.dataset.state = "ready";
            payBtn.removeAttribute("aria-disabled");
          } else {
            payBtn.dataset.state = "disabled";
            payBtn.setAttribute("aria-disabled", "true");
          }
        });

      } catch (err) {
        console.error("stripe-listener:init error", err);
        var formErr = document.getElementById("ff-form-error");
        if (formErr) formErr.textContent = "Unable to initialize secure checkout.";
      }
    });

    document.addEventListener("ff:paymentConfirmRequested", async function (e) {
      var detail = (e && e.detail) || {};
      var donationState = detail.donationState || {};
      var payErrorEl = document.getElementById("ff-form-error");
      if (!stripe || !elements) {
        if (payErrorEl) payErrorEl.textContent = "Checkout not ready. Try again.";
        return;
      }
      try {
        // confirm using Payment Element (handles SCA + wallets)
        var result = await stripe.confirmPayment({
          elements: elements,
          confirmParams: {
            receipt_email: donationState.email || undefined
            // If you want redirects for some methods, you can set return_url here
            // return_url: window.location.href + '?payment=complete'
          },
          redirect: "if_required"
        });

        if (result.error) {
          if (payErrorEl) payErrorEl.textContent = result.error.message || "Payment failed.";
          return;
        }

        if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
          // update UI (simple)
          var nameEl = document.getElementById("ff-success-name");
          var amountEl = document.getElementById("ff-success-amount");
          var successBox = document.getElementById("ff-payment-success");
          if (nameEl) nameEl.textContent = donationState.name || "Supporter";
          if (amountEl) amountEl.textContent = "$" + (donationState.amount || 0);
          if (successBox) successBox.hidden = false;
          var payBtn = document.getElementById("ff-pay-btn");
          if (payBtn) payBtn.disabled = true;
          // optionally tell server about success (you probably do this on webhook)
        } else {
          // pending or requires_action handled by stripe via redirect
          if (payErrorEl) payErrorEl.textContent = "Payment in progress; follow any prompts to complete.";
        }
      } catch (err) {
        console.error("stripe-listener:confirm error", err);
        if (payErrorEl) payErrorEl.textContent = "Error completing payment. Try again.";
      }
    });
  }
})();

