import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeSettings } from './settings.js';

test('missing or malformed storage falls back to defaults', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULTS);
  assert.deepEqual(normalizeSettings('nope'), DEFAULTS);
  assert.deepEqual(normalizeSettings({}), DEFAULTS);
});

test('valid saved values are kept', () => {
  const s = normalizeSettings({ speech: false, rate: 1.4, objectModel: 'accurate', depthModel: 'dpt-nyu', verbosity: 'low' });
  assert.equal(s.speech, false);
  assert.equal(s.rate, 1.4);
  assert.equal(s.objectModel, 'accurate');
  assert.equal(s.depthModel, 'dpt-nyu');
  assert.equal(s.verbosity, 'low');
});

test('unknown model ids, wrong types and out-of-range numbers are rejected', () => {
  const s = normalizeSettings({
    objectModel: 'removed-model',
    depthModel: 'metric3d',
    rate: '1.1',
    minScore: 5,
    speech: 'yes',
    verbosity: 'loud',
    extra: 'ignored',
  });
  assert.equal(s.objectModel, 'fast');
  assert.equal(s.depthModel, 'off');
  assert.equal(s.rate, DEFAULTS.rate);
  assert.equal(s.minScore, 0.9);
  assert.equal(s.speech, true);
  assert.equal(s.verbosity, 'normal');
  assert.equal('extra' in s, false);
});
