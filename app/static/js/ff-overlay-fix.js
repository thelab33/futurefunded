/* ============================================================================
  FutureFunded — ff-overlay-fix.js
  Purpose: Robust overlay handling for #checkout (handles :target, backdrop,
           escape, z-index/pointer-events races, and test-friendly forceClose).
  DROP-IN: include after ff-app.js in your base template.
============================================================================ */

(function () {
  "use strict";

  if (window.__FF_OVERLAY_FIX_INSTALLED__) return;
  window.__FF_OVERLAY_FIX_INSTALLED__ = true;

  const SHEET_ID = "checkout";
  const SHEET_SEL = `#${SHEET_ID}`;
  const SHEET_ATTR = "data-ff-checkout-sheet"; // if you use this attribute, we still respect id
  const BACKDROP_SEL = `${SHEET_SEL} .ff-sheet__backdrop, ${SHEET_SEL} a.ff-sheet__backdrop`;
  const CLOSE_BTN_SEL =
    `${SHEET_SEL} button[data-ff-close-checkout], ${SHEET_SEL} [role="button"][data-ff-close-checkout], ${SHEET_SEL} .ff-sheet__close`;
  const OPEN_ATTR = "data-open";
  const HASH = "#checkout";

  // small debounce window to ignore immediate hashchange that re-opens :target
  let __ff_ignore_hash_until = 0;

  // utilities
  function qs(sel, root = document) { return (root || document).querySelector(sel); }
  function qsa(sel, root = document) { return Array.from((root || document).querySelectorAll(sel)); }
  function setClosedState(sheet) {
    if (!sheet) return;
    try { sheet.setAttribute("aria-hidden", "true"); } catch(e) {}
    try { sheet.setAttribute(OPEN_ATTR, "false"); } catch(e) {}
    try { sheet.setAttribute("hidden", ""); } catch(e) {}
    try { sheet.style.display = "none"; } catch(e) {}
    try { sheet.dispatchEvent(new CustomEvent("ff:close", { bubbles: true })); } catch(e) {}
  }
  function setOpenState(sheet) {
    if (!sheet) return;
    try { sheet.removeAttribute("hidden"); } catch(e) {}
    try { sheet.setAttribute("aria-hidden", "false"); } catch(e) {}
    try { sheet.setAttribute(OPEN_ATTR, "true"); } catch(e) {}
    try { sheet.style.removeProperty("display"); } catch(e) {}
    try { sheet.dispatchEvent(new CustomEvent("ff:open", { bubbles: true })); } catch(e) {}
  }
  function isHidden(sheet) {
    if (!sheet) return true;
    return sheet.hasAttribute("hidden") || sheet.getAttribute("aria-hidden") === "true" || (sheet.style && sheet.style.display === "none");
  }
  function removeHashIfCheckout() {
    try {
      if (location.hash === HASH) {
        // replaceState avoids adding a new history entry
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch (e) {}
  }

  // Primary force-close used by tests & fallback flows
  function forceClose() {
    const sheet = qs(SHEET_SEL) || qs(`[${SHEET_ATTR}]`);
    if (!sheet) return false;

    // If there is an app-level API, try to call it first (non-breaking)
    try {
      if (window.ff && typeof window.ff.closeCheckout === "function") {
        window.ff.closeCheckout();
      }
    } catch (e) {}

    // canonical close state
    setClosedState(sheet);

    // remove #checkout to prevent :target from reopening
    removeHashIfCheckout();

    // briefly ignore hashchange events to avoid re-open race
    __ff_ignore_hash_until = Date.now() + 300;

    return true;
  }

  // click handler: delegated capture for robust coverage
  function onDocClick(e) {
    try {
      // If click occurred on or inside a backdrop element for the sheet, close
      const backdrop = (e.target && e.target.closest && e.target.closest(".ff-sheet__backdrop"));
      if (backdrop && document.contains(backdrop) && backdrop.closest && backdrop.closest(SHEET_SEL)) {
        e.preventDefault && e.preventDefault();
        e.stopPropagation && e.stopPropagation();
        forceClose();
        return;
      }

      // If click was on an explicit close control inside the sheet, close
      const cbtn = (e.target && e.target.closest && e.target.closest(CLOSE_BTN_SEL));
      if (cbtn && document.contains(cbtn)) {
        e.preventDefault && e.preventDefault();
        e.stopPropagation && e.stopPropagation();
        forceClose();
        return;
      }
    } catch (err) {
      // swallow; non-critical
    }
  }

  // Escape key closes
  function onKeydown(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      forceClose();
    }
  }

  // Sync :target -> JS state on load and when hash changes
  function ensureTargetSync() {
    const sheet = qs(SHEET_SEL) || qs(`[${SHEET_ATTR}]`);
    if (!sheet) return;

    // If hash says open, ensure canonical open state
    if (location.hash === HASH && isHidden(sheet)) {
      // short delay to let CSS-based :target render (if any)
      setTimeout(() => {
        setOpenState(sheet);
      }, 16);
      return;
    }

    // If sheet is open but hash is absent, optionally add the hash (not required).
    // We avoid adding hash by default to prevent history spam.
  }

  // hashchange handler: ignore immediate re-opens triggered by our own replaceState
  function onHashChange() {
    if (Date.now() < __ff_ignore_hash_until) {
      // ignore — likely our own replaceState
      return;
    }
    ensureTargetSync();
  }

  // MutationObserver to bind to dynamic backdrops/panels added after initial load (defensive)
  function bindExistingAndObserve() {
    // bind immediate ones with direct click handlers so elementFromPoint receives the click target logically
    qsa(BACKDROP_SEL).forEach((b) => {
      if (!b.__ff_backdrop_bound__) {
        b.__ff_backdrop_bound__ = true;
        b.addEventListener("click", function (ev) {
          ev.preventDefault && ev.preventDefault();
          ev.stopPropagation && ev.stopPropagation();
          forceClose();
        }, { passive: false });
      }
    });
    // direct close buttons
    qsa(CLOSE_BTN_SEL).forEach((btn) => {
      if (!btn.__ff_close_bound__) {
        btn.__ff_close_bound__ = true;
        btn.addEventListener("click", function (ev) {
          ev.preventDefault && ev.preventDefault();
          ev.stopPropagation && ev.stopPropagation();
          forceClose();
        }, { passive: false });
      }
    });

    // observe new nodes
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes || []) {
          if (!n || !n.querySelector) continue;
          const b = (n.matches && n.matches(".ff-sheet__backdrop")) ? n : n.querySelector && n.querySelector(".ff-sheet__backdrop");
          if (b && !b.__ff_backdrop_bound__) {
            b.__ff_backdrop_bound__ = true;
            b.addEventListener("click", function (ev) {
              ev.preventDefault && ev.preventDefault();
              ev.stopPropagation && ev.stopPropagation();
              forceClose();
            }, { passive: false });
          }
          const cb = (n.matches && n.matches(CLOSE_BTN_SEL)) ? n : n.querySelector && n.querySelector(CLOSE_BTN_SEL);
          if (cb && !cb.__ff_close_bound__) {
            cb.__ff_close_bound__ = true;
            cb.addEventListener("click", function (ev) {
              ev.preventDefault && ev.preventDefault();
              ev.stopPropagation && ev.stopPropagation();
              forceClose();
            }, { passive: false });
          }
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // Install global listeners (capture so they see things before other handlers)
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("hashchange", onHashChange, false);

  // ensure initial sync at DOM ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(() => { ensureTargetSync(); bindExistingAndObserve(); }, 20);
  } else {
    document.addEventListener("DOMContentLoaded", () => { setTimeout(() => { ensureTargetSync(); bindExistingAndObserve(); }, 20); });
  }

  // Expose test hooks
  window.ffOverlay = window.ffOverlay || {};
  window.ffOverlay.forceClose = forceClose;
  window.ffOverlay.setClosedState = setClosedState;
  window.ffOverlay.setOpenState = setOpenState;
  window.ffOverlay.isHidden = () => {
    const s = qs(SHEET_SEL) || qs(`[${SHEET_ATTR}]`);
    return isHidden(s);
  };

  // small readiness flag for tests
  try { window.FF_READY = true; document.documentElement.classList.add("ff-app-ready"); } catch (e) {}

})();
