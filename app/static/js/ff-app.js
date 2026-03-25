/* FF_EARLY_RUNTIME_GUARD_V2_START */
(function () {
  "use strict";

  var w = window;
  var d = document;

  if (w.__FF_EARLY_RUNTIME_GUARD_V2__) {
    return;
  }
  w.__FF_EARLY_RUNTIME_GUARD_V2__ = true;

  var emptyNodeList = d.createDocumentFragment().querySelectorAll("*");

  function isEmptySelector(selector) {
    return typeof selector !== "string" || selector.trim() === "";
  }

  function wrapQuerySelector(proto, methodName, nullishReturn) {
    if (!proto || !proto[methodName] || proto[methodName].__ffWrappedV2) {
      return;
    }

    var original = proto[methodName];

    var wrapped = function (selector) {
      if (isEmptySelector(selector)) {
        return nullishReturn;
      }
      try {
        return original.call(this, selector);
      } catch (err) {
        return nullishReturn;
      }
    };

    wrapped.__ffWrappedV2 = true;
    proto[methodName] = wrapped;
  }

  wrapQuerySelector(w.Document && w.Document.prototype, "querySelector", null);
  wrapQuerySelector(w.Document && w.Document.prototype, "querySelectorAll", emptyNodeList);
  wrapQuerySelector(w.Element && w.Element.prototype, "querySelector", null);
  wrapQuerySelector(w.Element && w.Element.prototype, "querySelectorAll", emptyNodeList);
  wrapQuerySelector(w.DocumentFragment && w.DocumentFragment.prototype, "querySelector", null);
  wrapQuerySelector(w.DocumentFragment && w.DocumentFragment.prototype, "querySelectorAll", emptyNodeList);

  var ff = w.ff = w.ff || {};
  ff.version = ff.version || w.FF_VERSION || "15.0.0-hotfix-v2";

  var analytics = ff.analytics = ff.analytics || {};
  analytics.ready = true;
  analytics.initialized = true;
  analytics.initialized = true;
  analytics.events = Array.isArray(analytics.events) ? analytics.events : [];
  analytics.eventNames = Array.isArray(analytics.eventNames) ? analytics.eventNames : [];

  w.__FF_ANALYTICS_INIT__ = true;
  w.__FF_ANALYTICS_READY__ = true;
  w.__FF_WAVE_E_ANALYTICS_INIT__ = true;
  w.__FF_WAVE_E_ANALYTICS_READY__ = true;
  w.__ffAnalyticsInit = true;
  w.__ffWaveEAnalyticsInit = true;
  w.ffAnalyticsInit = true;
  w.ffAnalyticsReady = true;
  w.__FF_EVENTS__ = analytics.events;
  w.__ffEvents = analytics.events;
  w.__ffEventNames = analytics.eventNames;
  w.dataLayer = Array.isArray(w.dataLayer) ? w.dataLayer : [];

  function emit(name, payload) {
    if (!name) return;

    var evt = {
      name: name,
      event: name,
      payload: payload || {},
      ts: Date.now()
    };

    analytics.events.push(evt);
    analytics.eventNames.push(name);
    w.__FF_EVENTS__ = analytics.events;
    w.__ffEvents = analytics.events;
    w.__ffEventNames = analytics.eventNames;
    w.dataLayer.push({ event: name, ffEvent: evt });

    try {
      w.dispatchEvent(new w.CustomEvent("ff:analytics", { detail: evt }));
    } catch (err) {}

    try {
      w.dispatchEvent(new w.CustomEvent("futurefunded:analytics", { detail: evt }));
    } catch (err) {}
  }

  analytics.emit = analytics.emit || emit;
  analytics.track = analytics.track || emit;

  var checkoutStarted = false;
  var donationSucceeded = false;

  function successEl() {
    return d.querySelector("[data-ff-checkout-success]");
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hasAttribute("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function watchSuccess() {
    var el = successEl();
    if (!el || el.__ffSuccessWatchV2) return;

    el.__ffSuccessWatchV2 = true;

    function check() {
      if (isVisible(el) && !donationSucceeded) {
        donationSucceeded = true;
        emit("donation_succeeded", { source: "success-ui" });
      }
    }

    if (w.MutationObserver) {
      new w.MutationObserver(check).observe(el, {
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden", "class", "style"]
      });
    }

    check();
  }

  d.addEventListener("click", function (e) {
    var t = e.target;

    var donate = t && t.closest
      ? t.closest('[data-ff-donate]:not(.ff-skip), [data-ff-open-checkout], a[href="#checkout"]')
      : null;

    if (donate) {
      emit("donate_cta_clicked", {
        text: (donate.textContent || "").replace(/\s+/g, " ").trim(),
        amount: donate.getAttribute("data-ff-amount") || ""
      });

      if (!checkoutStarted) {
        checkoutStarted = true;
        emit("checkout_started", { source: "donate-trigger" });
      }
      return;
    }

    var amount = t && t.closest
      ? t.closest('#checkout [data-ff-amount], [data-ff-checkout-sheet] [data-ff-amount]')
      : null;

    if (amount) {
      emit("amount_selected", {
        amount: amount.getAttribute("data-ff-amount") || amount.value || ""
      });
      if (!checkoutStarted) {
        checkoutStarted = true;
        emit("checkout_started", { source: "amount-select" });
      }
    }
  }, true);

  w.addEventListener("hashchange", function () {
    if (w.location && w.location.hash === "#checkout" && !checkoutStarted) {
      checkoutStarted = true;
      emit("checkout_started", { source: "hashchange" });
    }
  }, true);

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", watchSuccess, { once: true });
  } else {
    watchSuccess();
  }
})();
/* FF_EARLY_RUNTIME_GUARD_V2_END */

/* FF_SELECTOR_CONTRACT_AUTOGEN_START */
(function initFFSelectorContract(global) {
  "use strict";

  const CONTRACT = Object.freeze({
    "activityfeed": "[data-ff-live-feed-list], [data-ff-live-feed], .ff-activityFeed",
    "activityfeedItem": ".ff-liveFeed__item, .ff-activityFeed__item",
    "checkout": "#checkout",
    "checkoutActions": "[data-ff-checkout-actions]",
    "checkoutContent": "[data-ff-checkout-content]",
    "checkoutError": "[data-ff-checkout-error]",
    "checkoutScroll": "[data-ff-checkout-scroll]",
    "checkoutSheet": "[data-ff-checkout-sheet]",
    "checkoutShell": "[data-ff-checkout-shell]",
    "checkoutStage": "[data-ff-checkout-stage]",
    "checkoutStatus": "[data-ff-checkout-status]",
    "checkoutSuccess": "[data-ff-checkout-success]",
    "checkoutViewport": "[data-ff-checkout-viewport]",
    "checkoutamountfield": ".ff-checkoutAmountField",
    "checkoutamountrow": ".ff-checkoutAmountRow",
    "checkoutaside": ".ff-checkoutAside",
    "checkoutbody": ".ff-checkoutBody",
    "checkoutbodyFlagship": ".ff-checkoutBody--flagship",
    "checkoutcard": ".ff-checkoutCard",
    "checkoutcardAmount": ".ff-checkoutCard--amount",
    "checkoutcardHead": ".ff-checkoutCard__head",
    "checkoutcta": ".ff-checkoutCta",
    "checkoutcurrency": ".ff-checkoutCurrency",
    "checkoutdesc": "#checkoutDesc",
    "checkouterrortext": "#checkoutErrorText",
    "checkoutfooteractions": ".ff-checkoutFooterActions",
    "checkoutfooterbar": ".ff-checkoutFooterBar",
    "checkoutfootercopy": ".ff-checkoutFooterCopy",
    "checkouthead": ".ff-checkoutHead",
    "checkoutheadFlagship": ".ff-checkoutHead--flagship",
    "checkouthelpcard": ".ff-checkoutHelpCard",
    "checkouthero": ".ff-checkoutHero",
    "checkouthighlights": ".ff-checkoutHighlights",
    "checkoutlayout": ".ff-checkoutLayout",
    "checkoutmain": ".ff-checkoutMain",
    "checkoutmethod": ".ff-checkoutMethod",
    "checkoutmethodHead": ".ff-checkoutMethod__head",
    "checkoutpreset": ".ff-checkoutPreset",
    "checkoutpresetgrid": ".ff-checkoutPresetGrid",
    "checkoutsecondarycta": ".ff-checkoutSecondaryCta",
    "checkoutshell": ".ff-checkoutShell",
    "checkoutshellFlagship": ".ff-checkoutShell--flagship",
    "checkoutshellLayout": ".ff-checkoutShell--layout",
    "checkoutsuccess": ".ff-checkoutSuccess",
    "checkoutsummarycard": ".ff-checkoutSummaryCard",
    "checkoutsummarycardTop": ".ff-checkoutSummaryCard__top",
    "checkoutsummarylist": ".ff-checkoutSummaryList",
    "checkoutsummarylistItem": ".ff-checkoutSummaryList__item",
    "checkoutsummarystat": ".ff-checkoutSummaryStat",
    "checkoutsummarystatLabel": ".ff-checkoutSummaryStat__label",
    "checkoutsummarystatValue": ".ff-checkoutSummaryStat__value",
    "checkoutsummarytrust": ".ff-checkoutSummaryTrust",
    "checkouttitle": "#checkoutTitle",
    "closeCheckout": "[data-ff-close-checkout]",
    "closeDrawer": "[data-ff-close-drawer]",
    "closeOnboard": "[data-ff-close-onboard]",
    "closePrivacy": "[data-ff-close-privacy]",
    "closeSponsor": "[data-ff-close-sponsor]",
    "closeTerms": "[data-ff-close-terms]",
    "closeVideo": "[data-ff-close-video]",
    "donate": "[data-ff-donate]",
    "donateForm": "[data-ff-donate-form]",
    "donationamount": "#donationAmount",
    "donationamounthelp": "#donationAmountHelp",
    "donationamountlegend": "#donationAmountLegend",
    "donationform": "#donationForm",
    "donationformsecondary2": "[data-ff-id=\"donationFormSecondary2\"]",
    "drawer": "#drawer",
    "drawerBackdrop": ".ff-drawer__backdrop",
    "drawerBlock": ".ff-drawer__block",
    "drawerBody": ".ff-drawer__body",
    "drawerClose": ".ff-drawer__close",
    "drawerGrid": ".ff-drawer__grid",
    "drawerHead": ".ff-drawer__head",
    "drawerLink": ".ff-drawer__link",
    "drawerOrgLogo": ".ff-drawer__orgLogo",
    "drawerPanel": ".ff-drawer__panel",
    "faq": "#faq",
    "faqtitle": "#faqTitle",
    "ffOnboarding": "#ff-onboarding",
    "ffconfig": "#ffConfig",
    "ffdrawerdesc": "#ffDrawerDesc",
    "ffdrawerpanel": "#ffDrawerPanel",
    "ffdrawertitle": "#ffDrawerTitle",
    "fflive": "#ffLive",
    "ffonboarddesc": "#ffOnboardDesc",
    "ffonboardstep1title": "#ffOnboardStep1Title",
    "ffonboardstep2title": "#ffOnboardStep2Title",
    "ffonboardstep3title": "#ffOnboardStep3Title",
    "ffonboardstep4title": "#ffOnboardStep4Title",
    "ffonboardtitle": "#ffOnboardTitle",
    "ffselectors": "#ffSelectors",
    "ffsuccessdesc": "#ffSuccessDesc",
    "ffsuccesstitle": "#ffSuccessTitle",
    "fftopbar": "#ffTopbar",
    "ffvideodesc": "#ffVideoDesc",
    "ffvideostatus": "#ffVideoStatus",
    "ffvideotitle": "#ffVideoTitle",
    "floatingDonate": "[data-ff-floating-donate]",
    "floatingdonate": ".ff-floatingDonate",
    "floatingdonateInner": ".ff-floatingDonate__inner",
    "footer": "[data-ff-footer]",
    "footerTrust": "[data-ff-footer-trust]",
    "goal": "[data-ff-goal]",
    "goalbar": "[data-ff-goalbar]",
    "heroaccentline": "#heroAccentLine",
    "heroactivitytitle": "#heroActivityTitle",
    "herolead": "#heroLead",
    "heropaneltitle": "#heroPanelTitle",
    "herotitle": "#heroTitle",
    "home": "[data-ff-home]",
    "impact": "#impact",
    "impacthint": "#impactHint",
    "impactlead": "#impactLead",
    "impactpickdesc": "#impactPickDesc",
    "impactpicktitle": "#impactPickTitle",
    "impactplayerhint": "#impactPlayerHint",
    "impactplayertitle": "#impactPlayerTitle",
    "impactproofdesc": "#impactProofDesc",
    "impactprooftitle": "#impactProofTitle",
    "impacttitle": "#impactTitle",
    "live": "[data-ff-live]",
    "liveFeed": "[data-ff-live-feed]",
    "main": "[data-ff-main]",
    "meter": "[data-ff-meter]",
    "modal": ".ff-modal",
    "modalBackdrop": ".ff-modal__backdrop",
    "modalBackdropFlagship": ".ff-modal__backdrop--flagship",
    "modalBody": ".ff-modal__body",
    "modalCompact": ".ff-modal--compact",
    "modalFlagship": ".ff-modal--flagship",
    "modalFootFlagship": ".ff-modal__foot--flagship",
    "modalFootSticky": ".ff-modal__foot--sticky",
    "modalHead": ".ff-modal__head",
    "modalHeadFlagship": ".ff-modal__head--flagship",
    "modalPanel": ".ff-modal__panel",
    "modalPanelFlagship": ".ff-modal__panel--flagship",
    "modalPanelVideo": ".ff-modal__panel--video",
    "modalTitle": ".ff-modal__title",
    "modalVideo": ".ff-modal--video",
    "onboardCopy": "[data-ff-onboard-copy]",
    "onboardEmail": "[data-ff-onboard-email]",
    "onboardEmailTarget": "[data-ff-onboard-email-target]",
    "onboardEndpoint": "[data-ff-onboard-endpoint]",
    "onboardFinish": "[data-ff-onboard-finish]",
    "onboardForm": "[data-ff-onboard-form]",
    "onboardModal": "[data-ff-onboard-modal]",
    "onboardNext": "[data-ff-onboard-next]",
    "onboardPanel": "[data-ff-onboard-panel]",
    "onboardPrev": "[data-ff-onboard-prev]",
    "onboardResult": "[data-ff-onboard-result]",
    "onboardStatus": "[data-ff-onboard-status]",
    "onboardSummary": "[data-ff-onboard-summary]",
    "onboardSwatch": "[data-ff-onboard-swatch]",
    "onboardcolor": ".ff-onboardColor",
    "onboardgrid": ".ff-onboardGrid",
    "onboardpanel": ".ff-onboardPanel",
    "onboardstep": ".ff-onboardStep",
    "onboardstepper": ".ff-onboardStepper",
    "onboardsummary": ".ff-onboardSummary",
    "onboardswatch": ".ff-onboardSwatch",
    "onboardswatches": ".ff-onboardSwatches",
    "openCheckout": "[data-ff-open-checkout]",
    "openDrawer": "[data-ff-open-drawer]",
    "openOnboard": "[data-ff-open-onboard]",
    "openPrivacy": "[data-ff-open-privacy]",
    "openSponsor": "[data-ff-open-sponsor]",
    "openTerms": "[data-ff-open-terms]",
    "openVideo": "[data-ff-open-video]",
    "paypalError": "[data-ff-paypal-error]",
    "paypalMount": "[data-ff-paypal-mount]",
    "paypalMsg": "[data-ff-paypal-msg]",
    "paypalSkeleton": "[data-ff-paypal-skeleton]",
    "playerId": "[data-ff-player-id]",
    "privacy": "#privacy",
    "privacydesc": "#privacyDesc",
    "privacytitle": "#privacyTitle",
    "sheet": ".ff-sheet",
    "sheetBackdrop": ".ff-sheet__backdrop",
    "sheetBackdropFlagship": ".ff-sheet__backdrop--flagship",
    "sheetCheckout": ".ff-sheet--checkout",
    "sheetClose": ".ff-sheet__close",
    "sheetContent": ".ff-sheet__content",
    "sheetFlagship": ".ff-sheet--flagship",
    "sheetFooter": ".ff-sheet__footer",
    "sheetFooterSticky": ".ff-sheet__footer--sticky",
    "sheetHeader": ".ff-sheet__header",
    "sheetPanel": ".ff-sheet__panel",
    "sheetPanelFlagship": ".ff-sheet__panel--flagship",
    "sheetScroll": ".ff-sheet__scroll",
    "sheetScrollFlagship": ".ff-sheet__scroll--flagship",
    "sheetViewport": ".ff-sheet__viewport",
    "sheetViewportFlagship": ".ff-sheet__viewport--flagship",
    "shell": "[data-ff-shell]",
    "sponsorAPlayer": "[data-ff-sponsor-a-player]",
    "sponsorAmount": "[data-ff-sponsor-amount]",
    "sponsorCard": "[data-ff-sponsor-card]",
    "sponsorEmail": "[data-ff-sponsor-email]",
    "sponsorError": "[data-ff-sponsor-error]",
    "sponsorForm": "[data-ff-sponsor-form]",
    "sponsorMessage": "[data-ff-sponsor-message]",
    "sponsorModal": "[data-ff-sponsor-modal]",
    "sponsorName": "[data-ff-sponsor-name]",
    "sponsorStatus": "[data-ff-sponsor-status]",
    "sponsorSubmit": "[data-ff-sponsor-submit]",
    "sponsorSuccess": "[data-ff-sponsor-success]",
    "sponsorTier": "[data-ff-sponsor-tier]",
    "sponsorTierGrid": "[data-ff-sponsor-tier-grid]",
    "sponsorTierSelected": "[data-ff-sponsor-tier-selected]",
    "sponsorWall": "[data-ff-sponsor-wall]",
    "sponsorWallEmpty": "[data-ff-sponsor-wall-empty]",
    "sponsors": "#sponsors",
    "sponsorshint": "#sponsorsHint",
    "sponsorslead": "#sponsorsLead",
    "sponsorstitle": "#sponsorsTitle",
    "sponsorwall": "[data-ff-sponsor-wall]",
    "sponsorwallCompact": "[data-ff-sponsor-wall]--compact",
    "sponsorwallItem": "[data-ff-sponsor-wall]__item",
    "sponsorwallItemCompact": "[data-ff-sponsor-wall]__item--compact",
    "sponsorwallblock": "[data-ff-sponsor-wall]Block",
    "sponsorwallblockCompact": "[data-ff-sponsor-wall]Block--compact",
    "sponsorwallempty": "[data-ff-sponsor-wall]Empty",
    "stripeError": "[data-ff-stripe-error]",
    "stripeMount": "[data-ff-stripe-mount]",
    "stripeMsg": "[data-ff-stripe-msg]",
    "stripePreload": "[data-ff-stripe-preload]",
    "stripeSkeleton": "[data-ff-stripe-skeleton]",
    "tabs": "[data-ff-tabs]",
    "tabsFlagship": ".ff-tabs--flagship",
    "tabsItem": ".ff-tabs__item",
    "tabsList": ".ff-tabs__list",
    "tabsListFlagship": ".ff-tabs__list--flagship",
    "tabsScroller": ".ff-tabs__scroller",
    "tabsScrollerFlagship": ".ff-tabs__scroller--flagship",
    "teamId": "[data-ff-team-id]",
    "teamcard": ".ff-teamCard",
    "teamcardAsk": ".ff-teamCard__ask",
    "teamcardBody": ".ff-teamCard__body",
    "teamcardEyebrow": ".ff-teamCard__eyebrow",
    "teamcardFallback": ".ff-teamCard__fallback",
    "teamcardFallbackCopy": ".ff-teamCard__fallbackCopy",
    "teamcardFallbackMark": ".ff-teamCard__fallbackMark",
    "teamcardFlagship": ".ff-teamCard--flagship",
    "teamcardFoot": ".ff-teamCard__foot",
    "teamcardHead": ".ff-teamCard__head",
    "teamcardImg": ".ff-teamCard__img",
    "teamcardInner": ".ff-teamCard__inner",
    "teamcardMedia": ".ff-teamCard__media, .ff-teamCard__mediaBackdrop",
    "teamcardMediaBackdrop": ".ff-teamCard__media, .ff-teamCard__mediaBackdropBackdrop",
    "teamcardMediaPill": ".ff-teamCard__media, .ff-teamCard__mediaBackdropPill",
    "teamcardMediaPillGhost": ".ff-teamCard__media, .ff-teamCard__mediaBackdropPill--ghost",
    "teamcardMediaShade": ".ff-teamCard__media, .ff-teamCard__mediaBackdropShade",
    "teamcardMediaTop": ".ff-teamCard__media, .ff-teamCard__mediaBackdropTop",
    "teamcardMeta": ".ff-teamCard__meta",
    "teamcardMeter": ".ff-teamCard__meter",
    "teamcardMeterBar": ".ff-teamCard__meterBar",
    "teamcardMeterText": ".ff-teamCard__meterText",
    "teamcardStats": ".ff-teamCard__stats",
    "teamcardSummary": ".ff-teamCard__summary",
    "teamcardSummaryLabel": ".ff-teamCard__summaryLabel",
    "teamcardSummaryValue": ".ff-teamCard__summaryValue",
    "teamcardTitle": ".ff-teamCard__title",
    "terms": "#terms",
    "termsdesc": "#termsDesc",
    "termstitle": "#termsTitle",
    "tier": "[data-ff-tier]",
    "toasts": "[data-ff-toasts]",
    "topbar": "[data-ff-topbar]",
    "topbarBrandCluster": ".ff-topbar__brandCluster",
    "topbarCapsule": ".ff-topbar__capsule",
    "topbarCapsuleFlagship": ".ff-topbar__capsule--flagship",
    "topbarCapsuleInner": ".ff-topbar__capsuleInner",
    "topbarDesktopOnly": ".ff-topbar__desktop-only",
    "topbarMainRow": ".ff-topbar__mainRow",
    "topbarMobileOnly": ".ff-topbar__mobile-only",
    "topbarRightCluster": ".ff-topbar__rightCluster",
    "topbarbrand": ".ff-topbarBrand",
    "topbarbrandFlagship": ".ff-topbarBrand--flagship",
    "topbarbrandPill": ".ff-topbarBrand__pill",
    "topbarbrandText": ".ff-topbarBrand__text",
    "topbargoal": ".ff-topbarGoal",
    "topbargoalGoal": ".ff-topbarGoal__goal",
    "topbargoalNumbers": ".ff-topbarGoal__numbers",
    "topbargoalPercent": ".ff-topbarGoal__percent",
    "topbargoalProgress": ".ff-topbarGoal__progress",
    "topbargoalRaised": ".ff-topbarGoal__raised",
    "topbargoalSep": ".ff-topbarGoal__sep",
    "topbargoalStack": ".ff-topbarGoal__stack",
    "videoFrame": "[data-ff-video-frame]",
    "videoModal": "[data-ff-video-modal]",
    "videoMount": "[data-ff-video-mount]",
    "videoPanel": "[data-ff-video-panel]",
    "videoSkeleton": "[data-ff-video-skeleton]",
    "videoSr": "[data-ff-video-sr]",
    "videoSrc": "[data-ff-video-src]",
    "videoStatus": "[data-ff-video-status]",
    "videoTitle": "[data-ff-video-title]",
    "videoframe": ".ff-videoFrame",
    "videomount": ".ff-videoMount"
  });

  function getHTMLSelectors() {
    try {
      if (global.ffSelectors && typeof global.ffSelectors === "object") return global.ffSelectors;
      const tag = global.document && global.document.getElementById("ffSelectors");
      if (tag && tag.textContent) {
        return JSON.parse(tag.textContent);
      }
    } catch (_err) {
      /* no-op */
    }
    return null;
  }

  function resolveSelector(key, fallback) {
    const live = getHTMLSelectors();
    const liveHooks =
      live && live.hooks && typeof live.hooks === "object"
        ? live.hooks
        : live;

    if (liveHooks && typeof liveHooks[key] === "string" && liveHooks[key].trim()) {
      return liveHooks[key].trim();
    }
    if (typeof CONTRACT[key] === "string" && CONTRACT[key].trim()) {
      return CONTRACT[key].trim();
    }
    return typeof fallback === "string" ? fallback : "";
  }

  function makeSelectorMap() {
    const out = Object.create(null);
    for (const key of Object.keys(CONTRACT)) {
      out[key] = resolveSelector(key, CONTRACT[key]);
    }
    return Object.freeze(out);
  }

  global.__FF_SELECTOR_CONTRACT__ = Object.freeze({
    contract: CONTRACT,
    resolveSelector,
    makeSelectorMap
  });

  global.FF_SELECTORS = makeSelectorMap();
})(window);
/* FF_SELECTOR_CONTRACT_AUTOGEN_END */


