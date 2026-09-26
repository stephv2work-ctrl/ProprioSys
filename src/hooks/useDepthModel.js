import { useCallback, useEffect, useState } from 'react';

const OFF = { status: 'off', progress: 0, device: null, error: null };

/** Downloads the chosen depth model in the background as soon as it's selected. */
export function useDepthModel(id) {
  const [state, setState] = useState(OFF);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (id === 'off') {
      setState(OFF);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', progress: 0, device: null, error: null });
    import('../lib/depth.js')
      .then(async (m) => {
        const { device } = await m.detectBackend();
        if (!cancelled) setState((s) => ({ ...s, device }));
        await m.loadDepthModel(id, (progress) => !cancelled && setState((s) => ({ ...s, progress })));
        if (!cancelled) setState({ status: 'ready', progress: 100, device, error: null });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setState({
            ...OFF,
            status: 'error',
            error: navigator.onLine ? 'The depth model failed to load.' : 'Connect to the internet once to download the depth model.',
          });
        }
      });
    return () => {
      cancelled = true;
      // Free the model when it's switched off or replaced.
      import('../lib/depth.js').then((m) => m.unloadDepthModel(id));
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { id, ...state, retry };
}
