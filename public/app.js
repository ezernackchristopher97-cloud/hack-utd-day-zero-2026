const byId = id => document.getElementById(id);
const state = {
  data: null,
  minute: 0,
  position: 0,
  timer: null,
  chart: null,
  selected: null,
  staged: null,
  applied: null,
  probe: null,
  outcome: null,
  receipt: null,
  expanded: false,
  busy: false,
  handoffVersion: 0,
};
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const bits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const svgNS = "http://www.w3.org/2000/svg";
const featuredOptions = 3;
const driveCheck = "local-trip-contact";
const contactButtons = [
  ["briefing-contact-latched", "tripped"],
  ["briefing-contact-clear", "clear"],
  ["forecast-contact-latched", "tripped"],
  ["forecast-contact-clear", "clear"],
];
let retryLoad;

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
  return Number.isFinite(amount) ? usd.format(amount) : "Unavailable";
}

function point(trace, minute) {
  return trace[Math.min(minute, trace.length - 1)];
}

function readingAt(trace, position) {
  const minute = Math.floor(position);
  const sample = point(trace, minute);
  const next = point(trace, minute + 1);
  return sample.level + ((next.before ?? next.level) - sample.level) * (position - minute);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { cache: "no-store", ...init, signal: controller.signal });
    if (response.ok) return await response.json();
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Request failed (${response.status}).`);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The local server took too long to answer. Check Terminal and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  if (state.timer !== null) cancelAnimationFrame(state.timer);
  state.timer = null;
  document.body.classList.remove("is-playing");
  text("play-icon", "▶");
  text("play-label", "Play");
}

function goTo(minute) {
  if (!state.data) return;
  state.minute = Math.max(0, Math.min(minute, state.data.scenario.horizon));
  state.position = state.minute;
  renderTime();
}

function startPlayback() {
  if (state.busy || !state.data || state.timer !== null) return;
  const { horizon } = state.data.scenario;
  if (state.position >= horizon) goTo(0);
  document.body.classList.add("is-playing");
  text("play-icon", "Ⅱ");
  text("play-label", "Pause");
  let previous;
  const millisecondsPerMinute = Math.min(320, 18000 / horizon);
  const advance = now => {
    if (previous != null) {
      state.position = Math.min(horizon, state.position + (now - previous) / millisecondsPerMinute);
      const minute = Math.floor(state.position);
      if (minute !== state.minute) {
        state.minute = minute;
        renderTime();
      } else {
        renderMotion();
      }
    }
    previous = now;
    if (state.position >= horizon) stopPlayback();
    else state.timer = requestAnimationFrame(advance);
  };
  state.timer = requestAnimationFrame(advance);
}

function togglePlayback() {
  if (state.timer !== null) stopPlayback();
  else startPlayback();
}

function playFromStart() {
  stopPlayback();
  goTo(0);
  byId("play").focus({ preventScroll: true });
  byId("forecast").scrollIntoView({ block: "start" });
  startPlayback();
}

async function playReading(scenarioId, probeId, outcomeId) {
  if (state.busy) return;
  const current = state.data?.scenario.id === scenarioId && state.probe === probeId && state.outcome === outcomeId;
  if (current || await loadScenario(scenarioId, probeId, outcomeId)) playFromStart();
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

function crossingWindow({ earliest, latest }) {
  if (earliest == null) return "Within limit through replay";
  return earliest === latest || latest == null ? time(earliest) : `${time(earliest)} to ${time(latest)}`;
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
  text("condition-detail", evidence?.hypotheses.length ? `${bits.format(evidence.bits)} bits of uncertainty` : "Tested conditions");
  text("response-state", stateName());
  text("response-detail", state.staged ? option(state.staged).label : state.applied ? option(state.applied).label : "No response applied");
  renderChart(baseline, option(state.selected));
  renderDependencies(active, observed);
  for (const step of byId("actions").children) {
    step.dataset.phase = state.minute < Number(step.dataset.start) ? "waiting" :
      state.minute >= Number(step.dataset.end) ? "done" : "active";
  }
  const currentActions = selectedActions().filter(action => action.delay <= state.minute);
  const lastAction = currentActions.at(-1);
  const reading = evidence.observation;
  let message = "Watch the readings change with and without a response.";
  if (reading && state.minute < reading.delay) message = `Field reading due at ${time(reading.delay)}.`;
  else if (lastAction) message = `${time(lastAction.delay)} · ${lastAction.label}${state.applied ? " in the simulation" : " in the response forecast"}.`;
  else if (reading) message = `${time(reading.delay)} · ${reading.label}.`;
  if (state.minute === scenario.horizon) message = `Replay complete at ${time(scenario.horizon)}. ${message}`;
  if (byId("replay-message").textContent !== message) text("replay-message", message);
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
  label((left + right) / 2, bottom + 35, "Elapsed minutes");

  if (baseline.earliest != null && baseline.latest > baseline.earliest) {
    draw("rect", {
      x: x(baseline.earliest), y: top, width: x(baseline.latest) - x(baseline.earliest),
      height: bottom - top, class: "deadline-window",
    });
  }

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
  const reading = state.data.evidence?.observation;
  if (reading?.delay > 0 && reading.delay <= horizon) {
    line(x(reading.delay), top, x(reading.delay), bottom, "probe-line");
  }

  const clip = svgElement("rect", { x: left, y: top, width: 0, height: bottom - top });
  const clipPath = svgElement("clipPath", { id: "played-trace" });
  clipPath.append(clip);
  drawing.append(clipPath);
  const played = svgElement("g", { "clip-path": "url(#played-trace)" });
  traces.forEach((trace, index) => {
    if (!trace.length) return;
    const attributes = {
      d: makePath(trace, x, y, "level"),
      class: `trace ${index ? "plan-line" : "baseline-line"}`,
      "vector-effect": "non-scaling-stroke",
    };
    draw("path", { ...attributes, class: `${attributes.class} future-trace` });
    played.append(svgElement("path", attributes));
  });
  drawing.append(played);
  const playhead = svgElement("line", { y1: top, y2: bottom, class: "playhead", "vector-effect": "non-scaling-stroke" });
  drawing.append(playhead);
  const dots = traces.map((trace, index) => trace.length ? svgElement("circle", {
    r: 4.5, class: `playhead-dot ${index ? "plan-dot" : "baseline-dot"}`,
  }) : null);
  drawing.append(...dots.filter(Boolean));

  group.replaceChildren(drawing);
  state.chart = { x, y, left, traces, clip, playhead, dots };
  renderMotion();
  byId("band-key").hidden = !bands.some(band => band.some(sample => sample.min < sample.max));
  byId("action-key").hidden = delays.size === 0;
  const limitText = `${limitLabel || "Operating limit"} ${value(limit)}.`;
  const first = baseline.earliest == null ? "The forecast stays within the limit without a response." : `Without a response, the forecast reaches the limit at ${crossingWindow(baseline)}.`;
  const branch = reading ? ` Reading at ${time(reading.delay)}.` : "";
  text("chart-description", `${first} ${limitText}${branch} ${selected ? planRisk(selected) : ""}`);
  text("chart-caption", `${limitText} ${first}${branch}`);
  text("chart-mode", state.applied ? "RESPONSE REPLAY" : state.staged ? "RESPONSE STAGED" : state.probe ? "EVIDENCE REPLAY" : "PLAN PREVIEW");
  text("plan-key", selected?.label || "Selected response");
}

function renderMotion() {
  const { x, y, left, traces, clip, playhead, dots } = state.chart;
  const { capacity, limit } = state.data.scenario;
  const cursor = x(state.position);
  clip.setAttribute("width", cursor - left);
  playhead.setAttribute("x1", cursor);
  playhead.setAttribute("x2", cursor);
  traces.forEach((trace, index) => {
    const level = readingAt(trace.length ? trace : traces[0], state.position);
    const track = index ? "plan" : "baseline";
    const atLimit = level >= limit;
    const levelLabel = value(level);
    if (byId(`${track}-level`).textContent !== levelLabel) text(`${track}-level`, levelLabel);
    byId(`${track}-fill`).style.transform = `scaleX(${Math.max(0, Math.min(1, level / capacity))})`;
    if (byId(`${track}-reading`).dataset.limit !== String(atLimit)) {
      byId(`${track}-reading`).dataset.limit = String(atLimit);
      text(`${track}-status`, atLimit ? "Operating limit reached" : "Below operating limit");
    }
    if (dots[index]) {
      dots[index].setAttribute("cx", cursor);
      dots[index].setAttribute("cy", y(level));
    }
  });
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

function renderContactCheck() {
  const check = state.data?.scenario.probes?.find(probe => probe.id === driveCheck);
  byId("briefing-contact").hidden = !check;
  byId("forecast-contact").hidden = !check;
  for (const [id, outcomeId] of contactButtons) {
    const button = byId(id);
    const available = check?.outcomes.some(outcome => outcome.id === outcomeId && outcome.probability > 0);
    button.disabled = state.busy || !available;
    button.setAttribute("aria-pressed", String(state.probe === driveCheck && state.outcome === outcomeId));
  }
  const outcome = state.probe === driveCheck && check?.outcomes.find(item => item.id === state.outcome);
  const result = outcome ? `${outcome.label}. ${branchRecommendation(outcome)}.` : "Choose a reading to replay its forecast.";
  if (byId("contact-result").textContent !== result) text("contact-result", result);
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
  for (const id of ["run-demo", "play", "timeline", "reset"]) byId(id).disabled = state.busy || !state.data;
  renderContactCheck();
}

function renderPlans(focusId) {
  const { options, recommendedId } = state.data;
  const selected = option(state.selected);
  const shown = state.expanded ? options : options.slice(0, featuredOptions);
  const rows = shown.map((plan, index) => {
    const button = element("button", "plan-option");
    button.type = "button";
    button.dataset.plan = plan.id;
    button.disabled = state.busy;
    button.setAttribute("aria-pressed", String(plan.id === selected?.id));
    button.append(
      element("span", "plan-rank", String(index + 1).padStart(2, "0")),
      element("span", "plan-title", plan.label),
      element("span", "plan-price", cost(plan.cost)),
      element("span", "plan-summary", `${plan.id === recommendedId ? "Recommended · " : ""}${planRisk(plan)}`),
    );
    button.addEventListener("click", () => {
      if (state.busy) return;
      if (state.applied === plan.id) {
        playFromStart();
        return;
      }
      state.selected = plan.id;
      state.staged = null;
      state.applied = null;
      state.receipt = null;
      resetHandoff();
      text("decision-note", "");
      text("receipt", "");
      renderPlans(plan.id);
      renderTenants();
      renderEvidence();
      renderTime();
    });
    return button;
  });
  byId("plans").replaceChildren(...rows);
  if (focusId) rows.find(button => button.dataset.plan === focusId)?.focus();
  const toggle = byId("plan-toggle");
  toggle.disabled = state.busy;
  toggle.hidden = options.length <= featuredOptions || Boolean(state.applied);
  toggle.setAttribute("aria-expanded", String(state.expanded));
  toggle.textContent = state.expanded ? "Show top options" : `Show all ${options.length} options`;
  text("plan-count", `${options.filter(plan => plan.safe).length} WITHIN LIMIT`);
  text("plan-intro", recommendedId ? "Compare modeled cost and the earliest limit before you stage a response." : "Every tested response reaches the limit in at least one condition.");
  byId("actions").replaceChildren(...selectedActions().map(action => {
    const row = element("li");
    row.dataset.start = action.delay;
    if (action.duration != null) row.dataset.end = action.delay + action.duration;
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
  const hasHypotheses = Boolean(evidence?.hypotheses?.length);
  const hideEvidence = !(hasHypotheses || scenario.observations?.length);
  for (const id of ["evidence-panel", "evidence-link", "forecast-evidence-link"]) byId(id).hidden = hideEvidence;
  if (byId("evidence-panel").hidden) return;
  for (const id of ["evidence-intro", "evidence-hypotheses"]) {
    const node = byId(id);
    if (node) node.hidden = !hasHypotheses;
  }
  text("evidence-bits", hasHypotheses ? `${bits.format(evidence.bits)} BITS UNCERTAINTY` : "OBSERVATIONS");
  byId("observations").replaceChildren(...(scenario.observations || []).map(observation => {
    const item = element("li", "", `${observation.label} · `);
    item.append(element("strong", "", observation.value));
    return item;
  }));
  byId("hypotheses").replaceChildren(...(evidence?.hypotheses || []).map(hypothesis => {
    const item = element("li", "", `${hypothesis.label} · `);
    item.append(element("strong", "", percent.format(hypothesis.probability)));
    return item;
  }));
  const locked = state.busy;
  const studies = (scenario.probes || []).map(probe => renderProbe(scenario, probe, locked));
  if (studies.length && state.data.beforeProbe) {
    const before = state.data.beforeProbe;
    const summary = element("p", "probe-reference");
    summary.append(
      element("strong", "", "Without another reading"),
      element("span", "", branchRecommendation(before)),
      element("span", "", `No response · ${crossingWindow(before)}`),
    );
    studies.unshift(summary);
  }
  if (state.probe) {
    const controls = element("div", "probe-controls");
    const forecast = element("button", "button secondary", "Replay this forecast ↑");
    forecast.type = "button";
    forecast.disabled = locked;
    forecast.addEventListener("click", playFromStart);
    const clear = element("button", "button secondary", "Return to shared readings");
    clear.type = "button";
    clear.disabled = locked;
    clear.addEventListener("click", async () => {
      if (await loadScenario(scenario.id)) byId("evidence-title").focus();
    });
    controls.append(forecast, clear);
    studies.push(controls);
  }
  byId("probes").replaceChildren(...studies);
  const observation = evidence?.observation;
  text("probe-result", observation
    ? `${observation.label}. Uncertainty fell from ${bits.format(evidence.priorBits)} to ${bits.format(evidence.bits)} bits. The check takes ${observation.delay} min before the response can start.`
    : "");
}

function branchRecommendation(branch) {
  if (!branch.safe) return "No tested response stays within the limit";
  return `${branch.recommendedLabel} · ${cost(branch.cost)}`;
}

function renderProbe(scenario, probe, locked) {
  const section = element("section", "probe-study");
  section.setAttribute("aria-label", probe.label);
  section.append(element("h3", "probe-study-heading", probe.label));
  section.append(element("p", "probe-study-meta", `${probe.delay} min · ${cost(probe.cost)} check · ${bits.format(probe.expectedGain)} bits expected to resolve`));
  if (probe.description) section.append(element("p", "probe-study-detail", probe.description));
  const branches = element("div", "probe-branch-list");
  branches.setAttribute("role", "group");
  branches.setAttribute("aria-label", "Possible readings to replay");
  for (const outcome of probe.outcomes) {
    const current = state.probe === probe.id && state.outcome === outcome.id;
    const possible = outcome.probability > 0;
    const button = element("button", "probe-branch");
    button.type = "button";
    button.disabled = locked || !possible;
    button.dataset.probe = probe.id;
    button.dataset.outcome = outcome.id;
    button.setAttribute("aria-pressed", String(current));
    button.append(
      element("span", "probe-branch-label", outcome.label),
      element("span", "probe-branch-chance", `${percent.format(outcome.probability)} modeled chance`),
      element("span", "probe-branch-meta", possible ? `No response · ${crossingWindow(outcome)}` : "Outside the exercise model"),
    );
    if (possible) {
      button.append(
        element("span", "probe-branch-plan", branchRecommendation(outcome)),
      );
      const before = state.data.beforeProbe;
      if (outcome.safe && before?.safe && outcome.cost !== before.cost) {
        const delta = outcome.cost - before.cost;
        button.append(element("span", "probe-branch-delta", `${cost(Math.abs(delta))} ${delta < 0 ? "less" : "more"} than acting now`));
      }
      button.append(element("span", "probe-branch-status", current ? "Play this reading again ▶" : "Play this reading ▶"));
    }
    button.addEventListener("click", () => playReading(scenario.id, probe.id, outcome.id));
    branches.append(button);
  }
  section.append(branches);
  return section;
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

function clearLoadError() {
  byId("load-error").hidden = true;
  byId("retry-load").hidden = true;
}

function showLoadError(message, retry) {
  retryLoad = retry;
  byId("load-error").hidden = false;
  byId("retry-load").hidden = false;
  text("load-error", message);
  byId("load-error").scrollIntoView({ block: "center" });
}

async function loadScenario(id, probe = null, outcome = null) {
  if (state.busy) return;
  stopPlayback();
  state.busy = true;
  renderDecisionButtons();
  if (state.data) {
    renderPlans();
    renderEvidence();
  }
  clearLoadError();
  try {
    const parameters = new URLSearchParams();
    if (probe) parameters.set("probe", probe);
    if (outcome) parameters.set("outcome", outcome);
    const search = parameters.toString();
    const query = search ? `?${search}` : "";
    state.data = await json(`${scenarioPath(id)}${query}`);
    state.minute = 0;
    state.position = 0;
    state.selected = state.data.recommendedId || state.data.options[0]?.id;
    state.staged = null;
    state.applied = null;
    state.probe = probe;
    state.outcome = state.data.evidence?.observation?.id ?? null;
    state.receipt = null;
    state.expanded = false;
    state.busy = false;
    byId("scenario").value = id;
    resetHandoff();
    renderScenario();
    return true;
  } catch (error) {
    state.busy = false;
    showLoadError(`Could not load the incident. ${error.message}`, () => loadScenario(id, probe, outcome));
    if (state.data) {
      byId("scenario").value = state.data.scenario.id;
      renderPlans();
      renderEvidence();
    } else renderDecisionButtons();
    return false;
  }
}

function stageResponse() {
  if (state.busy || !option(state.selected)?.actionIds.length) return;
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
      body: JSON.stringify({ plan, minute: state.minute, probe: state.probe, outcome: state.outcome }),
    });
    state.applied = plan;
    state.staged = null;
    resetHandoff();
    text("receipt", `Dispatch receipt ${state.receipt.id}`);
    text("decision-note", "Response applied. The replay is running from T+00.");
  } catch (error) {
    text("decision-note", `Response is still staged. ${error.message} You can retry.`);
  } finally {
    state.busy = false;
    renderPlans();
    renderEvidence();
    if (state.applied) playFromStart();
    else byId("apply").focus();
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
  if (state.outcome) query.set("outcome", state.outcome);
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
  clearLoadError();
  try {
    const { scenarios } = await json("./api/scenarios");
    if (!scenarios.length) throw new Error("No scenarios are available.");
    const choices = scenarios.map(scenario => new Option(scenario.name, scenario.id));
    byId("scenario").replaceChildren(...choices);
    await loadScenario(scenarios[0].id);
  } catch (error) {
    showLoadError(`Could not start Avon Relay. ${error.message}`, initialize);
  }
}

byId("run-demo").addEventListener("click", playFromStart);
for (const [id, outcome] of contactButtons) {
  byId(id).addEventListener("click", () => playReading(state.data.scenario.id, driveCheck, outcome));
}
byId("retry-load").addEventListener("click", () => retryLoad?.());
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
