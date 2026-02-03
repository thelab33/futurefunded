(() => {
    const bar = document.getElementById("fc-testimonial-scrollbar");
    if (!bar || bar.__init) return;
    bar.__init = true;

    let lastY = window.scrollY,
      visible = false,
      hideTimer;

    function showBar() {
      if (!visible) {
        bar.classList.remove("hidden");
        requestAnimationFrame(() => bar.classList.add("opacity-100"));
        visible = true;
      }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideBar, 3000); // auto-hide after 3s idle
    }
    function hideBar() {
      if (visible) {
        bar.classList.remove("opacity-100");
        bar.addEventListener(
          "transitionend",
          () => bar.classList.add("hidden"),
          { once: true },
        );
        visible = false;
      }
    }

    window.addEventListener(
      "scroll",
      () => {
        const dy = Math.abs(window.scrollY - lastY);
        if (dy > 30) {
          // only trigger if scrolled enough
          showBar();
          lastY = window.scrollY;
        }
      },
      { passive: true },
    );
  })();
