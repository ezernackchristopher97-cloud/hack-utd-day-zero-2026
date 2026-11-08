const amplitude = 0.6;
const memoryCoupling = 0.2;
const memoryDecay = 0.3;

export function phaseCheck() {
  const probability = (1 + amplitude) / 2;
  // The two phase values give the same entropy.
  const entropy = -3 * (probability * Math.log(probability) + (1 - probability) * Math.log(1 - probability));
  const memory = memoryCoupling * entropy / memoryDecay;
  const states = Array.from({ length: 8 }, (_, index) => {
    const id = index.toString(2).padStart(3, '0');
    const phase = Array.from(id, Number);
    const readout = phase.map(bit => bit === 0 ? 1 : -1);
    return { id, phase, readout, entropy, memory };
  });
  return { states, entropy, memory };
}
