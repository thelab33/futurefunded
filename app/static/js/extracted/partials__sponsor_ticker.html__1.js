(() => {
      const root = document.getElementById("sponsor-ticker");
      if (!root || root.__init) return;
      root.__init = true;

      const qs = (sel, ctx = root) => ctx.querySelector(sel);
      const track = qs(".track");
      const toggleBtn = qs("[data-ticker-toggle]");
      const source = root.dataset.source || "/api/sponsors";
      const socketNs = root.dataset.socketNs || "/sponsors";
      const speedAttr = parseFloat(root.dataset.speed || "");

      /* ---------- speed control ---------- */
      function setSpeedFromWidth() {
        // If user provided data-speed (seconds), honor it
        if (isFinite(speedAttr) && speedAttr > 0) {
          root.style.setProperty("--speed", `${speedAttr}s`);
          return;
        }
        // Otherwise compute from content width & px/sec baseline
        const inner = qs('.inner[data-clone="0"]');
        if (!inner) return;
        const contentWidth = inner.getBoundingClientRect().width || 600;
        const ppx = +getComputedStyle(root).getPropertyValue("--ppx") || 80;
        const dur = Math.max(12, Math.min(40, contentWidth / ppx)); // clamp 12–40s
        root.style.setProperty("--speed", dur + "s");
      }

      /* ---------- controls ---------- */
      function pause() {
        root.classList.add("paused");
        if (toggleBtn) {
          toggleBtn.textContent = "Play";
          toggleBtn.setAttribute("aria-pressed", "true");
        }
      }
      function play() {
        root.classList.remove("paused");
        if (toggleBtn) {
          toggleBtn.textContent = "Pause";
          toggleBtn.setAttribute("aria-pressed", "false");
        }
      }
      toggleBtn?.addEventListener("click", () =>
        root.classList.contains("paused") ? play() : pause(),
      );
      toggleBtn?.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          root.classList.contains("paused") ? play() : pause();
        }
      });
      root.addEventListener("mouseenter", pause);
      root.addEventListener("mouseleave", play);

      // Pause when off-screen (perf + a11y)
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (ents) => ents.forEach((e) => (e.isIntersecting ? play() : pause())),
          { threshold: 0.01 },
        );
        io.observe(root);
      }

      /* ---------- initial items from DOM ---------- */
      let items = Array.from(
        qs('.inner[data-clone="0"]').querySelectorAll(".item"),
      ).map((a) => ({
        name: a.textContent.trim(),
        url: a.getAttribute("href") || "#",
        logo: (a.querySelector("img") || {}).src || null,
      }));

      /* ---------- render ---------- */
      function render(list) {
        list = (list || []).filter(Boolean).slice(0, 64);
        if (!list.length)
          list = [{ name: "Your Brand Here", url: "#", logo: null }];
        const html = list
          .map((s, i) => {
            const logo = s.logo
              ? `<img loading="lazy" decoding="async" src="${s.logo}" alt="" class="logo">`
              : "";
            const dot = i < list.length - 1 ? `<span class="dot">•</span>` : "";
            const url = s.url || "#";
            return `<a href="${url}" class="item" target="_blank" rel="noopener">${logo}<span>${s.name}</span></a>${dot}`;
          })
          .join("");
        root.querySelectorAll(".inner").forEach((el, idx) => {
          el.innerHTML = html;
          if (idx === 1) el.setAttribute("aria-hidden", "true");
        });
        // restart animation cleanly
        track.style.animation = "none";
        void track.offsetWidth;
        track.style.animation = "";
        setSpeedFromWidth();
      }

      /* ---------- public API ---------- */
      window.restartSponsorTicker = function () {
        track.style.animation = "none";
        void track.offsetWidth;
        track.style.animation = "";
      };
      window.fcAddSponsor = function (
        name,
        url = "#",
        vip = false,
        logo = null,
      ) {
        if (!name) return;
        const key = String(name).trim().toLowerCase();
        const ix = items.findIndex(
          (s) => (s.name || "").trim().toLowerCase() === key,
        );
        if (ix >= 0) items.splice(ix, 1); // move existing to front
        items.unshift({ name, url, logo });
        render(items);
        if (vip && typeof window.launchConfetti === "function") {
          window.launchConfetti({ particleCount: 180, spread: 80 });
        }
      };

      /* ---------- live hooks ---------- */
      // From hero / donations (support both event names)
      window.addEventListener("fc:vip:hit", (ev) => {
        const t = ev.detail?.threshold;
        window.fcAddSponsor(t ? `VIP ${t}` : "VIP Sponsor", "#", true, null);
      });
      window.addEventListener("fc:funds:update", (ev) => {
        const n = ev.detail?.sponsorName;
        if (n) window.fcAddSponsor(String(n), "#", false, null);
      });
      // Optional custom event
      window.addEventListener("fc:vip", (ev) => {
        const d = ev.detail || {};
        window.fcAddSponsor(
          d.name || "VIP Sponsor",
          d.url || "#",
          true,
          d.logo || null,
        );
      });

      // Socket.IO (optional)
      if (typeof window.io === "function") {
        try {
          const sock = window.io(socketNs, {
            transports: ["websocket", "polling"],
          });
          sock.on("sponsor", (payload) => {
            if (!payload || !payload.name) return;
            window.fcAddSponsor(
              payload.name,
              payload.url || "#",
              !!payload.vip,
              payload.logo || null,
            );
          });
        } catch (e) {
          /* non-fatal */
        }
      }

      // Poll fallback (accepts [{name,url,logo}] OR {items:[...]})
      (async function poll() {
        try {
          const res = await fetch(source, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data)
              ? data
              : Array.isArray(data?.items)
                ? data.items
                : [];
            if (list.length) {
              items = list;
              render(items);
            }
          }
        } catch (e) {
          /* ignore */
        }
        setTimeout(poll, 120000); // every 2 min
      })();

      // Setup
      setSpeedFromWidth();
      window.addEventListener("resize", setSpeedFromWidth, { passive: true });
    })();
