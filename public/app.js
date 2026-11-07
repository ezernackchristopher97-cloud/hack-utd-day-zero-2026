const byId = id => document.getElementById(id);
const state = {
  data: null,
  minute: 0,
  timer: null,
  selected: null,
  staged: null,
  applied: null,
  probe: null,
  receipt: null,
  expanded: false,
  busy: false,
  handoffVersion: 0,
};
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const svgNS = "http://www.w3.org/2000/svg";
const featuredOptions = 3;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function svgElement(tag, attributes, content) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

function text(id, value) {
  byId(id).textContent = value;
}

function option(id) {
  return state.data?.options.find(candidate => candidate.id === id);
}

function time(minute) {
  return `T+${String(minute).padStart(2, "0")}`;
}

function value(level) {
  return `${decimal.format(level)} ${state.data.scenario.unit}`;
}

function cost(amount) {
  return Number.isFinite(amount) ? usd.format(amount) : "—";
}

function point(trace, minute) {
  return trace[Math.min(minute, trace.length - 1)];
}

function stateName() {
  if (state.staged) return "Staged";
  if (state.applied) return "Applied";
  return "Preview";
}

function scenarioPath(id = state.data.scenario.id) {
  return `./api/scenarios/${encodeURIComponent(id)}`;
}

async function json(url, init) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Request failed (${response.status}).`);
  }
  return response.json();
}

function activeForecast() {
  return option(state.applied) || state.data.baseline;
}

function resetHandoff() {
  state.handoffVersion += 1;
  byId("handoff-text").hidden = true;
  byId("handoff-copy").hidden = true;
  byId("handoff-generate").disabled = false;
  byId("handoff-text").value = "";
  text("copy-status", "");
}

function stopPlayback() {
  clearInterval(state.timer);
  state.timer = null;
  text("play-icon", "▶");
  text("play-label", "Play");
}

function goTo(minute) {
  if (!state.data) return;
  state.minute = Math.max(0, Math.min(minute, state.data.scenario.horizon));
  renderTime();
}

function togglePlayback() {
  if (state.timer) {
    stopPlayback();
    return;
  }
  if (state.minute === state.data.scenario.horizon) goTo(0);
  text("play-icon", "Ⅱ");
  text("play-label", "Pause");
  state.timer = setInterval(() => {
    goTo(state.minute + 1);
    if (state.minute === state.data.scenario.horizon) stopPlayback();
  }, 290);
}

function deadlineText(forecast) {
  if (forecast.earliest == null) return "Within limit";
  if (state.minute >= forecast.earliest) return `At ${time(forecast.earliest)}`;
  return `${forecast.earliest - state.minute} min`;
}

function deadlineDetail(forecast) {
  const { earliest, latest, limitCases, caseCount } = forecast;
  if (earliest == null) return `Through ${time(state.data.scenario.horizon)} in tested conditions`;
  const window = latest != null && latest !== earliest ? `${time(earliest)} to ${time(latest)}` : time(earliest);
  return caseCount && Number.isFinite(limitCases) ? `${window} · ${limitCases}/${caseCount} conditions cross` : `${window} · tested conditions`;
}

function renderTime() {
  const { scenario, baseline, evidence } = state.data;
  const active = activeForecast();
  const observed = point(active.nominal.trace, state.minute);
  const timeline = byId("timeline");
  timeline.value = state.minute;
  timeline.setAttribute("aria-valuetext", `${state.minute} minutes elapsed`);
  text("elapsed", `${time(state.minute)} min`);
  text("deadline", deadlineText(active));
  byId("deadline").classList.toggle("amber", active.earliest != null);
  text("deadline-detail", deadlineDetail(active));
  text("current-value", value(observed.level));
  text("current-detail", `${scenario.levelLabel || "Simulated reading"} · ${state.applied ? "applied response" : "no action"}`);
  text("condition-count", String(active.caseCount ?? scenario.cases.length));
  text("condition-detail", evidence?.hypotheses.length ? `${decimal.format(evidence.bits)} bits of uncertainty` : "Tested conditions");
  text("response-state", stateName());
  text("response-detail", state.staged ? option(state.staged).label : state.applied ? option(state.applied).label : "No response applied");
  renderChart(baseline, option(state.selected));
  renderDependencies(active, observed);
}

function makePath(points, x, y, key) {
  return points.map((sample, index) => {
    const first = index ? "L" : "M";
    const at = x(sample.minute);
    if (key === "level" && sample.before != null) {
      return `${first}${at},${y(sample.before)} L${at},${y(sample.level)}`;
    }
    return `${first}${at},${y(sample[key])}`;
  }).join(" ");
}

function renderChart(baseline, selected) {
  const { horizon, limit, limitLabel } = state.data.scenario;
  const group = byId("chart-drawing");
  const drawing = document.createDocumentFragment();
  const left = 58;
  const right = 654;
  const top = 21;
  const bottom = 226;
  const x = minute => left + (right - left) * minute / horizon;
  const traces = [baseline.nominal.trace, selected?.nominal.trace || []];
  const bands = [baseline.band || [], selected?.band || []];
  const extremes = [
    limit,
    ...traces.flatMap(trace => trace.flatMap(sample => [sample.level, sample.before ?? sample.level])),
    ...bands.flatMap(band => band.flatMap(sample => [sample.min, sample.max])),
  ];
  const minimum = Math.min(...extremes);
  const maximum = Math.max(...extremes);
  const span = Math.max(1, maximum - minimum);
  const min = Math.max(0, minimum - 0.12 * span);
  const max = maximum + 0.14 * span;
  const y = level => bottom - (bottom - top) * (level - min) / (max - min);
  const draw = (tag, attributes, content) => drawing.append(svgElement(tag, attributes, content));
  const line = (x1, y1, x2, y2, style) => draw("line", { x1, y1, x2, y2, class: style, "vector-effect": "non-scaling-stroke" });
  const label = (x, y, content, anchor = "middle", style = "") => draw("text", { x, y, class: `axis-label ${style}`, "text-anchor": anchor }, content);

  for (let index = 0; index <= 4; index += 1) {
    const level = min + (max - min) * index / 4;
    const at = y(level);
    line(left, at, right, at, "grid");
    label(left - 8, at + 4, decimal.format(level), "end");
  }
  const ticks = [...new Set([0, Math.round(horizon / 4), Math.round(horizon / 2), Math.round(3 * horizon / 4), horizon])];
  for (const tick of ticks) {
    line(x(tick), top, x(tick), bottom, "grid");
    label(x(tick), bottom + 24, tick);
  }
  label((left + right) / 2, bottom + 42, "Elapsed minutes");

  bands.forEach((band, index) => {
    if (band.length < 2) return;
    const lower = makePath(band, x, y, "min");
    const upper = makePath([...band].reverse(), x, y, "max").replace(/^M/, "L");
    draw("path", { d: `${lower} ${upper} Z`, class: index ? "plan-band" : "baseline-band" });
  });
  line(left, y(limit), right, y(limit), "trace limit-line");
  if (baseline.earliest != null) {
    const deadline = x(baseline.earliest);
    line(deadline, top, deadline, bottom, "deadline-line");
    label(Math.min(right - 5, deadline + 5), top - 4, time(baseline.earliest), deadline > right - 60 ? "end" : "start", "tick-emphasis");
  }

  const delays = new Set(selectedActions().flatMap(action =>
    action.effects ? action.effects.map(effect => action.delay + effect.delay) : [action.delay]
  ));
  for (const delay of delays) {
    if (delay >= 0 && delay <= horizon) line(x(delay), top, x(delay), bottom, "event-line");
  }

  traces.forEach((trace, index) => {
    if (!trace.length) return;
    draw("path", {
      d: makePath(trace, x, y, "level"),
      class: `trace ${index ? "plan-line" : "baseline-line"}`,
      "vector-effect": "non-scaling-stroke",
    });
  });
  line(x(state.minute), top, x(state.minute), bottom, "playhead");
  traces.forEach((trace, index) => {
    if (!trace.length) return;
    const sample = point(trace, state.minute);
    draw("circle", { cx: x(sample.minute), cy: y(sample.level), r: 4, class: index ? "plan-dot" : "baseline-dot" });
  });

  group.replaceChildren(drawing);
  byId("band-key").hidden = !bands.some(band => band.some(sample => sample.min < sample.max));
  byId("action-key").hidden = delays.size === 0;
  const limitText = `${limitLabel || "Operating limit"} ${value(limit)}.`;
  const first = baseline.earliest == null ? "No action stays within the limit under the tested conditions." : `Without action, the earliest limit crossing is ${time(baseline.earliest)}.`;
  text("chart-description", `${first} ${limitText} ${selected ? planRisk(selected) : ""}`);
  text("chart-caption", `${limitText} ${first}`);
  text("chart-mode", state.applied ? "RESPONSE REPLAY" : state.staged ? "RESPONSE STAGED" : "PLAN PREVIEW");
  text("plan-key", selected?.label || "Selected response");
}

function renderDependencies(active, observed) {
  const { scenario } = state.data;
  const nodes = new Map(scenario.nodes.map(asset => [asset.id, asset.label]));
  const impacts = new Map(active.nominal.impacts.map(impact => [impact.id, impact.at]));
  const assets = scenario.nodes.map(asset => {
    const hit = impacts.has(asset.id) && state.minute >= impacts.get(asset.id);
    const atRisk = impacts.has(asset.id) && !hit;
    const initialAlarm = asset.at === 0;
    const label = initialAlarm ? "Reported at start" : hit ? "Impact reached" : atRisk ? `Forecast ${time(impacts.get(asset.id))}` : "Clear in replay";
    const reading = asset.threshold != null
      ? hit ? `At ${time(impacts.get(asset.id))}` : `Limit ${value(asset.threshold)}`
      : asset.role;
    const row = element("li");
    row.append(element("strong", "asset-name", asset.label), element("span", "asset-value", reading));
    const status = element("span", "asset-status", label);
    status.dataset.tone = hit ? "fault" : atRisk ? "watch" : "clear";
    row.append(status);
    return row;
  });
  byId("dependencies").replaceChildren(...assets);
  text("network-description", `${time(state.minute)} · ${value(observed.level)} · ${state.applied ? "applied response" : "no action"}`);
  const connections = scenario.edges.map(edge => {
    const route = `${nodes.get(edge.from) || edge.from} → ${nodes.get(edge.to) || edge.to}`;
    return edge.delay > 0 ? `${route} (+${edge.delay} min)` : route;
  });
  text("dependency-paths", connections.join(" · "));
}

function planRisk(plan) {
  if (plan.safe) {
    return plan.margin > 0 ? `Within limit · ${value(plan.margin)} of headroom` : "Within limit in all tested conditions";
  }
  if (plan.earliest != null) return `Earliest limit at ${time(plan.earliest)}`;
  return plan.reason || "Review tested conditions";
}

function selectedActions() {
  const selected = option(state.selected);
  return selected?.actionIds
    .map(id => state.data.scenario.actions.find(action => action.id === id))
    .filter(Boolean)
    .sort((first, second) => first.delay - second.delay) || [];
}

function renderDecisionButtons() {
  const selected = option(state.selected);
  const unavailable = state.busy || !selected || selected.actionIds.length === 0;
  byId("stage").disabled = unavailable;
  byId("stage").hidden = Boolean(state.staged || state.applied);
  byId("apply").disabled = state.busy;
  byId("apply").hidden = !state.staged;
  byId("unstage").disabled = state.busy;
  byId("unstage").hidden = !state.staged;
  byId("clear-response").hidden = !state.applied;
  byId("clear-response").disabled = state.busy;
  byId("scenario").disabled = state.busy;
  for (const id of ["play", "timeline", "reset"]) byId(id).disabled = state.busy || !state.data;
}

function renderPlans(focusId) {
  const { options, recommendedId } = state.data;
  const selected = option(state.selected);
  const shown = state.expanded ? options : options.slice(0, featuredOptions);
  const rows = shown.map((plan, index) => {
    const button = element("button", "plan-option");
    button.type = "button";
    button.dataset.plan = plan.id;
    button.disabled = state.busy || Boolean(state.applied);
    button.setAttribute("aria-pressed", String(plan.id === selected?.id));
    button.append(
      element("span", "plan-rank", String(index + 1).padStart(2, "0")),
      element("span", "plan-title", plan.label),
      element("span", "plan-price", cost(plan.cost)),
      element("span", "plan-summary", `${plan.id === recommendedId ? "Recommended · " : ""}${planRisk(plan)}`),
    );
    button.addEventListener("click", () => {
      state.selected = plan.id;
      state.staged = null;
      resetHandoff();
      text("decision-note", "");
      renderPlans(plan.id);
      renderTenants();
      renderTime();
    });
    return button;
  });
  byId("plans").replaceChildren(...rows);
  if (focusId) rows.find(button => button.dataset.plan === focusId)?.focus();
  const toggle = byId("plan-toggle");
  toggle.hidden = options.length <= featuredOptions || Boolean(state.applied);
  toggle.setAttribute("aria-expanded", String(state.expanded));
  toggle.textContent = state.expanded ? "Show top options" : `Show all ${options.length} options`;
  text("plan-count", `${options.filter(plan => plan.safe).length} WITHIN LIMIT`);
  text("plan-intro", recommendedId ? "Compare modeled cost and the earliest limit before you stage a response." : "Every tested response reaches the limit in at least one condition.");
  byId("actions").replaceChildren(...selectedActions().map(action => {
    const row = element("li");
    const details = element("span", "", action.label);
    if (action.description) details.append(element("small", "action-description", action.description));
    row.append(element("span", "action-time", time(action.delay)), details);
    return row;
  }));
  renderDecisionButtons();
}

function renderTenants() {
  const exposure = state.data.tenantExposure;
  byId("tenant-panel").hidden = !exposure;
  if (!exposure) return;
  const chosen = exposure.options?.[state.selected] || exposure.baseline;
  const byTenant = new Map(chosen.map(entry => [entry.id, entry]));
  function estimate(entry) {
    if (!entry || !entry.minutes) return "Clear through replay";
    return `${entry.minutes} min · ${cost(entry.loss)}`;
  }
  const rows = exposure.baseline.map(entry => {
    const row = element("tr");
    const name = element("td", "", entry.label);
    if (entry.commitment) name.append(element("small", "", entry.commitment));
    row.append(name, element("td", "", estimate(entry)), element("td", "", estimate(byTenant.get(entry.id))));
    return row;
  });
  byId("tenant-rows").replaceChildren(...rows);
}

function renderEvidence() {
  const { scenario, evidence } = state.data;
  byId("evidence-panel").hidden = !(evidence?.hypotheses?.length || scenario.observations?.length);
  if (byId("evidence-panel").hidden) return;
  text("evidence-bits", evidence?.hypotheses.length ? `${decimal.format(evidence.bits)} BITS UNCERTAINTY` : "OBSERVATIONS");
  byId("observations").replaceChildren(...(scenario.observations || []).map(observation => {
    const item = element("li", "", `${observation.label} · `);
    item.append(element("strong", "", observation.value));
    return item;
  }));
  byId("hypotheses").replaceChildren(...(evidence?.hypotheses || []).map(hypothesis => {
    const item = element("li", "", `${hypothesis.label} · `);
    item.append(element("strong", "", `${decimal.format(hypothesis.probability * 100)}%`));
    return item;
  }));
  const buttons = (scenario.probes || []).map(probe => {
    const button = element("button", "button secondary probe", probe.label);
    button.type = "button";
    button.disabled = state.busy || Boolean(state.probe || state.applied || state.staged);
    button.append(element("small", "", `${probe.delay} min · ${cost(probe.cost)} · ${decimal.format(probe.expectedGain)} bits expected`));
    if (probe.description) button.title = probe.description;
    button.addEventListener("click", async () => {
      await loadScenario(scenario.id, probe.id);
      byId("evidence-title").focus();
    });
    return button;
  });
  if (state.probe) {
    const clear = element("button", "button secondary", "Reset evidence");
    clear.type = "button";
    clear.disabled = state.busy;
    clear.addEventListener("click", async () => {
      await loadScenario(scenario.id);
      byId("evidence-title").focus();
    });
    buttons.push(clear);
  }
  byId("probes").replaceChildren(...buttons);
  const observation = evidence?.observation;
  text("probe-result", observation ? `Reading: ${typeof observation === "string" ? observation : observation.label || observation.outcomeLabel || observation.outcome || observation.id}. Response times now include the field check.` : "");
}

function renderScenario() {
  const { scenario } = state.data;
  text("incident-title", scenario.name);
  text("incident-description", scenario.description);
  text("incident-number", scenario.eog?.facilityId || scenario.id.toUpperCase());
  byId("scenario-next-step").hidden = !scenario.eog?.nextStep;
  text("scenario-next-step", scenario.eog?.nextStep ? `Next step: ${scenario.eog.nextStep}` : "");
  text("scenario-source", scenario.eog
    ? "Source: EOG challenge telemetry. The replay uses the supplied exercise records."
    : scenario.source || "Source: synthetic exercise data.");
  byId("timeline").max = scenario.horizon;
  for (const id of ["scenario", "play", "timeline", "reset", "handoff-generate"]) byId(id).disabled = false;
  text("decision-note", "");
  text("receipt", "");
  renderPlans();
  renderTenants();
  renderEvidence();
  renderTime();
}

async function loadScenario(id, probe = null) {
  if (state.busy) return;
  stopPlayback();
  state.busy = true;
  renderDecisionButtons();
  if (state.data) {
    renderPlans();
    renderEvidence();
  }
  byId("load-error").hidden = true;
  try {
    const query = probe ? `?${new URLSearchParams({ probe })}` : "";
    state.data = await json(`${scenarioPath(id)}${query}`);
    state.minute = 0;
    state.selected = state.data.recommendedId || state.data.options[0]?.id;
    state.staged = null;
    state.applied = null;
    state.probe = probe;
    state.receipt = null;
    state.expanded = false;
    state.busy = false;
    byId("scenario").value = id;
    resetHandoff();
    renderScenario();
  } catch (error) {
    state.busy = false;
    byId("load-error").hidden = false;
    text("load-error", `Could not load the incident. ${error.message}`);
    if (state.data) {
      byId("scenario").value = state.data.scenario.id;
      renderPlans();
      renderEvidence();
    } else {
      byId("scenario").disabled = false;
    }
  }
}

function stageResponse() {
  stopPlayback();
  state.staged = state.selected;
  resetHandoff();
  text("decision-note", "Staged for simulation. Apply to record the response and replay it from T+00.");
  renderDecisionButtons();
  renderEvidence();
  renderTime();
  byId("apply").focus();
}

async function applyResponse() {
  stopPlayback();
  const plan = state.staged;
  if (!plan || state.busy) return;
  state.busy = true;
  renderPlans();
  renderEvidence();
  text("decision-note", "Recording the response…");
  try {
    state.receipt = await json(`${scenarioPath()}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, minute: state.minute, probe: state.probe }),
    });
    state.applied = plan;
    state.staged = null;
    resetHandoff();
    text("receipt", `Dispatch receipt ${state.receipt.id}`);
    text("decision-note", "Response applied to the simulation. The replay starts at T+00.");
    goTo(0);
  } catch (error) {
    text("decision-note", `Response is still staged. ${error.message} You can retry.`);
  } finally {
    state.busy = false;
    renderPlans();
    renderEvidence();
    renderTime();
    byId(state.applied ? "play" : "apply").focus();
  }
}

