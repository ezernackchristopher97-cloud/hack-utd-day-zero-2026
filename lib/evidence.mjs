export function entropy(probabilities) {
  return -probabilities.reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0);
}

function update(hypotheses, outcome) {
  const weighted = hypotheses.map(hypothesis => hypothesis.prior * (outcome.likelihood[hypothesis.id] ?? 0));
  const total = weighted.reduce((sum, value) => sum + value, 0);
  return {
    total,
    probabilities: total > 0 ? weighted.map(value => value / total) : hypotheses.map(hypothesis => hypothesis.prior)
  };
}

export function readEvidence(scenario, probeId) {
  const hypotheses = scenario.hypotheses ?? [];
  const probes = scenario.probes ?? [];
  const priorBits = entropy(hypotheses.map(hypothesis => hypothesis.prior));
  const probe = probes.find(candidate => candidate.id === probeId);
  if (probeId && !probe) return null;

  const outcome = probe?.outcomes.find(candidate => candidate.id === probe.demoOutcome);
  const probabilities = outcome ? update(hypotheses, outcome).probabilities : hypotheses.map(hypothesis => hypothesis.prior);
  const bits = entropy(probabilities);
  const rankedProbes = probes.map(({ id, label, description, delay, cost, outcomes }) => {
    const expectedBits = outcomes.reduce((sum, result) => {
      const posterior = update(hypotheses, result);
      return sum + posterior.total * entropy(posterior.probabilities);
    }, 0);
    return {
      id, label, description, delay, cost,
      expectedGain: Math.max(0, priorBits - expectedBits),
      outcomes: outcomes.map(result => ({ id: result.id, label: result.label }))
    };
  }).sort((a, b) => b.expectedGain - a.expectedGain || a.delay - b.delay || a.cost - b.cost);

  // A reading only removes cases that have zero likelihood in the exercise model.
  const survivingCases = outcome ? new Set(hypotheses.flatMap((hypothesis, index) =>
    probabilities[index] > 0 ? hypothesis.caseIds ?? [] : []
  )) : null;
  const caseIds = survivingCases?.size ? scenario.cases.filter(item => survivingCases.has(item.id)).map(item => item.id) : undefined;
  const evidence = {
    bits,
    priorBits,
    hypotheses: hypotheses.map(({ id, label }, index) => ({ id, label, probability: probabilities[index] })),
    observation: outcome ? { id: outcome.id, label: outcome.label, probe: probe.label, delay: probe.delay, cost: probe.cost } : null
  };
  return { evidence, rankedProbes, caseIds, delay: probe?.delay ?? 0, cost: probe?.cost ?? 0 };
}
