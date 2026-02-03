(() => {
      if (window.__fcStickyMgr) return;
      window.__fcStickyMgr = true;

      const RESERVE = document.getElementById("fc-sticky-reserve");
      const SEL = "[data-sticky-cta]";
      const GAP_PX = () =>
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--fc-sticky-gap",
          ),
        ) || 8;

      /* ---------- helpers ---------- */
      const isFiniteNum = (v) => Number.isFinite(parseFloat(v));
      const px = (v) => `${Math.max(0, Math.round(Number(v) || 0))}px`;

      const isVisible = (el) => {
        if (!el || el.hidden) return false;
        const cs = getComputedStyle(el);
        if (
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          cs.pointerEvents === "none"
        )
          return false;
        if (cs.position !== "fixed") return false;
        // Stack only bottom-anchored CTAs
        if (cs.bottom === "auto") return false;
        // Detached or not on layout tree?
        if (el.offsetParent === null && cs.position !== "fixed") return false;
        return true;
      };

      // Cache + return element's baseline bottom as CSS var
      const getBaseBottom = (el) => {
        const existing = el.style.getPropertyValue("--fc-base-bottom");
        if (existing) return existing.trim();
        const b = getComputedStyle(el).bottom;
        const base = isFiniteNum(b) ? `${parseFloat(b)}px` : "0px";
        el.style.setProperty("--fc-base-bottom", base);
        return base;
      };

      const measureHeight = (el) =>
        Math.ceil(el.getBoundingClientRect().height || 0);

      /* ---------- core layout pass: stack + reserve ---------- */
      function layout() {
        const candidates = [...document.querySelectorAll(SEL)].filter(
          isVisible,
        );

        // Sort: higher data-sticky-priority is closer to bottom; then by baseline bottom
        candidates.sort((a, b) => {
          const pa = parseFloat(a.getAttribute("data-sticky-priority") || "0");
          const pb = parseFloat(b.getAttribute("data-sticky-priority") || "0");
          if (pb !== pa) return pb - pa;
          return parseFloat(getBaseBottom(a)) - parseFloat(getBaseBottom(b));
        });

        let offset = 0;
        const gap = GAP_PX();
        let bottomMostHeight = 0;

        if (candidates.length === 0) {
          document.documentElement.style.setProperty("--fc-sticky-h", "0px");
          if (RESERVE)
            RESERVE.style.height = `calc(var(--fc-sticky-h,0px) + var(--fc-safe-bottom))`;
          return;
        }

        candidates.forEach((el, idx) => {
          const base = getBaseBottom(el); // eslint-disable-line no-unused-vars
          const h = measureHeight(el);

          // Stack above the bottom-most (idx 0 is the bottom-most item)
          el.style.setProperty("--fc-stack", px(idx === 0 ? 0 : offset + gap));
          el.style.bottom = `calc(var(--fc-base-bottom) + var(--fc-stack, 0px))`;
          el.classList.add("fc-sticky-managed");

          // Provide a sensible default z-index only if author didn’t set one
          const z = getComputedStyle(el).zIndex;
          if (z === "auto") el.style.zIndex = "60";

          if (idx === 0) bottomMostHeight = h;
          if (idx === 0) offset = h;
          else offset += h + gap;
        });

        // Reserve space for bottom-most CTA (safe-area included via CSS on main)
        document.documentElement.style.setProperty(
          "--fc-sticky-h",
          px(bottomMostHeight),
        );
        if (RESERVE)
          RESERVE.style.height = `calc(var(--fc-sticky-h,0px) + var(--fc-safe-bottom))`;
      }

      /* ---------- auto-hide near footer (opt-out with data-no-autohide) ---------- */
      function bindFooterAutohide() {
        const footer =
          document.getElementById("site-footer") ||
          document.querySelector('[role="contentinfo"]');
        if (!footer || !("IntersectionObserver" in window)) return;

        const setHidden = (hide) => {
          document.querySelectorAll(SEL).forEach((el) => {
            if (el.hasAttribute("data-no-autohide")) return; // opt-out
            el.classList.toggle("fc-sticky-hide", !!hide);
          });
        };

        const io = new IntersectionObserver(
          ([entry]) => {
            setHidden(entry && entry.isIntersecting);
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
        );

        io.observe(footer);
      }

      /* ---------- observers & events ---------- */
      let ro = null;
      const resizeWatch = () => {
        if (ro) ro.disconnect();
        if (!("ResizeObserver" in window)) return;
        ro = new ResizeObserver(() => rafLayout());
        document.querySelectorAll(SEL).forEach((el) => ro.observe(el));
      };

      let mo = null;
      const mutationWatch = () => {
        if (mo) mo.disconnect();
        if (!("MutationObserver" in window)) return;
        mo = new MutationObserver((muts) => {
          // Relayout when CTAs are added/removed/hidden or styles/classes change
          if (
            muts.some(
              (m) =>
                m.type === "childList" ||
                (m.type === "attributes" &&
                  (m.attributeName === "class" ||
                    m.attributeName === "style" ||
                    m.attributeName === "hidden")),
            )
          ) {
            rafLayout();
          }
        });
        mo.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "hidden"],
        });
      };

      let rafId = null;
      const rafLayout = () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(layout);
      };

      addEventListener("resize", rafLayout, { passive: true });
      addEventListener("orientationchange", rafLayout);
      // Hooks your UI may already emit
      [
        "fc:donate:open",
        "fc:donate:close",
        "fc:sticky:measure",
        "fc:sticky:refresh",
      ].forEach((ev) => addEventListener(ev, rafLayout));

      // Initial run
      bindFooterAutohide();
      resizeWatch();
      mutationWatch();
      rafLayout();

      /* ---------- public API ---------- */
      window.fcSticky = {
        measure: rafLayout,
        refresh: rafLayout,
        register(el) {
          if (!el) return;
          el.setAttribute("data-sticky-cta", "");
          rafLayout();
          resizeWatch();
        },
        unregister(el) {
          if (!el) return;
          el.removeAttribute("data-sticky-cta");
          rafLayout();
          resizeWatch();
        },
      };
    })();
