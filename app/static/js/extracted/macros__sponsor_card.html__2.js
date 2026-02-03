(() => {
    const toggleBtn = document.getElementById("sponsor-wall-toggle");
    const widget = document.getElementById("sponsor-wall-widget");
    const closeBtn = document.getElementById("sponsor-wall-close");
    const sponsorList = document.getElementById("sponsor-wall-list");
    const ticker = document.getElementById("ticker-inner");
    const nudgeDot = document.getElementById("sponsor-nudge-dot");
    // Modal/Share placeholders
    window.openSponsorModal = () =>
      alert("🚀 Replace with your Sponsorship Modal logic!");
    window.shareSponsorWall = (network) => {
      const shareUrl = window.location.href;
      if (navigator.share) {
        navigator.share({ title: "Support Our Team!", url: shareUrl });
      } else {
        // Fallback open window to network (implement as needed)
        alert("Social sharing for " + network + " coming soon!");
      }
    };
    // Confetti effect (implement your own or use a lib)
    window.launchConfetti = () => {};
    // Welcome toast (replace with a lib like Toastify for best UX)
    window.welcomeSponsor = (name) => {
      launchConfetti();
      alert(`🎉 Welcome, ${name}!`);
    };
    function focusTrap(e) {
      const els = widget.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!els.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    function openWidget() {
      widget.setAttribute("aria-hidden", "false");
      widget.focus();
      toggleBtn.setAttribute("aria-expanded", "true");
      checkScrollShadow();
      document.body.style.overflow = "hidden";
      if (nudgeDot) nudgeDot.classList.add("hidden");
    }
    function closeWidget() {
      widget.setAttribute("aria-hidden", "true");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.focus();
      document.body.style.overflow = "";
    }
    toggleBtn.addEventListener("click", () => {
      const isOpen = widget.getAttribute("aria-hidden") === "false";
      isOpen ? closeWidget() : openWidget();
    });
    closeBtn.addEventListener("click", closeWidget);
    widget.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeWidget();
      }
      focusTrap(e);
    });
    document.addEventListener("click", (e) => {
      if (!widget.contains(e.target) && e.target !== toggleBtn) closeWidget();
    });
    function checkScrollShadow() {
      sponsorList.scrollTop > 5
        ? sponsorList.classList.add("scroll-shadow")
        : sponsorList.classList.remove("scroll-shadow");
    }
    sponsorList.addEventListener("scroll", checkScrollShadow);
    // Leaderboard toggle logic (plug in HTMX/Socket.IO here)
    document.querySelectorAll(".leaderboard-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document
          .querySelectorAll(".leaderboard-toggle")
          .forEach((b) => b.classList.remove("bg-yellow-400/40"));
        btn.classList.add("bg-yellow-400/40");
        // TODO: Fetch and update sponsor list by leaderboard type (all/month)
      });
    });
    // Live ticker update (plug in Socket.IO or HTMX swap here)
    // TODO: ticker.innerHTML = newDonationFeed;
    // Smart nudge — after 3min closed, pulse dot
    setTimeout(() => {
      if (widget.getAttribute("aria-hidden") === "true" && nudgeDot) {
        nudgeDot.classList.remove("hidden");
      }
    }, 180_000);
    // Keyboard shortcut: 'S' toggles sponsor wall
    document.addEventListener("keydown", (e) => {
      if (
        e.key.toLowerCase() === "s" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        e.preventDefault();
        const isOpen = widget.getAttribute("aria-hidden") === "false";
        isOpen ? closeWidget() : openWidget();
      }
    });
  })();