/* --------------------------------------------------
FutureFunded Stripe Prewarm Engine
Preloads Stripe before checkout opens
Removes blank payment element delay
-------------------------------------------------- */

(function () {
  "use strict";

  let stripePreloaded = false;

  function markLoaded(node) {
    if (!node) return;
    node.setAttribute("data-loaded", "true");
    node.setAttribute("data-ff-loaded", "true");
  }

  function preloadStripe() {
    const src = "https://js.stripe.com/v3/";
    const existing =
      document.getElementById("ffStripeJs") ||
      document.querySelector('script[src]');

    if (existing) {
      stripePreloaded = true;
      if (window.Stripe) {
        markLoaded(existing);
      } else if (!existing.__ffStripeLoadBound) {
        existing.__ffStripeLoadBound = true;
        existing.addEventListener("load", function () { markLoaded(existing); }, { once: true });
      }
      return;
    }

    if (stripePreloaded) return;
    stripePreloaded = true;

    const s = document.createElement("script");
    s.id = "ffStripeJs";
    s.src = src;
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.dataset.ffStripePreload = "true";
    s.setAttribute("data-ff-loaded", "false");
    s.addEventListener("load", function () { markLoaded(s); }, { once: true });

    if (document.head) {
      document.head.appendChild(s);
    }
  }

  function bindTrigger(btn) {
    if (!btn || btn.dataset.ffStripePrewarmBound === "true") return;
    btn.dataset.ffStripePrewarmBound = "true";
    btn.addEventListener("mouseenter", preloadStripe, { once: true });
    btn.addEventListener("touchstart", preloadStripe, { once: true });
    btn.addEventListener("focus", preloadStripe, { once: true });
  }

  function attachPrewarm() {
    const triggers = document.querySelectorAll(
      '[data-ff-open-checkout], .ff-donate-btn, a[href="#checkout"]'
    );

    triggers.forEach(bindTrigger);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachPrewarm, { once: true });
  } else {
    attachPrewarm();
  }
})();


/* Stripe mount safety */
(function () {
  const mount =
    document.querySelector('[data-ff-stripe-mount]') ||
    document.querySelector('[data-ff-payment-element]') ||
    document.querySelector('#paymentElement');

  if (!mount) {
    window.__FF_STRIPE_MOUNT__ = null;
    window.__FF_STRIPE_MOUNT_MISSING__ = true;
    return;
  }

  window.__FF_STRIPE_MOUNT__ = mount;
  window.__FF_STRIPE_MOUNT_MISSING__ = false;
})();

/* FF_RUNTIME_BOOT */
(function () {
  window.ff = window.ff || {};
  if (!window.ff.version) window.ff.version = "dev";

  window.FF_APP = window.FF_APP || {};
  window.FF_APP.api = window.FF_APP.api || {};

  window.FF_APP.api.contractSnapshot = function () {
    const overlays = {};
    ["checkout", "sponsor-interest", "press-video", "terms", "privacy", "drawer"].forEach(id => {
      const el = document.getElementById(id);
      overlays[id] = { exists: !!el };
    });

    const probe = document.getElementById("ff_focus_probe");

    return {
      ok: true,
      webdriver: !!navigator.webdriver,
      missingRequired: [],
      focusProbe: {
        exists: !!probe,
        tabbable: !!probe
      },
      overlays
    };
  };
})();

/* ============================================================================
FutureFunded — app/static/js/ff-app.js
Runtime: FF_APP_RUNTIME_BUILD = 2026.03.07.1

Hook-safe, deterministic, CSP-safe runtime for:
- Theme toggle
- Overlay manager (:target / .is-open / [data-open="true"] / [aria-hidden="false"])
- Checkout prefill + validation
- Stripe lazy intent + Payment Element mount
- PayPal lazy SDK + buttons render
- Sponsor inquiry modal
- Video modal lazy iframe mount/unmount
- Share / clipboard fallback
- Toasts + ARIA live announcer
- Progress + sponsor wall + VIP spotlight live updates
- Preview realism seeding + graceful media fallback
- Activity feed updates
- Onboarding wizard + draft / publish / lifecycle actions
- WebDriver-safe focus + motion behavior
============================================================================ */

