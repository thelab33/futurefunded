window.addEventListener("fc:funds:update", (e) => {
    const { raised, goal, pct } = e.detail;
    // Example: update header mini meter
    const hdrRaised = document.getElementById("hdr-raised");
    const hdrGoal = document.getElementById("hdr-goal");
    const hdrPct = document.getElementById("hdr-pct");
    const hdrBar = document.getElementById("hdr-meter");

    if (hdrRaised)
      hdrRaised.textContent = `$${Math.round(raised).toLocaleString()}`;
    if (hdrGoal) hdrGoal.textContent = `$${Math.round(goal).toLocaleString()}`;
    if (hdrPct) hdrPct.textContent = `${pct.toFixed(1)}%`;
    if (hdrBar) hdrBar.style.width = pct + "%";
  });
