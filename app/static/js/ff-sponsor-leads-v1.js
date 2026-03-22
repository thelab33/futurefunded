(function sponsorLeadsV1(win, doc) {
  "use strict";

  if (!win || !doc) return;
  if (win.__ffSponsorLeadsV1Bound) return;
  win.__ffSponsorLeadsV1Bound = true;

  function qs(sel, root) {
    return (root || doc).querySelector(sel);
  }

  function firstValue(selectors, root) {
    for (var i = 0; i < selectors.length; i += 1) {
      var el = qs(selectors[i], root);
      if (!el) continue;
      if (typeof el.value === "string" && el.value.trim()) return el.value.trim();
      if (typeof el.textContent === "string" && el.textContent.trim()) return el.textContent.trim();
    }
    return "";
  }

  function setMessage(el, text, show) {
    if (!el) return;
    el.textContent = text || "";
    if ("hidden" in el) el.hidden = !show;
  }

  function csrfToken(form) {
    var meta = qs('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    var input = qs('input[name="csrf_token"]', form);
    return input && input.value ? input.value : "";
  }

  function bindForm() {
    var form = qs("#sponsorForm") || qs("[data-ff-sponsor-form]");
    if (!form) return;
    if (form.dataset.ffSponsorLeadBound === "true") return;

    form.dataset.ffSponsorLeadBound = "true";

    var statusEl = qs("[data-ff-sponsor-status]") || qs("#sponsorInterestTrust");
    var errorEl = qs("[data-ff-sponsor-error]") || qs("#sponsorErrorText");
    var successEl = qs("[data-ff-sponsor-success]");
    var submitBtn = qs("[data-ff-sponsor-submit]", form) || qs('button[type="submit"]', form);

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();

      setMessage(errorEl, "", false);
      setMessage(successEl, "", false);
      setMessage(statusEl, "Sending sponsor inquiry…", true);

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute("aria-busy", "true");
      }

      var payload = {
        sponsor_name: firstValue([
          '[data-ff-sponsor-name]',
          'input[name="sponsor_name"]',
          'input[name="name"]'
        ], form),
        business_name: firstValue([
          'input[name="business_name"]',
          'input[name="company"]'
        ], form),
        email: firstValue([
          '[data-ff-sponsor-email]',
          '[data-ff-email]',
          'input[name="email"]'
        ], form),
        phone: firstValue([
          'input[name="phone"]',
          'input[name="telephone"]'
        ], form),
        website: firstValue([
          'input[name="website"]'
        ], form),
        tier_interest: firstValue([
          '[data-ff-sponsor-tier-selected]',
          'input[name="tier_interest"]:checked',
          'input[name="tier_interest"]',
          'input[name="tier"]'
        ], form),
        budget: firstValue([
          'input[name="budget"]',
          'select[name="budget"]'
        ], form),
        message: firstValue([
          '[data-ff-sponsor-message]',
          'textarea[name="message"]'
        ], form),
        organization_name: doc.title || "",
        campaign_name: doc.title || "",
        page_url: win.location.href,
        referrer: doc.referrer || ""
      };

      try {
        var res = await fetch(form.getAttribute("action") || "/api/sponsor-interest", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": csrfToken(form)
          },
          body: JSON.stringify(payload)
        });

        var data = {};
        try {
          data = await res.json();
        } catch (_) {
          data = {};
        }

        if (!res.ok || !data.ok) {
          var msg = (data && data.message) || "We could not send your sponsor inquiry.";
          setMessage(errorEl, msg, true);
          setMessage(statusEl, "Sponsor inquiry failed. Please review and try again.", true);
          return;
        }

        setMessage(successEl, data.message || "Thanks — your sponsor inquiry was received.", true);
        setMessage(statusEl, "Sponsor inquiry sent successfully.", true);
        form.reset();

        win.dispatchEvent(new CustomEvent("ff:sponsor-lead:created", {
          detail: data
        }));
      } catch (err) {
        setMessage(errorEl, "Network error. Please try again.", true);
        setMessage(statusEl, "Network error while sending sponsor inquiry.", true);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.removeAttribute("aria-busy");
        }
      }
    });
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", bindForm, { once: true });
  } else {
    bindForm();
  }
})(window, document);