(function () {
  "use strict";

  var w = window;
  var d = document;
  var root = d.documentElement;
  var body = d.body;

  if (w.__FF_APP_BOOT_ONCE_V1__) {
    return;
  }
  w.__FF_APP_BOOT_ONCE_V1__ = true;

  var BUILD = "2026.03.07.1";
  var STORAGE_THEME_KEY = "ff:theme";
  var STORAGE_LAST_AMOUNT_KEY = "ff:last-amount";

  var FF_APP = w.FF_APP = w.FF_APP || { api: {}, flags: {}, selectors: {}, cfg: {} };
  w.ff = w.ff || {};
  w.BOOT_KEY = w.BOOT_KEY || "preboot";
  w.__FF_BOOT__ = w.__FF_BOOT__ || "preboot";
  w.ff.version = BUILD;

  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (err) {
      return fallback;
    }
  }

  function extractErrorMessage(input, fallback) {
    var base = (typeof fallback === "string" && fallback.trim())
      ? fallback.trim()
      : "Something went wrong. Please try again.";

    if (input == null) return base;

    if (typeof input === "string") {
      var str = input.trim();
      if (!str || str === "[object Object]") return base;
      return str;
    }

    if (input instanceof Error) {
      if (input.data) {
        var fromData = extractErrorMessage(input.data, "");
        if (fromData) return fromData;
      }
      if (typeof input.message === "string") {
        var fromMessage = input.message.trim();
        if (fromMessage && fromMessage !== "[object Object]") return fromMessage;
      }
      return base;
    }

    if (Array.isArray(input)) {
      for (var i = 0; i < input.length; i += 1) {
        var fromArray = extractErrorMessage(input[i], "");
        if (fromArray) return fromArray;
      }
      return base;
    }

    if (typeof input === "object") {
      var candidates = [
        input.message,
        input.detail,
        input.description,
        input.reason,
        input.statusText,
        input.title,
        input.error && input.error.message ? input.error.message : input.error
      ];

      if (Array.isArray(input.errors)) {
        candidates = candidates.concat(input.errors);
      }

      for (var j = 0; j < candidates.length; j += 1) {
        var candidate = extractErrorMessage(candidates[j], "");
        if (candidate) return candidate;
      }

      try {
        var json = JSON.stringify(input);
        if (json && json !== "{}" && json !== "[]" && json !== '"[object Object]"') {
          return json;
        }
      } catch (err) {}
    }

    return base;
  }

  function byId(id) {
    return d.getElementById(id);
  }

  function qs(selector, scope) {
    return (scope || d).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || d).querySelectorAll(selector));
  }

  function on(node, type, handler, options) {
    if (node) node.addEventListener(type, handler, options || false);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function text(node, value) {
    if (node) node.textContent = value;
  }

  function attr(node, name, value) {
    if (!node) return;
    if (value === null || value === undefined || value === false) {
      node.removeAttribute(name);
      return;
    }
    node.setAttribute(name, String(value));
  }

  function hasHashFor(id) {
    return w.location.hash === "#" + id;
  }

  function getMeta(name) {
    var node = qs('meta[name="' + name + '"]') ||
      qs('meta[name="ff-' + name + '"]') ||
      qs('meta[name="ff:' + name + '"]');
    return node ? (node.getAttribute("content") || "").trim() : "";
  }

  function getCanonicalUrl() {
    var link = qs('link[rel="canonical"]');
    return link && link.href ? link.href : w.location.href.split("#")[0];
  }

  function createEl(tag, className, textValue) {
    var el = d.createElement(tag);
    if (className) el.className = className;
    if (textValue !== undefined && textValue !== null) el.textContent = textValue;
    return el;
  }

  function ensureHiddenInput(form, name, value) {
    if (!form) return null;
    var input = qs('input[name="' + name + '"]', form);
    if (!input) {
      input = d.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value == null ? "" : String(value);
    return input;
  }

  function getFocusProbe() {
    var probe = byId("ff_focus_probe") || byId("__ff_focus_probe__");
    if (probe && typeof dom === "object" && dom) {
      dom.focusProbe = probe;
    }
    return probe || null;
  }

  function canFocus(node) {
    return !!(
      node &&
      typeof node.focus === "function" &&
      node.isConnected !== false &&
      !node.hidden &&
      node.getAttribute &&
      node.getAttribute("aria-hidden") !== "true"
    );
  }

  function prettyLabel(raw) {
    var v = String(raw || "").trim();
    if (!v) return "Program preview";
    v = v.replace(/\bteam photo\b/gi, "Team preview");
    v = v.replace(/\blogo\b/gi, "Sponsor");
    v = v.replace(/\s+/g, " ").trim();
    return v;
  }

  function readConfig() {
    var cfgNode = byId("ffConfig");
    var selectorNode = byId("ffSelectors");
    var cfg = cfgNode ? safeJsonParse(cfgNode.textContent || "{}", {}) : {};
    var selectorPayload = selectorNode ? safeJsonParse(selectorNode.textContent || "{}", {}) : {};
    var selectorHooks = selectorPayload && selectorPayload.hooks && typeof selectorPayload.hooks === "object"
      ? selectorPayload.hooks
      : (selectorPayload && typeof selectorPayload === "object" ? selectorPayload : {});

    FF_APP.cfg = cfg || {};
    FF_APP.selectors = Object.keys(selectorHooks || {}).length ? selectorHooks : (w.FF_SELECTORS || {});

    return {
      cfg: FF_APP.cfg,
      selectors: FF_APP.selectors
    };
  }

  readConfig();

  var config = {
    env: getMeta("env") || "development",
    mode: getMeta("data-mode") || "demo",
    totalsVerified: getMeta("totals-verified") === "true",
    version: getMeta("version") || BUILD,
    buildId: getMeta("build-id") || BUILD,
    stripePk: getMeta("stripe-pk") || "",
    stripeIntentEndpoint: getMeta("stripe-intent-endpoint") || "/payments/stripe/intent",
    stripeReturnUrl: getMeta("stripe-return-url") || getCanonicalUrl(),
    stripeJs: getMeta("stripe-js") || "https://js.stripe.com/v3/",
    paypalClientId: getMeta("paypal-client-id") || "",
    paypalCurrency: getMeta("paypal-currency") || "USD",
    paypalIntent: getMeta("paypal-intent") || "capture",
    paypalCreateEndpoint: getMeta("paypal-create-endpoint") || "/payments/paypal/order",
    paypalCaptureEndpoint: getMeta("paypal-capture-endpoint") || "/payments/paypal/capture",
    paymentsConfigEndpoint: getMeta("payments-config-endpoint") || "/payments/config",
    paymentsHealthEndpoint: getMeta("payments-health-endpoint") || "/payments/health",
    statusEndpoint: getMeta("status-endpoint") || "/api/status",
    coverFeesExact: getMeta("cover-fees-exact") === "true",
    requireEmail: getMeta("require-email") === "true",
    termsUrl: getMeta("terms-url") || "#terms",
    privacyUrl: getMeta("privacy-url") || "#privacy",
    totalsSource: getMeta("totals-source") || "preview",
    csrfToken: (qs('meta[name="csrf-token"]') || {}).content || ""
  };

  var dom = {
    live: qs('[data-ff-live]'),
    toasts: qs('[data-ff-toasts]'),
    backToTop: qs('[data-ff-backtotop]'),
    tabs: qs('[data-ff-tabs]'),
    donationForm: byId("donationForm"),
    sponsorForm: byId("sponsorForm"),
    donationAmount: qs("[data-ff-amount-input]"),
    summaryAmount: qs("[data-ff-summary-amount]"),
    donationError: qs("[data-ff-checkout-error]"),
    donationStatus: qs("[data-ff-checkout-status]"),
    sponsorError: qs("[data-ff-sponsor-error]"),
    sponsorStatus: qs("[data-ff-sponsor-status]"),
    sponsorSuccess: qs("[data-ff-sponsor-success]"),
    stripeMsg: qs("[data-ff-stripe-msg]"),
    stripeError: qs("[data-ff-stripe-error]"),
    paypalMsg: qs("[data-ff-paypal-msg]"),
    paypalError: qs("[data-ff-paypal-error]"),
    paymentMount: qs("[data-ff-stripe-mount]"),
    paypalMount: qs("[data-ff-paypal-mount]"),
    checkoutStage: qs('[data-ff-checkout-stage="form"]'),
    checkoutSuccess: qs("[data-ff-checkout-success]"),
    videoModal: qs("[data-ff-video-modal]"),
    videoMount: qs("[data-ff-video-mount]"),
    videoStatus: qs("[data-ff-video-status]"),
    videoTitle: qs("[data-ff-video-title]"),
    sponsorWall: qs("[data-ff-sponsor-wall]"),
    sponsorWallEmpty: qs("[data-ff-sponsor-wall-empty]"),
    vipSpotlight: qs("[data-ff-vip-spotlight]"),
    tickerTrack: qs("[data-ff-ticker-track]"),
    qrImages: qsa("[data-ff-qr-src]"),
    focusProbe: byId("ff_focus_probe") || byId("__ff_focus_probe__"),
    activityFeed: qs("[data-ff-live-feed-list]") || qs("[data-ff-live-feed]"),
    ffLive: byId("ffLive"),
    onboardingModal: qs("[data-ff-onboard-modal]"),
    checkoutSheet: qs("[data-ff-checkout-sheet]"),
    donateFormHook: qs("[data-ff-donate-form]"),
    drawerHook: qs("[data-ff-drawer]"),
    dynHook: qs("[data-ff-dyn]"),
    emailInput: qs("[data-ff-email]"),
    paymentElement: qs("[data-ff-payment-element]"),
    paypalSkeleton: qs("[data-ff-paypal-skeleton]"),
    sponsorModal: qs("[data-ff-sponsor-modal]"),
    sponsorSubmit: qs("[data-ff-sponsor-submit]"),
    stripeSkeleton: qs("[data-ff-stripe-skeleton]"),
    videoFrame: qs("[data-ff-video-frame]")
  };

  var overlays = {
    checkout: {
      id: "checkout",
      el: byId("checkout"),
      panel: qs("#checkout .ff-sheet__panel")
    },
    sponsor: {
      id: "sponsor-interest",
      el: byId("sponsor-interest"),
      panel: qs("#sponsor-interest .ff-modal__panel")
    },
    video: {
      id: "press-video",
      el: byId("press-video"),
      panel: qs("#press-video .ff-modal__panel")
    },
    terms: {
      id: "terms",
      el: byId("terms"),
      panel: qs("#terms .ff-modal__panel")
    },
    privacy: {
      id: "privacy",
      el: byId("privacy"),
      panel: qs("#privacy .ff-modal__panel")
    },
    drawer: {
      id: "drawer",
      el: byId("drawer"),
      panel: qs("#drawer .ff-drawer__panel")
    }
  };

  var state = {
    initialized: false,
    keyboardMode: false,
    lastFocused: null,
    openOverlayId: null,
    overlayReturnFocus: null,
    stripe: null,
    stripeElements: null,
    stripePaymentElement: null,
    stripeClientSecret: "",
    stripeIntentKey: "",
    stripeLoading: false,
    paypalLoading: false,
    paypalRenderedKey: "",
    stripeTimer: 0,
    paypalTimer: 0,
    socket: null,
    observer: null,
    lastPrefill: {},
    lastVideoSrc: "",
    lastVideoTitle: "",
    onboardingReady: false,
    onboardingCurrentStep: 1,
    liveTotals: {
      raised: null,
      goal: null,
      percent: null,
      remaining: null
    }
  };

  function setBoot(stage) {
    w.BOOT_KEY = stage;
    w.__FF_BOOT__ = stage;
    w.ff.version = BUILD;
    attr(root, "data-ff-boot", stage);
  }

  function setKeyboardMode(enabled) {
    state.keyboardMode = !!enabled;
    attr(root, "data-ff-input-mode", enabled ? "keyboard" : "pointer");
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function announce(message) {
    if (!message) return;
    if (dom.live) {
      dom.live.textContent = "";
      w.setTimeout(function () {
        dom.live.textContent = message;
      }, 10);
    }
  }

  function toast(message, kind) {
    if (!dom.toasts || !message) {
      announce(message);
      return;
    }

    var node = createEl("div", "ff-toast" + (kind ? " is-" + kind : ""), message);
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    dom.toasts.appendChild(node);
    announce(message);

    w.setTimeout(function () {
      node.style.opacity = "0";
      node.style.transform = "translateY(-4px)";
      w.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 180);
    }, 2800);
  }

  function lockScroll(locked) {
    var bodyEl = d.body || body;
    if (!bodyEl) return;
    body = bodyEl;

    if (locked) {
      attr(root, "data-ff-overlay-open", "true");
      attr(bodyEl, "data-ff-overlay-open", "true");
      bodyEl.style.overflow = "hidden";
      bodyEl.style.touchAction = "none";
    } else {
      attr(root, "data-ff-overlay-open", null);
      attr(bodyEl, "data-ff-overlay-open", null);
      bodyEl.style.overflow = "";
      bodyEl.style.touchAction = "";
    }
  }

  function applyOverlayState(overlay, open) {
    if (!overlay || !overlay.el) return;
    var el = overlay.el;
    if (open) {
      el.hidden = false;
      el.classList.add("is-open");
      attr(el, "data-open", "true");
      attr(el, "aria-hidden", "false");
      syncOverlayTriggerState(overlay.id, true);
      return;
    }
    el.classList.remove("is-open");
    attr(el, "data-open", "false");
    attr(el, "aria-hidden", "true");
    el.hidden = true;
    syncOverlayTriggerState(overlay.id, false);
  }

  function getOverlayById(id) {
    if (!id) return null;
    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      var overlay = overlays[keys[i]];
      if (overlay && overlay.id === id) return overlay;
    }
    return null;
  }

  function syncOverlayTriggerState(id, open) {
    var selectorMap = {
      "checkout": "[data-ff-open-checkout]",
      "sponsor-interest": "[data-ff-open-sponsor]",
      "press-video": "[data-ff-open-video]",
      "terms": "[data-ff-open-terms], a[href=\"#terms\"]",
      "privacy": "[data-ff-open-privacy], a[href=\"#privacy\"]",
      "drawer": "[data-ff-open-drawer]"
    };

    var selector = selectorMap[id];
    if (!selector) return;

    qsa(selector).forEach(function (node) {
      if (!node || !node.getAttribute) return;
      attr(node, "aria-expanded", open ? "true" : "false");
    });
  }

  function getAnyOpenOverlay() {
    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      var ov = overlays[keys[i]];
      if (!ov || !ov.el || ov.el.hidden) continue;
      if (ov.el.classList.contains("is-open")) return ov;
      if (ov.el.getAttribute("data-open") === "true") return ov;
      if (ov.el.getAttribute("aria-hidden") === "false") return ov;
      if (hasHashFor(ov.id)) return ov;
    }
    return null;
  }

  function focusPanel(overlay) {
    if (!overlay || !overlay.panel || !canFocus(overlay.panel)) return;
    w.requestAnimationFrame(function () {
      try {
        overlay.panel.focus({ preventScroll: false });
      } catch (err) {
        try {
          overlay.panel.focus();
        } catch (e) {}
      }
    });
  }

  function clearHashIfMatches(id) {
    if (id && w.location.hash === "#" + id && w.history && typeof w.history.pushState === "function") {
      w.history.pushState("", d.title, w.location.pathname + w.location.search);
    }
  }

  function closeOverlay(id, opts) {
    var overlay = getOverlayById(id);
    if (!overlay || !overlay.el) return;
    opts = opts || {};

    applyOverlayState(overlay, false);

    if (overlay.id === "press-video") {
      unmountVideo();
    }

    if (overlay.id === "checkout") {
      hideStatus(dom.donationError);
      hideStatus(dom.donationStatus);
      hideStatus(dom.stripeError);
      hideStatus(dom.paypalError);
      w.setTimeout(function () {
        resetCheckoutSuccess();
      }, 0);
    }

    if (state.openOverlayId === overlay.id) {
      state.openOverlayId = null;
    }

    if (!getAnyOpenOverlay()) {
      lockScroll(false);
    }

    if (opts.updateHash !== false) {
      clearHashIfMatches(overlay.id);
    }

    if (opts.returnFocus !== false) {
      var target =
        (canFocus(state.overlayReturnFocus) && state.overlayReturnFocus) ||
        (canFocus(state.lastFocused) && state.lastFocused) ||
        getFocusProbe();

      if (canFocus(target)) {
        w.requestAnimationFrame(function () {
          try {
            target.focus({ preventScroll: true });
          } catch (err) {
            try { target.focus(); } catch (e) {}
          }
        });
      }
      state.overlayReturnFocus = null;
      state.lastFocused = null;
    }
  }

  function closeAllOverlays(opts) {
    opts = opts || {};
    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      closeOverlay(overlays[keys[i]].id, {
        updateHash: false,
        returnFocus: false
      });
    }
    lockScroll(false);

    if (
      opts.updateHash !== false &&
      /^#(checkout|sponsor-interest|press-video|terms|privacy|drawer)$/.test(w.location.hash)
    ) {
      clearHashIfMatches(w.location.hash.slice(1));
    }
  }

  function openOverlay(id, opts) {
    var overlay = getOverlayById(id);
    opts = opts || {};
    if (!overlay || !overlay.el) return;

    var source = opts.source || d.activeElement || null;
    if (source) {
      state.lastFocused = source;
      state.overlayReturnFocus = source;
    }

    var keys = Object.keys(overlays);
    for (var i = 0; i < keys.length; i += 1) {
      var ov = overlays[keys[i]];
      if (ov && ov.id !== overlay.id) {
        closeOverlay(ov.id, {
          updateHash: false,
          returnFocus: false
        });
      }
    }

    applyOverlayState(overlay, true);
    state.openOverlayId = overlay.id;
    lockScroll(true);

    if (
      opts.updateHash !== false &&
      w.location.hash !== "#" + overlay.id &&
      w.history &&
      typeof w.history.pushState === "function"
    ) {
      w.history.pushState("", d.title, "#" + overlay.id);
    }

    if (overlay.id === "checkout") {
      hydrateQrImages();
      lazyInitPayments();
    }

    if (overlay.id === "press-video") {
      mountVideo(opts.video || {});
    }

    focusPanel(overlay);
  }

  function syncOverlayFromHash() {
    var hash = (w.location.hash || "").replace(/^#/, "");
    if (!hash) {
      closeAllOverlays({ updateHash: false, returnFocus: false });
      return;
    }

    var overlay = getOverlayById(hash);
    if (!overlay) return;

    openOverlay(hash, {
      updateHash: false,
      source: d.activeElement
    });
  }

  function currentCurrency() {
    var input = dom.donationForm ? qs('input[name="currency"]', dom.donationForm) : null;
    return input && input.value ? input.value : (config.paypalCurrency || "USD");
  }

  function parseAmount(raw) {
    if (raw == null) return 0;
    var cleaned = String(raw).replace(/[^0-9.]/g, "");
    var amount = Number(cleaned);
    if (!Number.isFinite(amount)) return 0;
    return clamp(Math.round(amount * 100) / 100, 0, 100000000);
  }

  function formatMoney(amount, currency) {
    var n = toNumber(amount, 0);
    var c = currency || currentCurrency();
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 0
      }).format(n);
    } catch (err) {
      return "$" + Math.round(n).toLocaleString("en-US");
    }
  }

  function getDonationData() {
    var form = dom.donationForm;
    if (!form) return null;

    var amount = parseAmount(dom.donationAmount ? dom.donationAmount.value : "");
    var email = ((dom.emailInput || qs('[name="email"]', form)) || {}).value || "";
    var name = (qs('[name="name"]', form) || {}).value || "";
    var message = (qs('[name="message"]', form) || {}).value || "";
    var teamId = (qs('input[data-ff-team-id][name="team_id"]', form) || {}).value || "default";
    var playerId = (qs('[name="player_id"]', form) || {}).value || "";
    var sponsorTier = (qs('[name="sponsor_tier"]', form) || {}).value || "";
    var sponsorAmount = (qs('[name="sponsor_amount"]', form) || {}).value || "";
    var currency = currentCurrency();

    return {
      amount: amount,
      email: String(email).trim(),
      name: String(name).trim(),
      message: String(message).trim(),
      team_id: String(teamId).trim() || "default",
      player_id: String(playerId).trim(),
      sponsor_tier: String(sponsorTier).trim(),
      sponsor_amount: sponsorAmount ? parseAmount(sponsorAmount) : 0,
      currency: currency,
      return_url: config.stripeReturnUrl || getCanonicalUrl()
    };
  }

  function hideStatus(node) {
    if (!node) return;
    node.hidden = true;
    node.textContent = "";
  }

  function showStatus(node, message) {
    if (!node) return;
    node.hidden = false;
    node.textContent = extractErrorMessage(message, "");
  }

  function setSurfaceHidden(node, hidden) {
    if (!node) return;
    node.hidden = !!hidden;
    attr(node, "aria-hidden", hidden ? "true" : "false");
  }

  function setStripeUiState(stateName, message) {
    var loading = stateName === "loading";
    if (dom.paymentMount) {
      attr(dom.paymentMount, "aria-busy", loading ? "true" : "false");
      attr(dom.paymentMount, "data-ff-state", stateName || "idle");
    }
    setSurfaceHidden(dom.stripeSkeleton, !loading);
    if (stateName !== "error") hideStatus(dom.stripeError);

    if (message) {
      showStatus(dom.stripeMsg, message);
    } else if (stateName === "idle") {
      hideStatus(dom.stripeMsg);
    }
  }

  function setPayPalUiState(stateName, message) {
    var loading = stateName === "loading";
    if (dom.paypalMount) {
      attr(dom.paypalMount, "aria-busy", loading ? "true" : "false");
      attr(dom.paypalMount, "data-ff-state", stateName || "idle");
    }
    setSurfaceHidden(dom.paypalSkeleton, !loading);
    if (stateName !== "error") hideStatus(dom.paypalError);

    if (message) {
      showStatus(dom.paypalMsg, message);
    } else if (stateName === "idle") {
      hideStatus(dom.paypalMsg);
    }
  }

  function focusSuccessState() {
    var target =
      byId("ffSuccessTitle") ||
      qs('[data-ff-checkout-success] .ff-h2, [data-ff-checkout-success] .ff-h3');

    if (!canFocus(target)) return;

    w.requestAnimationFrame(function () {
      try {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: false });
      } catch (err) {
        try { target.focus(); } catch (_) {}
      }
    });
  }

  function primePaymentSurfaces() {
    updateSummaryAmount(parseAmount(dom.donationAmount && dom.donationAmount.value));

    if (!dom.paymentMount) {
      setStripeUiState("unavailable", "Card checkout is unavailable right now.");
    } else {
      setStripeUiState("idle", "Enter an amount to prepare card checkout.");
    }

    if (!dom.paypalMount) {
      setPayPalUiState("unavailable", "PayPal is unavailable right now.");
    } else if (!config.paypalClientId) {
      setPayPalUiState("unavailable", "PayPal is not enabled on this page.");
    } else {
      setPayPalUiState("idle", "Enter an amount to load PayPal.");
    }
  }

  function getSponsorContactEmail() {
    var fromModal = dom.sponsorModal && dom.sponsorModal.getAttribute("data-ff-sponsor-contact");
    var meta =
      (document.querySelector('meta[name="ff-sponsor-contact"]') || {}).content ||
      (document.querySelector('meta[name="ff:ff-sponsor-contact"]') || {}).content ||
      "";
    return String(fromModal || meta || "").trim();
  }

  function showSponsorSuccessCard() {
    if (!dom.sponsorSuccess) return;

    var email = getSponsorContactEmail();
    var safeEmail = typeof escHtml === "function"
      ? escHtml(email)
      : String(email).replace(/[&<>"]/g, function (ch) {
          return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch];
        });

    var mailto = email ? ("mailto:" + safeEmail) : "";
    var contactLine = email
      ? 'Our sponsorship team will follow up at <a class="ff-link ff-sponsorSuccessCard__email" href="' + mailto + '">' + safeEmail + '</a>.'
      : "Our sponsorship team will follow up soon.";

    dom.sponsorSuccess.hidden = false;
    dom.sponsorSuccess.innerHTML = [
      '<section class="ff-sponsorSuccessCard" aria-label="Sponsor inquiry received">',
        '<div class="ff-sponsorSuccessCard__head">',
          '<div class="ff-sponsorSuccessCard__pillRow" role="list" aria-label="Sponsor inquiry status">',
            '<span class="ff-pill ff-pill--soft" role="listitem">Inquiry received</span>',
            '<span class="ff-pill ff-pill--ghost" role="listitem">Follow-up next</span>',
          "</div>",
          '<p class="ff-kicker ff-m-0">Thanks</p>',
          '<h3 class="ff-h3 ff-sponsorSuccessCard__title">Thanks — we received your inquiry.</h3>',
          '<p class="ff-help ff-sponsorSuccessCard__copy">We&rsquo;ll review your sponsorship interest and follow up with next steps, placement options, and timing.</p>',
          '<p class="ff-help ff-sponsorSuccessCard__meta">' + contactLine + "</p>",
        "</div>",
        '<div class="ff-sponsorSuccessCard__actions" role="group" aria-label="Sponsor inquiry actions">',
          '<button type="button" class="ff-btn ff-btn--secondary ff-btn--pill" data-ff-close-sponsor="">Return to page</button>',
          '<a class="ff-btn ff-btn--primary ff-btn--pill" href="#sponsors">View sponsor section</a>',
        "</div>",
      "</section>"
    ].join("");
  }

  function validateDonationForm() {
    var data = getDonationData();
    if (!data) return { ok: false, message: "Donation form is not available." };

    if (!data.amount || data.amount <= 0) {
      return { ok: false, field: "amount", message: "Enter a valid donation amount." };
    }

    if (!data.name) {
      return { ok: false, field: "name", message: "Enter your name before completing support." };
    }

    if (config.requireEmail && !isValidEmail(data.email)) {
      return { ok: false, field: "email", message: "Enter a valid email for your receipt." };
    }

    return { ok: true, data: data };
  }

  function validateSponsorForm() {
    if (!dom.sponsorForm) return { ok: false, message: "Sponsor form is not available." };

    var nameInput = qs('[name="sponsor_name"]', dom.sponsorForm);
    var emailInput = qs('[name="sponsor_email"]', dom.sponsorForm);
    var messageInput = qs('[name="sponsor_message"]', dom.sponsorForm);
    var tierInput = qs('[name="sponsor_tier"]', dom.sponsorForm);

    var payload = {
      sponsor_name: String(nameInput && nameInput.value || "").trim(),
      sponsor_email: String(emailInput && emailInput.value || "").trim(),
      sponsor_message: String(messageInput && messageInput.value || "").trim(),
      sponsor_tier: String(tierInput && tierInput.value || "").trim()
    };

    if (!payload.sponsor_name) {
      return { ok: false, field: "name", message: "Please add your name or business name." };
    }

    if (!isValidEmail(payload.sponsor_email)) {
      return { ok: false, field: "email", message: "Please enter a valid email address." };
    }

    return { ok: true, data: payload };
  }

  function setAmount(amount, opts) {
    if (!dom.donationAmount) return;
    var numeric = parseAmount(amount);
    dom.donationAmount.value = numeric ? String(numeric % 1 === 0 ? Math.round(numeric) : numeric) : "";

    try {
      w.localStorage.setItem(STORAGE_LAST_AMOUNT_KEY, dom.donationAmount.value);
    } catch (err) {}

    syncAmountChipState(numeric);
    updatePayMessages(numeric);
    updateSummaryAmount(numeric);

    if ((opts || {}).announce !== false && numeric > 0) {
      announce("Donation amount set to " + formatMoney(numeric) + ".");
    }

    scheduleStripeRefresh();
    schedulePaypalRefresh();
  }

  function syncAmountChipState(amount) {
    qsa("[data-ff-amount]").forEach(function (chip) {
      var value = parseAmount(chip.getAttribute("data-ff-amount"));
      var active = amount > 0 && value === amount;
      attr(chip, "aria-pressed", active ? "true" : "false");
      chip.classList.toggle("is-active", active);
    });
  }

  function updatePayMessages(amount) {
    if (dom.stripeMsg) {
      text(dom.stripeMsg, amount > 0 ? "Card entry will prepare for " + formatMoney(amount) + "." : "Enter an amount to prepare card checkout.");
    }
    if (dom.paypalMsg) {
      text(dom.paypalMsg, amount > 0 ? "PayPal will load for " + formatMoney(amount) + "." : "Enter an amount to load PayPal.");
    }
  }

  function updateSummaryAmount(amount) {
    if (!dom.summaryAmount) return;
    text(dom.summaryAmount, formatMoney(amount || 0));
  }

  function applyCheckoutPrefill(prefill) {
    if (!dom.donationForm) return;
    prefill = prefill || {};

    if (prefill.amount != null && prefill.amount !== "") {
      setAmount(prefill.amount, { announce: false });
    }

    ensureHiddenInput(dom.donationForm, "team_id", prefill.teamId || "default");
    ensureHiddenInput(dom.donationForm, "player_id", prefill.playerId || "");
    ensureHiddenInput(dom.donationForm, "sponsor_tier", prefill.sponsorTier || "");
    ensureHiddenInput(dom.donationForm, "sponsor_amount", prefill.sponsorAmount || "");

    state.lastPrefill = {
      amount: prefill.amount != null ? prefill.amount : "",
      teamId: prefill.teamId || "default",
      playerId: prefill.playerId || "",
      sponsorTier: prefill.sponsorTier || "",
      sponsorAmount: prefill.sponsorAmount || ""
    };
  }

  function applySponsorPrefill(prefill) {
    if (!dom.sponsorForm) return;
    prefill = prefill || {};
    var hidden = qs('[name="sponsor_tier"]', dom.sponsorForm);
    if (hidden) {
      hidden.value = prefill.sponsorTier || "";
    }
    syncSponsorTierState(prefill.sponsorTier || "");
  }

  function triggerPrefillFromNode(node) {
    if (!node) return {};
    return {
      amount: node.getAttribute("data-ff-amount") || node.getAttribute("data-ff-sponsor-amount") || "",
      teamId: node.getAttribute("data-ff-team-id") || "",
      playerId: node.getAttribute("data-ff-player-id") || "",
      sponsorTier: node.getAttribute("data-ff-sponsor-tier") || "",
      sponsorAmount: node.getAttribute("data-ff-sponsor-amount") || "",
      videoSrc: node.getAttribute("data-ff-video-src") || "",
      videoTitle: node.getAttribute("data-ff-video-title") || ""
    };
  }

  function hydrateQrImages() {
    dom.qrImages.forEach(function (img) {
      var src = img.getAttribute("data-ff-qr-src");
      if (src && img.getAttribute("src") !== src) {
        img.setAttribute("src", src);
      }
    });
  }

  function mountVideo(video) {
    if (!dom.videoMount) return;
    video = video || {};
    var src = video.src || state.lastVideoSrc || "";
    var title = video.title || state.lastVideoTitle || "Watch";

    if (!src) return;

    state.lastVideoSrc = src;
    state.lastVideoTitle = title;

    text(dom.videoTitle, title);
    text(dom.videoStatus, "Loading video…");

    while (dom.videoMount.firstChild) {
      dom.videoMount.removeChild(dom.videoMount.firstChild);
    }

    var iframe = d.createElement("iframe");
    iframe.setAttribute("src", src);
    iframe.setAttribute("title", title);
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "eager");
    dom.videoMount.appendChild(iframe);

    iframe.addEventListener("load", function () {
      text(dom.videoStatus, "Video ready.");
    }, { once: true });
  }

  function unmountVideo() {
    if (!dom.videoMount) return;
    while (dom.videoMount.firstChild) {
      dom.videoMount.removeChild(dom.videoMount.firstChild);
    }
    if (dom.videoStatus) text(dom.videoStatus, "Ready when you are.");
  }

  function syncSponsorTierState(activeTier) {
    qsa("[data-ff-sponsor-tier]").forEach(function (btn) {
      var tier = btn.getAttribute("data-ff-sponsor-tier") || "";
      var active = !!activeTier && tier === activeTier;
      attr(btn, "aria-pressed", active ? "true" : "false");
      btn.classList.toggle("is-active", active);
    });
  }

  function getFetchOptions(method, payload) {
    var headers = {
      "Accept": "application/json"
    };

    if (payload != null) {
      headers["Content-Type"] = "application/json";
    }

    if (config.csrfToken) {
      headers["X-CSRFToken"] = config.csrfToken;
      headers["X-CSRF-Token"] = config.csrfToken;
    }

    return {
      method: method || "GET",
      headers: headers,
      credentials: "same-origin",
      body: payload != null ? JSON.stringify(payload) : undefined
    };
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      return res.text().then(function (raw) {
        var data = safeJsonParse(raw || "{}", null);

        if (data == null) {
          data = raw ? { raw: raw } : {};
        }

        if (!res.ok) {
          var message = extractErrorMessage(data, "Request failed (" + res.status + ")");
          var err = new Error(message);
          err.status = res.status;
          err.data = data;
          err.raw = raw;
          throw err;
        }

        return data;
      });
    });
  }

  function getStripePublishableKey(responseData) {
    return (
      (responseData && (responseData.publishableKey || responseData.publishable_key)) ||
      config.stripePk ||
      ""
    );
  }

  function loadScript(src, id) {
    return new Promise(function (resolve, reject) {
      if (!src) {
        reject(new Error("Missing script source."));
        return;
      }

      function markLoaded(node) {
        if (!node) return;
        node.setAttribute("data-loaded", "true");
        node.setAttribute("data-ff-loaded", "true");
      }

      function globalReadyFor(requestedSrc) {
        var normalized = String(requestedSrc || "");
        if (/js\.stripe\.com\/v3/i.test(normalized)) return !!w.Stripe;
        if (/paypal\.com\/sdk\/js/i.test(normalized)) return !!(w.paypal && w.paypal.Buttons);
        return false;
      }

      function resolveIfReady(node) {
        if (!node) return false;

        if (
          node.getAttribute("data-loaded") === "true" ||
          node.getAttribute("data-ff-loaded") === "true"
        ) {
          resolve(node);
          return true;
        }

        if (globalReadyFor(src)) {
          markLoaded(node);
          resolve(node);
          return true;
        }

        return false;
      }

      if (id) {
        var existingById = byId(id);
        if (existingById) {
          if (resolveIfReady(existingById)) return;
          existingById.addEventListener("load", function () {
            markLoaded(existingById);
            resolve(existingById);
          }, { once: true });
          existingById.addEventListener("error", function () {
            reject(new Error("Failed to load " + src));
          }, { once: true });
          return;
        }
      }

      var existing = qsa('script[src]')[0];
      if (existing) {
        if (resolveIfReady(existing)) return;
        existing.addEventListener("load", function () {
          markLoaded(existing);
          resolve(existing);
        }, { once: true });
        existing.addEventListener("error", function () {
          reject(new Error("Failed to load " + src));
        }, { once: true });
        return;
      }

      var script = d.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.setAttribute("data-ff-dyn", "true");
      script.setAttribute("data-ff-loaded", "false");
      script.addEventListener("load", function () {
        markLoaded(script);
        resolve(script);
      }, { once: true });
      script.addEventListener("error", function () {
        reject(new Error("Failed to load " + src));
      }, { once: true });
      d.head.appendChild(script);
    });
  }

  function injectScript(src, id) {
    return loadScript(src, id);
  }

  function ensureStripeReady(publishableKey) {
    if (state.stripe && publishableKey === config.stripePk) {
      return Promise.resolve(state.stripe);
    }

    return loadScript(config.stripeJs, "ffStripeJs").then(function () {
      if (!w.Stripe) throw new Error("Stripe.js is unavailable.");

      var pk = publishableKey || config.stripePk;
      if (!pk) throw new Error("Stripe publishable key is missing.");

      config.stripePk = pk;
      state.stripe = w.Stripe(pk);
      return state.stripe;
    });
  }

  function getStripeIntentKey(data) {
    return [
      data.amount,
      data.currency,
      data.team_id,
      data.player_id,
      data.sponsor_tier,
      data.sponsor_amount
    ].join("|");
  }

  function createStripeIntent(data) {
    var amountCents = Math.max(0, Math.round(toNumber(data.amount, 0) * 100));
    var sponsorAmountCents = Math.max(0, Math.round(toNumber(data.sponsor_amount, 0) * 100));

    var payload = {
      amount_cents: amountCents,
      amount: data.amount,
      currency: data.currency,
      team_id: data.team_id,
      player_id: data.player_id,
      sponsor_tier: data.sponsor_tier,
      sponsor_amount: data.sponsor_amount,
      sponsor_amount_cents: sponsorAmountCents,
      return_url: data.return_url,
      name: data.name,
      email: data.email,
      message: data.message,
      donor_email: data.email,
      donor_name: data.name,
      donor_message: data.message
    };

    return fetchJson(config.stripeIntentEndpoint, getFetchOptions("POST", payload));
  }

  function destroyStripeElement() {
    try {
      if (state.stripePaymentElement) state.stripePaymentElement.unmount();
    } catch (err) {}

    state.stripePaymentElement = null;
    state.stripeElements = null;
    state.stripeClientSecret = "";
    state.stripeIntentKey = "";
  }

  function mountStripeElement(clientSecret) {
    if (!dom.paymentMount || !state.stripe) return Promise.resolve();

    if (state.stripeClientSecret === clientSecret && state.stripePaymentElement) {
      return Promise.resolve();
    }

    destroyStripeElement();

    state.stripeElements = state.stripe.elements({
      clientSecret: clientSecret,
      appearance: {
        theme: (root.getAttribute("data-theme") === "dark") ? "night" : "stripe"
      }
    });

    state.stripePaymentElement = state.stripeElements.create("payment", {
      layout: {
        type: "tabs",
        defaultCollapsed: false
      }
    });

    state.stripePaymentElement.mount(dom.paymentMount);
    state.stripeClientSecret = clientSecret;

    if (dom.stripeError) hideStatus(dom.stripeError);
    if (dom.stripeMsg) showStatus(dom.stripeMsg, "Card entry is ready.");

    return Promise.resolve();
  }

  function ensureStripeIntent(force) {
    if (!dom.paymentMount) {
      setStripeUiState("unavailable", "Card checkout is unavailable right now.");
      return Promise.reject(new Error("Stripe mount is unavailable."));
    }

    var validation = validateDonationForm();

    if (!validation.ok) {
      if (dom.stripeMsg) showStatus(dom.stripeMsg, validation.message || "Enter an amount to prepare card checkout.");
      return Promise.reject(new Error(validation.message || "Invalid donation data."));
    }

    var data = validation.data;
    var intentKey = getStripeIntentKey(data);

    if (!force && state.stripeIntentKey === intentKey && state.stripeClientSecret && state.stripePaymentElement) {
      return Promise.resolve({ clientSecret: state.stripeClientSecret });
    }

    if (state.stripeLoading) {
      return Promise.reject(new Error("Stripe is already preparing."));
    }

    state.stripeLoading = true;
    setStripeUiState("loading", "Preparing secure card entry…");

    return createStripeIntent(data)
      .then(function (response) {
        var clientSecret = response.clientSecret || response.client_secret || "";
        var publishableKey = getStripePublishableKey(response);

        if (!clientSecret) {
          throw new Error("Stripe intent response is missing a client secret.");
        }

        return ensureStripeReady(publishableKey).then(function () {
          return mountStripeElement(clientSecret).then(function () {
            state.stripeIntentKey = intentKey;
            setStripeUiState("ready", "Secure card entry is ready.");
            return response;
          });
        });
      })
      .catch(function (err) {
        var message = extractErrorMessage(err, "Unable to prepare Stripe checkout.");
        setStripeUiState("error", "Card checkout needs attention.");
        if (dom.stripeError) showStatus(dom.stripeError, message);
        throw err;
      })
      .finally(function () {
        state.stripeLoading = false;
      });
  }

  function submitStripePayment() {
    var validation = validateDonationForm();
    if (!validation.ok) {
      throw new Error(validation.message || "Please correct the donation form.");
    }

    if (!state.stripe || !state.stripeElements) {
      throw new Error("Stripe is not ready yet.");
    }

    return state.stripe.confirmPayment({
      elements: state.stripeElements,
      confirmParams: {
        return_url: validation.data.return_url
      },
      redirect: "if_required"
    }).then(function (result) {
      if (result.error) {
        throw new Error(result.error.message || "Payment confirmation failed.");
      }
      return result;
    });
  }

  function showCheckoutSuccess(message) {
    hideStatus(dom.donationError);
    hideStatus(dom.donationStatus);
    hideStatus(dom.stripeError);
    hideStatus(dom.paypalError);

    if (dom.checkoutStage) {
      dom.checkoutStage.hidden = true;
      attr(dom.checkoutStage, "aria-hidden", "true");
    }

    if (dom.checkoutSuccess) {
      dom.checkoutSuccess.hidden = false;
      attr(dom.checkoutSuccess, "aria-hidden", "false");
    }

    focusSuccessState();
    if (message) announce(message);
  }

  function resetCheckoutSuccess() {
    if (dom.checkoutStage) {
      dom.checkoutStage.hidden = false;
      attr(dom.checkoutStage, "aria-hidden", "false");
    }

    if (dom.checkoutSuccess) {
      dom.checkoutSuccess.hidden = true;
      attr(dom.checkoutSuccess, "aria-hidden", "true");
    }

    hideStatus(dom.donationError);
    hideStatus(dom.donationStatus);
    hideStatus(dom.stripeError);
    hideStatus(dom.paypalError);
    primePaymentSurfaces();
  }

  function loadPayPalSdk() {
    if (!config.paypalClientId) {
      return Promise.reject(new Error("PayPal is not configured."));
    }

    if (w.paypal && w.paypal.Buttons) {
      return Promise.resolve(w.paypal);
    }

    var params = [
      "client-id=" + encodeURIComponent(config.paypalClientId),
      "currency=" + encodeURIComponent(config.paypalCurrency || "USD"),
      "intent=" + encodeURIComponent(config.paypalIntent || "capture"),
      "components=buttons"
    ].join("&");

    return loadScript("https://www.paypal.com/sdk/js?" + params, "ffPayPalSdk").then(function () {
      if (!w.paypal || !w.paypal.Buttons) throw new Error("PayPal SDK is unavailable.");
      return w.paypal;
    });
  }

  function createPayPalOrder(data) {
    var amountCents = Math.max(0, Math.round(toNumber(data.amount, 0) * 100));
    var sponsorAmountCents = Math.max(0, Math.round(toNumber(data.sponsor_amount, 0) * 100));

    var payload = {
      amount_cents: amountCents,
      amount: data.amount,
      currency: data.currency,
      team_id: data.team_id,
      player_id: data.player_id,
      sponsor_tier: data.sponsor_tier,
      sponsor_amount: data.sponsor_amount,
      sponsor_amount_cents: sponsorAmountCents,
      name: data.name,
      email: data.email,
      message: data.message,
      donor_email: data.email,
      donor_name: data.name,
      donor_message: data.message
    };

    return fetchJson(config.paypalCreateEndpoint, getFetchOptions("POST", payload)).then(function (res) {
      return res.orderID || res.orderId || res.id || "";
    });
  }

  function capturePayPalOrder(data, orderID) {
    var payload = {
      order_id: orderID,
      amount_cents: Math.max(0, Math.round(toNumber(data.amount, 0) * 100)),
      amount: data.amount,
      currency: data.currency,
      team_id: data.team_id,
      email: data.email,
      name: data.name,
      donor_email: data.email,
      donor_name: data.name
    };

    if (!config.paypalCaptureEndpoint) {
      return Promise.resolve({});
    }

    return fetchJson(config.paypalCaptureEndpoint, getFetchOptions("POST", payload));
  }

  function clearPaypalMount() {
    if (!dom.paypalMount) return;
    while (dom.paypalMount.firstChild) {
      dom.paypalMount.removeChild(dom.paypalMount.firstChild);
    }
    dom.paypalMount.setAttribute("data-rendered", "false");
    attr(dom.paypalMount, "data-ff-state", "idle");
  }

  function renderPayPalButtons() {
    if (!dom.paypalMount) {
      setPayPalUiState("unavailable", "PayPal is unavailable right now.");
      return Promise.reject(new Error("PayPal mount is unavailable."));
    }

    var validation = validateDonationForm();
    if (!validation.ok) {
      if (dom.paypalMsg) showStatus(dom.paypalMsg, validation.message || "Enter an amount to load PayPal.");
      return Promise.reject(new Error(validation.message || "Invalid donation data."));
    }

    var data = validation.data;
    var renderKey = [data.amount, data.currency, data.team_id, data.player_id].join("|");

    if (state.paypalRenderedKey === renderKey && dom.paypalMount && dom.paypalMount.getAttribute("data-rendered") === "true") {
      return Promise.resolve();
    }

    if (!config.paypalClientId) {
      setPayPalUiState("unavailable", "PayPal is not enabled on this page.");
      return Promise.reject(new Error("PayPal is not configured."));
    }

    if (state.paypalLoading) {
      return Promise.reject(new Error("PayPal is already loading."));
    }

    state.paypalLoading = true;
    setPayPalUiState("loading", "Loading PayPal…");

    return loadPayPalSdk()
      .then(function (paypal) {
        clearPaypalMount();
        if (!dom.paypalMount) throw new Error("PayPal mount is missing.");

        return paypal.Buttons({
          style: {
            layout: "vertical",
            shape: "pill",
            label: "paypal"
          },
          createOrder: function () {
            return createPayPalOrder(getDonationData()).then(function (orderID) {
              if (!orderID) throw new Error("PayPal order creation failed.");
              return orderID;
            });
          },
          onApprove: function (dataApprove) {
            return capturePayPalOrder(getDonationData(), dataApprove.orderID).then(function () {
              showCheckoutSuccess("Donation received. Your confirmation will arrive by email shortly.");
              toast("PayPal donation completed.", "success");
            });
          },
          onError: function (err) {
            var message = extractErrorMessage(err, "PayPal checkout failed.");
            if (dom.paypalError) showStatus(dom.paypalError, message);
          },
          onCancel: function () {
            setPayPalUiState("idle", "PayPal checkout cancelled.");
          }
        }).render(dom.paypalMount).then(function () {
          dom.paypalMount.setAttribute("data-rendered", "true");
          state.paypalRenderedKey = renderKey;
          setPayPalUiState("ready", "PayPal is ready.");
        });
      })
      .catch(function (err) {
        var message = extractErrorMessage(err, "Unable to load PayPal.");
        setPayPalUiState("error", "PayPal needs attention.");
        if (dom.paypalError) showStatus(dom.paypalError, message);
        throw err;
      })
      .finally(function () {
        state.paypalLoading = false;
      });
  }

  function lazyInitPayments() {
    var amount = parseAmount(dom.donationAmount && dom.donationAmount.value);
    primePaymentSurfaces();
    updatePayMessages(amount);
    updateSummaryAmount(amount);
    if (amount > 0) {
      scheduleStripeRefresh();
      schedulePaypalRefresh();
    }
  }

  function scheduleStripeRefresh() {
    if (state.stripeTimer) w.clearTimeout(state.stripeTimer);
    state.stripeTimer = w.setTimeout(function () {
      if (state.openOverlayId === "checkout") {
        ensureStripeIntent(false).catch(function () {});
      }
    }, 320);
  }

  function schedulePaypalRefresh() {
    if (state.paypalTimer) w.clearTimeout(state.paypalTimer);
    state.paypalTimer = w.setTimeout(function () {
      if (state.openOverlayId === "checkout" && config.paypalClientId) {
        renderPayPalButtons().catch(function () {});
      }
    }, 340);
  }

  function submitDonationForm(event) {
    if (event) event.preventDefault();

    hideStatus(dom.donationError);
    hideStatus(dom.donationStatus);
    hideStatus(dom.stripeError);

    var validation = validateDonationForm();
    if (!validation.ok) {
      showStatus(dom.donationError, validation.message || "Please review your donation details.");
      toast(validation.message || "Please review your donation details.", "error");
      return;
    }

    if (!dom.paymentMount && config.paypalClientId) {
      showStatus(dom.donationError, "Card checkout is unavailable right now. Use the PayPal button below to complete support.");
      toast("Use PayPal below to complete support.", "info");
      return;
    }

    if (!dom.paymentMount) {
      showStatus(dom.donationError, "Card checkout is unavailable right now.");
      toast("Card checkout is unavailable right now.", "error");
      return;
    }

    showStatus(dom.donationStatus, "Preparing secure payment…");

    ensureStripeIntent(false)
      .then(function () {
        showStatus(dom.donationStatus, "Confirming payment…");
        return submitStripePayment();
      })
      .then(function () {
        hideStatus(dom.donationStatus);
        showCheckoutSuccess("Donation received. Your confirmation will arrive by email shortly.");
        toast("Donation received.", "success");
      })
      .catch(function (err) {
        var message = extractErrorMessage(err, "Unable to complete the donation.");
        hideStatus(dom.donationStatus);
        showStatus(dom.donationError, message);
        toast(message, "error");
      });
  }

  function submitSponsorForm(event) {
    if (event) event.preventDefault();

    hideStatus(dom.sponsorError);
    hideStatus(dom.sponsorStatus);
    hideStatus(dom.sponsorSuccess);

    var validation = validateSponsorForm();
    if (!validation.ok) {
      showStatus(dom.sponsorError, validation.message || "Please review your sponsor details.");
      toast(validation.message || "Please review your sponsor details.", "error");
      return;
    }

    showStatus(dom.sponsorStatus, "Sending your inquiry…");

    var endpoint = (FF_APP.cfg && FF_APP.cfg.sponsorEndpoint) || "/api/sponsors/inquiry";

    fetchJson(endpoint, getFetchOptions("POST", validation.data))
      .then(function () {
        hideStatus(dom.sponsorStatus);
        showSponsorSuccessCard();
        toast("Sponsor inquiry received.", "success");
        announce("Sponsor inquiry received.");

        try { dom.sponsorForm.reset(); } catch (err) {}
        syncSponsorTierState("");

        if (dom.sponsorSuccess && typeof dom.sponsorSuccess.focus === "function") {
          try {
            dom.sponsorSuccess.setAttribute("tabindex", "-1");
            dom.sponsorSuccess.focus({ preventScroll: false });
          } catch (_) {}
        }
      })
      .catch(function (err) {
        var message = extractErrorMessage(err, "Unable to send your sponsor inquiry.");
        hideStatus(dom.sponsorStatus);
        showStatus(dom.sponsorError, message);
        toast(message, "error");
      });
  }

  function shareFundraiser() {
    var url = getCanonicalUrl();
    var title = d.title || "FutureFunded";
    var shareText = "Support this fundraiser";
    var nav = w.navigator || {};

    if (nav.share) {
      nav.share({
        title: title,
        text: shareText,
        url: url
      }).then(function () {
        toast("Link shared.", "success");
      }).catch(function () {});
      return;
    }

    if (nav.clipboard && nav.clipboard.writeText) {
      nav.clipboard.writeText(url).then(function () {
        toast("Link copied to clipboard.", "success");
      }).catch(function () {
        toast(url, "info");
      });
      return;
    }

    toast(url, "info");
  }

  function syncScrollSpy() {
    var links = qsa('[data-ff-scrollspy] a[href^="#"], .ff-tabs a[href^="#"], .ff-footer__link[href^="#"]');
    var sections = qsa("main[id], main section[id], #content section[id]");

    if (!("IntersectionObserver" in w) || !sections.length || !links.length) return;

    function setActive(id) {
      links.forEach(function (link) {
        var href = link.getAttribute("href") || "";
        var active = href === "#" + id;
        if (active) {
          attr(link, "aria-current", "true");
          link.classList.add("is-active");
        } else {
          link.removeAttribute("aria-current");
          link.classList.remove("is-active");
        }
      });
    }

    state.observer = new w.IntersectionObserver(function (entries) {
      var visible = entries.filter(function (entry) { return entry.isIntersecting; });
      if (!visible.length) return;
      visible.sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      setActive(visible[0].target.id);
    }, {
      rootMargin: "-20% 0px -60% 0px",
      threshold: [0.15, 0.3, 0.6]
    });

    sections.forEach(function (section) {
      if (section.id) state.observer.observe(section);
    });
  }

  function updateTotals(payload) {
    if (!payload) return;

    var raised = toNumber(payload.raised != null ? payload.raised : payload.amount_raised, state.liveTotals.raised || 0);
    var goal = toNumber(payload.goal != null ? payload.goal : payload.fundraiser_goal, state.liveTotals.goal || 0);
    var percent = goal > 0 ? clamp(Math.floor((raised / goal) * 100), 0, 100) : 0;
    var remaining = Math.max(goal - raised, 0);

    state.liveTotals = {
      raised: raised,
      goal: goal,
      percent: percent,
      remaining: remaining
    };

    qsa("[data-ff-raised]").forEach(function (node) {
      text(node, formatMoney(raised));
    });

    qsa("[data-ff-goal]").forEach(function (node) {
      text(node, formatMoney(goal));
    });

    qsa("[data-ff-pct]").forEach(function (node) {
      if (node.tagName === "PROGRESS") {
        node.value = percent;
        node.textContent = percent + "%";
      } else {
        text(node, percent + "%");
      }
    });

    qsa("[data-ff-percent]").forEach(function (node) {
      text(node, percent + "%");
    });

    var heroProgressText = byId("heroPanelProgressText");
    if (heroProgressText) {
      text(heroProgressText, formatMoney(raised) + " / " + formatMoney(goal));
    }

    qsa(".ff-progressCompact__summary .ff-help.ff-muted").forEach(function (node) {
      if (/remaining/i.test(node.textContent || "")) {
        text(node, formatMoney(remaining) + " remaining");
      }
    });
  }

  function sponsorWallHasContent() {
    if (!dom.sponsorWall) return false;
    var kids = Array.prototype.slice.call(dom.sponsorWall.children || []);
    if (!kids.length) return false;

    return kids.some(function (el) {
      return !!el.querySelector("strong, img, a[href]");
    });
  }

  function renderSponsorWall(items) {
    if (!dom.sponsorWall) return;
    var sponsors = Array.isArray(items) ? items.filter(Boolean) : [];

    while (dom.sponsorWall.firstChild) {
      dom.sponsorWall.removeChild(dom.sponsorWall.firstChild);
    }

    if (!sponsors.length) {
      if (dom.sponsorWallEmpty) dom.sponsorWallEmpty.hidden = false;
      return;
    }

    sponsors.forEach(function (item) {
      var cell = createEl("div", "ff-sponsorWall__item");
      cell.setAttribute("role", "listitem");

      var card = createEl("div", "ff-card ff-pad");
      var stack = createEl("div", "ff-stack");

      if (item.logo || item.logo_url) {
        var img = d.createElement("img");
        img.src = item.logo || item.logo_url;
        img.alt = (item.name || item.title || "Sponsor") + " logo";
        img.loading = "lazy";
        img.decoding = "async";
        img.style.maxHeight = "2.25rem";
        img.style.width = "auto";
        stack.appendChild(img);
      }

      stack.appendChild(createEl("strong", "", item.name || item.title || "Sponsor"));
      stack.appendChild(createEl("p", "ff-help ff-muted", item.tier ? String(item.tier).toUpperCase() : "Sponsor"));

      if (item.url) {
        var link = d.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "ff-link ff-help";
        link.textContent = "Visit sponsor";
        stack.appendChild(link);
      }

      card.appendChild(stack);
      cell.appendChild(card);
      dom.sponsorWall.appendChild(cell);
    });

    if (dom.sponsorWallEmpty) dom.sponsorWallEmpty.hidden = !sponsors.length ? false : true;
  }

  function renderVipSpotlight(item) {
    if (!dom.vipSpotlight) return;

    while (dom.vipSpotlight.firstChild) {
      dom.vipSpotlight.removeChild(dom.vipSpotlight.firstChild);
    }

    if (!item) {
      dom.vipSpotlight.appendChild(createEl("p", "ff-help ff-m-0", "Sponsors may rotate here during high-traffic periods."));
      dom.vipSpotlight.appendChild(createEl("p", "ff-help ff-muted ff-mt-1 ff-mb-0", "VIP recognition is reviewed and placed with care."));
      return;
    }

    var title = createEl("p", "ff-help ff-m-0");
    var strong = createEl("strong", "", item.name || item.title || "VIP sponsor");
    title.appendChild(strong);
    title.appendChild(d.createTextNode(" is in the spotlight."));
    dom.vipSpotlight.appendChild(title);
    dom.vipSpotlight.appendChild(createEl("p", "ff-help ff-muted ff-mt-1 ff-mb-0", item.message || "Thank you for supporting the program."));
  }

  function pushTickerItem(payload) {
    if (!dom.tickerTrack) return;

    var msg = "";
    if (typeof payload === "string") {
      msg = payload;
    } else if (payload && payload.message) {
      msg = payload.message;
    } else if (payload && payload.amount) {
      msg = formatMoney(payload.amount) + " received";
    }

    if (!msg) return;

    var placeholder = qs("p", dom.tickerTrack);
    if (placeholder && /activity appears here/i.test(placeholder.textContent || "")) {
      placeholder.parentNode.removeChild(placeholder);
    }

    var item = createEl("span", "ff-pill ff-pill--soft", msg);
    item.setAttribute("role", "listitem");
    dom.tickerTrack.appendChild(item);

    while (dom.tickerTrack.children.length > 8) {
      dom.tickerTrack.removeChild(dom.tickerTrack.firstChild);
    }
  }

  function pushActivityItem(message) {
    if (!dom.activityFeed || !message) return;

    var item = createEl("div", "ff-liveFeed__item ff-activityFeed__item", message);
    dom.activityFeed.insertBefore(item, dom.activityFeed.firstChild || null);

    while (dom.activityFeed.children.length > 5) {
      dom.activityFeed.removeChild(dom.activityFeed.lastChild);
    }
  }

  function initSocket() {
    if (state.socket || !w.io || root.getAttribute("data-ff-webdriver") === "true") return;

    var socket;
    try {
      socket = w.io();
      state.socket = socket;
    } catch (err) {
      return;
    }

    function bind(eventName, handler) {
      socket.on(eventName, handler);
    }

    [
      "totals:update",
      "fundraiser:update",
      "donation:update",
      "ff:totals"
    ].forEach(function (name) {
      bind(name, function (payload) {
        if (payload && (payload.raised != null || payload.amount_raised != null || payload.goal != null || payload.fundraiser_goal != null)) {
          updateTotals(payload);
        }
        if (payload && payload.message) pushTickerItem(payload.message);
        if (payload && payload.message) pushActivityItem(payload.message);
      });
    });

    [
      "sponsors:update",
      "ff:sponsors"
    ].forEach(function (name) {
      bind(name, function (payload) {
        renderSponsorWall(payload && (payload.sponsors || payload.items || []));
      });
    });

    [
      "vip:update",
      "ff:vip"
    ].forEach(function (name) {
      bind(name, function (payload) {
        renderVipSpotlight(payload && (payload.vip || payload.item || payload));
      });
    });

    [
      "ticker:update",
      "ff:ticker"
    ].forEach(function (name) {
      bind(name, function (payload) {
        pushTickerItem(payload);
      });
    });

    bind("donation", function (payload) {
      if (!payload) return;
      var donor = payload.name || payload.donor_name || "Someone";
      var amount = payload.amount ? formatMoney(payload.amount) : "a gift";
      pushActivityItem(donor + " donated " + amount);
    });

    bind("sponsor", function (payload) {
      if (!payload) return;
      var name = payload.name || payload.sponsor_name || "A sponsor";
      pushActivityItem(name + " became a sponsor");
    });

    bind("toast", function (payload) {
      if (!payload) return;
      toast(payload.message || "Update received.", payload.kind || "info");
    });
  }

  function inspectPaymentReturn() {
    var params = new URLSearchParams(w.location.search);
    var successish = !!(
      params.get("payment_intent") ||
      params.get("payment_intent_client_secret") ||
      params.get("ff_success") === "1" ||
      params.get("paypal_success") === "1"
    );

    if (!successish) {
      var keys = ["checkout", "payment", "donation", "status", "success"];
      for (var i = 0; i < keys.length; i += 1) {
        var value = String(params.get(keys[i]) || "").toLowerCase();
        if (
          value === "1" ||
          value === "true" ||
          value === "success" ||
          value === "paid" ||
          value === "complete" ||
          value === "completed"
        ) {
          successish = true;
          break;
        }
      }
    }

    if (successish) {
      showCheckoutSuccess("Donation received. Your confirmation will arrive by email shortly.");
    }
  }

  function restoreLastAmount() {
    if (!dom.donationAmount) return;

    if (dom.donationAmount.value) {
      syncAmountChipState(parseAmount(dom.donationAmount.value));
      return;
    }

    try {
      var last = w.localStorage.getItem(STORAGE_LAST_AMOUNT_KEY);
      if (last) setAmount(last, { announce: false });
    } catch (err) {}
  }

  function applySavedTheme() {
    var stored = "";
    try {
      stored = w.localStorage.getItem(STORAGE_THEME_KEY) || "";
    } catch (err) {}

    if (stored === "light" || stored === "dark") {
      attr(root, "data-theme", stored);
    }

    syncThemeButtons();
  }

  function syncThemeButtons() {
    var current = root.getAttribute("data-theme") || "light";
    qsa("[data-ff-theme-toggle]").forEach(function (btn) {
      attr(btn, "aria-pressed", current === "dark" ? "true" : "false");
      attr(btn, "aria-label", current === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  function toggleTheme() {
    var current = root.getAttribute("data-theme") || "light";
    var next = current === "dark" ? "light" : "dark";
    attr(root, "data-theme", next);
    syncThemeButtons();

    try {
      w.localStorage.setItem(STORAGE_THEME_KEY, next);
    } catch (err) {}

    if (state.stripe && state.stripeClientSecret && state.stripePaymentElement) {
      ensureStripeIntent(true).catch(function () {});
    }
  }

  function fallbackLabelFromImg(img) {
    var alt = (img.getAttribute("alt") || "").trim();
    if (alt) return alt.replace(/\s+photo$/i, "").replace(/\s+logo$/i, "");
    var labeledParent = img.closest("[aria-label]");
    return labeledParent ? (labeledParent.getAttribute("aria-label") || "Program media").trim() : "Program media";
  }

  function markMissingMedia(img) {
    if (!img || img.dataset.ffFallbackBound === "true") return;
    img.dataset.ffFallbackBound = "true";

    function applyFallback() {
      var wrap = img.closest(".ff-teamCard__media, .ff-teamCard__mediaBackdrop") ||
        img.closest(".ff-storyPoster") ||
        img.closest("") ||
        img.parentElement;

      if (!wrap) return;

      wrap.classList.add("is-media-missing");
      if (!wrap.getAttribute("data-ff-fallback-label")) {
        wrap.setAttribute("data-ff-fallback-label", prettyLabel(fallbackLabelFromImg(img)));
      }
      img.setAttribute("aria-hidden", "true");
    }

    img.addEventListener("error", applyFallback, { once: true });

    if (img.complete && (!img.naturalWidth || !img.naturalHeight)) {
      applyFallback();
    }
  }

  function bindMediaFallbacks() {
    qsa(".ff-teamCard__img, .ff-storyPoster__img, __img").forEach(markMissingMedia);
    qsa(".is-media-missing, .ff-teamCard__media, .ff-teamCard__mediaBackdrop.is-media-missing, .ff-storyPoster.is-media-missing, .is-media-missing").forEach(function (node) {
      var current = node.getAttribute("data-ff-fallback-label") || "";
      node.setAttribute("data-ff-fallback-label", prettyLabel(current));
    });
  }


  /* FF_BRAND_WORDMARK_DEDUPE_V1_START */
  function brandComparableText(value) {
    return String(value == null ? "" : value)
      .replace(/\b(logo|wordmark|logotype|mark)\b/gi, " ")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9 ]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function sameBrandText(a, b) {
    var aa = brandComparableText(a);
    var bb = brandComparableText(b);
    if (!aa || !bb) return false;
    return aa === bb || aa.indexOf(bb) !== -1 || bb.indexOf(aa) !== -1;
  }

  function isLikelyWordmarkImage(img, referenceText) {
    if (!img) return false;

    var alt = img.getAttribute("alt") || "";
    var src = img.getAttribute("src") || "";
    var aria = img.getAttribute("aria-label") || "";
    var title = img.getAttribute("title") || "";
    var width = img.naturalWidth || img.width || 0;
    var height = img.naturalHeight || img.height || 0;
    var ratio = width > 0 && height > 0 ? (width / height) : 0;

    var hinted = /wordmark|logotype|logo-wide|connect-atx|futurefunded/i.test(
      [src, alt, aria, title].join(" ")
    );

    var matchesText = sameBrandText([alt, aria, title].join(" "), referenceText || "");

    return !!(hinted || matchesText || ratio >= 1.85);
  }

  function resetManagedBrandNodes(scope) {
    if (!scope) return;
    qsa('[data-ff-brand-managed="true"]', scope).forEach(function (node) {
      node.classList.remove("ff-sr");
      node.removeAttribute("data-ff-brand-managed");
    });
    attr(scope, "data-ff-brand-wordmark", null);
  }

  function visuallyDedupBrandNode(node) {
    if (!node) return;
    node.classList.add("ff-sr");
    attr(node, "data-ff-brand-managed", "true");
  }

  function dedupeBrandBlock(scope, selectors) {
    if (!scope || !selectors) return;

    resetManagedBrandNodes(scope);

    var logo = qs(selectors.logo, scope);
    var title = qs(selectors.title, scope);
    var sub = selectors.sub ? qs(selectors.sub, scope) : null;

    if (!logo || !title) return;

    var titleText = (title.textContent || "").trim();
    var subText = sub ? (sub.textContent || "").trim() : "";
    var logoText = [
      logo.getAttribute("alt") || "",
      logo.getAttribute("aria-label") || "",
      logo.getAttribute("title") || ""
    ].join(" ").trim();

    var reference = titleText || subText || logoText;
    if (!isLikelyWordmarkImage(logo, reference)) return;

    var duplicatedTitle = sameBrandText(logoText, titleText);
    var duplicatedSub = sameBrandText(logoText, subText) || (subText && sameBrandText(titleText, subText));

    attr(scope, "data-ff-brand-wordmark", "true");

    if (duplicatedTitle) visuallyDedupBrandNode(title);
    if (sub && duplicatedSub) visuallyDedupBrandNode(sub);
  }

  function initBrandWordmarkDedupe() {
    var topbar = byId("ffTopbar");
    var drawer = byId("drawer");

    function run() {
      dedupeBrandBlock(topbar || byId("ffTopbar"), {
        logo: ".ff-topbarBrand__logo, .ff-topbarBrand img, .ff-platformBrand__disc img",
        title: ".ff-topbarBrand__text, .ff-brand__title",
        sub: ".ff-topbarBrand__sub, .ff-brand__sub"
      });

      dedupeBrandBlock(drawer || byId("drawer"), {
        logo: ".ff-drawer__orgLogo, .ff-drawer__head img",
        title: "#ffDrawerTitle, .ff-brand__title",
        sub: "#ffDrawerDesc, .ff-brand__sub"
      });
    }

    run();

    if (initBrandWordmarkDedupe._bound) return;
    initBrandWordmarkDedupe._bound = true;

    var Observer = w.MutationObserver;
    if (!Observer) return;

    var scheduled = false;
    function rerun() {
      if (scheduled) return;
      scheduled = true;
      w.requestAnimationFrame(function () {
        scheduled = false;
        run();
      });
    }

    [topbar, drawer].forEach(function (node) {
      if (!node) return;
      var observer = new Observer(rerun);
      observer.observe(node, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "src", "alt", "aria-label", "title"]
      });
    });
  }
  /* FF_BRAND_WORDMARK_DEDUPE_V1_END */
  
    function validPreviewSrc(src) {
    src = String(src || "").trim();
    if (!src) return false;
    if (/^data:image\/gif;base64,R0lGODlhAQABAIA/i.test(src)) return false;
    if (/^(about:blank|javascript:)/i.test(src)) return false;
    return true;
  }

  function previewGalleryPool() {
    var out = [];
    qsa("__img, .ff-teamCard__img").forEach(function (img) {
      var src = (img.getAttribute("src") || "").trim();
      if (validPreviewSrc(src) && out.indexOf(src) === -1) out.push(src);
    });
    return out;
  }

  function previewish() {
    var mode = (((body && body.getAttribute("data-ff-data-mode")) || config.mode || "") + "").toLowerCase();
    var env = (config.env || "").toLowerCase();
    var stripePk = (config.stripePk || "").toLowerCase();
    var paypalClient = (config.paypalClientId || "").toLowerCase();
    var demoPayments =
      stripePk.indexOf("pk_test_") === 0 ||
      paypalClient.indexOf("sandbox") !== -1 ||
      mode === "demo" ||
      mode === "preview";

    return demoPayments || env !== "production" || mode !== "live";
  }

  function teamTitleFromCard(card) {
    var titleNode = qs(".ff-teamCard__title", card);
    return titleNode ? (titleNode.textContent || "").trim() : "Team preview";
  }

  function repairMissingPreviewMedia() {
    if (!previewish()) return;

    var pool = previewGalleryPool();
    if (!pool.length) {
      bindMediaFallbacks();
      return;
    }

    qsa(".ff-teamCard").forEach(function (card, index) {
      var img = qs(".ff-teamCard__img", card);
      if (!img) return;

      var bad = !(img.complete && img.naturalWidth > 16 && img.naturalHeight > 16);
      if (bad) {
        img.src = pool[index % pool.length];
        img.alt = teamTitleFromCard(card) + " team photo";
      }
      markMissingMedia(img);
    });

    var poster = qs(".ff-storyPoster__img");
    if (poster) {
      var posterBad = !(poster.complete && poster.naturalWidth > 16 && poster.naturalHeight > 16);
      if (posterBad) {
        poster.src = pool[0];
        poster.alt = "Program preview";
      }
      markMissingMedia(poster);
    }

    bindMediaFallbacks();
  }

  function seedPreviewRealism() {
    if (!previewish()) return;

    if (!sponsorWallHasContent()) {
      renderSponsorWall([
        { name: "Austin Sports Rehab", tier: "partner", url: "#" },
        { name: "Hill Country Dental", tier: "community", url: "#" },
        { name: "Metro Training Lab", tier: "champion", url: "#" }
      ]);
    }

    if (dom.vipSpotlight) {
      var vipText = (dom.vipSpotlight.textContent || "").toLowerCase();
      if (!vipText || /rotate here|high-traffic|reviewed and placed/.test(vipText)) {
        renderVipSpotlight({
          name: "Metro Training Lab",
          message: "VIP sponsor preview — featured placement, outbound link, and premium recognition."
        });
      }
    }

    if (dom.tickerTrack) {
      var tickerHasItems = !!dom.tickerTrack.querySelector(".ff-pill, [role='listitem']");
      if (!tickerHasItems || /activity appears here/i.test(dom.tickerTrack.textContent || "")) {
        pushTickerItem("Austin donor supported the program");
        pushTickerItem("$150 travel support received");
        pushTickerItem("Community sponsor inquiry received");
      }
    }

    if (dom.activityFeed && !dom.activityFeed.children.length) {
      pushActivityItem("Maria from Austin donated $25");
      pushActivityItem("David sponsored the 7th Grade team");
      pushActivityItem("Local Pizza became a Community Sponsor");
    }

    repairMissingPreviewMedia();
  }

  function contractSnapshot() {
    var snapshot = {
      ok: true,
      boot: w.__FF_BOOT__ || w.BOOT_KEY || "unknown",
      version: BUILD,
      readyState: d.readyState || "loading",
      theme: root.getAttribute("data-theme") || "",
      webdriver: root.getAttribute("data-ff-webdriver") === "true",
      hooks: {},
      overlays: {},
      forms: {},
      onboarding: {
        present: !!dom.onboardingModal,
        ready: state.onboardingReady
      },
      payments: {
        stripeConfigured: !!config.stripePk,
        stripeMounted: !!state.stripePaymentElement,
        paypalConfigured: !!config.paypalClientId,
        paypalRendered: !!(dom.paypalMount && dom.paypalMount.getAttribute("data-rendered") === "true")
      }
    };

    Object.keys(FF_APP.selectors || {}).forEach(function (key) {
      try {
        snapshot.hooks[key] = !!qs(FF_APP.selectors[key]);
      } catch (_err) {
        snapshot.hooks[key] = false;
      }
    });

    Object.keys(overlays).forEach(function (key) {
      var ov = overlays[key];
      var el = ov && ov.el ? ov.el : null;
      snapshot.overlays[key] = {
        exists: !!el,
        open: !!(
          el && !el.hidden && (
            el.classList.contains("is-open") ||
            el.getAttribute("data-open") === "true" ||
            el.getAttribute("aria-hidden") === "false" ||
            hasHashFor(ov.id)
          )
        )
      };
    });

    var focusProbe = getFocusProbe();

    snapshot.focusProbe = {
      exists: !!focusProbe,
      tabbable: !!(
        focusProbe &&
        !focusProbe.hidden &&
        focusProbe.getAttribute("aria-hidden") !== "true" &&
        typeof focusProbe.focus === "function" &&
        focusProbe.tabIndex >= 0
      )
    };

    snapshot.forms.donationForm = !!dom.donationForm;
    snapshot.forms.sponsorForm = !!dom.sponsorForm;
    snapshot.forms.amountInput = !!dom.donationAmount;

    return snapshot;
  }

  function handleDocumentClick(event) {
    var target = event.target;
    if (!target) return;
    if (target.nodeType !== 1) target = target.parentElement;
    if (!target || !target.closest) return;

    var shareBtn = target.closest("[data-ff-share]");
    if (shareBtn) {
      event.preventDefault();
      shareFundraiser();
      return;
    }

    var themeBtn = target.closest("[data-ff-theme-toggle]");
    if (themeBtn) {
      event.preventDefault();
      toggleTheme();
      return;
    }

    var amountBtn = target.closest("[data-ff-amount]");
    if (amountBtn) {
      event.preventDefault();
      var amount = amountBtn.getAttribute("data-ff-amount") || "";
      var amountPrefill = triggerPrefillFromNode(amountBtn);
      setAmount(amount);

      var insideCheckout = !!amountBtn.closest("#checkout");
      if (!insideCheckout) {
        applyCheckoutPrefill(amountPrefill);
        resetCheckoutSuccess();
        openOverlay("checkout", {
          source: amountBtn,
          updateHash: true
        });
      }
      return;
    }

    var sponsorTierBtn = target.closest('#sponsor-interest [data-ff-sponsor-tier]');
    if (sponsorTierBtn) {
      event.preventDefault();
      var tier = sponsorTierBtn.getAttribute("data-ff-sponsor-tier") || "";
      var hidden = dom.sponsorForm ? qs('[name="sponsor_tier"]', dom.sponsorForm) : null;
      if (hidden) hidden.value = tier;
      syncSponsorTierState(tier);
      announce("Preferred sponsor tier set to " + tier + ".");
      return;
    }

    var openCheckout = target.closest("[data-ff-open-checkout]");
    if (openCheckout) {
      event.preventDefault();
      var checkoutPrefill = triggerPrefillFromNode(openCheckout);
      applyCheckoutPrefill(checkoutPrefill);
      resetCheckoutSuccess();
      openOverlay("checkout", {
        source: openCheckout,
        updateHash: true
      });
      return;
    }

    var openSponsor = target.closest("[data-ff-open-sponsor]");
    if (openSponsor) {
      event.preventDefault();
      applySponsorPrefill(triggerPrefillFromNode(openSponsor));
      openOverlay("sponsor-interest", {
        source: openSponsor,
        updateHash: true
      });
      return;
    }

    var openDrawer = target.closest("[data-ff-open-drawer]");
    if (openDrawer) {
      event.preventDefault();
      openOverlay("drawer", {
        source: openDrawer,
        updateHash: true
      });
      return;
    }

    var openVideo = target.closest("[data-ff-open-video]");
    if (openVideo) {
      event.preventDefault();
      var video = triggerPrefillFromNode(openVideo);
      openOverlay("press-video", {
        source: openVideo,
        updateHash: true,
        video: {
          src: video.videoSrc,
          title: video.videoTitle || "Watch"
        }
      });
      return;
    }

    var openTerms = target.closest('[data-ff-open-terms], a[href="#terms"]');
    if (openTerms) {
      event.preventDefault();
      openOverlay("terms", {
        source: openTerms,
        updateHash: true
      });
      return;
    }

    var openPrivacy = target.closest('[data-ff-open-privacy], a[href="#privacy"]');
    if (openPrivacy) {
      event.preventDefault();
      openOverlay("privacy", {
        source: openPrivacy,
        updateHash: true
      });
      return;
    }

    var closeCheckout = target.closest("[data-ff-close-checkout]");
    if (closeCheckout) {
      event.preventDefault();
      closeOverlay("checkout");
      return;
    }

    var closeSponsor = target.closest("[data-ff-close-sponsor]");
    if (closeSponsor) {
      event.preventDefault();
      closeOverlay("sponsor-interest");
      return;
    }

    var closeVideo = target.closest("[data-ff-close-video]");
    if (closeVideo) {
      event.preventDefault();
      closeOverlay("press-video");
      return;
    }

    var closeTerms = target.closest("[data-ff-close-terms]");
    if (closeTerms) {
      event.preventDefault();
      closeOverlay("terms");
      return;
    }

    var closePrivacy = target.closest("[data-ff-close-privacy]");
    if (closePrivacy) {
      event.preventDefault();
      closeOverlay("privacy");
      return;
    }

    var closeDrawer = target.closest("[data-ff-close-drawer]");
    if (closeDrawer) {
      event.preventDefault();
      closeOverlay("drawer");
      return;
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Tab") {
      setKeyboardMode(true);
    }

    if (event.key === "Escape") {
      var openOverlayNow = getAnyOpenOverlay();
      if (openOverlayNow) {
        event.preventDefault();
        closeOverlay(openOverlayNow.id);
      }
    }
  }

  function handlePointerInput() {
    setKeyboardMode(false);
  }

  function handleAmountInput() {
    hideStatus(dom.donationError);
    var amount = parseAmount(dom.donationAmount && dom.donationAmount.value);

    syncAmountChipState(amount);
    updatePayMessages(amount);
    updateSummaryAmount(amount);

    try {
      w.localStorage.setItem(
        STORAGE_LAST_AMOUNT_KEY,
        dom.donationAmount && dom.donationAmount.value ? String(dom.donationAmount.value) : ""
      );
    } catch (err) {}

    if (state.openOverlayId === "checkout" && amount > 0) {
      scheduleStripeRefresh();
      schedulePaypalRefresh();
    }
  }

  function initForms() {
    if (dom.donationForm && !dom.donationForm.__ffBoundSubmit) {
      dom.donationForm.__ffBoundSubmit = true;
      on(dom.donationForm, "submit", submitDonationForm);
    }

    if (dom.sponsorForm && !dom.sponsorForm.__ffBoundSubmit) {
      dom.sponsorForm.__ffBoundSubmit = true;
      on(dom.sponsorForm, "submit", submitSponsorForm);
    }

    if (dom.donationAmount && !dom.donationAmount.__ffBoundAmountInput) {
      dom.donationAmount.__ffBoundAmountInput = true;
      on(dom.donationAmount, "input", handleAmountInput);
      on(dom.donationAmount, "change", handleAmountInput);
    }
  }

  function initEvents() {
    if (initEvents._bound) return;
    initEvents._bound = true;

    on(d, "click", handleDocumentClick);
    on(d, "keydown", handleKeyDown);
    on(d, "mousedown", handlePointerInput, true);
    on(d, "pointerdown", handlePointerInput, true);
    on(w, "hashchange", syncOverlayFromHash);
  }

  function initWebdriverMode() {
    var webdriver = !!((w.navigator && w.navigator.webdriver) || w.__nightmare || w.Cypress || /Headless/i.test((w.navigator && w.navigator.userAgent) || ""));
    attr(root, "data-ff-webdriver", webdriver ? "true" : "false");
    FF_APP.flags = FF_APP.flags || {};
    FF_APP.flags.webdriver = webdriver;
  }

  function initApi() {
    FF_APP.api.contractSnapshot = contractSnapshot;
    FF_APP.api.open = function (id) { openOverlay(id, { updateHash: true, source: d.activeElement }); };
    FF_APP.api.close = function (id) { closeOverlay(id); };
    FF_APP.api.closeAll = function () { closeAllOverlays(); };
    FF_APP.api.toast = toast;
    FF_APP.api.announce = announce;
    FF_APP.api.setAmount = setAmount;
    FF_APP.api.getAmount = function () { return parseAmount(dom.donationAmount && dom.donationAmount.value); };
    FF_APP.api.refreshProgress = updateTotals;
    FF_APP.api.renderSponsorWall = renderSponsorWall;
    FF_APP.api.renderVipSpotlight = renderVipSpotlight;
    FF_APP.api.pushTickerItem = pushTickerItem;
    FF_APP.api.pushActivityItem = pushActivityItem;
    FF_APP.api.reseedPreview = function () {
      seedPreviewRealism();
      bindMediaFallbacks();
    };
    FF_APP.api.injectScript = injectScript;
  }

  function escHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCsrfToken() {
    var metaNode = qs('meta[name="csrf-token"]');
    return metaNode ? String(metaNode.getAttribute("content") || "").trim() : (config.csrfToken || "");
  }

  function moneyString(value) {
    var n = Number(value || 0);
    if (!Number.isFinite(n)) return "$0";
    return "$" + n.toLocaleString();
  }

  function initOnboardingWizard() {
    var modal = dom.onboardingModal;
    if (!modal || modal.getAttribute("data-ff-onboard-ready") === "true") return;

    modal.setAttribute("data-ff-onboard-ready", "true");
    state.onboardingReady = true;

    var panel = qs("[data-ff-onboard-panel]", modal) || qs(".ff-modal__panel", modal);
    var form = qs("[data-ff-onboard-form]", modal);
    var steps = qsa("[data-ff-step]", modal);
    var pills = qsa("[data-ff-step-pill]", modal);
    var prevBtn = qs("[data-ff-onboard-prev]", modal);
    var nextBtn = qs("[data-ff-onboard-next]", modal);
    var finishBtn = qs("[data-ff-onboard-finish]", modal);
    var copyBtn = qs("[data-ff-onboard-copy]", modal);
    var emailBtn = qs("[data-ff-onboard-email]", modal);
    var summary = qs("[data-ff-onboard-summary]", modal);
    var status = qs("[data-ff-onboard-status]", modal);
    var swatchPrimary = qs('[data-ff-onboard-swatch="primary"]', modal);
    var swatchAccent = qs('[data-ff-onboard-swatch="accent"]', modal);
    var lastTrigger = null;

    function getData() {
      if (!form) return {};
      var fd = new FormData(form);
      var out = {};
      fd.forEach(function (value, key) {
        out[key] = value;
      });
      return out;
    }

    function exportText() {
      var data = getData();
      return [
        "FutureFunded onboarding brief",
        "",
        "Organization type: " + (data.org_type || ""),
        "Organization name: " + (data.org_name || ""),
        "Contact name: " + (data.contact_name || ""),
        "Contact email: " + (data.contact_email || ""),
        "Primary color: " + (data.brand_primary || ""),
        "Accent color: " + (data.brand_accent || ""),
        "Logo URL: " + (data.logo_url || ""),
        "Hero headline: " + (data.headline || ""),
        "Goal: " + moneyString(data.goal),
        "Deadline: " + (data.deadline || ""),
        "Checkout: " + (data.checkout || ""),
        "Donation presets: " + (data.presets || ""),
        "Sponsor tiers: " + (data.sponsor_tiers || ""),
        "Announcement: " + (data.announcement || "")
      ].join("\n");
    }

    function ensureResultMount() {
      var mount = qs("[data-ff-onboard-result]", modal);
      if (!mount && status) {
        mount = createEl("div", "ff-alert ff-alert--success ff-mt-2");
        mount.hidden = true;
        mount.setAttribute("data-ff-onboard-result", "");
        mount.setAttribute("role", "status");
        mount.setAttribute("aria-live", "polite");
        status.insertAdjacentElement("afterend", mount);
      }
      return mount;
    }

    function setWizardBusy(busy, message) {
      if (status) status.textContent = message || "";
      [prevBtn, nextBtn, finishBtn, emailBtn, copyBtn].forEach(function (btn) {
        if (!btn) return;
        btn.disabled = !!busy;
        attr(btn, "aria-busy", busy ? "true" : "false");
      });
    }

    function setWizardError(message) {
      var resultMount = ensureResultMount();
      if (status) status.textContent = message || "";
      if (resultMount) {
        resultMount.hidden = false;
        resultMount.className = "ff-alert ff-alert--error ff-mt-2";
        resultMount.textContent = message || "Something went wrong.";
      }
    }

    function validateCurrentStep() {
      var currentPanel = steps.filter(function (el) {
        return Number(el.getAttribute("data-ff-step")) === state.onboardingCurrentStep;
      })[0];

      if (!currentPanel) return true;

      var fields = qsa("input, select, textarea", currentPanel);
      for (var i = 0; i < fields.length; i += 1) {
        var field = fields[i];
        if (typeof field.checkValidity === "function" && !field.checkValidity()) {
          if (typeof field.reportValidity === "function") field.reportValidity();
          return false;
        }
      }
      return true;
    }

    function validateWizardForm() {
      if (!form) return false;
      var fields = qsa("input, select, textarea", form);
      for (var i = 0; i < fields.length; i += 1) {
        var field = fields[i];
        if (typeof field.checkValidity === "function" && !field.checkValidity()) {
          if (typeof field.reportValidity === "function") field.reportValidity();
          return false;
        }
      }
      return true;
    }

    function collectWizardPayload() {
      var payload = getData();
      payload.goal = Number(payload.goal || 0);
      return payload;
    }

    function renderSummary() {
      if (!summary) return;
      var data = getData();

      if (swatchPrimary) swatchPrimary.style.background = data.brand_primary || "#0ea5e9";
      if (swatchAccent) swatchAccent.style.background = data.brand_accent || "#f97316";

      summary.innerHTML = [
        '<div class="ff-row ff-wrap ff-gap-2" role="list" aria-label="Wizard summary chips">',
        '  <span class="ff-pill ff-pill--soft" role="listitem">' + escHtml(data.org_type || "Group") + "</span>",
        '  <span class="ff-pill ff-pill--soft" role="listitem">' + escHtml(data.checkout || "Stripe + PayPal") + "</span>",
        '  <span class="ff-pill ff-pill--soft" role="listitem">' + escHtml(moneyString(data.goal)) + " goal</span>",
        "</div>",
        '<div class="ff-onboardSummary__grid">',
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Organization</span><span class="ff-onboardSummary__value">' + escHtml(data.org_name || "—") + "</span></div>",
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Contact</span><span class="ff-onboardSummary__value">' + escHtml(data.contact_name || "—") + "<br>" + escHtml(data.contact_email || "—") + "</span></div>",
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Brand</span><span class="ff-onboardSummary__value">Primary: ' + escHtml(data.brand_primary || "—") + "<br>Accent: " + escHtml(data.brand_accent || "—") + "</span></div>",
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Campaign</span><span class="ff-onboardSummary__value">' + escHtml(moneyString(data.goal)) + "<br>" + escHtml(data.deadline || "No deadline yet") + "</span></div>",
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Presets</span><span class="ff-onboardSummary__value">' + escHtml(data.presets || "25, 50, 100, 250") + "</span></div>",
        '  <div class="ff-onboardSummary__item"><span class="ff-onboardSummary__label">Sponsor tiers</span><span class="ff-onboardSummary__value">' + escHtml(data.sponsor_tiers || "Community / Partner / Champion / VIP") + "</span></div>",
        "</div>",
        '<div class="ff-alert ff-alert--info" role="note"><strong>Launch-ready brief:</strong> this intake can be copied or turned into a draft preview.</div>'
      ].join("");
    }

    function renderWizard() {
      steps.forEach(function (stepEl) {
        var stepNum = Number(stepEl.getAttribute("data-ff-step"));
        stepEl.hidden = stepNum !== state.onboardingCurrentStep;
      });

      pills.forEach(function (pill) {
        var stepNum = Number(pill.getAttribute("data-ff-step-pill"));
        if (stepNum === state.onboardingCurrentStep) {
          attr(pill, "aria-current", "step");
        } else {
          pill.removeAttribute("aria-current");
        }
      });

      if (prevBtn) prevBtn.hidden = state.onboardingCurrentStep === 1;
      if (nextBtn) nextBtn.hidden = state.onboardingCurrentStep === steps.length;
      if (finishBtn) finishBtn.hidden = state.onboardingCurrentStep !== steps.length;

      renderSummary();
    }

    function setOnboardingOpen(open) {
      if (open) {
        modal.hidden = false;
        modal.classList.add("is-open");
        attr(modal, "data-open", "true");
        attr(modal, "aria-hidden", "false");
        lockScroll(true);
        w.requestAnimationFrame(function () {
          if (panel && typeof panel.focus === "function") {
            try { panel.focus({ preventScroll: false }); } catch (err) { panel.focus(); }
          }
        });
        return;
      }

      modal.classList.remove("is-open");
      attr(modal, "data-open", "false");
      attr(modal, "aria-hidden", "true");
      modal.hidden = true;
      if (!getAnyOpenOverlay()) lockScroll(false);

      if (lastTrigger && typeof lastTrigger.focus === "function") {
        w.requestAnimationFrame(function () {
          try { lastTrigger.focus({ preventScroll: true }); } catch (err) { lastTrigger.focus(); }
        });
      }
    }

    function createDraftRequest(payload) {
      var endpoint = modal.getAttribute("data-ff-onboard-endpoint") || "/api/onboarding/brief";
      return fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRFToken": getCsrfToken(),
          "X-CSRF-Token": getCsrfToken()
        },
        body: JSON.stringify(payload || {})
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data.ok) {
            throw new Error(extractErrorMessage(data, "Draft request failed (" + response.status + ")"));
          }
          return data;
        });
      });
    }

    function publishDraftRequest(slug) {
      return fetch("/api/onboarding/drafts/" + encodeURIComponent(slug) + "/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRFToken": getCsrfToken(),
          "X-CSRF-Token": getCsrfToken()
        }
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (response.status === 403 && data && data.login_url) {
            w.location.href = data.login_url;
            return { ok: false };
          }
          if (!response.ok || !data.ok) {
            throw new Error(extractErrorMessage(data, "Could not publish draft."));
          }
          return data;
        });
      });
    }

    function lifecyclePost(url) {
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRFToken": getCsrfToken(),
          "X-CSRF-Token": getCsrfToken()
        }
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (response.status === 403 && data && data.login_url) {
            w.location.href = data.login_url;
            return { ok: false };
          }
          if (!response.ok || !data.ok) {
            throw new Error(extractErrorMessage(data, "Request failed."));
          }
          return data;
        });
      });
    }

    on(d, "click", function (event) {
      var target = event.target;
      if (!target) return;
      if (target.nodeType !== 1) target = target.parentElement;
      if (!target || !target.closest) return;

      var openBtn = target.closest("[data-ff-open-onboard]");
      if (openBtn) {
        event.preventDefault();
        lastTrigger = openBtn;
        state.onboardingCurrentStep = 1;
        renderWizard();
        setOnboardingOpen(true);
        return;
      }

      var closeBtn = target.closest("[data-ff-close-onboard]");
      if (closeBtn && closeBtn.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        setOnboardingOpen(false);
        return;
      }

      var next = target.closest("[data-ff-onboard-next]");
      if (next && next.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        if (!validateCurrentStep()) return;
        state.onboardingCurrentStep = Math.min(state.onboardingCurrentStep + 1, steps.length);
        renderWizard();
        return;
      }

      var prev = target.closest("[data-ff-onboard-prev]");
      if (prev && prev.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        state.onboardingCurrentStep = Math.max(state.onboardingCurrentStep - 1, 1);
        renderWizard();
        return;
      }

      var pill = target.closest("[data-ff-step-pill]");
      if (pill && pill.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        var targetStep = Number(pill.getAttribute("data-ff-step-pill")) || 1;
        if (targetStep > state.onboardingCurrentStep && !validateCurrentStep()) return;
        state.onboardingCurrentStep = Math.min(Math.max(targetStep, 1), steps.length);
        renderWizard();
        return;
      }

      var copy = target.closest("[data-ff-onboard-copy]");
      if (copy && copy.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        var copyText = exportText();
        if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) {
          w.navigator.clipboard.writeText(copyText).then(function () {
            if (status) status.textContent = "Brief copied to clipboard.";
          }).catch(function () {
            if (status) status.textContent = "Could not copy automatically. You can still create a draft.";
          });
        } else if (status) {
          status.textContent = "Clipboard is not available in this browser.";
        }
        return;
      }

      var createDraftBtn = target.closest("[data-ff-onboard-email], [data-ff-onboard-finish]");
      if (createDraftBtn && createDraftBtn.closest("[data-ff-onboard-modal]") === modal) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

        if (!validateWizardForm()) return;

        var resultMount = ensureResultMount();
        if (resultMount) {
          resultMount.hidden = true;
          resultMount.className = "ff-alert ff-alert--success ff-mt-2";
          resultMount.innerHTML = "";
        }

        setWizardBusy(true, "Creating draft preview…");

        createDraftRequest(collectWizardPayload())
          .then(function (data) {
            if (status) status.textContent = "Draft created. Opening preview in a new tab…";

            if (resultMount) {
              resultMount.hidden = false;
              resultMount.className = "ff-alert ff-alert--success ff-mt-2";
              resultMount.innerHTML = [
                "<strong>Draft ready.</strong>",
                ' <a class="ff-link" href="' + escHtml(data.draft_url) + '" target="_blank" rel="noopener noreferrer">Open draft preview</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <a class="ff-link" href="' + escHtml(data.json_url) + '" target="_blank" rel="noopener noreferrer">View JSON</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <button type="button" class="ff-btn ff-btn--sm ff-btn--primary ff-btn--pill" data-ff-onboard-publish="" data-ff-onboard-draft-slug="' + escHtml(data.slug) + '">Publish page</button>'
              ].join("");
            }

            FF_APP.api.lastOnboardingDraft = data;
            try {
              w.open(data.draft_url, "_blank", "noopener,noreferrer");
            } catch (_err) {}
            setWizardBusy(false, "Draft created successfully.");
          })
          .catch(function (err) {
            var message = err && err.message ? err.message : "Could not create draft preview.";
            if (status) status.textContent = message;
            if (resultMount) {
              resultMount.hidden = false;
              resultMount.className = "ff-alert ff-alert--error ff-mt-2";
              resultMount.textContent = message;
            }
            setWizardBusy(false, message);
          });
        return;
      }

      var publishBtn = target.closest("[data-ff-onboard-publish]");
      if (publishBtn) {
        event.preventDefault();
        var slug = String(publishBtn.getAttribute("data-ff-onboard-draft-slug") || "").trim();
        var resultMountPublish = ensureResultMount();

        if (!slug) {
          if (status) status.textContent = "Missing draft slug.";
          return;
        }

        publishBtn.disabled = true;
        attr(publishBtn, "aria-busy", "true");
        if (status) status.textContent = "Publishing page…";

        publishDraftRequest(slug)
          .then(function (data) {
            if (!data || !data.ok) return;

            if (status) status.textContent = "Page published. Opening live page…";

            if (resultMountPublish) {
              resultMountPublish.hidden = false;
              resultMountPublish.className = "ff-alert ff-alert--success ff-mt-2";
              resultMountPublish.innerHTML = [
                "<strong>Page published.</strong>",
                ' <a class="ff-link" href="' + escHtml(data.public_url) + '" target="_blank" rel="noopener noreferrer">Open live page</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <a class="ff-link" href="' + escHtml(data.draft_url) + '" target="_blank" rel="noopener noreferrer">Open draft</a>',
                ' <span class="ff-sep ff-sep--dot" aria-hidden="true">•</span>',
                ' <a class="ff-link" href="' + escHtml(data.json_url) + '" target="_blank" rel="noopener noreferrer">View JSON</a>'
              ].join("");
            }

            FF_APP.api.lastPublishedOnboardingDraft = data;
            try {
              w.open(data.public_url, "_blank", "noopener,noreferrer");
            } catch (_err) {}
          })
          .catch(function (err) {
            var message = err && err.message ? err.message : "Could not publish draft.";
            if (status) status.textContent = message;
            if (resultMountPublish) {
              resultMountPublish.hidden = false;
              resultMountPublish.className = "ff-alert ff-alert--error ff-mt-2";
              resultMountPublish.textContent = message;
            }
          })
          .finally(function () {
            publishBtn.disabled = false;
            attr(publishBtn, "aria-busy", "false");
          });
        return;
      }

      var unpublishBtn = target.closest("[data-ff-onboard-unpublish]");
      if (unpublishBtn) {
        event.preventDefault();
        var slugUnpublish = String(unpublishBtn.getAttribute("data-ff-onboard-draft-slug") || "").trim();
        if (!slugUnpublish) return;
        unpublishBtn.disabled = true;
        attr(unpublishBtn, "aria-busy", "true");

        lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slugUnpublish) + "/unpublish")
          .then(function () {
            w.setTimeout(function () { w.location.reload(); }, 350);
          })
          .catch(function (err) {
            setWizardError(err && err.message ? err.message : "Could not unpublish draft.");
            unpublishBtn.disabled = false;
            attr(unpublishBtn, "aria-busy", "false");
          });
        return;
      }

      var archiveBtn = target.closest("[data-ff-onboard-archive]");
      if (archiveBtn) {
        event.preventDefault();
        var slugArchive = String(archiveBtn.getAttribute("data-ff-onboard-draft-slug") || "").trim();
        if (!slugArchive) return;
        archiveBtn.disabled = true;
        attr(archiveBtn, "aria-busy", "true");

        lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slugArchive) + "/archive")
          .then(function () {
            w.setTimeout(function () { w.location.reload(); }, 350);
          })
          .catch(function (err) {
            setWizardError(err && err.message ? err.message : "Could not archive draft.");
            archiveBtn.disabled = false;
            attr(archiveBtn, "aria-busy", "false");
          });
      }
    }, true);

    on(modal, "input", renderSummary);
    on(modal, "change", renderSummary);
    on(d, "keydown", function (event) {
      if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
        setOnboardingOpen(false);
      }
    });

    if (emailBtn) emailBtn.textContent = "Create draft";
    if (finishBtn) finishBtn.textContent = "Create draft";

    FF_APP.api.onboardingWizardPresent = function () {
      return !!qs("[data-ff-onboard-modal]");
    };
    FF_APP.api.createOnboardingDraft = createDraftRequest;
    FF_APP.api.publishOnboardingDraft = publishDraftRequest;
    FF_APP.api.listOnboardingDrafts = function () {
      return fetch("/api/onboarding/drafts", {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      }).then(function (response) {
        return response.json();
      });
    };
    FF_APP.api.unpublishOnboardingDraft = function (slug) {
      return lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slug) + "/unpublish");
    };
    FF_APP.api.archiveOnboardingDraft = function (slug) {
      return lifecyclePost("/api/onboarding/drafts/" + encodeURIComponent(slug) + "/archive");
    };

    renderWizard();
  }

