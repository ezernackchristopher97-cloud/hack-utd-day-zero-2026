export function entropy(probabilities) {
  return -probabilities.reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0);
}

function scoreOutcome(scenario, hypotheses, { id, label, likelihood }) {
  const weighted = hypotheses.map(hypothesis => hypothesis.prior * (likelihood[hypothesis.id] ?? 0));
  const probability = weighted.reduce((sum, value) => sum + value, 0);
  if (probability === 0) return { id, label, probability, bits: null };

  const posterior = weighted.map(value => value / probability);
  // Keep every case supported by at least one still possible hypothesis.
  const survivingCases = new Set(hypotheses.flatMap((hypothesis, index) =>
    posterior[index] > 0 ? hypothesis.caseIds ?? [] : []
  ));
  const caseIds = scenario.cases.filter(item => survivingCases.has(item.id)).map(item => item.id);
  return { id, label, probability, bits: entropy(posterior), posterior, caseIds: caseIds.length ? caseIds : undefined };
}

export function readEvidence(scenario, probeId, outcomeId) {
  if (outcomeId != null && probeId == null) {
    return { status: 400, error: 'Choose a probe before choosing a reading.' };
  }
  const hypotheses = scenario.hypotheses ?? [];
  const probes = scenario.probes ?? [];
  const probe = probes.find(candidate => candidate.id === probeId);
  if (probeId != null && !probe) return { status: 404, error: 'Probe not found for this scenario.' };

  const prior = hypotheses.map(hypothesis => hypothesis.prior);
  const priorBits = entropy(prior);
  const rankedProbes = probes.map(({ id, label, description, delay, cost, outcomes }) => {
    const scored = outcomes.map(outcome => scoreOutcome(scenario, hypotheses, outcome));
    const expectedBits = scored.reduce((sum, outcome) => sum + outcome.probability * (outcome.bits ?? 0), 0);
    return {
      id, label, description, delay, cost,
      expectedGain: Math.max(0, priorBits - expectedBits),
      outcomes: scored
    };
  }).sort((a, b) => b.expectedGain - a.expectedGain || a.delay - b.delay || a.cost - b.cost);

  const selectedProbe = rankedProbes.find(candidate => candidate.id === probeId);
  const outcome = selectedProbe?.outcomes.find(candidate => candidate.id === (outcomeId ?? probe.demoOutcome));
  if (probe && !outcome) return { status: 404, error: 'Reading not found for this probe.' };
  if (outcome?.probability === 0) return { status: 422, error: 'This reading is impossible in the current model.' };

  const probabilities = outcome?.posterior ?? prior;
  const evidence = {
    bits: outcome?.bits ?? priorBits,
    priorBits,
    hypotheses: hypotheses.map(({ id, label }, index) => ({ id, label, probability: probabilities[index] })),
    observation: outcome ? {
      id: outcome.id,
      label: outcome.label,
      probe: probe.label,
      probeId: probe.id,
      delay: probe.delay,
      cost: probe.cost,
      probability: outcome.probability
    } : null
  };
  return { evidence, rankedProbes, caseIds: outcome?.caseIds, delay: probe?.delay ?? 0, cost: probe?.cost ?? 0 };
}
