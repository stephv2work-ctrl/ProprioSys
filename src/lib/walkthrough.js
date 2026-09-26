// Turns detections from a single still photo into an ordered, spoken tour:
// an overview, then a left-to-right sweep using clock directions, grouping
// small objects with the surface they rest on. Pure logic (no DOM).
import { plural } from './announcer.js';
import { formatDistance } from './distance.js';

const SPOKEN = {
  'dining table': 'table',
  tv: 'TV',
  'cell phone': 'phone',
  'potted plant': 'plant',
  'hair drier': 'hair dryer',
  'sports ball': 'ball',
};

// Things other objects are commonly "on".
const SURFACES = new Set(['dining table', 'bed', 'couch', 'bench', 'chair']);

const HOURS = [10, 11, 12, 1, 2];

export const spoken = (label) => SPOKEN[label] ?? label;

export function nounPhrase(label, count) {
  const word = spoken(label);
  if (count > 1) return `${count} ${plural(word)}`;
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Horizontal position → clock direction, as if the user faces 12 o'clock. */
export function clockOf(cx) {
  return HOURS[Math.min(HOURS.length - 1, Math.max(0, Math.floor(cx * HOURS.length)))];
}

export function distanceOf(area) {
  if (area >= 0.4) return 'very close';
  if (area >= 0.15) return 'close';
  if (area < 0.02) return 'far';
  return null;
}

/** Child rests on parent: centred over it, bottom edge in the parent's upper part, and clearly smaller. */
export function isOn(child, parent) {
  const [cx, cy, cw, ch] = child.bbox;
  const [px, py, pw, ph] = parent.bbox;
  const mid = cx + cw / 2;
  const bottom = cy + ch;
  return (
    mid > px &&
    mid < px + pw &&
    bottom >= py - 0.1 * ph &&
    bottom <= py + 0.6 * ph &&
    cw * ch < 0.5 * pw * ph
  );
}

/** Count labels in first-seen order → ["2 chairs", "a table", ...] */
function countPhrases(objs) {
  const counts = new Map();
  for (const o of objs) counts.set(o.label, (counts.get(o.label) ?? 0) + 1);
  return [...counts].map(([label, n]) => nounPhrase(label, n));
}

/**
 * @param {{ distances?: (number|null)[], note?: string }} [opts] `distances` (metres) align
 *   with `preds`; when given they replace the box-size guesses. `note` is appended to the overview.
 * @returns {{ text: string, boxes: number[][] }[]} steps — `boxes` holds the
 *   original `bbox` arrays (by reference) so the UI can highlight them.
 */
export function buildWalkthrough(preds, w, h, { distances, note } = {}) {
  if (!w || !h || preds.length === 0) {
    return [
      {
        text: "I couldn't identify any objects in this photo. Try moving closer, adding light, or aiming at a different spot.",
        boxes: [],
      },
    ];
  }

  const objs = preds.map((p, i) => {
    const [x, y, bw, bh] = p.bbox;
    const metres = distances?.[i] ?? null;
    return { label: p.class, bbox: p.bbox, cx: (x + bw / 2) / w, area: (bw * bh) / (w * h), metres, parent: null };
  });
  const measured = objs.some((o) => o.metres != null);

  // Attach each object to the largest surface it sits on.
  for (const o of objs) {
    for (const s of objs) {
      if (s !== o && SURFACES.has(s.label) && isOn(o, s) && (!o.parent || s.area > o.parent.area)) o.parent = s;
    }
  }
  // Keep nesting one level deep: anything that holds other objects is itself top-level.
  const parents = new Set(objs.map((o) => o.parent).filter(Boolean));
  for (const p of parents) p.parent = null;

  // Group top-level objects of the same class in the same direction ("2 chairs at 10 o'clock").
  const groups = new Map();
  for (const o of objs) {
    if (o.parent) continue;
    const key = `${o.label}|${clockOf(o.cx)}`;
    const g = groups.get(key) ?? { label: o.label, clock: clockOf(o.cx), members: [], children: [] };
    g.members.push(o);
    groups.set(key, g);
  }
  for (const o of [...objs].sort((a, b) => a.cx - b.cx)) {
    if (!o.parent) continue;
    for (const g of groups.values()) if (g.members.includes(o.parent)) g.children.push(o);
  }

  const mean = (g) => g.members.reduce((s, o) => s + o.cx, 0) / g.members.length;
  const tour = [...groups.values()].sort((a, b) => mean(a) - mean(b));

  const ordered = tour.flatMap((g) => [...g.members, ...g.children]);
  let overview =
    objs.length === 1
      ? `I found 1 object: ${joinList(countPhrases(ordered))}.`
      : `I found ${objs.length} objects: ${joinList(countPhrases(ordered))}.`;
  if (measured && objs.length > 1) {
    const nearest = objs.filter((o) => o.metres != null).reduce((a, b) => (b.metres < a.metres ? b : a));
    overview += ` Nearest is ${nounPhrase(nearest.label, 1)}, ${formatDistance(nearest.metres)} away at ${clockOf(nearest.cx)} o'clock.`;
  }
  if (objs.length > 1) overview += ' Here they are from left to right.';
  if (note) overview += ` ${note}`;
  const steps = [{ text: overview, boxes: objs.map((o) => o.bbox) }];

  for (const g of tour) {
    const largest = g.members.reduce((a, b) => (b.area > a.area ? b : a));
    // Measured distance to the nearest member when available, else a size-based guess.
    const known = g.members.map((o) => o.metres).filter((m) => m != null);
    const dist = known.length ? formatDistance(Math.min(...known)) : distanceOf(largest.area);
    let text = `At ${g.clock} o'clock${dist ? `, ${dist}` : ''}: ${nounPhrase(g.label, g.members.length)}.`;
    if (g.children.length) {
      text += ` On ${g.members.length > 1 ? 'them' : 'it'}: ${joinList(countPhrases(g.children))}.`;
    }
    steps.push({ text, boxes: [...g.members, ...g.children].map((o) => o.bbox) });
  }

  steps.push({ text: 'End of walkthrough.', boxes: [] });
  return steps;
}
