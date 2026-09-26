import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxDistance, formatDistance, inputSize, percentile } from './distance.js';

test('inputSize keeps aspect and snaps to multiples of 28', () => {
  assert.deepEqual(inputSize(640, 480), { width: 448, height: 336 });
  assert.deepEqual(inputSize(480, 640), { width: 336, height: 448 });
  assert.deepEqual(inputSize(1280, 720), { width: 448, height: 252 });
  for (const v of Object.values(inputSize(1000, 333))) assert.equal(v % 28, 0);
});

test('percentile', () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5, 1, 3, 2, 4], 0), 1);
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 1), 5);
});

test('boxDistance reads the object, not the background behind it', () => {
  // 10×10 depth map at half the source resolution: wall at 4 m, object at 2 m in the middle.
  const width = 10;
  const height = 10;
  const data = new Float32Array(width * height).fill(4);
  for (let r = 3; r < 8; r++) for (let c = 3; c < 8; c++) data[r * width + c] = 2;
  const depth = { data, width, height };
  // Box in 20×20 source pixels loosely around the object (includes some wall).
  assert.equal(boxDistance(depth, [4, 4, 14, 14], 20, 20), 2);
});

test('boxDistance ignores invalid values and handles empty regions', () => {
  const depth = { data: new Float32Array([NaN, 0, -1, NaN]), width: 2, height: 2 };
  assert.equal(boxDistance(depth, [0, 0, 2, 2], 2, 2), null);
});

test('formatDistance', () => {
  assert.equal(formatDistance(0.84), '0.8 metres');
  assert.equal(formatDistance(1.02), '1 metre');
  assert.equal(formatDistance(2.46), '2.5 metres');
  assert.equal(formatDistance(4.4), '4 metres');
  assert.equal(formatDistance(null), null);
});
