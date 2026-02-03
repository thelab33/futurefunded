(() => {
      const host = document.getElementById("fc-flash");
      if (!host) return;
      const DEF = parseInt(host.dataset.autocloseDefault || "4500", 10);
      const MAX = parseInt(host.dataset.maxVisible || "4", 10);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timers = new WeakMap();

      const liveForCat = (cat) => {
        cat = (cat || "default").toLowerCase();
        if (cat === "danger" || cat === "error") return 0;
        if (cat === "warning" || cat === "info") return 5200;
        if (cat === "success") return 3800;
        return DEF;
      };

      function enforceCap() {
        const cards = [...host.querySelectorAll("[data-flash]")];
        if (cards.length <= MAX) return;
        const extra = cards.length - MAX;
        for (let i = 0; i < extra; i++) {
          stop(cards[i]);
          hide(cards[i]);
        }
      }

      const start = (el, ms) => {
        if (!ms || ms <= 0) return;
        const bar = el.querySelector(".timer");
        if (bar && !reduced) {
          bar.style.transition = `width ${ms}ms linear`;
          requestAnimationFrame(() => (bar.style.width = "0%"));
        }
        const id = setTimeout(() => hide(el), ms);
        timers.set(el, id);
      };
      const stop = (el) => {
        const id = timers.get(el);
        if (id) {
          clearTimeout(id);
          timers.delete(el);
        }
      };
      const hide = (el) => {
        if (el.__closing) return;
        el.__closing = true;
        if (!reduced) el.classList.add("out");
        setTimeout(() => el.remove(), reduced ? 0 : 480);
      };

      // Initialize any server-rendered toasts
      host.querySelectorAll("[data-flash]").forEach((card) => {
        const msAttr = parseInt(
          card.getAttribute("data-autoclose-ms") || "",
          10,
        );
        const ms = Number.isFinite(msAttr)
          ? msAttr
          : liveForCat(card.getAttribute("data-category"));
        start(card, ms);
      });
      enforceCap();

      // Dismiss / swipe
      host.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-close]");
        if (!btn) return;
        const card = btn.closest("[data-flash]");
        stop(card);
        hide(card);
      });
      host.addEventListener("touchstart", onTouchStart, { passive: true });
      host.addEventListener("touchmove", onTouchMove, { passive: false });
      host.addEventListener("touchend", onTouchEnd);
      let touchStartX = 0,
        activeCard = null;
      function onTouchStart(e) {
        const card = e.target.closest?.("[data-flash]");
        if (!card) return;
        activeCard = card;
        touchStartX = e.touches[0].clientX;
        stop(card);
      }
      function onTouchMove(e) {
        if (!activeCard) return;
        const dx = e.touches[0].clientX - touchStartX;
        activeCard.style.transform = `translateX(${dx}px)`;
        activeCard.style.opacity = String(
          Math.max(0.35, 1 - Math.abs(dx) / 200),
        );
        if (Math.abs(dx) > 48) e.preventDefault();
      }
      function onTouchEnd() {
        if (!activeCard) return;
        const dx =
          parseFloat(activeCard.style.transform.replace(/[^\-0-9.]/g, "")) || 0;
        if (Math.abs(dx) > 80) {
          hide(activeCard);
        } else {
          activeCard.style.transform = "";
          activeCard.style.opacity = "";
          start(activeCard, 1800);
        }
        activeCard = null;
      }

      // Pause/resume on hover/focus
      const pause = () => host.querySelectorAll("[data-flash]").forEach(stop);
      const resume = () =>
        host.querySelectorAll("[data-flash]").forEach((el) => {
          const ms = liveForCat(el.getAttribute("data-category"));
          if (ms > 0) start(el, Math.min(ms, 1800));
        });
      host.addEventListener("mouseenter", pause);
      host.addEventListener("mouseleave", resume);
      host.addEventListener("focusin", pause);
      host.addEventListener("focusout", resume);

      // ESC clears all
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        host.querySelectorAll("[data-flash]").forEach(hide);
        if (!reduced) host.classList.add("out");
        setTimeout(() => host.remove(), reduced ? 0 : 480);
      });

      // Public API + cross-tab sync
      const bc = (function () {
        try {
          return new BroadcastChannel("fc_ui");
        } catch {
          return null;
        }
      })();
      function emit(type, detail) {
        try {
          window.dispatchEvent(new CustomEvent(type, { detail }));
          bc?.postMessage({ type, detail });
        } catch {}
      }

      window.fcFlash = function ({
        message = "",
        category = "default",
        timeout,
        action,
      } = {}) {
        const clsMap = {
          success: "ring-emerald-400/50 text-emerald-50",
          danger: "ring-red-400/60 text-red-50",
          error: "ring-red-400/60 text-red-50",
          warning: "ring-amber-400/60 text-amber-50",
          info: "ring-sky-400/60 text-sky-50",
          default: "ring-yellow-300/40 text-yellow-50",
        };
        const icoMap = {
          success: "✔️",
          danger: "✖️",
          error: "✖️",
          warning: "⚠️",
          info: "ℹ️",
          default: "💡",
        };
        const cat = (category || "default").toLowerCase();

        const card = document.createElement("div");
        card.className = `card in pointer-events-auto flex items-start gap-3 px-5 py-3 ring-2 ${clsMap[cat] || clsMap.default}`;
        card.setAttribute("data-flash", "");
        card.setAttribute("data-category", cat);
        card.setAttribute(
          "role",
          cat === "danger" || cat === "error" ? "alert" : "status",
        );
        card.tabIndex = 0;

        const close = document.createElement("button");
        close.type = "button";
        close.setAttribute("aria-label", "Dismiss message");
        close.className =
          "ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-yellow-200 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-yellow-400";
        close.textContent = "×";
        close.setAttribute("data-close", "");

        const icon = document.createElement("span");
        icon.className = "text-xl leading-none";
        icon.textContent = icoMap[cat] || icoMap.default;
        icon.setAttribute("aria-hidden", "true");
        const sr = document.createElement("span");
        sr.className = "sr-only";
        sr.textContent = cat[0].toUpperCase() + cat.slice(1) + ":";
        const body = document.createElement("div");
        body.className = "flex-1 text-sm";
        body.textContent = String(message || "");
        const timer = document.createElement("div");
        timer.className = "timer";
        timer.setAttribute("aria-hidden", "true");

        card.append(icon, sr, body);

        if (action && (action.href || action.hx_post)) {
          const a = document.createElement("a");
          if (action.href) a.href = action.href;
          if (action.hx_post) {
            a.setAttribute("hx-post", action.hx_post);
            a.setAttribute("hx-swap", "none");
          }
          a.className =
            "ml-2 inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-yellow-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-400";
          a.textContent = String(action.label || "View");
          card.appendChild(a);
        }

        card.append(close, timer);
        host.append(card);
        enforceCap();
        const ms = Number.isFinite(timeout) ? timeout : liveForCat(cat);
        start(card, ms);
        emit("fc:flash:shown", { category: cat });
        try {
          card.focus({ preventScroll: true });
        } catch {}
      };

      // Event bridge + cross-tab
      window.addEventListener("fc:flash", (e) =>
        window.fcFlash(e.detail || {}),
      );
      bc?.addEventListener?.("message", (ev) => {
        if (ev?.data?.type === "fc:flash") window.fcFlash(ev.data.detail);
      });

      // Optional: show VIP callout if another module dispatches it
      window.addEventListener("fc:vip:hit", (e) => {
        const d = e.detail || {};
        const who = d.name || "VIP Sponsor";
        window.fcFlash({
          message: `🎉 ${who} joined! Thank you for your support.`,
          category: "success",
          timeout: 3600,
        });
      });
    })();
