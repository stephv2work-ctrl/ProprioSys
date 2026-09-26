// Vibration API: Android Chrome/Firefox. iOS Safari has no support — calls are no-ops.
let last = 0;

export const haptics = {
  supported: typeof navigator !== 'undefined' && 'vibrate' in navigator,

  pulse(pattern, minGapMs = 600) {
    if (!this.supported) return;
    const now = performance.now();
    if (now - last < minGapMs) return;
    last = now;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* some browsers throw without a prior user gesture */
    }
  },
};
