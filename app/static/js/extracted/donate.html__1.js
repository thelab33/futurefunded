window.requestAnimationFrame(() => {
    if (typeof window.openDonationModal === "function")
      window.openDonationModal();
  });
