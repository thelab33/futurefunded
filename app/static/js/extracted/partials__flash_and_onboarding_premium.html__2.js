(() => {
      const pop = document.getElementById("fc-onboarding");
      if (!pop) return;
      const key = pop.getAttribute("data-storage-key") || "onboarded:global";
      const delay = parseInt(pop.getAttribute("data-delay") || "1200", 10);
      const cooldownDays = parseInt(
        pop.getAttribute("data-cooldown-days") || "14",
        10,
      );
      const maxViews = parseInt(pop.getAttribute("data-max-views") || "3", 10);
      const exclude = (() => {
        try {
          return JSON.parse(pop.getAttribute("data-exclude") || "[]");
        } catch {
          return [];
        }
      })();
      const utmAllow = (() => {
        try {
          return JSON.parse(pop.getAttribute("data-utm-allow") || "[]");
        } catch {
          return [];
        }
      })();
      const bc = (function () {
        try {
          return new BroadcastChannel("fc_ui");
        } catch {
          return null;
        }
      })();

      // Frequency capping + route/utm gating
      try {
        const cap = JSON.parse(localStorage.getItem(key) || "{}"); // {seen:number, ts:number, closed:0/1}
        const now = Date.now();
        const okCooldown = !cap.ts || now - cap.ts > cooldownDays * 86400000;
        const viewsLeft = maxViews - (cap.seen || 0);
        const path = location.pathname || "";
        const blockedRoute = exclude.some((p) => path.startsWith(p));
        const url = new URL(location.href);
        const utm = url.searchParams.get("utm_source");
        const allowUtm = !utm || utmAllow.includes(utm);
        if (
          cap.closed === 1 ||
          !okCooldown ||
          viewsLeft <= 0 ||
          blockedRoute ||
          !allowUtm
        ) {
          pop.remove();
          return;
        }
      } catch {}

      // Show after delay (less intrusive)
      setTimeout(
        () => {
          pop.style.opacity = "1";
          pop.style.transform = "translateY(0) scale(1)";
          try {
            pop.focus({ preventScroll: true });
          } catch {}
          window.dispatchEvent(new CustomEvent("fc:onboarding:open"));
          bc?.postMessage({ type: "fc:onboarding:open" });
          try {
            const cap = JSON.parse(localStorage.getItem(key) || "{}");
            cap.seen = (cap.seen || 0) + 1;
            cap.ts = Date.now();
            localStorage.setItem(key, JSON.stringify(cap));
          } catch {}
        },
        Math.max(0, delay),
      );

      // Minimal focus trap
      function trap(container) {
        function onKey(e) {
          if (e.key !== "Tab") return;
          const qs = 'a,button,[tabindex]:not([tabindex="-1"])';
          const list = [...container.querySelectorAll(qs)].filter(
            (el) => !el.disabled,
          );
          if (!list.length) return;
          const first = list[0],
            last = list[list.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        container.addEventListener("keydown", onKey);
        return () => container.removeEventListener("keydown", onKey);
      }
      const untrap = trap(pop);

      // Close helpers
      const dismiss = document.getElementById("fc-ob-dismiss");
      const persistCap = () => {
        try {
          const cap = JSON.parse(localStorage.getItem(key) || "{}");
          cap.closed = 1;
          cap.ts = Date.now();
          localStorage.setItem(key, JSON.stringify(cap));
        } catch {}
      };
      const serverDismiss = async () => {
        const url =
          pop.getAttribute("data-dismiss-url") || "/dismiss-onboarding";
        const csrf = pop.getAttribute("data-csrf") || "";
        try {
          if (window.htmx) {
            await htmx.ajax("POST", url, {
              headers: { "X-CSRFToken": csrf },
              swap: "none",
            });
          } else {
            await fetch(url, {
              method: "POST",
              headers: { "X-CSRFToken": csrf },
              credentials: "same-origin",
            });
          }
        } catch {}
      };
      const close = async (persist) => {
        pop.style.opacity = "0";
        pop.style.transform = "translateY(6px) scale(.98)";
        setTimeout(() => pop.remove(), 240);
        untrap?.();
        if (persist) {
          persistCap();
          serverDismiss();
        }
        window.dispatchEvent(
          new CustomEvent("fc:onboarding:dismiss", { detail: { persist } }),
        );
        bc?.postMessage({ type: "fc:onboarding:dismiss", detail: { persist } });
      };

      dismiss?.addEventListener("click", () => close(true));
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close(true);
      });
      // Soft close when clicking outside
      document.addEventListener(
        "click",
        (e) => {
          if (!pop.contains(e.target)) close(false);
        },
        { capture: true },
      );

      // Track CTA
      pop
        .querySelector('[data-track="onboarding_sponsor_cta"]')
        ?.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("fc:onboarding:cta"));
          try {
            window.fcFlash?.({
              message: "Thanks for supporting!",
              category: "success",
              timeout: 2800,
            });
          } catch {}
          bc?.postMessage({
            type: "fc:flash",
            detail: {
              message: "Thanks for supporting!",
              category: "success",
              timeout: 2800,
            },
          });
        });
    })();
