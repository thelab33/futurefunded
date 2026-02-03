(() => {
    const btn =
      document.currentScript?.previousElementSibling?.querySelector?.(
        "[data-share]",
      );
    if (!btn) return;
    btn.addEventListener(
      "click",
      async () => {
        const url = location.href;
        const title = document.title;
        const text = "Support our season 💛";
        try {
          if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          btn.textContent = "✅ Link copied";
          setTimeout(() => (btn.textContent = "🔗 Share"), 1400);
        } catch {}
      },
      { passive: true },
    );
  })();
