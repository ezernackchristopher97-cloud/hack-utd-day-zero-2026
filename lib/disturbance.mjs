const config = Object.freeze({ baseline: 1, sampleInterval: 1, deadline: 5, window: 8, limit: 1.20 });
const pulseMenu = [0, 0.004, 0.008, 0.01, 0.016, 0.02, 0.024, 0.04, 0.08, 0.12];
const mechanisms = [
  { id: 'recover', label: 'Recovers', lambda: 0.22 },
  { id: 'hold', label: 'Holds displacement', lambda: 0 },
  { id: 'grow', label: 'Grows away', lambda: -0.12 }
];
const gauges = [
  { id: 'panel', label: 'Panel gauge', step: 0.02 },
  { id: 'precision', label: 'Fine gauge', step: 0.01 }
];

function runCandidate(amplitude, gauge) {
  const historySamples = 3;
  const sampleCount = config.window / config.sampleInterval + 1;
  const times = Array.from({ length: historySamples + sampleCount }, (_, i) => (i - historySamples) * config.sampleInterval);
  const samples = times.map(time => ({
    time,
    values: mechanisms.map(({ id, lambda }) => {
      const displacement = time < 0 ? 0 : amplitude * Math.exp(-lambda * time);
      const bin = Math.floor(displacement / gauge.step);
      return {
        id,
        value: config.baseline + displacement,
        reading: Number((config.baseline + bin * gauge.step).toFixed(2))
      };
    })
  }));
  // Each curve peaks at the start or end of the window.
  const peak = Math.max(...samples.flatMap(sample => sample.values.map(({ value }) => value)));
  const excess = Math.max(0, peak - config.limit);
  const gap = excess === 0 ? 0 : -Math.expm1(-excess / (config.limit - config.baseline));
  const safe = excess === 0;
  const firstDistinct = samples.find(({ values }) =>
    new Set(values.map(({ reading }) => reading)).size === mechanisms.length
  )?.time ?? null;
  const eligible = safe && firstDistinct !== null && firstDistinct <= config.deadline;
  let reason = 'eligible';
  if (!amplitude) reason = 'no-pulse';
  else if (!safe) reason = 'over-limit';
  else if (firstDistinct === null) reason = 'unresolved';
  else if (!eligible) reason = 'too-late';
  return { amplitude, gaugeId: gauge.id, safe, peak, excess, gap, firstDistinct, eligible, reason, samples };
}

export function disturbanceTest() {
  const candidates = gauges.flatMap(gauge => pulseMenu.map(amplitude => runCandidate(amplitude, gauge)));
  const recommended = candidates.filter(candidate => candidate.eligible)
    .reduce((best, candidate) => !best || candidate.amplitude < best.amplitude ? candidate : best, null);
  return {
    config,
    mechanisms: mechanisms.map(mechanism => ({ ...mechanism })),
    gauges: gauges.map(gauge => ({
      ...gauge,
      recommendedAmplitude: candidates.find(candidate => candidate.gaugeId === gauge.id && candidate.eligible)?.amplitude ?? null
    })),
    candidates,
    recommended: recommended ? { amplitude: recommended.amplitude, gaugeId: recommended.gaugeId } : null
  };
}
