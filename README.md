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
| `src/lib/models.js` | The selectable models (object + depth): labels, sizes, repos, input constraints |
| `src/lib/detector.js` | Lazy-loaded TF.js chunk: WebGL backend (CPU fallback), chosen COCO-SSD variant, shader warm-up, memoised per model |
| `src/lib/depth.js` | Lazy-loaded Transformers.js depth runtime: WebGPU (WASM fallback), download progress, warm-up, session reset on failure |
| `src/lib/distance.js` | Pure helpers: model input sizing, per-object distance from a depth map, spoken distance formatting |
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
- The default (Fast) COCO-SSD weights are 18 MB; Balanced is 27 MB and Accurate 67 MB. They're cached `CacheFirst` by the service worker, so the app works offline after the first run.
- Set `VITE_COCO_MODEL_URL` to self-host the Fast model's weights (e.g. `/models/model.json` in `public/`).

## Models and distances

Settings → **Object model** (Fast / Balanced / Accurate) and **Distance model** (Off / Indoor distances).

- *Indoor distances* uses [DPT-DINOv2 small, NYU](https://huggingface.co/onnx-community/dpt-dinov2-small-nyu)
  (Apache-2.0, ~40 MB) via Transformers.js. It outputs metric depth; each object's distance is the
  25th percentile of depth in the central half of its box. Canvas mode then says "At 12 o'clock,
  2.6 metres: a couch" and names the nearest object.
- Speed: ~0.5–0.8 s per photo with WebGPU; the WASM fallback measured ~15 s on a desktop, so
  Settings warns on phones without WebGPU.
- Model inputs must be multiples of 28 px (DPT halves its 14 px patch grid). A failed ONNX run can
  leave the session unusable, so `depth.js` discards and reloads it.
- Evaluated but not used: Metric3D ViT-S (fp16-only export rejected its input), Depth Anything V2
  Metric (no browser-ready ONNX export yet), Depth Anything V2 Small (relative depth only).
- Transformers.js caches weights in Cache Storage; the ONNX Runtime WASM (from jsDelivr) is cached
  by the service worker.

## Accessibility

- **Voice or screen reader:** on first launch the app asks whether announcements should use the
  ProprioSys voice or the user's screen reader (TalkBack / VoiceOver). The two never talk at once:
  in screen-reader mode everything goes through ARIA live regions (`src/lib/screenReader.js`).
- **Familiar controls:** the whole screen is a tap target, and so is the start screen. Earbud
  play/pause triggers the main action (Media Session API, `src/lib/mediaButtons.js`); double/triple
  press moves through a Canvas walkthrough. Keyboard and switch-access users get Space/Enter,
  ←/→, P (pause), M (mode), S (settings) and H (help).
- **Standard widgets:** Settings and Help are native `<dialog>`s (focus trap, Escape/back
  closes). The Live/Canvas switch is an ARIA radio group with arrow keys. The Canvas step slider
  is a native range input, so screen readers adjust it with their usual swipe up/down gesture.
- **Help:** a first-run spoken tutorial and a Help sheet with a "Play spoken guide" button
  (`src/lib/guide.js`).
- **Home-screen shortcuts:** long-press the installed icon for Live or Canvas (`/?mode=canvas`).
- Buttons show visible text that matches their accessible names, so Voice Control / Voice Access
  commands like "Tap Describe scene" work. The status pill is not a live region, so fps updates
  are never read aloud.
- Distance is estimated from box size and is approximate. This is not a mobility aid.