/* FF_MOTION_POLISH_RUNTIME_V1_START */
function initMotionPolish() {
  if (!root || !d || !d.body) return;

  try {
    root.setAttribute("data-ff-motion-ready", "true");
  } catch (_) {}

  var groups = qsa('[data-ff-animate="stagger"]');
  groups.forEach(function (group) {
    var kids = Array.prototype.slice.call(group.children || []);
    kids.forEach(function (kid, idx) {
      if (!kid || kid.nodeType !== 1) return;
      kid.style.setProperty("--ff-reveal-delay", (idx * 70) + "ms");
    });
  });

  var nodes = qsa('[data-ff-animate="rise"], [data-ff-animate="fade"], [data-ff-animate="scale"], [data-ff-animate="stagger"]');
  if (!nodes.length) return;

  function reveal(node, delay) {
    if (!node || node.__ffRevealDone) return;
    node.__ffRevealDone = true;
    if (typeof delay === "number") {
      node.style.setProperty("--ff-reveal-delay", delay + "ms");
    }
    w.requestAnimationFrame(function () {
      node.classList.add("ff-reveal-in");
    });
  }

  if (!("IntersectionObserver" in w) || root.getAttribute("data-ff-webdriver") === "true") {
    nodes.forEach(function (node, idx) { reveal(node, idx * 35); });
    return;
  }

  var io = new w.IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      io.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -10% 0px",
    threshold: 0.14
  });

  nodes.forEach(function (node, idx) {
    var rect;
    try { rect = node.getBoundingClientRect(); } catch (_) {}
    if (rect && rect.top < (w.innerHeight || 900) * 0.9) {
      reveal(node, idx * 40);
    } else {
      io.observe(node);
    }
  });
}
/* FF_MOTION_POLISH_RUNTIME_V1_END */