function unstageResponse() {
  state.staged = null;
  resetHandoff();
  text("decision-note", "");
  renderDecisionButtons();
  renderEvidence();
  renderTime();
  byId("stage").focus();
}

function clearResponse() {
  stopPlayback();
  state.applied = null;
  state.receipt = null;
  resetHandoff();
  text("decision-note", "");
  text("receipt", "");
  goTo(0);
  renderPlans();
  renderEvidence();
  byId("stage").focus();
}

async function generateHandoff() {
  const version = ++state.handoffVersion;
  const minute = state.minute;
  const selected = option(state.selected);
  const applied = state.applied;
  const query = new URLSearchParams({ plan: applied || state.selected || "none", minute });
  if (state.probe) query.set("probe", state.probe);
  byId("handoff-generate").disabled = true;
  try {
    const note = await json(`${scenarioPath()}/handoff?${query}`);
    if (version !== state.handoffVersion) return;
    const header = applied ? `Applied in simulation · dispatch ${state.receipt.id}` : `${state.staged ? "Staged" : "Preview"} · ${selected?.label || "No action"} · awaiting application`;
    byId("handoff-text").value = `${header}\n\n${note.text}`;
    byId("handoff-text").hidden = false;
    byId("handoff-copy").hidden = false;
    text("copy-status", "Handoff ready.");
  } catch (error) {
    if (version !== state.handoffVersion) return;
    text("copy-status", `Could not generate the handoff. ${error.message}`);
    byId("handoff-text").value = `Could not generate the handoff. ${error.message}`;
    byId("handoff-text").hidden = false;
    byId("handoff-copy").hidden = true;
  } finally {
    if (version === state.handoffVersion) byId("handoff-generate").disabled = false;
  }
}

