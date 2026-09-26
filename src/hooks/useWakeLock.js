import { useEffect } from 'react';

/** Keeps the screen on while active; the lock is dropped on tab hide, so re-acquire on return. */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock = null;
    let cancelled = false;

    const request = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) l.release();
        else lock = l;
      } catch {
        /* denied (battery saver, etc.) — non-fatal */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
