import assert from 'node:assert/strict';
import test from 'node:test';
import { phaseCheck } from '../lib/phase-check.mjs';

test('EntPTC entropy and equilibrium memory coincide across all eight phase states', () => {
  const { states, entropy, memory } = phaseCheck();
  assert.equal(states.length, 8);
  assert.ok(Math.abs(entropy - 1.5012072706145636) < 1e-12);
  assert.ok(Math.abs(memory - 1.000804847076376) < 1e-12);
  for (const state of states) {
    assert.equal(state.entropy, entropy);
    assert.equal(state.memory, memory);
    assert.deepEqual(state.readout, state.phase.map(bit => Math.cos(bit * Math.PI)));
  }
});

test('each independent cosine channel halves the remaining phase states', () => {
  const { states } = phaseCheck();
  for (const selected of states) {
    const sizes = [0, 1, 2, 3].map(channels => states.filter(state =>
      selected.readout.slice(0, channels).every((sign, index) => state.readout[index] === sign)
    ).length);
    assert.deepEqual(sizes, [8, 4, 2, 1]);
  }
});
