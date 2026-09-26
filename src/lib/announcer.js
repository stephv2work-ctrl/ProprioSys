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

export const VERBOSITY = {
  low: { repeatMs: 20000, changeMs: 5000 },
  normal: { repeatMs: 10000, changeMs: 3000 },
  high: { repeatMs: 6000, changeMs: 1500 },
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
      maxItems: 3, // keep sentences short enough to be useful while walking
      ...VERBOSITY.normal,
      ...opts,
    };
    this.tracks = new Map();
  }

  configure(opts) {
    Object.assign(this.opts, opts);
  }

  reset() {
    this.tracks.clear();
  }

  /**
   * Returns a plan `{ items, text, urgent, haptic }` or null. Call `commit()`
   * only if the plan was actually delivered, so dropped speech is retried.
   */
  evaluate(preds, w, h, now) {
    if (!w || !h) return null;
    const { minHits, gapMs, forgetMs, maxItems, repeatMs, changeMs } = this.opts;
    const items = summarize(preds, w, h);
    const present = new Set();

    for (const it of items) {
      present.add(it.label);
      let t = this.tracks.get(it.label);
      if (!t) {
        t = { hits: 0, lastSeen: -Infinity, announced: null };
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
      const changed = a.region !== it.region || a.prox !== it.prox || a.count !== it.count;
      if (it.prox === 'very close' && a.prox !== 'very close' && age > 1000) {
        due.push(it);
        urgent = true;
      } else if ((changed && age > changeMs) || age > repeatMs) {
        due.push(it);
      }
    }
    if (due.length === 0) return null;

    const picked = due.slice(0, maxItems);
    return {
      items: picked,
      text: `${picked.map(phrase).join('. ')}.`,
      urgent,
      haptic: urgent ? [180, 80, 180] : fresh ? [40] : null,
    };
  }

  commit(plan, now) {
    for (const it of plan.items) {
      const t = this.tracks.get(it.label);
      if (t) t.announced = { at: now, region: it.region, prox: it.prox, count: it.count };
    }
  }
}
