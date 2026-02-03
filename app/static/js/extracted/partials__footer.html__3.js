(() => {
  const floatCTA = document.getElementById('footer-float-cta');
  if (!floatCTA) return;
  
  // Debounced Scroll Handler for Floating CTA visibility
  const debounceFloatCTA = (() => {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        floatCTA.style.opacity = window.scrollY > 500 ? '1' : '0';
        floatCTA.style.pointerEvents = window.scrollY > 500 ? 'auto' : 'none';
      }, 50); // Debounce delay
    };
  })();

  window.addEventListener('scroll', debounceFloatCTA, { passive: true });
})();
