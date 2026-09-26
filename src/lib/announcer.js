// Turns a stream of per-frame detections into occasional, non-repetitive
// spoken sentences. Pure logic (no DOM) so it can be unit tested.

const PLURALS = {
  person: 'people',
  mouse: 'mice',
  knife: 'knives',
  sheep: 'sheep',
  skis: 'skis',
  scissors: 'scissors',
  bus: 'buses',
  bench: 'benches',
  couch: 'couches',
  sandwich: 'sandwiches',
  toothbrush: 'toothbrushes',
  'wine glass': 'wine glasses',
};

export const plural = (label) => PLURALS[label] ?? `${label}s`;

// How chatty Live mode is. "Very close" warnings ignore all of these limits.
//   repeatMs   re-announce an unchanged object after this long (Infinity = never)
//   changeMs   minimum time before announcing that an object moved or changed
//   minGapMs   minimum silence between any two announcements
//   maxItems   objects per sentence
//   minArea    ignore objects smaller than this fraction of the frame (small and far away)
export const VERBOSITY = {
  low: { repeatMs: Infinity, changeMs: 8000, minGapMs: 5000, maxItems: 1, minArea: 0.05 },
  normal: { repeatMs: 45000, changeMs: 5000, minGapMs: 3000, maxItems: 2, minArea: 0.02 },
  high: { repeatMs: 15000, changeMs: 2000, minGapMs: 1500, maxItems: 3, minArea: 0 },
};

// Rear camera is not mirrored, so image-left is the user's left.
export function regionOf(cx) {
  if (cx < 1 / 3) return 'left';
  if (cx > 2 / 3) return 'right';
  return 'ahead';
}

// Bounding-box area as a fraction of the frame is a cheap monocular proxy for distance.
export function proximityOf(areaRatio) {
  if (areaRatio >= 0.4) return 'very close';
  if (areaRatio >= 0.15) return 'close';
  return null;
}

/** Collapse detections to one entry per class (largest instance wins), biggest first. */
export function summarize(preds, w, h) {
  const groups = new Map();
  const frame = w * h;
  for (const p of preds) {
    const [x, , bw, bh] = p.bbox;
    const area = (bw * bh) / frame;
    const cx = (x + bw / 2) / w;
    const g = groups.get(p.class);
    if (!g) groups.set(p.class, { label: p.class, count: 1, area, cx });
    else {
      g.count++;
      if (area > g.area) {
        g.area = area;
        g.cx = cx;
      }
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, region: regionOf(g.cx), prox: proximityOf(g.area) }))
    .sort((a, b) => b.area - a.area);
}

const REGION_TEXT = { left: 'on your left', right: 'on your right', ahead: 'ahead' };

export function phrase(item) {
  const noun = item.count > 1 ? `${item.count} ${plural(item.label)}` : item.label;
  const text = `${noun} ${REGION_TEXT[item.region]}${item.prox ? `, ${item.prox}` : ''}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function describeScene(preds, w, h, max = 6) {
  if (!w || !h || preds.length === 0) return 'Nothing detected.';
  return `${summarize(preds, w, h).slice(0, max).map(phrase).join('. ')}.`;
}

export class Announcer {
  constructor(opts = {}) {
    this.opts = {
      minHits: 2, // consecutive frames before an object counts (kills 1-frame flicker)
      gapMs: 700, // a gap longer than this resets the hit streak
      forgetMs: 2500, // after this long unseen, a returning object is "new" again
      stableFrames: 4, // a change must hold this many frames (kills left/ahead flicker)
      ...VERBOSITY.normal,
      ...opts,
    };
    this.tracks = new Map();
    this.lastSpokeAt = -Infinity;
  }

  configure(opts) {
    Object.assign(this.opts, opts);
  }

  reset() {
    this.tracks.clear();
    this.lastSpokeAt = -Infinity;
  }

  /**
   * Returns a plan `{ items, text, urgent, haptic }` or null. Call `commit()`
   * only if the plan was actually delivered, so dropped speech is retried.
   */
  evaluate(preds, w, h, now) {
    if (!w || !h) return null;
    const { minHits, gapMs, forgetMs, maxItems, repeatMs, changeMs, minGapMs, minArea, stableFrames } = this.opts;
    // Small, distant objects are mostly noise while moving around; skip them.
    const items = summarize(preds, w, h).filter((it) => it.prox || it.area >= minArea);
    const present = new Set();

    for (const it of items) {
      present.add(it.label);
      let t = this.tracks.get(it.label);
      if (!t) {
        t = { hits: 0, lastSeen: -Infinity, announced: null, pending: null };
        this.tracks.set(it.label, t);
      }
      t.hits = now - t.lastSeen > gapMs ? 1 : t.hits + 1;
      t.lastSeen = now;
    }
    for (const [label, t] of this.tracks) {
      if (!present.has(label) && now - t.lastSeen > forgetMs) this.tracks.delete(label);
    }

    const due = [];
    let urgent = false;
    let fresh = false;
    for (const it of items) {
      const t = this.tracks.get(it.label);
      if (t.hits < minHits) continue;
      const a = t.announced;
      if (!a) {
        due.push(it);
        fresh = true;
        if (it.prox === 'very close') urgent = true;
        continue;
      }
      const age = now - a.at;
      // Only count a change once the new state has held for a few frames.
      const state = `${it.region}|${it.prox}|${it.count}`;
      const differs = a.region !== it.region || a.prox !== it.prox || a.count !== it.count;
      if (!differs) t.pending = null;
      else if (t.pending?.state === state) t.pending.frames++;
      else t.pending = { state, frames: 1 };
      const changed = differs && t.pending.frames >= stableFrames;
      if (it.prox === 'very close' && a.prox !== 'very close' && age > 1000) {
        due.push(it);
        urgent = true;
      } else if ((changed && age > changeMs) || age > repeatMs) {
        due.push(it);
      }
    }
    if (due.length === 0) return null;
    // Leave room to breathe between announcements, unless something is very close.
    if (!urgent && now - this.lastSpokeAt < minGapMs) return null;

    const picked = due.slice(0, maxItems);
    return {
      items: picked,
      text: `${picked.map(phrase).join('. ')}.`,
      urgent,
      haptic: urgent ? [180, 80, 180] : fresh ? [40] : null,
    };
  }

  commit(plan, now) {
    this.lastSpokeAt = now;
    for (const it of plan.items) {
      const t = this.tracks.get(it.label);
      if (t) t.announced = { at: now, region: it.region, prox: it.prox, count: it.count };
    }
  }
}
