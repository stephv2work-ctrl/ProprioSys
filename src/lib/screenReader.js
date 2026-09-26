// Sends text to the user's screen reader (TalkBack / VoiceOver / NVDA) through
// ARIA live regions rendered once by <LiveRegions />. Written to the DOM
// directly so frequent announcements never cause React re-renders.
const regions = { polite: null, assertive: null };
const timers = { polite: 0, assertive: 0 };

export function registerRegion(kind, el) {
  regions[kind] = el;
}

/** `urgent` interrupts whatever the screen reader is saying (use sparingly). */
export function srAnnounce(text, { urgent = false } = {}) {
  const kind = urgent ? 'assertive' : 'polite';
  const el = regions[kind];
  if (!el || !text) return;
  // Clearing first makes screen readers re-read identical text ("Couch ahead" twice).
  el.textContent = '';
  clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => {
    el.textContent = text;
  }, 60);
}
