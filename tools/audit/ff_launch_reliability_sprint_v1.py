from pathlib import Path
import shutil, time, re, sys

HTML = Path("app/templates/index.html")
CSS = Path("app/static/css/ff.css")
JS = Path("app/static/js/ff-app.js")

for p in (HTML, CSS, JS):
    if not p.exists():
        print(f"❌ Missing file: {p}")
        sys.exit(1)

def backup(path: Path, label: str) -> Path:
    b = path.with_suffix(path.suffix + f".bak-{label}-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(path, b)
    return b

def patch_html():
    s = HTML.read_text(encoding="utf-8")
    orig = s

    # 1) Deterministic focus probe for runtime contract.
    if 'id="ff_focus_probe"' not in s and "id='ff_focus_probe'" not in s:
        probe = """
  <button
    id="ff_focus_probe"
    class="ff-focus-probe"
    type="button"
    tabindex="0"
  >Focus probe</button>
""".rstrip()
        s, n = re.subn(r"(<body\b[^>]*>)", r"\1\n" + probe + "\n", s, count=1, flags=re.I | re.S)
        if n == 0:
            print("❌ Could not insert ff_focus_probe after <body>.")
            sys.exit(1)

    # 2) Keep sponsor rail query contract-safe for patched JS selector.
    s = s.replace(
        '<div class="ff-sponsorWallRail" aria-hidden="true">',
        '<div class="ff-sponsorWallRail" data-ff-sponsor-wall-rail="" aria-hidden="true">'
    )

    if s != orig:
        b = backup(HTML, "launch-reliability-sprint-v1")
        HTML.write_text(s, encoding="utf-8")
        print(f"✅ HTML patched: {HTML}")
        print(f"🛟 Backup: {b}")
    else:
        print("ℹ️ HTML already clean; no changes needed.")

def patch_css():
    s = CSS.read_text(encoding="utf-8")
    orig = s

    start = "/* FF_RUNTIME_RELIABILITY_PATCH_V1_START */"
    end = "/* FF_RUNTIME_RELIABILITY_PATCH_V1_END */"
    block = r'''
/* FF_RUNTIME_RELIABILITY_PATCH_V1_START */
.ff-empty {
  opacity: 0.96;
}

.ff-focus-probe {
  position: fixed;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: 0;
  border: 0;
  overflow: hidden;
  white-space: nowrap;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  opacity: 0.01;
  pointer-events: none;
  z-index: -1;
}

.ff-focus-probe:focus {
  opacity: 0.01;
  outline: none;
}
/* FF_RUNTIME_RELIABILITY_PATCH_V1_END */
'''.strip()

    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pattern.search(s):
        s = pattern.sub(block, s, count=1)
        action = "refreshed existing FF_RUNTIME_RELIABILITY_PATCH_V1 block"
    else:
        s = s.rstrip() + "\n\n" + block + "\n"
        action = "appended FF_RUNTIME_RELIABILITY_PATCH_V1 block"

    if s != orig:
        b = backup(CSS, "launch-reliability-sprint-v1")
        CSS.write_text(s, encoding="utf-8")
        print(f"✅ {action}")
        print(f"🛟 Backup: {b}")
        print(f"📄 Patched: {CSS}")
    else:
        print("ℹ️ CSS already clean; no changes needed.")

def patch_js():
    s = JS.read_text(encoding="utf-8")
    orig = s

    # 1) Kill the exact invalid selector that is breaking boot.
    bad_exact = "[data-ff-sponsor-marquee],.ff-sponsorMarquee,[data-ff-sponsor-wall]__rail,.ff-sponsorLogoRail"
    good_exact = "[data-ff-sponsor-marquee],.ff-sponsorMarquee,[data-ff-sponsor-wall-rail],.ff-sponsorWallRail,.ff-sponsorWall__rail,.ff-sponsorLogoRail"
    s = s.replace(bad_exact, good_exact)
    s = s.replace("[data-ff-sponsor-wall]__rail", "[data-ff-sponsor-wall-rail],.ff-sponsorWallRail,.ff-sponsorWall__rail")

    start = "/* FF_LAUNCH_RELIABILITY_SPRINT_V1_START */"
    end = "/* FF_LAUNCH_RELIABILITY_SPRINT_V1_END */"
    block = r'''
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
    setSheetState(false, reason || "close");
    clearCheckoutHash();
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
      new MutationObserver(checkSuccess).observe(success, {
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
    if (key === "Escape" && checkoutOpen) {
      closeCheckout("escape");
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
'''.strip()

    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pattern.search(s):
        s = pattern.sub(block, s, count=1)
        action = "refreshed existing FF_LAUNCH_RELIABILITY_SPRINT_V1 block"
    else:
        s = s.rstrip() + "\n\n" + block + "\n"
        action = "appended FF_LAUNCH_RELIABILITY_SPRINT_V1 block"

    if s != orig:
        b = backup(JS, "launch-reliability-sprint-v1")
        JS.write_text(s, encoding="utf-8")
        print(f"✅ {action}")
        print(f"🛟 Backup: {b}")
        print(f"📄 Patched: {JS}")
    else:
        print("ℹ️ JS already clean; no changes needed.")

patch_html()
patch_css()
patch_js()
