// Finder mode: follows one chosen kind of object and speaks only about it.
// Pure logic (no DOM) so it can be unit tested.
import { proximityOf } from './announcer.js';
import { clockOf, nounPhrase, spoken } from './walkthrough.js';

// The 80 COCO-SSD classes. Everyday things people look for come first.
export const COMMON_TARGETS = [
  'person', 'chair', 'couch', 'dining table', 'bed', 'toilet', 'sink', 'cup', 'bottle', 'cell phone',
  'laptop', 'remote', 'keyboard', 'book', 'backpack', 'handbag', 'suitcase', 'umbrella', 'tv', 'dog', 'cat',
  'car', 'bicycle', 'bench',
];
export const ALL_TARGETS = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
  'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors',
  'teddy bear', 'hair drier', 'toothbrush',
];

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export class Finder {
  constructor(opts = {}) {
    this.opts = {
      minHits: 2, // frames before "found" (kills one-frame false positives)
      gapMs: 700, // a longer miss restarts the streak
      holdFrames: 3, // a new direction must hold this long before it's spoken
      minGapMs: 2000, // silence between updates
      repeatMs: 8000, // reassure with the same position this often
      lostMs: 2500, // unseen this long = "out of view"
      ...opts,
    };
    this.setTarget(null);
  }

  setTarget(label) {
    this.target = label;
    this.state = { hits: 0, lastSeen: -Infinity, visible: false, spokenKey: null, spokeAt: -Infinity, pending: null };
  }

  /** Returns `{ text, haptic, urgent }` or null. Call `commit()` once it was delivered. */
  evaluate(preds, w, h, now) {
    if (!this.target || !w || !h) return null;
    const { minHits, gapMs, holdFrames, minGapMs, repeatMs, lostMs } = this.opts;
    const st = this.state;
    const name = spoken(this.target);
    const matches = preds.filter((p) => p.class === this.target);

    if (matches.length === 0) {
      if (st.visible && now - st.lastSeen > lostMs) {
        return { text: `${cap(name)} out of view.`, haptic: null, urgent: false, key: null, lost: true };
      }
      return null;
    }

    // Follow the nearest (largest) one.
    const best = matches.reduce((a, b) => (b.bbox[2] * b.bbox[3] > a.bbox[2] * a.bbox[3] ? b : a));
    const [x, , bw, bh] = best.bbox;
    const clock = clockOf((x + bw / 2) / w);
    const prox = proximityOf((bw * bh) / (w * h));
    st.hits = now - st.lastSeen > gapMs ? 1 : st.hits + 1;
    st.lastSeen = now;
    if (st.hits < minHits) return null;

    const key = `${clock}|${prox}`;
    const where = `${clock} o'clock${prox ? `, ${prox}` : ''}`;
    const subject = matches.length > 1 ? `${nounPhrase(this.target, matches.length)}, nearest` : cap(name);
    const plan = {
      text: `${subject} at ${where}.`.replace(/^./, (c) => c.toUpperCase()),
      // A tick when it's straight ahead helps line up with it.
      haptic: clock === 12 ? [30] : null,
      urgent: prox === 'very close' && st.spokenKey !== key,
      key,
    };

    if (!st.visible) return { ...plan, haptic: [40, 60, 40] };
    if (key !== st.spokenKey) {
      st.pending = st.pending?.key === key ? { key, frames: st.pending.frames + 1 } : { key, frames: 1 };
      if (st.pending.frames >= holdFrames && (plan.urgent || now - st.spokeAt >= minGapMs)) return plan;
      return null;
    }
    st.pending = null;
    return now - st.spokeAt >= repeatMs ? plan : null;
  }

  commit(plan, now) {
    const st = this.state;
    st.spokeAt = now;
    st.pending = null;
    if (plan.lost) {
      st.visible = false;
      st.spokenKey = null;
    } else {
      st.visible = true;
      st.spokenKey = plan.key;
    }
  }

  /** On demand ("where is it?"): the latest position, or that it isn't in view. */
  describe(preds, w, h) {
    if (!this.target) return 'Choose something to find first.';
    const matches = preds.filter((p) => p.class === this.target);
    const name = spoken(this.target);
    if (!matches.length || !w || !h) return `${cap(name)} not in view. Turn slowly to look around.`;
    const best = matches.reduce((a, b) => (b.bbox[2] * b.bbox[3] > a.bbox[2] * a.bbox[3] ? b : a));
    const [x, , bw, bh] = best.bbox;
    const prox = proximityOf((bw * bh) / (w * h));
    return `${cap(name)} at ${clockOf((x + bw / 2) / w)} o'clock${prox ? `, ${prox}` : ''}.`;
  }
}