async function copyHandoff() {
  const note = byId("handoff-text");
  try {
    await navigator.clipboard.writeText(note.value);
    text("copy-status", "Handoff copied.");
    text("handoff-copy", "Copied");
    setTimeout(() => text("handoff-copy", "Copy note"), 1700);
  } catch {
    note.focus();
    note.select();
    text("copy-status", "Note selected. Use your keyboard to copy it.");
  }
}

async function initialize() {
  try {
    const { scenarios } = await json("./api/scenarios");
    if (!scenarios.length) throw new Error("No scenarios are available.");
    const choices = scenarios.map(scenario => new Option(scenario.name, scenario.id));
    byId("scenario").replaceChildren(...choices);
    await loadScenario(scenarios[0].id);
  } catch (error) {
    byId("load-error").hidden = false;
    text("load-error", `Could not start Avon Relay. ${error.message}`);
  }
}

byId("scenario").addEventListener("change", event => loadScenario(event.target.value));
byId("play").addEventListener("click", togglePlayback);
byId("timeline").addEventListener("input", event => {
  stopPlayback();
  goTo(Number(event.target.value));
});
byId("reset").addEventListener("click", () => {
  stopPlayback();
  goTo(0);
});
byId("plan-toggle").addEventListener("click", () => {
  state.expanded = !state.expanded;
  if (!state.expanded && state.data.options.indexOf(option(state.selected)) >= featuredOptions) {
    state.selected = state.data.options[0].id;
    state.staged = null;
    resetHandoff();
    text("decision-note", "");
    renderTenants();
    renderTime();
  }
  renderPlans();
  renderEvidence();
});
byId("stage").addEventListener("click", stageResponse);
byId("apply").addEventListener("click", applyResponse);
byId("unstage").addEventListener("click", unstageResponse);
byId("clear-response").addEventListener("click", clearResponse);
byId("handoff-generate").addEventListener("click", generateHandoff);
byId("handoff-copy").addEventListener("click", copyHandoff);

initialize();
