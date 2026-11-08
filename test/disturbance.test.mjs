import assert from 'node:assert/strict';
import test from 'node:test';
import { disturbanceTest } from '../lib/disturbance.mjs';

const demo = disturbanceTest();
const candidate = (gaugeId, amplitude) => demo.candidates.find(item => item.gaugeId === gaugeId && item.amplitude === amplitude);
const valuesAt = (item, time) => item.samples.find(sample => sample.time === time).values;
const readingsAt = (item, time) => valuesAt(item, time).map(({ reading }) => reading);

test('passive histories are identical and all mechanisms start at the same displaced radius', () => {
  const passive = candidate('panel', 0);
  assert.equal(passive.firstDistinct, null);
  assert.equal(passive.reason, 'no-pulse');
  for (const sample of passive.samples) {
    assert.deepEqual(sample.values.map(({ value, reading }) => [value, reading]), [[1, 1], [1, 1], [1, 1]]);
  }
  const active = candidate('panel', 0.024);
  assert.deepEqual(active.samples.filter(sample => sample.time < 0), passive.samples.filter(sample => sample.time < 0));
  assert.deepEqual(valuesAt(active, 0).map(({ value }) => value), [1.024, 1.024, 1.024]);
  assert.deepEqual(readingsAt(active, 0), [1.02, 1.02, 1.02]);
  const [recover, hold, grow] = valuesAt(active, 2);
  assert.ok(Math.abs(recover.value - (1 + 0.024 * Math.exp(-0.44))) < 1e-12);
  assert.equal(hold.value, 1.024);
  assert.ok(Math.abs(grow.value - (1 + 0.024 * Math.exp(0.24))) < 1e-12);
});

test('gauge bins and deadline change the smallest usable pulse', () => {
  const panel = candidate('panel', 0.024);
  assert.deepEqual(readingsAt(panel, 4), [1, 1.02, 1.02]);
  assert.deepEqual(readingsAt(panel, 5), [1, 1.02, 1.04]);
  assert.equal(panel.firstDistinct, demo.config.deadline);
  assert.equal(panel.eligible, true);
  assert.deepEqual([candidate('panel', 0.02).firstDistinct, candidate('panel', 0.02).reason], [6, 'too-late']);

  const fine = candidate('precision', 0.016);
  assert.deepEqual(readingsAt(fine, 2), [1.01, 1.01, 1.02]);
  assert.deepEqual(readingsAt(fine, 3), [1, 1.01, 1.02]);
  assert.equal(fine.firstDistinct, 3);
  assert.equal(candidate('panel', 0.016).reason, 'unresolved');
  assert.equal(candidate('precision', 0.01).reason, 'too-late');
  assert.deepEqual(demo.gauges.map(({ recommendedAmplitude }) => recommendedAmplitude), [0.024, 0.016]);
  assert.deepEqual(demo.recommended, { amplitude: 0.016, gaugeId: 'precision' });
});

test('rejects a pulse that separates early and crosses the bound later in the window', () => {
  const active = candidate('precision', 0.08);
  assert.equal(active.firstDistinct, 1);
  assert.ok(valuesAt(active, demo.config.deadline).every(({ value }) => value < demo.config.limit));
  assert.ok(active.peak > demo.config.limit);
  assert.equal(active.peak, valuesAt(active, demo.config.window).find(({ id }) => id === 'grow').value);
  assert.deepEqual([active.safe, active.eligible, active.reason], [false, false, 'over-limit']);
  assert.ok(Math.abs(active.gap - (1 - Math.exp(-(active.peak - 1.2) / 0.2))) < 1e-12);
  assert.equal(candidate('panel', 0.016).gap, 0);
  assert.equal(candidate('panel', 0.02).gap, 0);
});
