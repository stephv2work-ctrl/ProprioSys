# ProprioSys

Mobile PWA that streams the rear camera, runs COCO-SSD (TensorFlow.js, WebGL) on-device, and
speaks what it sees — with direction ("on your left"), rough distance ("close", "very close"), and
haptic pulses for nearby objects. No frames leave the device.

## Modes

- **Live** — continuous scanning; announces new or moved objects with direction and rough distance.
- **Canvas** — tap to take a still, then hear a guided walkthrough: an overview ("I found 5 objects…"),
  a left-to-right tour using clock directions ("At 10 o'clock, close: a chair"), objects grouped
  with the surface they sit on ("On it: a laptop and a cup"), and a closing line. The item being
  described is highlighted on screen. Swipe left/right (or Previous/Next) to move between items,
  tap to pause/play. Everything runs on-device — no paid APIs.

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (desktop webcam works on localhost)
npm run dev:mobile   # HTTPS on your LAN IP — open on a phone, accept the self-signed cert
npm run build && npm run preview
npm test             # announcement-logic unit tests
npm run icons        # regenerate PNG icons
```

Camera access requires a secure context: `localhost` or HTTPS. Deploy `dist/` to any static host
with HTTPS (Netlify, Vercel, Cloudflare Pages, GitHub Pages).

## Architecture

| File | Role |
| --- | --- |
| `src/lib/detector.js` | Lazy-loaded TF.js chunk: WebGL backend (CPU fallback), `lite_mobilenet_v2`, shader warm-up, memoised load |
| `src/hooks/useDetectionLoop.js` | rAF loop, ≤15 fps, never overlaps inferences, no React re-render per frame |
| `src/lib/announcer.js` | Pure logic: groups detections, 2-frame debounce, per-object cooldowns, urgent "very close" escalation |
| `src/lib/speech.js` | Web Speech wrapper: English voice, non-urgent speech never interrupts, iOS unlock, stuck-state recovery |
| `src/lib/haptics.js` | Throttled Vibration API (no-op on iOS) |
| `src/lib/draw.js` | Live overlay (matches the video's `object-fit: cover`) and Canvas snapshot rendering with highlighted boxes |
| `src/lib/walkthrough.js` | Pure logic for Canvas mode: overview, clock-direction tour, "on the table" grouping |
| `src/components/CanvasMode.jsx` | Capture → analyse → narrated walkthrough with swipe/tap controls |
| `src/hooks/useCamera.js` / `useWakeLock.js` | 640×480 rear camera with friendly errors; screen kept awake while running |

Plans from the announcer are only `commit()`ed when speech actually played, so anything dropped
while the voice was busy is retried on the next frame instead of being lost.

## Performance notes

- TF.js (~840 kB, 214 kB gzip) is a separate chunk that starts downloading on mount, so the model is
  usually ready before the user taps Start. Initial app JS is ~77 kB gzip.
- The model weights (~5 MB) are cached `CacheFirst` by the service worker, so the app works offline after the first run.
- Set `VITE_COCO_MODEL_URL` to self-host the weights (e.g. `/models/model.json` in `public/`).

## Accessibility

- The whole screen is a "describe everything" button; the controls are large with a high-contrast yellow accent.
- Turning off built-in speech switches captions to `aria-live`, so TalkBack/VoiceOver users hear
  announcements through their screen reader, without double-speaking.
- Distance is estimated from box size and is approximate. This is not a mobility aid.
