(() => {
  const header = document.getElementById("site-header");
  const backTop = document.getElementById("backtop");
  const navLinks = document.querySelectorAll("header .nav a[data-link]");
  const shareBtn = document.getElementById("hdr-share");
  let lastScroll = 0;

  // --- Header hide/reveal on scroll ---
  window.addEventListener("scroll", () => {
    const current = window.scrollY;
    if (header) {
      if (current > lastScroll && current > 80) {
        header.style.transform = "translateY(-100%)"; // hide
      } else {
        header.style.transform = "translateY(0)"; // reveal
      }
    }
    lastScroll = current;
  });

  // --- Back to Top fade + scroll ---
  window.addEventListener("scroll", () => {
    if (backTop) {
      if (window.scrollY > 300) {
        backTop.classList.remove("opacity-0", "pointer-events-none");
      } else {
        backTop.classList.add("opacity-0", "pointer-events-none");
      }
    }
  });
  backTop?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // --- Scroll-spy nav highlight ---
  const sections = [...document.querySelectorAll("section[id]")];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const link = document.querySelector(`a[data-link="${entry.target.id}"]`);
          if (entry.isIntersecting) {
            navLinks.forEach(l => l.classList.remove("text-yellow-300"));
            link?.classList.add("text-yellow-300");
          }
        });
      },
      { threshold: 0.4 }
    );
    sections.forEach(sec => observer.observe(sec));
  }

  // --- Share button (Web Share API + fallback) ---
  shareBtn?.addEventListener("click", () => {
    const data = JSON.parse(shareBtn.dataset.share);
    if (navigator.share) {
      navigator.share(data).catch(console.warn);
    } else {
      // Fallback: copy link + alert
      navigator.clipboard.writeText(data.url).then(() => {
        alert("📋 Link copied! Share it with your friends.");
      });
    }
  });
})();
