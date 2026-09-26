import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkthrough, clockOf, distanceOf, isOn, joinList, nounPhrase } from './walkthrough.js';

const W = 1000;
const H = 1000;
const det = (cls, x, y, w, h) => ({ class: cls, score: 0.9, bbox: [x, y, w, h] });

test('nounPhrase uses articles, spoken names and plurals', () => {
  assert.equal(nounPhrase('umbrella', 1), 'an umbrella');
  assert.equal(nounPhrase('dining table', 1), 'a table');
  assert.equal(nounPhrase('person', 3), '3 people');
  assert.equal(nounPhrase('cell phone', 2), '2 phones');
});

test('joinList', () => {
  assert.equal(joinList(['a']), 'a');
  assert.equal(joinList(['a', 'b']), 'a and b');
  assert.equal(joinList(['a', 'b', 'c']), 'a, b and c');
});

test('clockOf spans 10 to 2 o\'clock', () => {
  assert.deepEqual([0, 0.3, 0.5, 0.7, 0.99, 1].map(clockOf), [10, 11, 12, 1, 2, 2]);
});

test('distanceOf', () => {
  assert.equal(distanceOf(0.5), 'very close');
  assert.equal(distanceOf(0.2), 'close');
  assert.equal(distanceOf(0.05), null);
  assert.equal(distanceOf(0.01), 'far');
});

test('isOn: cup resting on table top, not one beside it', () => {
  const table = det('dining table', 300, 500, 400, 300);
  assert.ok(isOn(det('cup', 450, 440, 50, 80), table));
  assert.ok(!isOn(det('cup', 100, 440, 50, 80), table));
  assert.ok(!isOn(det('cup', 450, 900, 50, 80), table));
});

test('single object overview skips the left-to-right line', () => {
  const steps = buildWalkthrough([det('couch', 300, 400, 400, 400)], W, H);
  assert.deepEqual(
    steps.map((s) => s.text),
    ['I found 1 object: a couch.', "At 12 o'clock, close: a couch.", 'End of walkthrough.'],
  );
});

test('empty photo gives a helpful message', () => {
  const steps = buildWalkthrough([], W, H);
  assert.equal(steps.length, 1);
  assert.match(steps[0].text, /couldn't identify/);
});

test('full walkthrough: overview, left-to-right tour, objects on surfaces, ending', () => {
  const chair = det('chair', 20, 500, 150, 300); // 10 o'clock
  const table = det('dining table', 300, 500, 400, 300); // 12 o'clock, area 0.12
  const laptop = det('laptop', 420, 400, 150, 120); // on table
  const cup = det('cup', 600, 450, 40, 60); // on table
  const p1 = det('person', 850, 300, 60, 150); // 2 o'clock, far
  const p2 = det('person', 920, 300, 60, 150); // 2 o'clock, far
  const steps = buildWalkthrough([cup, p1, table, laptop, chair, p2], W, H);

  assert.deepEqual(
    steps.map((s) => s.text),
    [
      'I found 6 objects: a chair, a table, a laptop, a cup and 2 people. Here they are from left to right.',
      "At 10 o'clock: a chair.",
      "At 12 o'clock: a table. On it: a laptop and a cup.",
      "At 2 o'clock, far: 2 people.",
      'End of walkthrough.',
    ],
  );
  // Boxes are the original bbox arrays, for highlighting.
  assert.ok(steps[2].boxes.includes(table.bbox) && steps[2].boxes.includes(cup.bbox));
  assert.equal(steps[0].boxes.length, 6);
});
