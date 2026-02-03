window.launchConfetti = function() {
    // Confetti.js (canvas-confetti) integration
    if (window.confetti) {
      confetti({
        particleCount: {{ particle_count }},
        spread: {{ spread }},
        origin: { y: 0.6 },
        angle: 90,              // Spread direction
        scalar: 1.2,            // Size multiplier
        colors: [
          '#FBBF24', '#FACC15', '#FFD700',
          '#FFC107', '#FFEB3B'
        ]
      });
    }

    // Optional cheer sound
    {% if sound == "yes" %}
    try {
      const audio = new Audio("{{ url_for('static', filename='audio/' ~ audio_file) }}");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch(e) {
      console.error("Confetti audio failed:", e);
    }
    {% endif %}

    // Stop confetti after given duration (seconds)
    setTimeout(() => {
      if (window.confetti && typeof window.confetti.reset === 'function') {
        window.confetti.reset();
      }
    }, {{ duration }} * 1000);
  };