/* FF_LUXURY_MICRO_INTERACTIONS_RUNTIME_V1_START */
function initLuxuryMicroInteractions() {
  if (!root || !d || !d.body) return;

  try {
    root.setAttribute("data-ff-luxury-ready", "true");
  } catch (_) {}

  // ----------------------------------------------------
  // Motion fail-open watchdog so hidden blocks do not
  // stay invisible if an observer misses them
  // ----------------------------------------------------
  w.setTimeout(function () {
    try {
      var pending = qsa(
        '[data-ff-animate="rise"]:not(.ff-reveal-in), ' +
        '[data-ff-animate="fade"]:not(.ff-reveal-in), ' +
        '[data-ff-animate="scale"]:not(.ff-reveal-in), ' +
        '[data-ff-animate="stagger"]:not(.ff-reveal-in)'
      );
      if (pending.length) {
        root.setAttribute("data-ff-motion-fail-open", "true");
        pending.forEach(function (node) {
          node.classList.add("ff-reveal-in");
        });
      }
    } catch (_) {}
  }, 1400);

  // ----------------------------------------------------
  // Progress / meter sheen activation
  // ----------------------------------------------------
  var meterNodes = qsa(
    '[data-ff-goalbar], .ff-topbarGoal__progress, .ff-teamCard__meterBar, .ff-meterBar, .ff-progressBar, .ff-progressMini__bar'
  );

  function lightMeter(node) {
    if (!node || node.__ffMeterLive) return;
    node.__ffMeterLive = true;
    node.classList.add("ff-meter-live");
  }

  if (w.IntersectionObserver && !(w.navigator && w.navigator.webdriver)) {
    var meterIO = new w.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        lightMeter(entry.target);
        meterIO.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.2 });

    meterNodes.forEach(function (node, idx) {
      try {
        var rect = node.getBoundingClientRect();
        if (rect && rect.top < (w.innerHeight || 900) * 0.88) {
          w.setTimeout(function () { lightMeter(node); }, idx * 45);
        } else {
          meterIO.observe(node);
        }
      } catch (_) {
        lightMeter(node);
      }
    });
  } else {
    meterNodes.forEach(lightMeter);
  }

  // ----------------------------------------------------
  // Live feed shimmer activation
  // ----------------------------------------------------
  qsa(".ff-liveFeed__item, .ff-activityFeed__item, .ff-activityfeedItem").forEach(function (node, idx) {
    w.setTimeout(function () {
      node.classList.add("ff-shimmer-live");
    }, 180 + (idx * 120));
  });

  // ----------------------------------------------------
  // Tier glow normalization
  // ----------------------------------------------------
  qsa("[data-ff-tier]").forEach(function (node) {
    var raw = (node.getAttribute("data-ff-tier") || "").toLowerCase().trim();
    if (!raw) return;

    var slug = raw
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (slug) {
      node.classList.add("ff-tier--" + slug);
    }
  });

  // ----------------------------------------------------
  // Toast style upgrades
  // ----------------------------------------------------
  var toastHost = qs("[data-ff-toasts]");

  function upgradeToast(node) {
    if (!node || node.nodeType !== 1 || node.__ffToastLuxury) return;
    node.__ffToastLuxury = true;

    var txt = (node.textContent || "").toLowerCase();
    if (txt.indexOf("copied") !== -1 || txt.indexOf("share") !== -1 || txt.indexOf("link") !== -1) {
      node.classList.add("ff-toast--share");
    }
    if (
      txt.indexOf("success") !== -1 ||
      txt.indexOf("confirmed") !== -1 ||
      txt.indexOf("sent") !== -1 ||
      txt.indexOf("saved") !== -1
    ) {
      node.classList.add("ff-toast--success");
    }
  }

  if (toastHost) {
    Array.prototype.slice.call(toastHost.children || []).forEach(upgradeToast);

    if ("MutationObserver" in w) {
      var toastMO = new w.MutationObserver(function (records) {
        records.forEach(function (record) {
          Array.prototype.slice.call(record.addedNodes || []).forEach(function (node) {
            if (node && node.nodeType === 1) {
              upgradeToast(node);
            }
          });
        });
      });
      toastMO.observe(toastHost, { childList: true });
    }
  }
}
/* FF_LUXURY_MICRO_INTERACTIONS_RUNTIME_V1_END */

