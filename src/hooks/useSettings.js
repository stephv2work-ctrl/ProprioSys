import { useCallback, useState } from 'react';

const KEY = 'propriosys.settings.v1';

export const DEFAULTS = {
  speech: true,
  haptics: true,
  showBoxes: true,
  rate: 1.1,
  minScore: 0.55,
  verbosity: 'normal',
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(read);
  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
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
