// Default settings and validation of whatever was saved on this device. Saved
// values can be stale (a model later renamed or removed) or malformed, so every
// field is checked against its expected type, range or list of options.
import { DEPTH_MODELS, OBJECT_MODELS } from './models.js';

export const DEFAULTS = {
  speech: true,
  haptics: true,
  showBoxes: true,
  rate: 1.1,
  minScore: 0.55,
  verbosity: 'normal',
  earbuds: true, // earbud play/pause button controls the app
  voiceChosen: false, // first-run question: ProprioSys voice vs. screen reader
  tutorialDone: false,
  objectModel: 'fast', // see lib/models.js
  depthModel: 'off',
};

const RANGES = { rate: [0.7, 1.8], minScore: [0.3, 0.9] };
const CHOICES = {
  verbosity: ['low', 'normal', 'high'],
  objectModel: OBJECT_MODELS.map((m) => m.id),
  depthModel: DEPTH_MODELS.map((m) => m.id),
};

export function normalizeSettings(saved) {
  const out = { ...DEFAULTS };
  if (!saved || typeof saved !== 'object') return out;
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const v = saved[key];
    if (typeof v !== typeof fallback) continue;
    if (typeof v === 'number') {
      const [min, max] = RANGES[key] ?? [-Infinity, Infinity];
      if (!Number.isFinite(v)) continue;
      out[key] = Math.min(max, Math.max(min, v));
    } else if (CHOICES[key]) {
      if (CHOICES[key].includes(v)) out[key] = v;
    } else {
      out[key] = v;
    }
  }
  return out;
}
