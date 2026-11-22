// Shared limits keep inference and rendering from competing with live audio.
const PitchScheduling = (() => {
  class NeuralBudget {
    constructor() { this.busy = false; this.nextAt = 0; this.startedAt = 0; }
    available(now) { return !this.busy && now >= this.nextAt; }
    start(now) {
      if (!this.available(now)) return false;
      this.busy = true; this.startedAt = now;
      return true;
    }
    finish(now, inferenceMs = 0) {
      const elapsed = Math.max(0, now - this.startedAt, inferenceMs);
      this.busy = false;
      // At most four checks per second, and at least four times the inference
      // duration resting: slow devices spend at most 20% of a core on CREPE.
      this.nextAt = now + Math.max(250 - elapsed, elapsed * 4);
    }
  }

  function createPainter(paint, intervalMs = 50) {
    let timer = null, lastAt = -Infinity;
    return {
      request() {
        if (timer !== null || document.hidden) return;
        timer = setTimeout(() => {
          timer = null;
          if (document.hidden) return;
          lastAt = performance.now();
          paint();
        }, Math.max(0, intervalMs - (performance.now() - lastAt)));
      },
      cancel() { clearTimeout(timer); timer = null; }
    };
  }
  return { NeuralBudget, createPainter };
})();
