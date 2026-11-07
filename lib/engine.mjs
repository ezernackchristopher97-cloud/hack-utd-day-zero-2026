const NO_ACTION = "none";

function levelDifference(level, boundary) {
  const difference = level - boundary;
  const tolerance = Math.max(1, Math.abs(level), Math.abs(boundary)) * 1e-12;
  return Math.abs(difference) <= tolerance ? 0 : difference;
}

function selectedActions(scenario, actionIds) {
  const actions = actionIds.map((id) => {
    const action = scenario.actions.find((item) => item.id === id);
    if (!action) throw new RangeError(`Unknown action: ${id}`);
    return action;
  });

  if (new Set(actionIds).size !== actionIds.length) {
    throw new RangeError("An action can only be selected once.");
  }

  const groups = actions.map(({ group }) => group).filter(Boolean);
  if (new Set(groups).size !== groups.length) {
    throw new RangeError("Selected actions cannot run together.");
  }
  return actions;
}

function rateCase(scenario, caseId) {
  const item = scenario.cases.find(({ id }) => id === caseId);
  if (item) return item;
  if (caseId === "nominal") return { id: "nominal", label: "Nominal", delta: 0 };
  throw new RangeError(`Unknown forecast case: ${caseId}`);
}

function findImpacts(scenario, trace) {
  const atById = new Map();
  const pending = [];

  function mark(id, at) {
    if (at > scenario.horizon || at >= (atById.get(id) ?? Infinity)) return;
    atById.set(id, at);
    pending.push({ id, at });
  }

  for (const node of scenario.nodes) {
    if (Number.isInteger(node.at) && node.at >= 0) mark(node.id, node.at);
    if (Number.isFinite(node.threshold)) {
      const at = trace.find(({ level, before }) =>
        levelDifference(Math.max(level, before ?? level), node.threshold) >= 0)?.minute;
      if (at !== undefined) mark(node.id, at);
    }
  }

  for (const { id, at } of pending) {
    for (const edge of scenario.edges) {
      if (edge.from === id && Number.isInteger(edge.delay) && edge.delay >= 0) {
        mark(edge.to, at + edge.delay);
      }
    }
  }

  return [...atById.entries()]
    .map(([id, at]) => ({ id, at }))
    .sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
}

export function simulate(scenario, actionIds = [], caseId = "nominal") {
  const actions = selectedActions(scenario, actionIds);
  const { delta } = rateCase(scenario, caseId);
  const { horizon, initial, limit, capacity } = scenario;
  const schedule = actions.map((action) => ({
    ...action,
    end: Math.min(horizon, action.delay + (action.duration ?? horizon)),
  }));
  const effects = schedule.flatMap((action) => {
    if (!action.effects) return [action];
    return action.effects.map((effect) => {
      const delay = action.delay + effect.delay;
      return { ...effect, delay, end: Math.min(horizon, delay + (effect.duration ?? horizon)) };
    });
  });
  const quantities = new Map();
  for (const { delay, quantity } of effects) {
    if (quantity) quantities.set(delay, (quantities.get(delay) ?? 0) + quantity);
  }

  const trace = [];
  let level = initial;
  let peak = initial;
  let firstLimit = null;
  let firstOverflow = null;
  let cost = schedule.reduce((total, action) => total + action.cost, 0);

  function sample(minute) {
    const before = level;
    level = Math.max(0, level + (quantities.get(minute) ?? 0));
    const high = Math.max(before, level);
    trace.push(before === level ? { minute, level } : { minute, level, before });
    peak = Math.max(peak, high);
    if (firstLimit === null && levelDifference(high, limit) >= 0) firstLimit = minute;
    if (firstOverflow === null && levelDifference(high, capacity) > 0) firstOverflow = minute;
  }

  sample(0);
  for (let minute = 0; minute < horizon; minute += 1) {
    let rate = scenario.rate + delta;
    for (const effect of effects) {
      if (minute >= effect.delay && minute < effect.end) rate += effect.delta ?? 0;
    }
    for (const action of schedule) {
      if (minute >= action.delay && minute < action.end) cost += action.costPerMinute ?? 0;
    }

    level = Math.max(0, level + rate);
    sample(minute + 1);
  }

  return {
    trace,
    firstLimit,
    firstOverflow,
    peak,
    final: level,
    cost,
    impacts: findImpacts(scenario, trace),
  };
}

