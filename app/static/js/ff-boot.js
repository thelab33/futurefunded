(function () {
  try {
    var KEY = "ff_theme_v12";
    var LEGACY = ["ff_theme_v11", "ff_theme_v10", "ff_theme_v9", "ff_theme"];

    function getStoredTheme() {
      var t = "";
      try { t = localStorage.getItem(KEY) || ""; } catch (e) {}

      if (t !== "dark" && t !== "light") {
        for (var i = 0; i < LEGACY.length; i++) {
          try {
            var v = localStorage.getItem(LEGACY[i]);
            if (v === "dark" || v === "light") { t = v; break; }
          } catch (e) {}
        }
      }

      if (t !== "dark" && t !== "light") {
        var prefersDark = false;
        try { prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) {}
        t = prefersDark ? "dark" : "light";
      }
      return t;
    }

    function persistTheme(t) {
      try {
        localStorage.setItem(KEY, t);
        for (var i = 0; i < LEGACY.length; i++) localStorage.setItem(LEGACY[i], t);
      } catch (e) {}
    }

    function applyTheme(t, persist) {
      var root = document.documentElement;
      root.setAttribute("data-theme", t);
      try { root.style.colorScheme = t; } catch (e) {}
      if (persist) persistTheme(t);
    }

    applyTheme(getStoredTheme(), false);

    window.FFTheme = {
      get: getStoredTheme,
      set: function (t) { if (t === "dark" || t === "light") applyTheme(t, true); },
      toggle: function () {
        var cur = getStoredTheme();
        var next = (cur === "dark") ? "light" : "dark";
        applyTheme(next, true);
        return next;
      }
    };
  } catch (e) {}
})();
