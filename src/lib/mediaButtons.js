// Lets the play/pause (and next/previous) buttons on wired or Bluetooth
// earbuds control the app via the Media Session API. Browsers only route
// those buttons to a page that is playing media, so we loop a silent clip.

let audio = null;

// 6 s of 8 kHz 8-bit silence (~48 kB), built at runtime. Android only shows
// media controls for clips of at least ~5 s.
function silentWavUrl(seconds = 6, rate = 8000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 8-bit PCM silence is the midpoint
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack'];

export const mediaButtons = {
  supported: typeof navigator !== 'undefined' && 'mediaSession' in navigator,

  /** Must be called from a user gesture (it starts audio playback). */
  async start() {
    if (!this.supported) return false;
    if (!audio) {
      audio = new Audio(silentWavUrl());
      audio.loop = true;
    }
    try {
      await audio.play();
    } catch {
      return false;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'ProprioSys',
      artist: 'Earbud button controls',
      artwork: [{ src: '/pwa-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = 'playing';
    return true;
  },

  /** Play and pause both trigger `primary`: earbuds send whichever the OS thinks applies. */
  setHandlers({ primary, next, prev }) {
    if (!this.supported) return;
    const ms = navigator.mediaSession;
    const keepAlive = () => {
      if (audio?.paused) audio.play().catch(() => {});
      ms.playbackState = 'playing';
    };
    const wrap = (fn) => (fn ? () => (keepAlive(), fn()) : null);
    const handlers = { play: wrap(primary), pause: wrap(primary), nexttrack: wrap(next), previoustrack: wrap(prev) };
    for (const action of ACTIONS) {
      try {
        ms.setActionHandler(action, handlers[action]);
      } catch {
        /* action unsupported on this browser */
      }
    }
  },

  stop() {
    audio?.pause();
    if (!this.supported) return;
    for (const action of ACTIONS) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  },
};
