(() => {
    const btn = document.getElementById("back-to-top");
    if (!btn || btn.__init) return;
    btn.__init = true;
    const sr = document.getElementById("btt-sr");
    const ring = btn.querySelector(".ring-wrap");
    const mqMd = window.matchMedia?.("(min-width: 768px)");

    const SHOW_AT = 320; // px scrolled before showing
    const STEP = 1; // announce every N% (kept small for precision)
    let lastAnnounced = -1;
    let shown = false;
    let raf = null;

    // Ensure a #top anchor exists for the href target (improves a11y/back/forward)
    if (!document.getElementById("top")) {
      const top = document.createElement("div");
      top.id = "top";
      top.setAttribute("aria-hidden", "true");
      top.style.position = "absolute";
      top.style.inset = "0 auto auto 0";
      top.style.width = "1px";
      top.style.height = "1px";
      top.style.overflow = "hidden";
      document.body.prepend(top);
    }

    const docEl = document.documentElement;

    function pctScrolled() {
      const sTop = window.pageYOffset || docEl.scrollTop || 0;
      const max = Math.max(1, docEl.scrollHeight - docEl.clientHeight);
      return Math.max(0, Math.min(100, (sTop / max) * 100));
    }

    function visibleOnViewport() {
      return mqMd ? mqMd.matches : window.innerWidth >= 768;
    }

    function setVisible(on) {
      if (on === shown) return;
      shown = on;
      // Respect Tailwind hidden/md:inline-flex by only toggling inline style when md+
      btn.style.display = on ? "inline-flex" : "none";
      // Let the sticky manager recalc stack/reserve
      try {
        window.dispatchEvent(new CustomEvent("fc:sticky:measure"));
      } catch {}
    }

    function sync() {
      const y = window.pageYOffset || docEl.scrollTop || 0;
      setVisible(visibleOnViewport() && y > SHOW_AT);

      const p = pctScrolled();
      if (ring) ring.style.setProperty("--p", Math.round(p) + "%");

      const pInt = Math.round(p);
      if (
        sr &&
        pInt !== lastAnnounced &&
        Math.abs(pInt - lastAnnounced) >= STEP
      ) {
        lastAnnounced = pInt;
        // Short, informative; avoids flooding AT
        sr.textContent = `You are ${pInt}% down the page.`;
      }
    }

    // Smooth scroll (respects reduced motion)
    btn.addEventListener("click", (e) => {
      const prefersReduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      )?.matches;
      if (prefersReduce) return; // allow instant anchor jump
      e.preventDefault();
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        location.hash = "#top";
      }
    });

    // Lightweight RAF scroll handler
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        sync();
      });
    }

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true }); // piggyback same RAF
    mqMd?.addEventListener?.("change", onScroll);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) sync();
      },
      { passive: true },
    );

    // First paint
    sync();
  })();
