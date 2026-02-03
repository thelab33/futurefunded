(() => {
  const backTopBtn = document.getElementById('backtop');
  if (!backTopBtn) return;
  
  // Debounced Scroll Handler for Back to Top button
  const debounceScroll = (() => {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        backTopBtn.style.opacity = window.scrollY > 300 ? "1" : "0";
        backTopBtn.style.pointerEvents = window.scrollY > 300 ? "auto" : "none";
      }, 50); // Debounce delay
    };
  })();

  window.addEventListener('scroll', debounceScroll, { passive: true });

  backTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
