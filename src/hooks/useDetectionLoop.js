import { useEffect, useRef } from 'react';

/**
 * rAF-driven inference loop. Never overlaps inferences (skips frames while the
 * GPU is busy) and caps the rate to save battery. Results go to `onFrame` via a
 * ref so per-frame work never triggers React re-renders.
 */
export function useDetectionLoop({ enabled, model, videoRef, minScore, maxFps = 15, onFrame }) {
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    if (!enabled || !model) return;
    const minInterval = 1000 / maxFps;
    let raf = 0;
    let busy = false;
    let last = 0;
    let alive = true;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (busy || now - last < minInterval || !video || video.readyState < 2) return;
      busy = true;
      last = now;
      const t0 = performance.now();
      model
        .detect(video, 10, minScore)
        .then((preds) => {
          if (alive) onFrameRef.current(preds, performance.now() - t0);
        })
        .catch((err) => console.warn('detect failed', err))
        .finally(() => {
          busy = false;
        });
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [enabled, model, videoRef, minScore, maxFps]);
}
