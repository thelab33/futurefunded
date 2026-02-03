(() => {
    const modal = document.getElementById("newsletter-modal");
    const box = document.getElementById("newsletter-box");
    const closeBtn = document.getElementById("newsletter-close");
    const form = document.getElementById("newsletter-form");
    const emailInp = document.getElementById("newsletter-email");
    const friendInp = document.getElementById("newsletter-invite");
    const errEl = document.getElementById("email-error");
    const thanksEl = document.getElementById("newsletter-thankyou");
    const confettiEmoji = document.getElementById("swish-confetti");
    const noThanks = document.getElementById("newsletter-nothanks");
    const ball = document.getElementById("newsletter-ball");
    let lastFocus = null,
      debounceTimeout = null;

    const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    function openModal() {
      lastFocus = document.activeElement;
      modal.classList.remove("hidden");
      modal.style.opacity = "1";
      box.classList.remove("animate-popOut");
      box.classList.add("animate-popIn");
      modal.showModal?.();
      document.body.style.overflow = "hidden";
      emailInp.focus();
      window.dispatchEvent(new CustomEvent("newsletterModalViewed"));
    }

    function closeModal() {
      box.classList.remove("animate-popIn");
      box.classList.add("animate-popOut");
      modal.style.opacity = "0";
      setTimeout(() => {
        modal.close?.();
        modal.classList.add("hidden");
        document.body.style.overflow = "";
        errEl.textContent = "";
        errEl.classList.add("sr-only");
        thanksEl.classList.add("hidden");
        form.reset();
        confettiEmoji.style.opacity = 0;
        emailInp.disabled = false;
        form
          .querySelector('button[type="submit"]')
          .classList.remove("opacity-60", "pointer-events-none");
        lastFocus?.focus();
      }, 350);
    }

    emailInp.addEventListener("input", () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        const val = emailInp.value.trim();
        if (!val) {
          errEl.textContent = "";
          emailInp.setAttribute("aria-invalid", "false");
        } else if (!validEmail(val)) {
          errEl.textContent = "Please enter a valid email address.";
          errEl.classList.remove("sr-only");
          emailInp.setAttribute("aria-invalid", "true");
        } else {
          errEl.textContent = "";
          errEl.classList.add("sr-only");
          emailInp.setAttribute("aria-invalid", "false");
        }
      }, 400);
    });

    if (
      !sessionStorage.getItem("newsletter_shown") &&
      !sessionStorage.getItem("newsletter_optout")
    ) {
      setTimeout(() => {
        openModal();
        sessionStorage.setItem("newsletter_shown", "1");
      }, 10000);
    }

    closeBtn.addEventListener("click", closeModal);
    noThanks.addEventListener("click", (e) => {
      e.preventDefault();
      sessionStorage.setItem("newsletter_optout", "1");
      closeModal();
      window.dispatchEvent(new CustomEvent("newsletterModalOptout"));
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden"))
        closeModal();
    });

    modal.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    form
      .querySelector('button[type="submit"]')
      .addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const ripple = document.createElement("span");
        ripple.className = "ripple-effect";
        btn.appendChild(ripple);
        const rect = btn.getBoundingClientRect();
        ripple.style.left = `${e.clientX - rect.left}px`;
        ripple.style.top = `${e.clientY - rect.top}px`;
        setTimeout(() => ripple.remove(), 600);
      });

    ball.addEventListener("click", () => {
      ball.classList.add("bounce-temp");
      setTimeout(() => ball.classList.remove("bounce-temp"), 600);
    });
    ball.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ball.click();
      }
    });

    function launchConfetti() {
      const confettiCount = 24;
      const colors = ["#FBBF24", "#FACC15", "#FFD700", "#FFC107", "#FFEB3B"];
      const btn = form.querySelector('button[type="submit"]');
      const rect = btn.getBoundingClientRect();
      for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement("div");
        confetti.className = "confetti-piece";
        confetti.style.backgroundColor =
          colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = `${rect.left + rect.width / 2}px`;
        confetti.style.top = `${rect.top + rect.height / 2}px`;
        document.body.appendChild(confetti);
        const angle = Math.random() * 2 * Math.PI;
        const velocity = Math.random() * 120 + 50;
        confetti.animate(
          [
            { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) rotate(${Math.random() * 360}deg)`,
              opacity: 0,
            },
          ],
          { duration: 1500, easing: "ease-out", fill: "forwards" },
        );
        setTimeout(() => confetti.remove(), 1600);
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = emailInp.value.trim(),
        invite = friendInp.value.trim();
      if (!validEmail(email)) {
        errEl.textContent = "Please enter a valid email address.";
        errEl.classList.remove("sr-only");
        box.classList.add("ring-red-400");
        setTimeout(() => box.classList.remove("ring-red-400"), 600);
        return;
      }
      errEl.classList.add("sr-only");
      emailInp.disabled = true;
      form
        .querySelector('button[type="submit"]')
        .classList.add("opacity-60", "pointer-events-none");
      confettiEmoji.style.opacity = 1;
      form
        .querySelector('button[type="submit"]')
        .classList.add("animate-bounce");
      setTimeout(
        () =>
          form
            .querySelector('button[type="submit"]')
            .classList.remove("animate-bounce"),
        900,
      );

      // API placeholder — replace with your backend call
      setTimeout(() => {
        thanksEl.classList.remove("hidden");
        launchConfetti();
        window.dispatchEvent(
          new CustomEvent("newsletterSubscribed", {
            detail: { email, invite },
          }),
        );
        setTimeout(closeModal, 1700);
        confettiEmoji.style.opacity = 0;
      }, 950);
    });
  })();
