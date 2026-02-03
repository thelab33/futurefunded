// app-mobile.js
// Mobile-first app-like behavior for fundraiser page

(function () {
  "use strict";

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function formatCurrency(amount) {
    var n = Number(amount) || 0;
    return "$" + n.toFixed(2);
  }

  function smoothScrollTo(id) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      el.scrollIntoView();
    }
  }

  function showToast(message) {
    var toast = qs("#share-toast");
    if (!toast) return;

    var inner = qs(".toast-inner", toast) || toast;
    inner.textContent = message;

    toast.hidden = false;

    if (showToast._hideTimer) {
      clearTimeout(showToast._hideTimer);
    }

    showToast._hideTimer = setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  }

  /* ---------------------------------------------------------------
     Navigation (mobile sheet)
     --------------------------------------------------------------- */
  function setupNavigation() {
    var navToggle = qs("[data-nav-toggle]");
    var navSheet = qs("[data-nav-sheet]");
    if (!navToggle || !navSheet) return;

    var closeButtons = qsa("[data-nav-close]", navSheet);

    function openNav() {
      navSheet.hidden = false;
      document.documentElement.classList.add("nav-open");
    }

    function closeNav() {
      navSheet.hidden = true;
      document.documentElement.classList.remove("nav-open");
    }

    navToggle.addEventListener("click", function () {
      if (navSheet.hidden) {
        openNav();
      } else {
        closeNav();
      }
    });

    closeButtons.forEach(function (btn) {
      btn.addEventListener("click", closeNav);
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !navSheet.hidden) {
        closeNav();
      }
    });
  }

  /* ---------------------------------------------------------------
     Scroll links + donate shortcuts
     --------------------------------------------------------------- */
  function setupScrollingAndCTAs() {
    qsa("[data-scroll-to]").forEach(function (el) {
      el.addEventListener("click", function () {
        var targetId = el.getAttribute("data-scroll-to");
        if (!targetId) return;
        smoothScrollTo(targetId);
      });
    });

    var donateButtons = qsa("[data-action='donate']");
    donateButtons.forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        smoothScrollTo("donate");
      });
    });
  }

  /* ---------------------------------------------------------------
     Native share / copy link
     --------------------------------------------------------------- */
  function setupShare() {
    var shareButtons = qsa("[data-action='share']");
    if (!shareButtons.length) return;

    var body = document.body || document.documentElement;
    var shareUrl = body.getAttribute("data-share-url") || window.location.href;
    var shareTitle = body.getAttribute("data-share-title") || document.title;
    var shareDesc = body.getAttribute("data-share-desc") || "";

    function fallbackCopy() {
      var input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy");
        showToast("Link copied — share it with family, friends, and sponsors.");
      } catch (e) {
        showToast("We couldn’t copy the link — use your browser’s share button.");
      }
      document.body.removeChild(input);
    }

    function handleShare() {
      if (navigator.share) {
        navigator
          .share({
            title: shareTitle,
            text: shareDesc,
            url: shareUrl,
          })
          .catch(function () {
            // user cancelled, ignore
          });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(shareUrl)
          .then(function () {
            showToast("Link copied — share it with family, friends, and sponsors.");
          })
          .catch(function () {
            fallbackCopy();
          });
      } else {
        fallbackCopy();
      }
    }

    shareButtons.forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        handleShare();
      });
    });
  }

  /* ---------------------------------------------------------------
     Tabs in "Ways to give"
     --------------------------------------------------------------- */
  function setupTabs() {
    var tabButtons = qsa("[data-tab]");
    if (!tabButtons.length) return;

    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-tab");
        if (!name) return;

        tabButtons.forEach(function (b) {
          var isActive = b === btn;
          b.classList.toggle("is-active", isActive);
          b.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        qsa(".tab-panel").forEach(function (panel) {
          var match = panel.id === "panel-" + name;
          panel.classList.toggle("is-active", match);
        });
      });
    });
  }

  /* ---------------------------------------------------------------
     Donation form + Stripe
     --------------------------------------------------------------- */
  function setupDonationForm() {
    var form = qs("#donation-form");
    if (!form) return;

    var detailsStep = qs('[data-step="details"]', form);
    var paymentStep = qs('[data-step="payment"]', form);
    var nextBtn = qs("#donation-next", form);
    var payBtn = qs("#pay-submit", form);

    var nameInput = qs("#donor-name", form);
    var emailInput = qs("#donor-email", form);
    var amountInput = qs("#donation-amount", form);
    var noteInput = qs("#donation-note", form);
    var freqInput = qs("#donation-frequency", form);
    var frequencyButtons = qsa("[data-frequency]", form);
    var quickAmountButtons = qsa("[data-amount-button]", form);

    var donateError = qs("#donation-error", form);
    var paymentError = qs("#payment-error", form);
    var paymentSummary = qs("#payment-summary", form);
    var cardElementHost = qs("#card-element", form);
    var successPanel = qs("#payment-success", form);
    var successName = qs("#success-name", form);
    var successAmount = qs("#success-amount", form);
    var successPrevPct = qs("#success-prev-pct", form);
    var successNewPct = qs("#success-new-pct", form);
    var successProgressLine = qs(".success-progress", form);

    /* Frequency pills */
    frequencyButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = btn.getAttribute("data-frequency") || "once";
        if (freqInput) {
          freqInput.value = value;
        }
        frequencyButtons.forEach(function (b) {
          var active = b === btn;
          b.classList.toggle("is-selected", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });
    });

    if (freqInput && !freqInput.value) {
      freqInput.value = "once";
    }

    /* Quick amounts within the form */
    quickAmountButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var raw = btn.getAttribute("data-amount-button");
        if (!amountInput || !raw) return;
        amountInput.value = raw;
        amountInput.focus();

        quickAmountButtons.forEach(function (b) {
          b.classList.toggle("is-selected", b === btn);
        });
      });
    });

    function setDonateError(message) {
      if (!donateError) return;
      if (!message) {
        donateError.hidden = true;
        donateError.textContent = "";
      } else {
        donateError.hidden = false;
        donateError.textContent = message;
        donateError.focus();
      }
    }

    function setPaymentError(message) {
      if (!paymentError) return;
      if (!message) {
        paymentError.hidden = true;
        paymentError.textContent = "";
      } else {
        paymentError.hidden = false;
        paymentError.textContent = message;
        paymentError.focus();
      }
    }

    var stripe = null;
    var elements = null;
    var paymentElement = null;
    var creatingIntent = false;
    var confirming = false;

    async function handleNextClick() {
      setDonateError("");
      setPaymentError("");

      if (!nameInput || !emailInput || !amountInput) return;

      var name = nameInput.value.trim();
      var email = emailInput.value.trim();
      var amtRaw = amountInput.value.trim();
      var amountNumber = parseFloat(amtRaw);
      var frequency = (freqInput && freqInput.value) || "once";

      if (!name) {
        setDonateError("Please add your name to continue.");
        return;
      }
      if (!email || email.indexOf("@") === -1) {
        setDonateError("Please use a valid email address.");
        return;
      }
      if (!isFinite(amountNumber) || amountNumber <= 0) {
        setDonateError("Please enter a positive gift amount.");
        return;
      }

      if (!window.Stripe) {
        setDonateError("Payments are unavailable right now. Please refresh and try again.");
        return;
      }

      if (creatingIntent) return;
      creatingIntent = true;

      if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.classList.add("is-loading");
        nextBtn.textContent = "Preparing secure payment…";
      }

      var payload = {
        name: name,
        email: email,
        note: noteInput ? noteInput.value.trim() : "",
        frequency: frequency,
        method: "stripe",
        amount: Math.round(amountNumber * 100),
        org_slug: form.getAttribute("data-org-slug") || "",
      };

      try {
        var res = await fetch("/payments/stripe/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        var data;
        try {
          data = await res.json();
        } catch (e) {
          data = {};
        }

        if (!res.ok || !data.client_secret || !data.publishable_key) {
          setDonateError("We couldn’t start checkout. Please try again.");
          return;
        }

        stripe = Stripe(data.publishable_key);
        elements = stripe.elements({ clientSecret: data.client_secret });
        paymentElement = elements.create("payment");

        if (cardElementHost) {
          paymentElement.mount(cardElementHost);
        }

        /* Summary */
        if (paymentSummary) {
          var orgName = document.body.getAttribute("data-org") || "this team";
          var freqCopy = frequency === "monthly" ? " as a monthly gift" : "";
          paymentSummary.innerHTML =
            "You’re giving <strong>" +
            formatCurrency(amountNumber) +
            "</strong>" +
            freqCopy +
            " to support " +
            orgName +
            ".";
        }

        /* Lock step 1 fields */
        nameInput.readOnly = true;
        emailInput.readOnly = true;
        amountInput.readOnly = true;
        if (freqInput) freqInput.disabled = true;
        frequencyButtons.forEach(function (b) {
          b.disabled = true;
        });

        form.setAttribute("data-amount", String(amountNumber));
        form.setAttribute("data-frequency", frequency);

        /* Switch to step 2 */
        if (detailsStep) detailsStep.hidden = true;
        if (paymentStep) paymentStep.hidden = false;
      } catch (err) {
        setDonateError("Network error. Please try again.");
      } finally {
        creatingIntent = false;
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.classList.remove("is-loading");
          nextBtn.textContent = "Continue to payment";
        }
      }
    }

    async function handlePayClick() {
      setPaymentError("");

      if (!stripe || !elements || !paymentElement) {
        setPaymentError("Payment is not ready yet. Try reloading this page.");
        return;
      }
      if (confirming) return;

      confirming = true;
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.classList.add("is-loading");
        payBtn.textContent = "Processing…";
      }

      try {
        var result = await stripe.confirmPayment({
          elements: elements,
          confirmParams: {
            return_url: window.location.href,
          },
          redirect: "if_required",
        });

        if (result.error) {
          setPaymentError(result.error.message || "There was an issue confirming your payment.");
          return;
        }

        var intent = result.paymentIntent;
        if (intent && intent.status === "succeeded") {
          var name = nameInput ? nameInput.value.trim() || "friend" : "friend";
          var amountNumber =
            parseFloat(form.getAttribute("data-amount") || "0") || 0;

          if (successName) successName.textContent = name;
          if (successAmount) successAmount.textContent = formatCurrency(amountNumber);

          updateProgressAfterPayment(
            amountNumber,
            successPrevPct,
            successNewPct,
            successProgressLine
          );

          if (successPanel) {
            successPanel.hidden = false;
            try {
              successPanel.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            } catch (e) {
              // ignore
            }
          }

          if (cardElementHost) {
            cardElementHost.style.display = "none";
          }
          if (payBtn) {
            payBtn.classList.remove("is-loading");
            payBtn.disabled = true;
            payBtn.textContent = "Payment complete";
          }
        } else {
          setPaymentError(
            "Something unexpected happened. Please check your card and try again."
          );
        }
      } catch (err) {
        setPaymentError(
          "Unexpected error while processing your payment."
        );
      } finally {
        confirming = false;
        if (payBtn && !payBtn.disabled) {
          payBtn.classList.remove("is-loading");
          payBtn.textContent = "Pay securely";
        }
      }
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        handleNextClick();
      });
    }

    if (payBtn) {
      payBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        handlePayClick();
      });
    }

    /* Impact tiles also prefill the amount */
    qsa("#impact [data-amount-button]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var raw = btn.getAttribute("data-amount-button");
        if (!amountInput || !raw) return;
        amountInput.value = raw;
        amountInput.focus();

        quickAmountButtons.forEach(function (b) {
          b.classList.toggle(
            "is-selected",
            b.getAttribute("data-amount-button") === raw
          );
        });

        smoothScrollTo("donate");
      });
    });
  }

  /* ---------------------------------------------------------------
     Progress update after payment success
     --------------------------------------------------------------- */
  function updateProgressAfterPayment(amount, prevEl, newEl, lineEl) {
    var body = document.body || document.documentElement;
    if (!body) return;

    var goal = parseFloat(body.getAttribute("data-goal") || "0") || 0;
    if (!goal || !amount) return;

    var raisedBefore =
      parseFloat(body.getAttribute("data-raised") || "0") || 0;
    var prevPct = Math.min(100, Math.round((raisedBefore / goal) * 100));

    var raisedAfter = raisedBefore + amount;
    var newPct = Math.min(100, Math.round((raisedAfter / goal) * 100));

    body.setAttribute("data-raised", String(raisedAfter));
    body.setAttribute("data-progress", String(newPct));
    body.style.setProperty("--progress", newPct + "%");

    if (prevEl) prevEl.textContent = prevPct;
    if (newEl) newEl.textContent = newPct;
    if (lineEl) lineEl.hidden = false;

    var progressPercent = qs("#progress-percent");
    var progressRaised = qs("#progress-raised");
    var progressBar = qs("[data-progress-bar]");

    if (progressPercent) {
      progressPercent.textContent = newPct + "%";
    }
    if (progressRaised) {
      progressRaised.textContent = formatCurrency(raisedAfter);
    }
    if (progressBar) {
      progressBar.style.width = newPct + "%";
    }
  }

  /* ---------------------------------------------------------------
     Kick everything off
     --------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    setupNavigation();
    setupScrollingAndCTAs();
    setupShare();
    setupTabs();
    setupDonationForm();
  });
})();

