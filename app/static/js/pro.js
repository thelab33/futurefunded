// Animate KPI numbers on scroll
function animateCountUp(el, end, duration=1200) {
  let start = 0, frame = null;
  const step = ts => {
    if (!el._start) el._start = ts;
    let progress = (ts - el._start) / duration;
    let val = Math.floor(start + (end - start) * Math.min(progress,1));
    el.textContent = val;
    if (progress < 1) frame = requestAnimationFrame(step);
    else el.textContent = end;
  };
  requestAnimationFrame(step);
}
window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-count-to]').forEach(el => {
    animateCountUp(el, parseInt(el.dataset.countTo,10));
  });
});

