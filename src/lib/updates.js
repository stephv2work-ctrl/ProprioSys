// Tracks whether a new app version is waiting. The service worker activates
// updates immediately, but reloading the page mid-use would stop the camera and
// drop the user on the start screen, so App decides *when* to reload.
let pending = false;
const listeners = new Set();

export const updates = {
  markPending() {
    pending = true;
    listeners.forEach((fn) => fn());
  },
  isPending: () => pending,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
