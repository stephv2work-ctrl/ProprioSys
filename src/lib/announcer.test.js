import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Announcer, VERBOSITY, describeScene, phrase, summarize } from './announcer.js';

const W = 640;
const H = 480;
// bbox helper: centre x fraction, area fraction (square-ish box)
const det = (cls, cx, area, score = 0.9) => {
  const side = Math.sqrt(area * W * H);
  return { class: cls, score, bbox: [cx * W - side / 2, 0, side, side] };
};

test('summarize groups by class, keeps largest, sorts by size', () => {
  const s = summarize([det('chair', 0.1, 0.02), det('chair', 0.2, 0.05), det('person', 0.5, 0.3)], W, H);
  assert.equal(s[0].label, 'person');
  assert.equal(s[0].prox, 'close');
  assert.equal(s[1].count, 2);
  assert.equal(s[1].region, 'left');
});

test('phrase pluralises and adds proximity', () => {
  assert.equal(phrase({ label: 'person', count: 2, region: 'right', prox: null }), '2 people on your right');
  assert.equal(phrase({ label: 'car', count: 1, region: 'ahead', prox: 'very close' }), 'Car ahead, very close');
});

test('requires consecutive frames before announcing (debounce flicker)', () => {
  const a = new Announcer();
  assert.equal(a.evaluate([det('dog', 0.5, 0.05)], W, H, 0), null);
  const plan = a.evaluate([det('dog', 0.5, 0.05)], W, H, 100);
  assert.equal(plan.text, 'Dog ahead.');
  assert.deepEqual(plan.haptic, [40]);
});

test('does not repeat until changed or repeat interval elapses', () => {
  const a = new Announcer({ repeatMs: 10000, changeMs: 3000 });
  a.evaluate([det('dog', 0.5, 0.05)], W, H, 0);
  a.commit(a.evaluate([det('dog', 0.5, 0.05)], W, H, 100), 100);
  for (let t = 200; t < 2000; t += 100) assert.equal(a.evaluate([det('dog', 0.5, 0.05)], W, H, t), null);
  // moved left: silent until the change cooldown passes
  let first = null;
  for (let t = 2000; t <= 4000 && !first; t += 100) {
    const plan = a.evaluate([det('dog', 0.1, 0.05)], W, H, t);
    if (plan) first = { t, text: plan.text };
  }
  assert.deepEqual(first, { t: 3200, text: 'Dog on your left.' });
});

test('uncommitted plans are retried (speech was busy)', () => {
  const a = new Announcer();
  a.evaluate([det('cat', 0.5, 0.05)], W, H, 0);
  assert.ok(a.evaluate([det('cat', 0.5, 0.05)], W, H, 100));
  assert.ok(a.evaluate([det('cat', 0.5, 0.05)], W, H, 200));
});

test('becoming very close is urgent and bypasses change cooldown', () => {
  const a = new Announcer();
  a.evaluate([det('person', 0.5, 0.05)], W, H, 0);
  a.commit(a.evaluate([det('person', 0.5, 0.05)], W, H, 100), 100);
  for (let t = 200; t < 1200; t += 100) a.evaluate([det('person', 0.5, 0.05)], W, H, t);
  const plan = a.evaluate([det('person', 0.5, 0.5)], W, H, 1200);
  assert.equal(plan.urgent, true);
  assert.equal(plan.text, 'Person ahead, very close.');
  assert.deepEqual(plan.haptic, [180, 80, 180]);
});

test('objects that leave and return are announced again', () => {
  const a = new Announcer({ forgetMs: 1000 });
  a.evaluate([det('cup', 0.5, 0.05)], W, H, 0);
  a.commit(a.evaluate([det('cup', 0.5, 0.05)], W, H, 100), 100);
  a.evaluate([], W, H, 3000);
  a.evaluate([det('cup', 0.5, 0.05)], W, H, 3500);
  assert.ok(a.evaluate([det('cup', 0.5, 0.05)], W, H, 3600));
});

test('small, distant objects are ignored in normal verbosity', () => {
  const a = new Announcer();
  a.evaluate([det('bottle', 0.5, 0.01)], W, H, 0);
  assert.equal(a.evaluate([det('bottle', 0.5, 0.01)], W, H, 100), null);
  a.configure(VERBOSITY.high);
  a.evaluate([det('bottle', 0.5, 0.01)], W, H, 200);
  assert.equal(a.evaluate([det('bottle', 0.5, 0.01)], W, H, 300).text, 'Bottle ahead.');
});

test('boundary flicker does not trigger re-announcements', () => {
  const a = new Announcer({ changeMs: 1000 });
  a.evaluate([det('chair', 0.3, 0.05)], W, H, 0);
  a.commit(a.evaluate([det('chair', 0.3, 0.05)], W, H, 100), 100);
  // Alternates left/ahead every frame for 10 s: never holds long enough to count.
  for (let t = 200, i = 0; t < 10000; t += 100, i++) {
    assert.equal(a.evaluate([det('chair', i % 2 ? 0.3 : 0.36, 0.05)], W, H, t), null);
  }
});

test('announcements keep a minimum gap, but very close warnings bypass it', () => {
  const a = new Announcer();
  a.evaluate([det('dog', 0.5, 0.05)], W, H, 0);
  a.commit(a.evaluate([det('dog', 0.5, 0.05)], W, H, 100), 100);
  a.evaluate([det('dog', 0.5, 0.05), det('cat', 0.1, 0.05)], W, H, 200);
  assert.equal(a.evaluate([det('dog', 0.5, 0.05), det('cat', 0.1, 0.05)], W, H, 300), null);
  a.evaluate([det('dog', 0.5, 0.05), det('car', 0.8, 0.5)], W, H, 400);
  const plan = a.evaluate([det('dog', 0.5, 0.05), det('car', 0.8, 0.5)], W, H, 500);
  assert.equal(plan.urgent, true);
});

test('quiet verbosity never repeats unchanged objects', () => {
  const a = new Announcer(VERBOSITY.low);
  a.evaluate([det('couch', 0.5, 0.2)], W, H, 0);
  a.commit(a.evaluate([det('couch', 0.5, 0.2)], W, H, 100), 100);
  for (let t = 200; t < 120000; t += 500) assert.equal(a.evaluate([det('couch', 0.5, 0.2)], W, H, t), null);
});

test('describeScene', () => {
  assert.equal(describeScene([], W, H), 'Nothing detected.');
  assert.equal(describeScene([det('laptop', 0.9, 0.2)], W, H), 'Laptop on your right, close.');
});
