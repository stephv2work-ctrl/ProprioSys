import { useCallback, useEffect, useState } from 'react';

const INITIAL = { status: 'loading', model: null, backend: null, error: null };

/** Starts loading TF.js + COCO-SSD on mount so it's ready by the time the user taps Start. */
export function useDetector(base) {
  const [state, setState] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL);
    import('../lib/detector.js')
      .then(async (m) => {
        const { model, backend } = await m.createDetector(base);
        if (cancelled) return;
        m.releaseDetectorsExcept(base);
        setState({ status: 'ready', model, backend, error: null });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setState({
            ...INITIAL,
            status: 'error',
            error: navigator.onLine
              ? 'The detection model failed to load.'
              : 'You are offline and the model is not cached yet. Connect once to download it.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [base, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
}
