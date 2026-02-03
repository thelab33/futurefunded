(() => {
    const root = document.getElementById("impact-shot");
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));
    const live = root.querySelector("#impact-shot-live");
    const storeKey = "impact_shot_selected";

    const byId = (id) => root.querySelector("#" + id);
    const select = (
      id,
      { scroll = false, announce = true, persist = true } = {},
    ) => {
      tabs.forEach((t) => {
        t.setAttribute("aria-selected", "false");
        t.tabIndex = -1;
      });
      panels.forEach((p) => (p.hidden = true));
      const tab = byId("tab-" + id),
        panel = byId("panel-" + id);
      if (!tab || !panel) return;
      tab.setAttribute("aria-selected", "true");
      tab.tabIndex = 0;
      panel.hidden = false;
      if (scroll) {
        try {
          panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch {}
      }
      if (announce && live) {
        live.textContent = `Impact zone: ${tab.textContent.trim()}`;
      }
      if (persist) {
        try {
          sessionStorage.setItem(storeKey, id);
        } catch {}
      }
      tab.focus({ preventScroll: true });
    };

    // Click to toggle (second click clears)
    tabs.forEach((t) =>
      t.addEventListener(
        "click",
        () => {
          const id = t.dataset.zone;
          const isSel = t.getAttribute("aria-selected") === "true";
          if (isSel) {
            t.setAttribute("aria-selected", "false");
            const p = byId("panel-" + id);
            if (p) p.hidden = true;
            try {
              sessionStorage.removeItem(storeKey);
            } catch {}
          } else {
            select(id, { scroll: true });
          }
        },
        { passive: true },
      ),
    );

    // Roving focus + arrows / Home / End
    root.addEventListener("keydown", (e) => {
      const cur = document.activeElement;
      if (!tabs.includes(cur)) return;
      const i = tabs.indexOf(cur);
      let j = i;
      if (e.key === "ArrowRight" || e.key === "ArrowDown")
        j = (i + 1) % tabs.length;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === "Home") j = 0;
      if (e.key === "End") j = tabs.length - 1;
      if (j !== i) {
        e.preventDefault();
        tabs[j].focus();
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(cur.dataset.zone, { scroll: true });
      }
      if (e.key === "Escape") {
        // clear
        const id = cur.dataset.zone;
        byId("panel-" + id)?.setAttribute("hidden", "");
        cur.setAttribute("aria-selected", "false");
        try {
          sessionStorage.removeItem(storeKey);
        } catch {}
      }
    });

    // Default selection: ?tag=… → sessionStorage → first
    const qs = new URLSearchParams(location.search);
    let def = (qs.get("tag") || "").toLowerCase();
    if (!def) {
      try {
        def = sessionStorage.getItem(storeKey) || "";
      } catch {}
    }
    if (!def) def = tabs[0]?.dataset.zone || "";
    if (def) select(def, { announce: false, persist: true });
  })();
