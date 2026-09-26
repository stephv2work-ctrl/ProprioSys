import { useCallback, useEffect, useState } from 'react';

const INITIAL = { status: 'loading', model: null, backend: null, error: null };

/** Starts loading TF.js + COCO-SSD on mount so it's ready by the time the user taps Start. */
export function useDetector() {
  const [state, setState] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    import('../lib/detector.js')
      .then((m) => m.createDetector())
      .then(({ model, backend }) => {
        if (!cancelled) setState({ status: 'ready', model, backend, error: null });
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
  }, [attempt]);

  const retry = useCallback(() => {
    setState(INITIAL);
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