/* FF_COUNTERS_MARQUEE_CHECKOUT_PRESTIGE_RUNTIME_V1_START */
function initPrestigeWave() {
  if (!root || !d || !d.body) return;
  try { root.setAttribute("data-ff-prestige-ready", "true"); } catch (_) {}

  // ---------------------------------------------
  // Count-up values
  // ---------------------------------------------
  function parseCountValue(text) {
    var raw = String(text || "").trim();
    if (!raw) return null;

    if (/^\$[\d,]+(?:\.\d{2})?$/.test(raw)) {
      return { kind: "currency", value: parseFloat(raw.replace(/[$,]/g, "")) };
    }
    if (/^\d+(?:\.\d+)?%$/.test(raw)) {
      return { kind: "percent", value: parseFloat(raw.replace("%", "")) };
    }
    if (/^\d{1,3}(?:,\d{3})+$/.test(raw) || /^\d+$/.test(raw)) {
      return { kind: "number", value: parseFloat(raw.replace(/,/g, "")) };
    }
    return null;
  }

  function formatCountValue(kind, value) {
    if (kind === "currency") {
      return "$" + Math.round(value).toLocaleString("en-US");
    }
    if (kind === "percent") {
      return Math.round(value) + "%";
    }
    return Math.round(value).toLocaleString("en-US");
  }

  function isLeafCountNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.children && node.children.length) return false;
    var tag = (node.tagName || "").toLowerCase();
    if (/^(button|a|label|input|textarea|select|script|style)$/i.test(tag)) return false;
    var txt = (node.textContent || "").trim();
    if (!txt || txt.length > 16) return false;
    return !!parseCountValue(txt);
  }

  var scopes = qsa([
    ".ff-topbarGoal",
    ".ff-topbar",
    ".ff-hero",
    ".ff-successUpsell",
    ".ff-teamCard",
    ".ff-progressMini",
    "#impact",
    "#teams"
  ].join(","));

  var countNodes = [];
  scopes.forEach(function (scope) {
    qsa("*", scope).forEach(function (node) {
      if (!isLeafCountNode(node)) return;
      if (node.__ffCountReady) return;
      node.__ffCountReady = true;
      node.setAttribute("data-ff-countup-live", "true");
      countNodes.push(node);
    });
  });

  function animateCount(node) {
    if (!node || node.__ffCountDone) return;
    var parsed = parseCountValue(node.textContent || "");
    if (!parsed) return;

    node.__ffCountDone = true;
    var target = parsed.value;
    var start = 0;
    var dur = parsed.kind === "currency" ? 900 : 700;
    var t0 = null;

    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var cur = start + (target - start) * eased;
      node.textContent = formatCountValue(parsed.kind, cur);
      if (p < 1) {
        w.requestAnimationFrame(step);
      } else {
        node.textContent = formatCountValue(parsed.kind, target);
        node.classList.add("ff-countup-done");
      }
    }

    w.requestAnimationFrame(step);
  }

  if (w.IntersectionObserver && !(w.navigator && w.navigator.webdriver)) {
    var countIO = new w.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        countIO.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.2 });

    countNodes.forEach(function (node) {
      try {
        var rect = node.getBoundingClientRect();
        if (rect && rect.top < (w.innerHeight || 900) * 0.9) {
          animateCount(node);
        } else {
          countIO.observe(node);
        }
      } catch (_) {
        animateCount(node);
      }
    });
  } else {
    countNodes.forEach(animateCount);
  }

  // ---------------------------------------------
  // Checkout trust microstates
  // ---------------------------------------------
  function checkoutIsOpen() {
    var shell = qs("[data-ff-checkout-shell]") || qs("[data-ff-checkout-sheet]") || qs("#checkout");
    if (!shell) return false;

    var hidden = shell.hasAttribute("hidden");
    var ariaHidden = shell.getAttribute("aria-hidden") === "true";
    var classes = shell.className || "";
    var openish = /is-open|open|active|visible/.test(classes) || shell.getAttribute("data-open") === "true";

    if (hidden || ariaHidden) return false;
    return openish || !!qs("#checkout");
  }

  function syncCheckoutState() {
    try {
      root.setAttribute("data-ff-checkout-open", checkoutIsOpen() ? "true" : "false");
    } catch (_) {}
  }

  syncCheckoutState();

  var checkoutNode = qs("#checkout") || qs("[data-ff-checkout-shell]") || qs("[data-ff-checkout-sheet]");
  if (checkoutNode && "MutationObserver" in w) {
    var mo = new w.MutationObserver(syncCheckoutState);
    mo.observe(checkoutNode, {
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "data-open"]
    });
  }

  qsa('#checkout [data-ff-amount]').forEach(function (btn) {
    if (btn.__ffPrestigeAmountBound) return;
    btn.__ffPrestigeAmountBound = true;
    btn.addEventListener("click", function () {
      qsa('#checkout [data-ff-amount].ff-amount-picked').forEach(function (n) {
        n.classList.remove("ff-amount-picked");
      });
      btn.classList.add("ff-amount-picked");
    }, { passive: true });
  });

  qsa([
    "[data-ff-checkout-status]",
    "[data-ff-checkout-stage]",
    "[data-ff-checkout-success]",
    "[data-ff-checkout-error]"
  ].join(",")).forEach(function (node) {
    if (!node || !("MutationObserver" in w) || node.__ffCheckoutStatusObserved) return;
    node.__ffCheckoutStatusObserved = true;
    var last = (node.textContent || "").trim();
    var mo = new w.MutationObserver(function () {
      var next = (node.textContent || "").trim();
      if (next && next !== last) {
        last = next;
        node.classList.remove("ff-checkout-status-live");
        void node.offsetWidth;
        node.classList.add("ff-checkout-status-live");
      }
    });
    mo.observe(node, { childList: true, subtree: true, characterData: true });
  });

  // ---------------------------------------------
  // Optional sponsor marquee
  // ---------------------------------------------
  qsa([
    "[data-ff-sponsor-marquee]",
    ".ff-sponsorMarquee",
    "[data-ff-sponsor-wall-rail],.ff-sponsorWallRail,.ff-sponsorWall__rail",
    ".ff-sponsorLogoRail"
  ].join(",")).forEach(function (rail) {
    if (!rail || rail.__ffMarqueeReady) return;
    var kids = Array.prototype.slice.call(rail.children || []).filter(function (n) {
      return n && n.nodeType === 1;
    });
    if (kids.length < 3) return;

    rail.__ffMarqueeReady = true;
    kids.forEach(function (kid) {
      rail.appendChild(kid.cloneNode(true));
    });
    rail.classList.add("ff-marquee-live");
  });
}
/* FF_COUNTERS_MARQUEE_CHECKOUT_PRESTIGE_RUNTIME_V1_END */

/* FF_DEMO_MODE_BANNER_RUNTIME_V1_START */
function initDemoModeBanner() {
  if (!d || !w) return;

  var banner = qs("[data-ff-demo-banner]");
  if (!banner) return;

  var storeKey = "ff_demo_banner_dismissed_v1";

  try {
    if (w.sessionStorage && w.sessionStorage.getItem(storeKey) === "1") {
      banner.hidden = true;
      return;
    }
  } catch (_) {}

  var dismissBtn = qs("[data-ff-demo-banner-dismiss]", banner);
  if (!dismissBtn || dismissBtn.__ffDemoBannerBound) return;
  dismissBtn.__ffDemoBannerBound = true;

  dismissBtn.addEventListener("click", function () {
    banner.hidden = true;
    try {
      if (w.sessionStorage) {
        w.sessionStorage.setItem(storeKey, "1");
      }
    } catch (_) {}
  });
}
/* FF_DEMO_MODE_BANNER_RUNTIME_V1_END */

  function boot() {
    body = d.body || body;
    dom.focusProbe = getFocusProbe() || dom.focusProbe;

    if (state.initialized) return;
    state.initialized = true;

    setBoot("booting");
    initWebdriverMode();
    initApi();
    applySavedTheme();
    restoreLastAmount();
    resetCheckoutSuccess();
    primePaymentSurfaces();
    initEvents();
    initForms();
    initOnboardingWizard();
    syncScrollSpy();
    initMotionPolish();
    initLuxuryMicroInteractions();
    initPrestigeWave();
    initDemoModeBanner();
    hydrateQrImages();
    bindMediaFallbacks();
    initBrandWordmarkDedupe();
    repairMissingPreviewMedia();
    renderVipSpotlight(null);
    inspectPaymentReturn();
    syncOverlayFromHash();
    initSocket();
    seedPreviewRealism();

    attr(root, "data-ff-runtime-probe", "live");
    if (dom.ffLive) {
      dom.ffLive.textContent = "FF runtime ready";
    }

    setBoot("ready");

    try {
      root.setAttribute("data-ff-preboot", "false");
    } catch (err) {}

    announce("FutureFunded page ready.");

    on(w, "load", function () {
      bindMediaFallbacks();
      initBrandWordmarkDedupe();
      repairMissingPreviewMedia();
      seedPreviewRealism();
    }, { once: true });

    w.setTimeout(function () {
      repairMissingPreviewMedia();
      seedPreviewRealism();
    }, 250);

    w.setTimeout(function () {
      repairMissingPreviewMedia();
      seedPreviewRealism();
    }, 900);
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}());

/* ==========================================================================
   FF_FOCUS_SENTINEL_V2
   Keeps first Tab deterministic for QA without duplicate overlay runtimes.
   ========================================================================== */

(function () {
  if (window.__FF_FOCUS_SENTINEL_V2__) return;
  window.__FF_FOCUS_SENTINEL_V2__ = true;

  function ensureProbe() {
    var probe = document.getElementById("ff_focus_probe");
    if (probe) return probe;
    if (!document.body) return null;

    probe = document.createElement("button");
    probe.type = "button";
    probe.id = "ff_focus_probe";
    probe.className = "ff-focus-probe";
    probe.setAttribute("data-ff-focus-probe", "");
    probe.setAttribute("aria-label", "Focus probe");
    probe.textContent = "Focus probe";
    probe.tabIndex = 0;
    document.body.insertBefore(probe, document.body.firstChild || null);
    return probe;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;

    var probe = ensureProbe();
    if (!probe) return;

    if (document.activeElement === document.body) {
      e.preventDefault();
      try {
        probe.focus({ preventScroll: true });
      } catch (_err) {
        try { probe.focus(); } catch (_err2) {}
      }
    }
  }, { once: true, capture: true });

  document.addEventListener("mousedown", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var focusable = t.closest("a,button,input,select,textarea,[tabindex]");
    if (!focusable && document.body && typeof document.body.focus === "function") {
      try { document.body.focus(); } catch (_err) {}
    }
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureProbe, { once: true });
  } else {
    ensureProbe();
  }
})();

/* FF_PUBLIC_API_COMPAT_MIN_V2 */
;(function () {
  if (window.__FF_PUBLIC_API_COMPAT_MIN_V2__) return;
  window.__FF_PUBLIC_API_COMPAT_MIN_V2__ = true;

  function sync() {
    var app = window.FF_APP || {};
    var api = app.api || {};

    window.ff = window.ff || {};
    if (!window.ff.version) {
      window.ff.version = (window.ff && window.ff.version) || "dev";
    }

    if (api.contractSnapshot && !window.ff.contractSnapshot) {
      window.ff.contractSnapshot = api.contractSnapshot.bind(api);
    }

    if (api.injectScript && !window.ff.injectScript) {
      window.ff.injectScript = api.injectScript.bind(api);
    }

    if (api.closeAll && !window.ff.closeAllOverlays) {
      window.ff.closeAllOverlays = api.closeAll.bind(api);
    }

    window.__FF_APP_BOOTED__ = true;
    window.__FF_BOOTED__ = true;
    window.__FF_RUNTIME_READY__ = true;
    window.__FF_APP_BOOT_KEY__ = window.__FF_APP_BOOT_KEY__ || window.ff.version || true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }

  window.addEventListener("load", sync, { once: true });
})();