function evaluate(scenario, actions, caseIds, representativeIndex) {
  const actionIds = actions.map(({ id }) => id);
  const runs = caseIds.map((id) => simulate(scenario, actionIds, id));
  const nominal = runs[representativeIndex];
  const band = nominal.trace.map(({ minute }) => {
    const levels = runs.flatMap(({ trace }) => {
      const { level, before = level } = trace[minute];
      return [level, before];
    });
    return { minute, min: Math.min(...levels), max: Math.max(...levels) };
  });
  const crossings = runs.flatMap(({ firstLimit }) => firstLimit === null ? [] : [firstLimit]);
  const worstPeak = Math.max(...runs.map(({ peak }) => peak));
  const cost = Math.max(...runs.map((run) => run.cost));
  const safe = crossings.length === 0;
  const subject = runs.length === 1 ? "The tested case stays" : `All ${runs.length} tested cases stay`;
  const crossingsLabel = crossings.length === 1 ? "reaches" : "reach";
  const reason = safe ? `${subject} below the protective limit through minute ${scenario.horizon}.` :
    `${crossings.length} of ${runs.length} tested cases ${crossingsLabel} the protective limit as early as minute ${Math.min(...crossings)}.`;

  return {
    id: actionIds.join("+") || NO_ACTION,
    label: actions.map(({ label }) => label).join(" + ") || "No action",
    actionIds,
    nominal,
    band,
    earliest: safe ? null : Math.min(...crossings),
    latest: safe ? null : Math.max(...crossings),
    worstPeak,
    cost,
    safe,
    reason,
    caseCount: runs.length,
    limitCases: crossings.length,
    overflowCases: runs.filter(({ firstOverflow }) => firstOverflow !== null).length,
    margin: levelDifference(scenario.limit, worstPeak),
  };
}

function compareOptions(left, right) {
  if (left.safe !== right.safe) return left.safe ? -1 : 1;
  if (!left.safe) {
    const byRisk = left.overflowCases - right.overflowCases ||
      left.limitCases - right.limitCases ||
      right.earliest - left.earliest ||
      left.worstPeak - right.worstPeak;
    if (byRisk) return byRisk;
  }
  return left.cost - right.cost ||
    left.actionIds.length - right.actionIds.length ||
    left.id.localeCompare(right.id);
}

export function analyze(scenario, caseIds) {
  const activeCaseIds = [...new Set(caseIds ?? scenario.cases.map(({ id }) => id))];
  if (activeCaseIds.length === 0) activeCaseIds.push("nominal");
  const activeCases = activeCaseIds.map((id) => rateCase(scenario, id));
  const nominalIndex = activeCaseIds.indexOf("nominal");
  const representativeIndex = nominalIndex >= 0 ? nominalIndex : activeCases.reduce(
    (best, item, index) => (item.weight ?? 0) > (activeCases[best].weight ?? 0) ? index : best,
    0,
  );

  const candidates = [[]];
  for (const [index, action] of scenario.actions.entries()) {
    candidates.push([action]);
    for (const other of scenario.actions.slice(index + 1)) {
      if (action.group && action.group === other.group) continue;
      candidates.push([action, other]);
    }
  }

  const options = candidates.map((actions) => evaluate(scenario, actions, activeCaseIds, representativeIndex));
  const baseline = options[0];
  options.sort(compareOptions);
  return {
    scenario,
    baseline,
    options,
    representativeCase: activeCaseIds[representativeIndex],
    recommendedId: options.find(({ safe }) => safe)?.id ?? null,
  };
}
