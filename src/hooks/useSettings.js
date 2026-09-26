import { useCallback, useState } from 'react';
import { DEFAULTS, normalizeSettings } from '../lib/settings.js';

export { DEFAULTS };

const KEY = 'propriosys.settings.v1';

function read() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(read);
  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = normalizeSettings({ ...prev, ...patch });
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode / storage blocked */
      }
      return next;
    });
  }, []);
  return [settings, update];
}
