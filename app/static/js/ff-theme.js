/* app/static/js/ff-theme.js
   Minimal, guard-checked, production-ish theme preset manager
*/
(function (window, document) {
  "use strict";

  const LS_THEME = "ff:theme";
  const LS_BRAND = "ff:brand";
  const root = document.documentElement;

  function setTheme(theme, brand = null, opts = { persist: true, saveServer: true, teamId: null }) {
    if (!theme) return;
    root.dataset.ffTheme = theme;
    if (brand) root.dataset.ffBrand = brand;
    if (opts.persist) {
      try { localStorage.setItem(LS_THEME, theme); } catch (e) {}
      if (brand) try { localStorage.setItem(LS_BRAND, brand); } catch (e) {}
    }
    if (opts.saveServer && opts.teamId) {
      saveThemeToServer(opts.teamId, theme, brand).catch(e => {
        console.warn("ff-theme: server save failed", e);
      });
    }
    document.dispatchEvent(new CustomEvent("ff:theme.changed", { detail: { theme, brand } }));
  }

  async function saveThemeToServer(teamId, theme, brand=null) {
    if (!teamId) throw new Error("teamId required to persist backend theme");
    const url = `/api/team/${teamId}/theme`;
    const body = { theme, brand };
    const headers = {
      "Content-Type": "application/json",
      "X-CSRFToken": (document.querySelector('meta[name="csrf-token"]') || {}).content || ""
    };
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), credentials: "same-origin" });
    if (!res.ok) throw new Error(`saveTheme failed (${res.status})`);
    return res.json();
  }

  (function hydrate() {
    try {
      const t = localStorage.getItem(LS_THEME);
      const b = localStorage.getItem(LS_BRAND);
      if (t) root.dataset.ffTheme = t;
      if (b) root.dataset.ffBrand = b;
    } catch (e) { /* ignore storage errors */ }
  })();

  function previewTheme(theme, duration = 2500) {
    const prev = root.dataset.ffTheme;
    root.dataset.ffTheme = theme;
    setTimeout(() => {
      root.dataset.ffTheme = prev || "";
    }, duration);
  }

  window.FFTheme = {
    setTheme,
    previewTheme,
    saveThemeToServer,
  };

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-ff-theme-btn]");
    if (!el) return;
    const theme = el.getAttribute("data-ff-theme-btn");
    const brand = el.getAttribute("data-ff-brand") || null;
    const teamId = el.getAttribute("data-ff-team-id") || null;
    setTheme(theme, brand, { persist: true, saveServer: Boolean(teamId), teamId });
  });

})(window, document);
