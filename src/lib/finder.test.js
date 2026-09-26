import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TARGETS, COMMON_TARGETS, Finder } from './finder.js';

const W = 640;
const H = 480;
const det = (cls, cx, area) => {
  const side = Math.sqrt(area * W * H);
  return { class: cls, score: 0.9, bbox: [cx * W - side / 2, 0, side, side] };
};
const run = (f, frames, start = 0, step = 100) => {
  const out = [];
  frames.forEach((preds, i) => {
    const t = start + i * step;
    const plan = f.evaluate(preds, W, H, t);
    if (plan) {
      f.commit(plan, t);
      out.push(plan.text);
    }
  });
  return out;
};

test('target lists cover the 80 COCO classes, common ones included', () => {
  assert.equal(ALL_TARGETS.length, 80);
  for (const t of COMMON_TARGETS) assert.ok(ALL_TARGETS.includes(t), t);
});

test('ignores everything except the target', () => {
  const f = new Finder();
  f.setTarget('cup');
  assert.deepEqual(run(f, Array(20).fill([det('chair', 0.5, 0.2), det('person', 0.2, 0.3)])), []);
});

test('announces when found, with clock direction and proximity', () => {
  const f = new Finder();
  f.setTarget('cup');
  const spoken = run(f, [[det('cup', 0.3, 0.05)], [det('cup', 0.3, 0.05)]]);
  assert.deepEqual(spoken, ["Cup at 11 o'clock."]);
});

test('updates only when the new direction holds, then says when it is lost', () => {
  const f = new Finder({ minGapMs: 0 });
  f.setTarget('bottle');
  const frames = [
    ...Array(3).fill([det('bottle', 0.3, 0.05)]), // found at 11
    [det('bottle', 0.5, 0.05)], // one-frame flicker to 12: ignored
    ...Array(5).fill([det('bottle', 0.3, 0.05)]),
    ...Array(5).fill([det('bottle', 0.5, 0.2)]), // moved to 12, close
    ...Array(40).fill([]), // gone
  ];
  assert.deepEqual(run(f, frames), ["Bottle at 11 o'clock.", "Bottle at 12 o'clock, close.", 'Bottle out of view.']);
});

test('straight ahead gives a tick; several matches follow the nearest', () => {
  const f = new Finder();
  f.setTarget('chair');
  f.evaluate([det('chair', 0.5, 0.05)], W, H, 0);
  const plan = f.evaluate([det('chair', 0.5, 0.05), det('chair', 0.1, 0.2)], W, H, 100);
  assert.equal(plan.text, "2 chairs, nearest at 10 o'clock, close.");
});

test('describe on demand', () => {
  const f = new Finder();
  assert.equal(f.describe([], W, H), 'Choose something to find first.');
  f.setTarget('cell phone');
  assert.equal(f.describe([], W, H), 'Phone not in view. Turn slowly to look around.');
  assert.equal(f.describe([det('cell phone', 0.5, 0.5)], W, H), "Phone at 12 o'clock, very close.");
});
