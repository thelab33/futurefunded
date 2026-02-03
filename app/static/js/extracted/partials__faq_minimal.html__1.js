(() => {
      if (window.__faqInit) return;
      window.__faqInit = true;
      const root = document.getElementById("faq");
      if (!root) return;
      const buttons = root.querySelectorAll("[data-faq-toggle]");

      const KEY = "fc:faq:open"; // persist last open panel
      function setOpen(btn, open) {
        const panel = document.getElementById(
          btn.getAttribute("aria-controls"),
        );
        btn.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
        panel.classList.toggle("hidden", !open);
        try {
          if (open) sessionStorage.setItem(KEY, panel.id);
        } catch {}
        try {
          window.dispatchEvent(
            new CustomEvent("fundchamps:faq:toggle", {
              detail: { id: panel.id, open },
            }),
          );
        } catch {}
      }

      buttons.forEach((btn, i) => {
        btn.addEventListener("click", () => {
          const isOpen = btn.getAttribute("aria-expanded") === "true";
          // close others
          buttons.forEach((b) => setOpen(b, b === btn ? !isOpen : false));
          if (!isOpen) {
            try {
              btn.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch {}
          }
        });
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            btn.click();
          }
        });
      });

      // restore last open, else open first when scrolled into view
      let restored = false;
      try {
        const id = sessionStorage.getItem(KEY);
        if (id) {
          const b = root.querySelector(`[aria-controls="${id}"]`);
          if (b) {
            buttons.forEach((x) => setOpen(x, x === b));
            restored = true;
          }
        }
      } catch {}

      if (!restored && "IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (ents) => {
            if (ents.some((e) => e.isIntersecting)) {
              const first = buttons[0];
              if (first && first.getAttribute("aria-expanded") !== "true")
                setOpen(first, true);
              io.disconnect();
            }
          },
          { threshold: 0.15 },
        );
        io.observe(root);
      }
    })();