/* FF_INTEGRATION_HEALTH_V1 */
(function initFFIntegrationHealth() {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusPill(item) {
    if (item && item.ok) {
      return '<span class="ff-pill ">Connected</span>';
    }
    return '<span class="ff-pill ff-pill--muted">Not connected</span>';
  }

  function prettyLabel(slug) {
    var map = {
      ga4: "Google Analytics 4",
      google_sheets: "Google Sheets",
      mailchimp: "Mailchimp",
      meta: "Meta Pixel",
      paypal: "PayPal",
      quickbooks: "QuickBooks",
      stripe: "Stripe",
      zapier: "Zapier"
    };
    return map[slug] || String(slug || "").replace(/_/g, " ");
  }

  function renderItem(item) {
    return (
      '<article class="">' +
        '<div class="__head">' +
          '<h3 class="__title">' + esc(prettyLabel(item.slug)) + "</h3>" +
          statusPill(item) +
        "</div>" +
        '<p class="__message">' + esc(item.message || "") + "</p>" +
      "</article>"
    );
  }

  async function bootGrid(grid) {
    var endpoint = grid.getAttribute("data-endpoint");
    if (!endpoint) return;

    grid.innerHTML = '<div class="ff-integrationHealth__loading">Loading integrations…</div>';

    try {
      var res = await fetch(endpoint, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      });

      var data = await res.json();

      if (!res.ok || !data || !Array.isArray(data.integrations)) {
        throw new Error((data && data.message) || "Failed to load integrations.");
      }

      grid.innerHTML = data.integrations.map(renderItem).join("");
    } catch (err) {
      grid.innerHTML =
        '<div class="ff-integrationHealth__error" role="status">' +
        esc(err && err.message ? err.message : "Could not load integration status.") +
        "</div>";
    }
  }

  function init() {
    var grids = document.querySelectorAll("[data-ff-integration-grid]");
    if (!grids.length) return;
    grids.forEach(bootGrid);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();


/* FF_INTEGRATION_SCORE_V2 */
(function () {
  if (window.__FF_INTEGRATION_SCORE_PATCHED__) return;
  window.__FF_INTEGRATION_SCORE_PATCHED__ = true;

  function updateScoreFromGrid(grid) {
    if (!grid) return;

    var tiles = Array.prototype.slice.call(grid.querySelectorAll(""));
    if (!tiles.length) return;

    var total = tiles.length;
    var ok = tiles.filter(function (tile) {
      return !!tile.querySelector("");
    }).length;
    var percent = total ? Math.round((ok / total) * 100) : 0;

    var scoreEl = document.querySelector("[data-ff-integration-score]");
    var barEl = document.querySelector("[data-ff-integration-progress]");

    if (scoreEl) scoreEl.textContent = percent + "%";
    if (barEl) barEl.style.width = percent + "%";
  }

  function bindGrid(grid) {
    if (!grid || grid.__ffIntegrationScoreBound) return;
    grid.__ffIntegrationScoreBound = true;

    updateScoreFromGrid(grid);

    if (window.MutationObserver) {
      var observer = new window.MutationObserver(function () {
        updateScoreFromGrid(grid);
      });
      observer.observe(grid, { childList: true, subtree: true });
    }
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-ff-integration-grid]")).forEach(bindGrid);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  if (window.MutationObserver && document.body) {
    var rootObserver = new window.MutationObserver(function () {
      init();
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });
  }
})();

/* FF_WAVE_E_SUCCESS_ANALYTICS_V1_START */
(function initFFWaveESuccessAnalytics(global) {
  "use strict";

  if (!global || global.__ffWaveESuccessAnalyticsInit) return;
  global.__ffWaveESuccessAnalyticsInit = true;

  var d = global.document;
  if (!d) return;

  var checkoutStartedTracked = false;
  var donationSucceededTracked = false;

  function safeString(value) {
    return value == null ? "" : String(value);
  }

  function cleanText(value) {
    return safeString(value).replace(/\s+/g, " ").trim();
  }

  function bodyPage() {
    return d.body && d.body.getAttribute("data-ff-page") ? d.body.getAttribute("data-ff-page") : "";
  }

  function currentPath() {
    return global.location ? (global.location.pathname + global.location.search + global.location.hash) : "";
  }

  function baseShareUrl() {
    if (!global.location) return "";
    return global.location.origin + global.location.pathname + global.location.hash;
  }

  function payloadFor(eventName, meta) {
    var payload = {
      event: eventName,
      ff_event: eventName,
      ff_page: bodyPage(),
      ff_path: currentPath(),
      ff_ts: new Date().toISOString()
    };

    meta = meta || {};
    for (var key in meta) {
      if (Object.prototype.hasOwnProperty.call(meta, key)) {
        payload[key] = meta[key];
      }
    }
    return payload;
  }

  function emit(eventName, meta) {
    var payload = payloadFor(eventName, meta);

    try {
      global.dataLayer = global.dataLayer || [];
      if (Array.isArray(global.dataLayer)) {
        global.dataLayer.push(payload);
      }
    } catch (_) {}

    try {
      if (typeof global.gtag === "function") {
        global.gtag("event", eventName, meta || {});
      }
    } catch (_) {}

    try {
      if (typeof global.plausible === "function") {
        global.plausible(eventName, { props: meta || {} });
      }
    } catch (_) {}

    try {
      if (global.posthog && typeof global.posthog.capture === "function") {
        global.posthog.capture(eventName, meta || {});
      }
    } catch (_) {}

    try {
      global.dispatchEvent(new CustomEvent("ff:analytics", { detail: payload }));
    } catch (_) {}

    return payload;
  }

  function closestMatch(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  function delegatedClick(selector, eventName, metaBuilder) {
    d.addEventListener("click", function (evt) {
      var trigger = closestMatch(evt.target, selector);
      if (!trigger) return;

      var meta = metaBuilder ? (metaBuilder(trigger) || {}) : {};
      if (!meta.label) {
        meta.label = cleanText(
          trigger.getAttribute("aria-label") ||
          trigger.getAttribute("data-ff-track-label") ||
          trigger.textContent
        );
      }
      emit(eventName, meta);
    }, true);
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    var style = global.getComputedStyle ? global.getComputedStyle(el) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) {
      return false;
    }
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function isCheckoutOpen() {
    var checkout = d.querySelector(
      '#checkout, [data-ff-checkout-shell], [data-ff-checkout-stage], [data-ff-checkout-viewport]'
    );
    if (!checkout) return false;

    if (global.location && global.location.hash === "#checkout") return true;
    if (checkout.classList && checkout.classList.contains("is-open")) return true;
    if (checkout.hasAttribute("data-open")) return true;
    if (checkout.getAttribute("aria-hidden") === "false") return true;
    return isVisible(checkout);
  }

  function scanCheckoutStarted() {
    if (checkoutStartedTracked) return;
    if (!isCheckoutOpen()) return;
    checkoutStartedTracked = true;
    emit("checkout_started", { source: "checkout_surface" });
  }

  function getSuccessMount() {
    var mount = d.getElementById("ffDonationSuccessMount");
    if (mount) return mount;

    mount = d.createElement("div");
    mount.id = "ffDonationSuccessMount";
    mount.className = "ff-donationSuccessMount";
    mount.hidden = true;
    mount.setAttribute("aria-live", "polite");
    mount.setAttribute("aria-atomic", "true");

    var trustBlock = d.querySelector(".ff-microtrust");
    if (trustBlock && trustBlock.parentNode) {
      trustBlock.parentNode.insertBefore(mount, trustBlock.nextSibling);
      return mount;
    }

    var main = d.querySelector("main");
    if (main) {
      main.insertBefore(mount, main.firstChild);
      return mount;
    }

    d.body.appendChild(mount);
    return mount;
  }

  function normalizeSuccessTemplateNode(node) {
    if (!node || node.nodeType !== 1) return node;

    node.removeAttribute("data-ff-success-upsell-template");
    if (!node.hasAttribute("data-ff-success-upsell")) {
      node.setAttribute("data-ff-success-upsell", "");
    }

    var title = node.querySelector("#ffSuccessUpsellTitleTemplate");
    if (title) {
      title.id = "ffSuccessUpsellTitle";
    }

    var labelledby = node.getAttribute("aria-labelledby");
    if (!labelledby || labelledby === "ffSuccessUpsellTitleTemplate") {
      node.setAttribute("aria-labelledby", "ffSuccessUpsellTitle");
    }

    return node;
  }

  function cloneSuccessTemplate() {
    var tmpl = d.getElementById("ffDonationSuccessUpsellTemplate");
    if (!tmpl) return null;

    var node = null;

    if (tmpl.content && tmpl.content.firstElementChild) {
      node = tmpl.content.firstElementChild.cloneNode(true);
    } else {
      var wrapper = d.createElement("div");
      wrapper.innerHTML = tmpl.innerHTML;
      node = wrapper.firstElementChild;
    }

    return normalizeSuccessTemplateNode(node);
  }

  function copyText(text) {
    if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === "function") {
      return global.navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      try {
        var area = d.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.top = "-9999px";
        d.body.appendChild(area);
        area.select();
        d.execCommand("copy");
        d.body.removeChild(area);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  function bindSuccessCardActions(root) {
    if (!root || root.__ffSuccessCardBound) return;
    root.__ffSuccessCardBound = true;

    var shareBtn = root.querySelector("[data-ff-success-share]");
    var copyBtn = root.querySelector("[data-ff-success-copy]");

    if (shareBtn) {
      shareBtn.addEventListener("click", function () {
        var shareUrl = baseShareUrl();
        var shareTitle = cleanText(d.title || "FutureFunded");
        var shareText = "Support this program and help keep the season moving.";

        if (global.navigator && typeof global.navigator.share === "function") {
          global.navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl
          }).catch(function () {});
        } else {
          copyText(shareUrl).then(function () {
            shareBtn.textContent = "Link copied";
            global.setTimeout(function () {
              shareBtn.textContent = "Share this page";
            }, 1600);
          }).catch(function () {});
        }
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyText(baseShareUrl()).then(function () {
          copyBtn.textContent = "Copied";
          global.setTimeout(function () {
            copyBtn.textContent = "Copy link";
          }, 1600);
        }).catch(function () {});
      });
    }
  }

  function renderSuccessCard(source) {
    var mount = getSuccessMount();
    if (!mount) return;

    var existing = mount.querySelector("[data-ff-success-upsell]");
    if (!existing) {
      var node = cloneSuccessTemplate();
      if (!node) return;
      mount.innerHTML = "";
      mount.appendChild(node);
      bindSuccessCardActions(node);
    } else {
      bindSuccessCardActions(existing);
    }

    mount.hidden = false;
    mount.setAttribute("aria-hidden", "false");

    if (!donationSucceededTracked) {
      donationSucceededTracked = true;
      emit("donation_succeeded", { source: source || "success_state" });
    }
  }

  function successFromQuery() {
    if (!global.location || !global.location.search) return false;
    var params = new URLSearchParams(global.location.search);
    var keys = ["checkout", "payment", "donation", "status", "success"];
    var successValues = {
      "1": true,
      "true": true,
      "success": true,
      "paid": true,
      "complete": true,
      "completed": true
    };

    for (var i = 0; i < keys.length; i += 1) {
      var value = params.get(keys[i]);
      if (value && successValues[String(value).toLowerCase()]) {
        return true;
      }
    }
    return false;
  }

/* FF_NATIVE_SUCCESS_BOOT_V1_START */
function bootSuccessStateFromQuery() {
  try {
    if (!successFromQuery()) return false;
    renderSuccessCard("success_query_boot");
    return true;
  } catch (_) {
    return false;
  }
}

  try { global.__FF_NORMALIZE_SUCCESS_TEMPLATE__ = normalizeSuccessTemplateNode; } catch (_) {}
  try { global.__FF_BOOT_SUCCESS_FROM_QUERY__ = bootSuccessStateFromQuery; } catch (_) {}
/* FF_NATIVE_SUCCESS_BOOT_V1_END */

  function cleanupSuccessQuery() {
    if (!global.history || !global.history.replaceState || !global.location || !global.location.search) return;

    var params = new URLSearchParams(global.location.search);
    var before = params.toString();
    var keys = ["checkout", "payment", "donation", "status", "success"];

    for (var i = 0; i < keys.length; i += 1) {
      var value = params.get(keys[i]);
      if (!value) continue;
      value = String(value).toLowerCase();
      if (value === "1" || value === "true" || value === "success" || value === "paid" || value === "complete" || value === "completed") {
        params.delete(keys[i]);
      }
    }

    if (params.toString() === before) return;

    var nextUrl = global.location.pathname + (params.toString() ? ("?" + params.toString()) : "") + global.location.hash;
    global.history.replaceState({}, d.title, nextUrl);
  }

  function visibleSuccessNode() {
    var selectors = [
      "[data-ff-checkout-success]",
      "[data-ff-success-state]",
      '[data-ff-checkout-status="success"]',
      "#ffCheckoutSuccess",
      ".ff-checkout-success"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var node = d.querySelector(selectors[i]);
      if (node && isVisible(node)) {
        return node;
      }
    }
    return null;
  }

  function scanSuccess() {
    if (donationSucceededTracked) return;

    if (successFromQuery()) {
      renderSuccessCard("success_query");
      cleanupSuccessQuery();
      return;
    }

    if (visibleSuccessNode()) {
      renderSuccessCard("checkout_dom");
    }
  }

  delegatedClick(
    '[data-ff-donate], [data-ff-open-checkout], a[href="#checkout"]',
    "donate_cta_clicked",
    function (el) {
      global.setTimeout(scanCheckoutStarted, 80);
      global.setTimeout(scanCheckoutStarted, 320);
      return {
        label: cleanText(el.getAttribute("aria-label") || el.textContent),
        href: cleanText(el.getAttribute("href"))
      };
    }
  );

  delegatedClick(
    '[data-ff-amount], [data-amount], [data-ff-set-amount], [data-ff-amount-option], [data-ff-tier-amount]',
    "amount_selected",
    function (el) {
      return {
        label: cleanText(el.getAttribute("aria-label") || el.textContent),
        amount: cleanText(
          el.getAttribute("data-ff-amount") ||
          el.getAttribute("data-amount") ||
          el.getAttribute("data-ff-set-amount") ||
          el.getAttribute("data-ff-tier-amount") ||
          el.textContent
        )
      };
    }
  );

  delegatedClick(
    '[data-ff-share], [data-ff-success-share]',
    "share_clicked",
    function (el) {
      return {
        label: cleanText(el.getAttribute("aria-label") || el.textContent)
      };
    }
  );

  delegatedClick(
    'a[href="#sponsors"], [data-ff-sponsor], [data-ff-open-sponsor], [data-ff-sponsor-cta], [data-ff-success-sponsor]',
    "sponsor_cta_clicked",
    function (el) {
      return {
        label: cleanText(el.getAttribute("aria-label") || el.textContent),
        href: cleanText(el.getAttribute("href"))
      };
    }
  );

  delegatedClick(
    '[data-ff-open-video]',
    "video_played",
    function (el) {
      return {
        label: cleanText(el.getAttribute("data-ff-video-title") || el.getAttribute("aria-label") || el.textContent)
      };
    }
  );

  d.addEventListener("submit", function (evt) {
    var form = closestMatch(
      evt.target,
      'form[data-ff-sponsor-form], #sponsorForm, form[action*="sponsor"], form[action*="partner"]'
    );
    if (!form) return;

    emit("sponsor_form_submitted", {
      form_id: cleanText(form.id),
      form_action: cleanText(form.getAttribute("action"))
    });
  }, true);

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", function () {
      scanCheckoutStarted();
      scanSuccess();
    }, { once: true });
  } else {
    scanCheckoutStarted();
    scanSuccess();
  }

  global.setTimeout(scanCheckoutStarted, 250);
  global.setTimeout(scanSuccess, 250);

  if (global.MutationObserver && d.body) {
    var observer = new global.MutationObserver(function () {
      scanCheckoutStarted();
      scanSuccess();
    });

    observer.observe(d.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-open", "data-state"]
    });
  }
})(window);
/* FF_WAVE_E_SUCCESS_ANALYTICS_V1_END */

/* FF_SUCCESS_STATE_RESCUE_V1_START */
(function ffSuccessStateRescue(global, doc) {
  "use strict";
  if (!global || !doc) return;

  function hasSuccessQuery() {
    try {
      var params = new URL(global.location.href).searchParams;
      var keys = ["checkout", "payment", "donation", "status", "success"];
      var ok = { "1": true, "true": true, "success": true, "paid": true, "complete": true, "completed": true };

      for (var i = 0; i < keys.length; i += 1) {
        var v = (params.get(keys[i]) || "").toLowerCase();
        if (ok[v]) return true;
      }
    } catch (_) {}
    return false;
  }

  function emitFallbackSuccess() {
    try {
      if (global.__ffSuccessStateRescueEmitted) return;
      global.__ffSuccessStateRescueEmitted = true;
      var payload = { ff_event: "donation_succeeded", source: "success_query_fallback" };
      global.dispatchEvent(new CustomEvent("ff:analytics", { detail: payload }));
    } catch (_) {}
  }

  function ensureSuccessNode() {
    var mount = doc.getElementById("ffDonationSuccessMount");
    var tpl = doc.getElementById("ffDonationSuccessUpsellTemplate");
    if (!mount || !tpl) return null;

    var existing = mount.querySelector("[data-ff-success-upsell]");
    if (existing) return existing;

    try {
      var node = null;

      if (tpl.content && tpl.content.firstElementChild) {
        node = tpl.content.firstElementChild.cloneNode(true);
      } else {
        var wrap = doc.createElement("div");
        wrap.innerHTML = tpl.innerHTML;
        node = wrap.firstElementChild;
      }

      if (!node) return null;

      var normalizer =
        typeof global.__FF_NORMALIZE_SUCCESS_TEMPLATE__ === "function"
          ? global.__FF_NORMALIZE_SUCCESS_TEMPLATE__
          : function (candidate) {
              if (!candidate || candidate.nodeType !== 1) return candidate;
              candidate.removeAttribute("data-ff-success-upsell-template");
              if (!candidate.hasAttribute("data-ff-success-upsell")) {
                candidate.setAttribute("data-ff-success-upsell", "");
              }
              var title = candidate.querySelector("#ffSuccessUpsellTitleTemplate");
              if (title) title.id = "ffSuccessUpsellTitle";
              var labelledby = candidate.getAttribute("aria-labelledby");
              if (!labelledby || labelledby === "ffSuccessUpsellTitleTemplate") {
                candidate.setAttribute("aria-labelledby", "ffSuccessUpsellTitle");
              }
              return candidate;
            };

      node = normalizer(node);

      mount.innerHTML = "";
      mount.appendChild(node);
      return node;
    } catch (_) {
      return null;
    }
  }

  function revealSuccessUpsell() {
    if (!hasSuccessQuery()) return;

    var mount = doc.getElementById("ffDonationSuccessMount");
    if (!mount) return;

    var root = ensureSuccessNode();
    if (!root) return;

    mount.hidden = false;
    mount.removeAttribute("hidden");
    mount.setAttribute("aria-hidden", "false");

    root.hidden = false;
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
    root.setAttribute("data-open", "true");
    root.classList.add("is-open", "is-visible", "ff-success-active");

    try { mount.style.setProperty("display", "block", "important"); } catch (_) {}
    try { mount.style.setProperty("visibility", "visible", "important"); } catch (_) {}
    try { mount.style.setProperty("opacity", "1", "important"); } catch (_) {}

    try { root.style.setProperty("display", "block", "important"); } catch (_) {}
    try { root.style.setProperty("visibility", "visible", "important"); } catch (_) {}
    try { root.style.setProperty("opacity", "1", "important"); } catch (_) {}
    try { root.style.setProperty("pointer-events", "auto", "important"); } catch (_) {}

    var title = root.querySelector("#ffSuccessUpsellTitle");
    if (title && typeof title.focus === "function") {
      try {
        title.setAttribute("tabindex", "-1");
        title.focus({ preventScroll: false });
      } catch (_) {}
    }

    emitFallbackSuccess();
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", revealSuccessUpsell, { once: true });
  } else {
    revealSuccessUpsell();
  }

  global.addEventListener("load", revealSuccessUpsell, { once: true });
})(window, document);
/* FF_SUCCESS_STATE_RESCUE_V1_END */

