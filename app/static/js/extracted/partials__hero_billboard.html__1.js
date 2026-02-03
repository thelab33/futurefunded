// Highlight next milestone when meter updates
    (function () {
      const root = document.currentScript.closest("section");
      const chips = root.querySelectorAll(".milestones .chip");
      function mark(p) {
        chips.forEach((ch) =>
          ch.classList.toggle("hit", parseInt(ch.textContent, 10) <= p),
        );
      }
      document.addEventListener(
        "fc:meter:update",
        (e) => {
          const d = e.detail || {};
          const p = Math.max(
            0,
            Math.min(100, +d.goal ? (+d.raised / +d.goal) * 100 : 0),
          );
          mark(p);
        },
        { passive: true },
      );
    })();
