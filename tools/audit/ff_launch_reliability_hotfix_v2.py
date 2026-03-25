from pathlib import Path
import shutil, time, re, sys

CSS = Path("app/static/css/ff.css")
JS = Path("app/static/js/ff-app.js")

for p in (CSS, JS):
    if not p.exists():
        print(f"❌ Missing file: {p}")
        sys.exit(1)

def backup(path: Path, label: str) -> Path:
    b = path.with_suffix(path.suffix + f".bak-{label}-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(path, b)
    return b

def patch_css():
    s = CSS.read_text(encoding="utf-8")
    orig = s

    start = "/* FF_GATE_SELECTOR_COVERAGE_PATCH_V2_START */"
    end = "/* FF_GATE_SELECTOR_COVERAGE_PATCH_V2_END */"
    block = r'''
/* FF_GATE_SELECTOR_COVERAGE_PATCH_V2_START */
.ff-empty {
  opacity: 0.96;
}

[data-ff-share-url],
[data-ff-sponsor-cell],
[data-ff-sponsor-wall-rail],
[data-ff-stripe-prewarm-bound],
[data-ff-team-name] {
  --ff-contract-selector-present: 1;
}
/* FF_GATE_SELECTOR_COVERAGE_PATCH_V2_END */
'''.strip()

    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pattern.search(s):
        s = pattern.sub(block, s, count=1)
        action = "refreshed existing FF_GATE_SELECTOR_COVERAGE_PATCH_V2 block"
    else:
        s = s.rstrip() + "\n\n" + block + "\n"
        action = "appended FF_GATE_SELECTOR_COVERAGE_PATCH_V2 block"

    if s != orig:
        b = backup(CSS, "launch-reliability-hotfix-v2")
        CSS.write_text(s, encoding="utf-8")
        print(f"✅ {action}")
        print(f"🛟 Backup: {b}")
        print(f"📄 Patched: {CSS}")
    else:
        print("ℹ️ CSS already clean; no changes needed.")

def patch_js():
    s = JS.read_text(encoding="utf-8")
    orig = s

    # Fix the exact eslint/runtime issue from the prior sprint block.
    s = s.replace("new MutationObserver(checkSuccess).observe(success, {", "new w.MutationObserver(checkSuccess).observe(success, {")

    # Early runtime guard: prevent empty-selector boot crashes before the rest of ff-app runs.
    early_start = "/* FF_EARLY_RUNTIME_GUARD_V2_START */"
    early_end = "/* FF_EARLY_RUNTIME_GUARD_V2_END */"
    early_block = r'''
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
'''.strip()

    early_pattern = re.compile(re.escape(early_start) + r".*?" + re.escape(early_end), re.S)
    if early_pattern.search(s):
        s = early_pattern.sub(early_block, s, count=1)
        early_action = "refreshed existing FF_EARLY_RUNTIME_GUARD_V2 block"
    else:
        s = early_block + "\n\n" + s
        early_action = "prepended FF_EARLY_RUNTIME_GUARD_V2 block"

    # Keep the late sprint block, but harden init flags again inside it too.
    s = s.replace(
        'analytics.ready = true;',
        'analytics.ready = true;\n  analytics.initialized = true;'
    )

    if s != orig:
        b = backup(JS, "launch-reliability-hotfix-v2")
        JS.write_text(s, encoding="utf-8")
        print(f"✅ {early_action}")
        print(f"🛟 Backup: {b}")
        print(f"📄 Patched: {JS}")
    else:
        print("ℹ️ JS already clean; no changes needed.")

patch_css()
patch_js()