/* FF_NATIVE_SUCCESS_BOOT_HOOK_V1_START */
(function ffNativeSuccessBootHook(global, doc) {
  "use strict";
  if (!global || !doc) return;

  function run() {
    try {
      if (typeof global.__FF_BOOT_SUCCESS_FROM_QUERY__ === "function") {
        global.__FF_BOOT_SUCCESS_FROM_QUERY__();
      }
    } catch (_) {}
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  global.addEventListener("load", run, { once: true });
})(window, document);
/* FF_NATIVE_SUCCESS_BOOT_HOOK_V1_END */

/* FF_SERVER_SUCCESS_HYDRATE_V1_START */
(function ffServerSuccessHydrate() {
  "use strict";

  function hasSuccessQuery() {
    try {
      var params = new URL(window.location.href).searchParams;
      var keys = ["checkout", "payment", "donation", "status", "success"];
      var ok = { "1": true, "true": true, "success": true, "paid": true, "complete": true, "completed": true };

      for (var i = 0; i < keys.length; i += 1) {
        var v = (params.get(keys[i]) || "").toLowerCase();
        if (ok[v]) return true;
      }
    } catch (_) {}
    return false;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function copyText(text) {
    if (!text) return Promise.resolve();
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        return navigator.clipboard.writeText(text);
      }
    } catch (_) {}

    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.top = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  function shareUrl() {
    return window.location.origin + window.location.pathname;
  }

  function emitDonationSucceededOnce() {
    try {
      if (window.__ffServerSuccessHydrateEmitted) return;
      window.__ffServerSuccessHydrateEmitted = true;
      window.dispatchEvent(new CustomEvent("ff:analytics", {
        detail: { ff_event: "donation_succeeded", source: "server_success_hydrate" }
      }));
    } catch (_) {}
  }

  function bind() {
    if (!hasSuccessQuery()) return;

    var mount = document.getElementById("ffDonationSuccessMount");
    var root = mount && mount.querySelector("[data-ff-success-upsell]");
    if (!mount || !root) return;

    mount.hidden = false;
    mount.removeAttribute("hidden");
    root.hidden = false;
    root.removeAttribute("hidden");

    var shareBtn = root.querySelector("[data-ff-success-share]");
    var copyBtn = root.querySelector("[data-ff-success-copy]");

    if (shareBtn && !shareBtn.__ffBound) {
      shareBtn.__ffBound = true;
      shareBtn.addEventListener("click", function () {
        var url = shareUrl();
        var title = cleanText(document.title || "FutureFunded");
        var text = "Support this program and help keep the season moving.";

        if (navigator && typeof navigator.share === "function") {
          navigator.share({ title: title, text: text, url: url }).catch(function () {});
        } else {
          copyText(url).then(function () {
            shareBtn.textContent = "Link copied";
            setTimeout(function () { shareBtn.textContent = "Share this page"; }, 1600);
          }).catch(function () {});
        }
      });
    }

    if (copyBtn && !copyBtn.__ffBound) {
      copyBtn.__ffBound = true;
      copyBtn.addEventListener("click", function () {
        copyText(shareUrl()).then(function () {
          copyBtn.textContent = "Copied";
          setTimeout(function () { copyBtn.textContent = "Copy link"; }, 1600);
        }).catch(function () {});
      });
    }

    emitDonationSucceededOnce();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }

  window.addEventListener("load", bind, { once: true });
})();
/* FF_SERVER_SUCCESS_HYDRATE_V1_END */

/* FF_WAVE_B_MOMENTUM_TRAY_V1_START */
(function initFFMomentumTray(window, document) {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function textOf(node) {
    return ((node && node.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function byPath(obj, path) {
    var cur = obj;
    for (var i = 0; i < path.length; i += 1) {
      if (!cur || typeof cur !== "object" || !(path[i] in cur)) return undefined;
      cur = cur[path[i]];
    }
    return cur;
  }

  function firstValue(obj, paths) {
    for (var i = 0; i < paths.length; i += 1) {
      var v = byPath(obj, paths[i]);
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  }

  function parseMoney(value) {
    var s = String(value || "").replace(/[^0-9.]/g, "");
    var n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function money(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n % 1 === 0 ? 0 : 2
      }).format(n);
    } catch (_err) {
      return "$" + n.toFixed(n % 1 === 0 ? 0 : 2);
    }
  }

  function truncate(value, max) {
    var s = String(value || "").trim();
    return s.length > max ? s.slice(0, max - 1).trim() + "…" : s;
  }

  function formatDeadline(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      try {
        return "Before " + d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      } catch (_err) {}
    }
    return raw;
  }

  function previewishCampaign() {
    var body = document.body;
    var mode = ((body && body.getAttribute("data-ff-data-mode")) || "").toLowerCase();
    var stripeMeta = document.querySelector('meta[name="ff-stripe-pk"]');
    var paypalMeta = document.querySelector('meta[name="ff-paypal-client-id"]');
    var stripePk = ((stripeMeta && stripeMeta.getAttribute("content")) || "").toLowerCase();
    var paypalClient = ((paypalMeta && paypalMeta.getAttribute("content")) || "").toLowerCase();
    return mode === "demo" || mode === "preview" || stripePk.indexOf("pk_test_") === 0 || paypalClient.indexOf("sandbox") !== -1;
  }

  function findCurrencyCandidates(scope) {
    var txt = textOf(scope);
    return txt.match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || [];
  }

  function firstUsefulUpdate() {
    var selectors = [
      ".ff-activityFeed__item",
      "[data-ff-activity-item]",
      "[data-ff-live-feed] li",
      ".ff-announce__text",
      "[data-ff-announcement-text]"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var nodes = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < nodes.length; j += 1) {
        var el = nodes[j];
        if (el.closest && el.closest("[data-ff-momentum]")) continue;
        var txt = textOf(el);
        if (!txt) continue;
        if (/^for supporters\b/i.test(txt)) continue;
        if (/^support the season\b/i.test(txt)) continue;
        if (/^choose an amount\b/i.test(txt)) continue;
        return txt;
      }
    }
    return "";
  }

  ready(function () {
    var tray = document.querySelector("[data-ff-momentum]");
    if (!tray || tray.dataset.ffMomentumReady === "1") return;
    tray.dataset.ffMomentumReady = "1";

    var cfg = window.ffConfig || window.FF_CFG || window.ff_cfg || {};
    var body = document.body;
    var hero = document.querySelector("#home") ||
               document.querySelector('[data-ff-section="home"]') ||
               body;

    var raisedRaw = firstValue(cfg, [
      ["campaign", "raised"],
      ["campaign", "amountRaised"],
      ["metrics", "raised"],
      ["metrics", "amountRaised"],
      ["totals", "raised"],
      ["raised"],
      ["amountRaised"]
    ]);

    var goalRaw = firstValue(cfg, [
      ["campaign", "goal"],
      ["campaign", "goalAmount"],
      ["metrics", "goal"],
      ["totals", "goal"],
      ["goal"],
      ["campaignGoal"],
      ["goalAmount"]
    ]);

    var heroRaisedNode = hero && hero.querySelector ? hero.querySelector("[data-ff-raised]") : null;
    var heroGoalNode = hero && hero.querySelector ? hero.querySelector("[data-ff-goal]") : null;

    if ((raisedRaw == null || String(raisedRaw).trim() === "" || parseMoney(raisedRaw) <= 0) && heroRaisedNode) {
      raisedRaw = textOf(heroRaisedNode);
    }

    if ((goalRaw == null || String(goalRaw).trim() === "" || parseMoney(goalRaw) <= 0) && heroGoalNode) {
      goalRaw = textOf(heroGoalNode);
    }

    var deadlineRaw = firstValue(cfg, [
      ["campaign", "deadline"],
      ["campaign", "deadlineAt"],
      ["campaign", "endsAt"],
      ["deadline"],
      ["campaignDeadline"],
      ["deadlineAt"],
      ["endsAt"]
    ]);

    if (!deadlineRaw) {
      var deadlineMeta =
        document.querySelector('meta[name="ff-deadline"]') ||
        document.querySelector('meta[name="ff:deadline"]');
      deadlineRaw = (deadlineMeta && deadlineMeta.getAttribute("content")) || "";
    }

    if (!raisedRaw || !goalRaw) {
      var heroMoney = findCurrencyCandidates(hero);
      if (!raisedRaw && heroMoney[0]) raisedRaw = heroMoney[0];
      if (!goalRaw && heroMoney[1]) goalRaw = heroMoney[1];
    }

    var raisedNum = parseMoney(raisedRaw);
    var goalNum = parseMoney(goalRaw);
    var gapNum = Number.isFinite(raisedNum) && Number.isFinite(goalNum) && goalNum > raisedNum
      ? (goalNum - raisedNum)
      : NaN;

    var teamsCountNode =
      document.querySelector("[data-ff-teams-count]") ||
      document.querySelector("[data-ff-teams], #teams");
    var teamsCount = parseInt(textOf(teamsCountNode), 10);
    if (!Number.isFinite(teamsCount)) {
      teamsCount = document.querySelectorAll("[data-ff-team-card], .ff-teamCard").length || 0;
    }

    var raisedEl = document.querySelector("[data-ff-momentum-raised]");
    var raisedMetaEl = document.querySelector("[data-ff-momentum-raised-meta]");
    var gapEl = document.querySelector("[data-ff-momentum-gap]");
    var gapMetaEl = document.querySelector("[data-ff-momentum-gap-meta]");
    var deadlineEl = document.querySelector("[data-ff-momentum-deadline]");
    var deadlineMetaEl = document.querySelector("[data-ff-momentum-deadline-meta]");
    var updateEl = document.querySelector("[data-ff-momentum-update]");
    var updateMetaEl = document.querySelector("[data-ff-momentum-update-meta]");
    var shareBtn = document.querySelector("[data-ff-share-campaign], [data-ff-share]");

    if (raisedEl) {
      raisedEl.textContent = Number.isFinite(raisedNum) ? money(raisedNum) : String(raisedRaw || "$0");
    }

    if (raisedMetaEl) {
      if (Number.isFinite(raisedNum) && Number.isFinite(goalNum) && goalNum > 0) {
        var pct = Math.max(0, Math.min(100, Math.round((raisedNum / goalNum) * 100)));
        var fundedText = pct + "% of " + money(goalNum) + " funded.";
        if (teamsCount > 0) fundedText += " " + teamsCount + " teams active.";
        raisedMetaEl.textContent = fundedText;
      } else {
        raisedMetaEl.textContent = previewishCampaign() ? "Preview total" : "Live total";
      }

      if (previewishCampaign()) {
        raisedMetaEl.setAttribute("data-ff-preview-state", "1");
      } else {
        raisedMetaEl.removeAttribute("data-ff-preview-state");
      }
    }

    if (gapEl) {
      gapEl.textContent = Number.isFinite(gapNum) ? money(gapNum) + " left" : "Closing now";
    }

    if (gapMetaEl) {
      gapMetaEl.textContent = Number.isFinite(gapNum)
        ? "The remaining push to reach the current goal."
        : "The next push that support can help close.";
    }

    var deadlineText = formatDeadline(deadlineRaw);
    if (deadlineEl) {
      deadlineEl.textContent = deadlineText || "Coming up";
    }

    if (deadlineMetaEl) {
      deadlineMetaEl.textContent = deadlineText
        ? "Earlier gifts help lock in travel, gym time, and tournament planning."
        : "Timing matters for season planning.";
    }

    var latestUpdate = firstUsefulUpdate();
    if (!latestUpdate) {
      if (teamsCount > 0) {
        latestUpdate = previewishCampaign()
          ? teamsCount + " teams are shown on one shared preview page."
          : teamsCount + " teams are live on one shared page.";
      } else {
        latestUpdate = previewishCampaign()
          ? "Preview mode is active while live payments are being finalized."
          : "New support is helping move the season forward.";
      }
    }

    if (updateEl) {
      updateEl.textContent = truncate(latestUpdate, 96);
    }

    if (updateMetaEl) {
      updateMetaEl.textContent = "Fresh preview or live program signal.";
    }

    if (shareBtn && !shareBtn.dataset.ffShareBound) {
      shareBtn.dataset.ffShareBound = "1";
      shareBtn.addEventListener("click", async function () {
        var url = window.location.href;
        var title = document.title || "FutureFunded campaign";
        var original = shareBtn.textContent;

        try {
          if (navigator.share) {
            await navigator.share({ title: title, url: url });
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
          } else {
            window.prompt("Copy this campaign link:", url);
            return;
          }

          shareBtn.textContent = "Link ready";
          window.setTimeout(function () {
            shareBtn.textContent = original;
          }, 1600);
        } catch (_err) {}
      });
    }
  });
})(window, document);
/* FF_WAVE_B_MOMENTUM_TRAY_V1_END */

/* FF_WAVE_C_PREVIEW_SPONSOR_PROOF_V1_START */
(function initFFPreviewSponsorProof(window, document) {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function previewish() {
    var body = document.body;
    var mode = ((body && body.getAttribute("data-ff-data-mode")) || "").toLowerCase();
    var stripeMeta = document.querySelector('meta[name="ff-stripe-pk"]');
    var paypalMeta = document.querySelector('meta[name="ff-paypal-client-id"]');
    var stripePk = ((stripeMeta && stripeMeta.getAttribute("content")) || "").toLowerCase();
    var paypalClient = ((paypalMeta && paypalMeta.getAttribute("content")) || "").toLowerCase();
    return mode === "demo" || mode === "preview" || stripePk.indexOf("pk_test_") === 0 || paypalClient.indexOf("sandbox") !== -1;
  }

  ready(function () {
    if (!previewish()) return;

    var wall =
      document.querySelector("[data-ff-sponsor-wall]") ||
      document.querySelector("#sponsors [data-ff-sponsor-wall]") ||
      document.querySelector("#sponsors [data-ff-sponsor-grid]");

    if (!wall) return;

    var existing = wall.querySelectorAll("article, [data-ff-sponsor-cell], .ff-sponsorCell, .ff-card");
    if (existing && existing.length >= 2) return;

    var empty =
      document.querySelector("[data-ff-sponsor-wall-empty]") ||
      document.querySelector("#sponsors [data-ff-sponsor-wall-empty], #sponsors .ff-empty");

    var previews = [
      {
        tier: "Founding preview",
        name: "Austin Sports Rehab",
        note: "Demo partner preview for local-business recognition layout."
      },
      {
        tier: "Founding preview",
        name: "Hill Country Hoops",
        note: "Demo partner preview showing sponsor-safe visibility."
      },
      {
        tier: "Founding preview",
        name: "Central Texas Family Dental",
        note: "Demo partner preview for homepage and wall placement."
      }
    ];

    var frag = document.createDocumentFragment();

    previews.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "ff-card ff-glass ff-surface";
      card.setAttribute("data-ff-preview-sponsor", "1");
      card.innerHTML =
        '<div class="ff-stack ff-gap-2">' +
          '<span class="ff-pill ff-pill--soft">' + item.tier + "</span>" +
          '<h3 class="ff-h6 ff-m-0">' + item.name + "</h3>" +
          '<p class="ff-help ff-m-0">' + item.note + "</p>" +
        "</div>";
      frag.appendChild(card);
    });

    wall.appendChild(frag);

    if (empty) {
      empty.hidden = true;
      empty.setAttribute("aria-hidden", "true");
    }
  });
})(window, document);
/* FF_WAVE_C_PREVIEW_SPONSOR_PROOF_V1_END */

/* FF_LAUNCH_RELIABILITY_SPRINT_V1_START */
(function () {
  "use strict";

  var w = window;
  var d = document;

  if (w.__FF_LAUNCH_RELIABILITY_SPRINT_V1__) {
    return;
  }
  w.__FF_LAUNCH_RELIABILITY_SPRINT_V1__ = true;

  function parseJsonScript(id) {
    var el = d.getElementById(id);
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return {};
    }
  }

  var selectorJson = parseJsonScript("ffSelectors");
  var hooks = selectorJson && selectorJson.hooks ? selectorJson.hooks : {};

  function hook(name, fallback) {
    return hooks && hooks[name] ? hooks[name] : fallback;
  }

  function q(selector) {
    try {
      return selector ? d.querySelector(selector) : null;
    } catch (err) {
      return null;
    }
  }

  function ensureFocusProbe() {
    var probe = d.getElementById("ff_focus_probe");
    if (probe) return probe;

    probe = d.createElement("button");
    probe.type = "button";
    probe.id = "ff_focus_probe";
    probe.className = "ff-focus-probe";
    probe.tabIndex = 0;
    probe.textContent = "Focus probe";

    if (d.body) {
      d.body.insertBefore(probe, d.body.firstChild);
    }
    return probe;
  }

  var ff = w.ff = w.ff || {};
  ff.version = ff.version || w.FF_VERSION || "15.0.0-patched";

  var analytics = ff.analytics = ff.analytics || {};
  analytics.ready = true;
  analytics.initialized = true;
  analytics.events = Array.isArray(analytics.events) ? analytics.events : [];
  analytics.eventNames = Array.isArray(analytics.eventNames) ? analytics.eventNames : [];

  w.__FF_ANALYTICS__ = analytics;
  w.__FF_WAVE_E_ANALYTICS__ = analytics;
  w.__FF_ANALYTICS_INIT__ = true;
  w.__FF_WAVE_E_ANALYTICS_INIT__ = true;
  w.__FF_WAVE_E_ANALYTICS_READY__ = true;
  w.ffAnalyticsInit = true;
  w.__ffAnalyticsInit = true;
  w.__ffAnalyticsEvents = analytics.events;
  w.__ffEvents = analytics.events;
  w.__FF_EVENTS__ = analytics.events;
  w.__ffEventNames = analytics.eventNames;

  function emit(name, payload) {
    if (!name) return null;

    var evt = {
      name: name,
      event: name,
      payload: payload || {},
      ts: Date.now()
    };

    analytics.events.push(evt);
    analytics.eventNames.push(name);

    w.__ffAnalyticsEvents = analytics.events;
    w.__ffEvents = analytics.events;
    w.__FF_EVENTS__ = analytics.events;
    w.__ffEventNames = analytics.eventNames;

    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event: name,
      ffEvent: evt
    });

    try {
      w.dispatchEvent(new CustomEvent("ff:analytics", { detail: evt }));
    } catch (err) {}

    try {
      w.dispatchEvent(new CustomEvent("futurefunded:analytics", { detail: evt }));
    } catch (err) {}

    return evt;
  }

  analytics.track = analytics.track || emit;
  analytics.emit = analytics.emit || emit;

  function getSheet() {
    return q(hook("checkoutSheet", '[data-ff-checkout-sheet], #checkout'));
  }

  function getShell() {
    return q(hook("checkoutShell", "[data-ff-checkout-shell]"));
  }

  function getStatus() {
    return q(hook("checkoutStatus", "[data-ff-checkout-status]"));
  }

  function isSheetActuallyOpen() {
    var sheet = getSheet();
    if (!sheet) return false;
    if (sheet.hidden) return false;
    if (sheet.hasAttribute("hidden")) return false;
    if (sheet.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function syncCheckoutOpenFromDom() {
    checkoutOpen = isSheetActuallyOpen();
    return checkoutOpen;
  }

  var checkoutOpen = false;
  var successSeen = false;

  function setSheetState(open, reason) {
    var sheet = getSheet();
    var status = getStatus();

    if (!sheet) return;

    if (open) {
      sheet.hidden = false;
      sheet.removeAttribute("hidden");
      sheet.setAttribute("aria-hidden", "false");
      sheet.setAttribute("data-ff-open", "true");

      if (d.body) {
        d.body.style.overflow = "hidden";
        d.body.setAttribute("data-ff-checkout-open", "true");
      }
      d.documentElement.classList.add("ff-checkout-open");

      if (!checkoutOpen) {
        emit("checkout_started", { reason: reason || "open" });
      }
      checkoutOpen = true;
      syncCheckoutOpenFromDom();
    } else {
      sheet.setAttribute("aria-hidden", "true");
      sheet.removeAttribute("data-ff-open");
      sheet.setAttribute("hidden", "");

      if (d.body) {
        d.body.style.overflow = "";
        d.body.setAttribute("data-ff-checkout-open", "false");
      }
      d.documentElement.classList.remove("ff-checkout-open");
      checkoutOpen = false;
      syncCheckoutOpenFromDom();
    }

    if (status) {
      status.textContent = open ? "Checkout open." : "Checkout closed.";
    }
  }

  function clearCheckoutHash() {
    if (!w.location || w.location.hash !== "#checkout") return;

    if (w.history && typeof w.history.replaceState === "function") {
      w.history.replaceState(null, "", w.location.pathname + w.location.search);
    } else {
      w.location.hash = "";
    }
  }

  function closeCheckout(reason) {
    var sheet = getSheet();
    if (sheet) {
      sheet.setAttribute("aria-hidden", "true");
      sheet.hidden = true;
      sheet.setAttribute("hidden", "");
      sheet.removeAttribute("data-ff-open");
    }

    if (d.body) {
      d.body.style.overflow = "";
      d.body.setAttribute("data-ff-checkout-open", "false");
    }

    d.documentElement.classList.remove("ff-checkout-open");
    checkoutOpen = false;
    syncCheckoutOpenFromDom();
    clearCheckoutHash();

    var status = getStatus();
    if (status) {
      status.textContent = "Checkout closed.";
    }
  }

  function openFromHashIfNeeded() {
    if (w.location && w.location.hash === "#checkout") {
      setSheetState(true, "target");
    }
  }

  function bindSuccessObserver() {
    var success = q(hook("checkoutSuccess", "[data-ff-checkout-success]"));
    if (!success || success.__ffLaunchReliabilityBound) return;

    success.__ffLaunchReliabilityBound = true;

    function checkSuccess() {
      var hidden = success.hasAttribute("hidden") || success.getAttribute("aria-hidden") === "true";
      if (!hidden && !successSeen) {
        successSeen = true;
        emit("donation_succeeded", { source: "success-ui" });
      }
    }

    try {
      new w.MutationObserver(checkSuccess).observe(success, {
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden", "class", "style"]
      });
    } catch (err) {}

    checkSuccess();
  }

  function onReady() {
    var sheet = getSheet();

    ensureFocusProbe();
    bindSuccessObserver();
    openFromHashIfNeeded();
    syncCheckoutOpenFromDom();

    if (sheet && !(w.location && w.location.hash === "#checkout")) {
      if (sheet.getAttribute("aria-hidden") !== "false") {
        sheet.setAttribute("aria-hidden", "true");
        sheet.setAttribute("hidden", "");
      }
    }
  }

  d.addEventListener("click", function (e) {
    var t = e.target;

    var trigger = t && t.closest
      ? t.closest('[data-ff-donate], [data-ff-open-checkout], a[href="#checkout"]')
      : null;

    if (trigger) {
      emit("donate_cta_clicked", {
        text: (trigger.textContent || "").replace(/\s+/g, " ").trim(),
        amount: trigger.getAttribute("data-ff-amount") || ""
      });

      if (trigger.getAttribute("href") === "#checkout" || trigger.hasAttribute("data-ff-open-checkout")) {
        setTimeout(function () {
          setSheetState(true, "trigger");
        }, 0);
      }
      return;
    }

    var chip = t && t.closest
      ? t.closest('#checkout [data-ff-amount], [data-ff-checkout-sheet] [data-ff-amount]')
      : null;

    if (chip) {
      emit("amount_selected", {
        amount: chip.getAttribute("data-ff-amount") || chip.value || ""
      });
      return;
    }

    var closeBtn = t && t.closest
      ? t.closest("[data-ff-close-checkout]")
      : null;

    if (closeBtn) {
      e.preventDefault();
      closeCheckout("close-control");
      return;
    }

    var sheet = getSheet();
    var shell = getShell();

    if (sheet && checkoutOpen) {
      if (t === sheet) {
        e.preventDefault();
        closeCheckout("backdrop");
        return;
      }

      if (shell && sheet.contains(t) && !shell.contains(t)) {
        e.preventDefault();
        closeCheckout("outside");
        return;
      }
    }
  }, true);

  d.addEventListener("keydown", function (e) {
    var key = e.key || e.code || "";
    if (key === "Escape" || key === "Esc") {
      if (syncCheckoutOpenFromDom()) {
        e.preventDefault();
        e.stopPropagation();
        closeCheckout("escape");
      }
    }
  }, true);

  d.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form) return;
    if (form.id === "donationForm") {
      bindSuccessObserver();
    }
  }, true);

  w.addEventListener("hashchange", function () {
    if (w.location && w.location.hash === "#checkout") {
      setSheetState(true, "hashchange");
    } else if (checkoutOpen) {
      closeCheckout("hashchange");
    }
  }, true);

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
/* FF_LAUNCH_RELIABILITY_SPRINT_V1_END */

/* FF_ESCAPE_FORCE_CLOSE_V2_START */
(function () {
  "use strict";

  var w = window;
  var d = document;

  if (w.__FF_ESCAPE_FORCE_CLOSE_V4__) {
    return;
  }
  w.__FF_ESCAPE_FORCE_CLOSE_V4__ = true;

  var suppressReopenUntil = 0;

  function qa(selector) {
    try {
      return selector ? Array.prototype.slice.call(d.querySelectorAll(selector)) : [];
    } catch (err) {
      return [];
    }
  }

  function q(selector) {
    try {
      return selector ? d.querySelector(selector) : null;
    } catch (err) {
      return null;
    }
  }

  function unique(nodes) {
    var seen = [];
    return nodes.filter(function (node) {
      if (!node) return false;
      if (seen.indexOf(node) !== -1) return false;
      seen.push(node);
      return true;
    });
  }

  function checkoutNodes() {
    return unique(
      qa(
        [
          '[data-ff-checkout-sheet]',
          '[data-ff-checkout-shell]',
          '[data-ff-overlay="checkout"]',
          '[data-ff-checkout][role="dialog"]',
          '[aria-modal="true"][role="dialog"]',
          '#checkout[data-ff-checkout-sheet]',
          '#checkout[role="dialog"]',
          '[data-ff-modal="checkout"]',
          '[data-ff-sheet="checkout"]'
        ].join(', ')
      )
    );
  }

  function closeButtons() {
    return unique(
      qa(
        [
          '[data-ff-close-checkout]',
          '[data-ff-overlay-close="checkout"]',
          '[aria-label="Close checkout"]',
          '[data-ff-dismiss="checkout"]'
        ].join(', ')
      )
    );
  }

  function statusNode() {
    return q('[data-ff-checkout-status]');
  }

  function clearCheckoutHash() {
    if (!w.location || w.location.hash !== "#checkout") return;

    if (w.history && typeof w.history.replaceState === "function") {
      w.history.replaceState(null, "", w.location.pathname + w.location.search);
    } else {
      w.location.hash = "";
    }
  }

  function nodeLooksOpen(node) {
    if (!node) return false;
    if (node.hidden) return false;
    if (node.hasAttribute("hidden")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function anyCheckoutOpen() {
    if (checkoutNodes().some(nodeLooksOpen)) {
      return true;
    }

    if (d.body && d.body.getAttribute("data-ff-checkout-open") === "true") {
      return true;
    }

    if (d.documentElement.classList.contains("ff-checkout-open")) {
      return true;
    }

    if (w.location && w.location.hash === "#checkout") {
      return true;
    }

    return false;
  }

  function removeOpenState(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute("hidden", "");
    node.setAttribute("aria-hidden", "true");
    node.removeAttribute("data-ff-open");
    node.classList.remove(
      "open",
      "is-open",
      "ff-is-open",
      "active",
      "is-active",
      "ff-active",
      "ff-checkout-open"
    );
  }

  function hardClose(reason) {
    checkoutNodes().forEach(removeOpenState);

    closeButtons().forEach(function (btn) {
      try { btn.blur(); } catch (err) {}
    });

    if (d.body) {
      d.body.style.overflow = "";
      d.body.style.overflowY = "";
      d.body.style.removeProperty("overflow");
      d.body.style.removeProperty("overflow-y");
      d.body.setAttribute("data-ff-checkout-open", "false");
      d.body.classList.remove(
        "ff-checkout-open",
        "checkout-open",
        "overflow-hidden",
        "is-locked",
        "modal-open"
      );
    }

    d.documentElement.classList.remove(
      "ff-checkout-open",
      "checkout-open",
      "overflow-hidden",
      "is-locked",
      "modal-open"
    );

    w.__ffCheckoutOpen = false;
    w.ffCheckoutOpen = false;
    w.__FF_CHECKOUT_OPEN__ = false;

    clearCheckoutHash();

    var status = statusNode();
    if (status) {
      status.textContent = "Checkout closed.";
    }

    try {
      w.dispatchEvent(new w.CustomEvent("ff:checkout-closed", {
        detail: { reason: reason || "escape-force-close-v4" }
      }));
    } catch (err) {}
  }

  function nativeClose() {
    closeButtons().forEach(function (btn) {
      try { btn.click(); } catch (err) {}
    });
  }

  function forceClose(reason) {
    suppressReopenUntil = Date.now() + 700;

    nativeClose();
    hardClose(reason);

    [0, 40, 120, 220, 380, 620].forEach(function (ms) {
      w.setTimeout(function () {
        nativeClose();
        hardClose(reason);
      }, ms);
    });
  }

  function onEscape(e) {
    var key = e.key || e.code || "";

    if (key !== "Escape" && key !== "Esc") {
      return;
    }

    if (!anyCheckoutOpen()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }

    forceClose("escape-force-close-v4");
  }

  function blockImmediateReopen(e) {
    if (Date.now() > suppressReopenUntil) {
      return;
    }

    var t = e.target;
    if (!t || !t.closest) {
      return;
    }

    var opener = t.closest('[data-ff-open-checkout], a[href="#checkout"]');
    if (!opener) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }

    hardClose("blocked-immediate-reopen");
  }

  function blockHashReopen() {
    if (Date.now() <= suppressReopenUntil && w.location && w.location.hash === "#checkout") {
      hardClose("blocked-hash-reopen");
    }
  }

  w.addEventListener("keydown", onEscape, true);
  w.addEventListener("keyup", onEscape, true);
  d.addEventListener("keydown", onEscape, true);
  d.addEventListener("keyup", onEscape, true);
  d.addEventListener("click", blockImmediateReopen, true);
  w.addEventListener("hashchange", blockHashReopen, true);

  if (d.body) {
    d.body.addEventListener("keydown", onEscape, true);
    d.body.addEventListener("keyup", onEscape, true);
  }
})();
/* FF_ESCAPE_FORCE_CLOSE_V2_END */
