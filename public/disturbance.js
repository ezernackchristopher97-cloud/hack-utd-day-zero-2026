const byId = id => document.getElementById(`disturbance-${id}`);
const svgNS = "http://www.w3.org/2000/svg";
const number = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const gaugeReading = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const millisecondsPerSample = 450;

let test;
let active;
let shown;
let sampleIndex = 0;
let animation;
let cursor;
let readingCards = [];

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attributes, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function time(seconds) {
  return `T${seconds < 0 ? "−" : "+"}${Math.abs(seconds)} s`;
}

function selectedGauge() {
  return test.gauges.find(gauge => gauge.id === byId("gauge").value);
}

function candidate() {
  const gaugeId = byId("gauge").value;
  const amplitude = Number(byId("pulse").value);
  return test.candidates.find(item => item.gaugeId === gaugeId && item.amplitude === amplitude);
}

function fillPulses(preferred) {
  const gauge = selectedGauge();
  const pulses = test.candidates.filter(item => item.gaugeId === gauge.id);
  const choices = pulses.map(pulse => {
    const note = !pulse.safe ? " · over limit" : pulse.amplitude === gauge.recommendedAmplitude ? " · suggested" : "";
    const label = pulse.amplitude === 0 ? "No pulse" : `+${number.format(pulse.amplitude)} r${note}`;
    const option = element("option", label);
    option.value = pulse.amplitude;
    return option;
  });
  byId("pulse").replaceChildren(...choices);
  const fallback = gauge.recommendedAmplitude ?? pulses.find(pulse => pulse.amplitude > 0 && pulse.safe)?.amplitude ?? 0;
  byId("pulse").value = pulses.some(pulse => pulse.amplitude === preferred) ? preferred : fallback;
  byId("gauge-detail").textContent = `Rounds down in steps of ${gaugeReading.format(gauge.step)} r.`;
}

function setVerdict(sampling = false) {
  const pulse = candidate();
  const { deadline, limit, window } = test.config;
  const gauge = selectedGauge();
  const isSuggested = gauge.recommendedAmplitude === pulse.amplitude;
  byId("suggest").hidden = gauge.recommendedAmplitude == null || isSuggested;
  byId("run").disabled = !pulse.safe;
  byId("run-label").textContent = !pulse.safe ? "Pulse blocked" : pulse.amplitude ? "Run simulated pulse" : "Run without a pulse";

  let label = isSuggested ? "SUGGESTED SETUP" : "TEST SETUP";
  let result = "Ready to test";
  let detail = `Modeled peak ${number.format(pulse.peak)} r. Exercise limit ${number.format(limit)} r.`;
  let tone = "neutral";

  if (!pulse.safe) {
    label = "PULSE BLOCKED";
    result = "Above the exercise limit";
    detail = `Modeled peak ${number.format(pulse.peak)} r exceeds ${number.format(limit)} r. Choose a smaller pulse.`;
    tone = "caution";
  } else if (sampling) {
    label = "GAUGE RESULT";
    result = "Sampling…";
    detail = `Reading the ${gauge.label.toLowerCase()} at each sample.`;
  } else if (pulse.amplitude === 0) {
    result = "All three readings match";
    detail = "Without a pulse, all three models stay at the same reading.";
  } else if (active) {
    label = "GAUGE RESULT";
    if (pulse.eligible) {
      result = `First readable split at ${time(pulse.firstDistinct)}`;
      detail = `The gauge shows three different values by the ${time(deadline)} deadline. The modeled peak is ${number.format(pulse.peak)} r.`;
      tone = "clear";
    } else {
      result = pulse.firstDistinct == null ? "No three-way split" : "The split comes too late";
      detail = pulse.firstDistinct == null
        ? `At least two models share a gauge reading at every sample through ${time(window)}.`
        : `Three different values first appear at ${time(pulse.firstDistinct)}, after the ${time(deadline)} deadline.`;
      if (gauge.recommendedAmplitude == null) detail += " No simulated test meets both limits with this gauge.";
      tone = "caution";
    }
  }

  byId("verdict").dataset.tone = tone;
  byId("result-label").textContent = label;
  byId("result").textContent = result;
  byId("result-detail").textContent = detail;
  byId("gap").textContent = pulse.gap.toFixed(4);
  byId("gap").dataset.violation = String(pulse.excess > 0);
  byId("gap-detail").textContent = pulse.excess > 0
    ? `${number.format(pulse.excess)} r beyond the limit. The limit blocks the pulse.`
    : "The modeled signal stays within the exercise limit.";
}

function points(samples, read, x, y) {
  const coordinates = samples.map((sample, index) => {
    const pos = `${x(sample.time)},${y(read(sample))}`;
    return index ? `${x(sample.time)},${y(read(samples[index - 1]))} ${pos}` : pos;
  });
  return coordinates.join(" ");
}

function plot() {
  const { baseline, deadline, limit, window } = test.config;
  const setup = candidate();
  const first = shown.samples[0].time;
  const range = Math.max(0.025, (setup.safe ? setup.peak : limit) - baseline);
  const step = range > 0.10 ? 0.05 : range > 0.05 ? 0.02 : 0.01;
  const topTick = Math.min(limit, Math.ceil((baseline + range * 1.08) / step) * step);
  const min = baseline - range * 0.12;
  const max = topTick + range * 0.10;
  const showsLimit = topTick === limit;
  const left = 64;
  const right = 654;
  const top = 22;
  const bottom = 223;
  const x = value => left + (value - first) / (window - first) * (right - left);
  const y = value => bottom - (value - min) / (max - min) * (bottom - top);
  const layer = byId("drawing");
  const series = [];
  const hasPulse = active?.amplitude > 0;
  let reveal;
  layer.replaceChildren(
    svg("rect", { x: x(deadline), y: top, width: right - x(deadline), height: bottom - top, class: "disturbance-late-zone" }),
    svg("line", {
      x1: left, x2: right, y1: y(topTick), y2: y(topTick),
      class: showsLimit ? "disturbance-limit-line" : "disturbance-grid-line",
    }),
    svg("line", { x1: left, x2: right, y1: bottom, y2: bottom, class: "disturbance-grid-line" }),
    svg("text", { x: left - 11, y: y(topTick) + 5, "text-anchor": "end" }, number.format(topTick)),
    svg("text", { x: left - 11, y: y(baseline) + 5, "text-anchor": "end" }, number.format(baseline)),
  );
  if (showsLimit) {
    layer.append(svg("text", { x: left + 6, y: y(limit) + 19, class: "disturbance-limit-text" }, "EXERCISE LIMIT"));
  }
  for (const [moment, label] of [[first, "Before"], [0, "Pulse"], [deadline, "Deadline"], [window, time(window)]]) {
    layer.append(
      svg("line", {
        x1: x(moment), x2: x(moment), y1: top, y2: bottom,
        class: moment === deadline ? "disturbance-deadline-line" : "disturbance-grid-line",
      }),
      svg("text", {
        x: x(moment), y: bottom + 26,
        "text-anchor": moment === first ? "start" : moment === window ? "end" : "middle",
      }, label),
    );
  }

  layer.append(svg("line", {
    x1: left, x2: right, y1: y(baseline), y2: y(baseline),
    class: "disturbance-trace", "data-kind": "baseline",
  }));
  if (hasPulse) {
    reveal = svg("rect", { x: left - 2, y: top - 2, width: 0, height: bottom - top + 4 });
    const clip = svg("clipPath", { id: "disturbance-reveal" });
    clip.append(reveal);
    const traces = svg("g", { "clip-path": "url(#disturbance-reveal)" });
    for (const mechanism of test.mechanisms) {
      const reading = sample => sample.values.find(item => item.id === mechanism.id).reading;
      traces.append(svg("polyline", {
        points: points(shown.samples, reading, x, y),
        class: "disturbance-trace disturbance-pulse-trace",
        "data-kind": mechanism.id,
      }));
    }
    if (active.firstDistinct != null) {
      traces.append(svg("line", {
        x1: x(active.firstDistinct), x2: x(active.firstDistinct), y1: top, y2: bottom,
        class: "disturbance-first-line", "data-eligible": active.eligible,
      }));
    }
    layer.append(clip, traces);
  }

  const line = svg("line", { y1: top, y2: bottom, class: "disturbance-cursor" });
  layer.append(line);
  for (const mechanism of hasPulse ? test.mechanisms : [{ id: "baseline" }]) {
    const dot = svg("circle", { r: 5, class: "disturbance-dot", "data-kind": mechanism.id });
    layer.append(dot);
    series.push({ id: mechanism.id, dot });
  }
  cursor = { x, y, line, series, reveal, left };
  byId("chart-mode").textContent = hasPulse ? selectedGauge().label.toUpperCase() : "NO PULSE";
  byId("chart-description").textContent = hasPulse
    ? "The chart draws the selected gauge's readings as the test runs. Each reading holds until the next sample."
    : "All three models follow the same flat line without a pulse. The sample viewer shows what the selected gauge would read.";
}

function renderLegend() {
  const hasPulse = active?.amplitude > 0;
  const legend = [{ id: "baseline", label: hasPulse ? "No pulse" : "No pulse · all three overlap" }];
  if (hasPulse) legend.push(...test.mechanisms);
  byId("legend").replaceChildren(...legend.map(item => {
    const entry = element("li");
    entry.dataset.kind = item.id;
    entry.append(element("i"), element("span", item.label));
    return entry;
  }));
}

function renderReadings() {
  readingCards = test.mechanisms.map(mechanism => {
    const card = element("li");
    card.dataset.kind = mechanism.id;
    const reading = element("strong");
    card.append(element("span", mechanism.label), reading);
    return { id: mechanism.id, reading, card };
  });
  byId("readings").replaceChildren(...readingCards.map(item => item.card));

  const row = element("tr");
  for (const label of ["Sample", ...test.mechanisms.map(item => item.label)]) {
    const head = element("th", label);
    head.scope = "col";
    row.append(head);
  }
  byId("table-head").replaceChildren(row);

  const rows = shown.samples.map(sample => {
    const entry = element("tr");
    const heading = element("th", time(sample.time));
    heading.scope = "row";
    if (sample.time === active?.firstDistinct) {
      entry.dataset.first = active.eligible ? "in-time" : "late";
      heading.append(element("small", active.eligible ? "First split" : "First split · late"));
    }
    entry.append(heading);
    for (const mechanism of test.mechanisms) {
      const reading = sample.values.find(item => item.id === mechanism.id).reading;
      entry.append(element("td", `${gaugeReading.format(reading)} r`));
    }
    return entry;
  });
  byId("table-body").replaceChildren(...rows);
  byId("table-caption").textContent = active?.amplitude ? "Gauge readings with the selected pulse" : "Gauge readings without a pulse";
}

function moveCursor(time) {
  const x = cursor.x(time);
  cursor.line.setAttribute("x1", x);
  cursor.line.setAttribute("x2", x);
  cursor.reveal?.setAttribute("width", x - cursor.left + 3);
  for (const { dot } of cursor.series) dot.setAttribute("cx", x);
}

function showSample(index) {
  sampleIndex = index;
  const sample = shown.samples[index];
  const control = byId("sample");
  control.value = index;
  control.setAttribute("aria-valuetext", time(sample.time));
  byId("time").textContent = time(sample.time);
  const groups = new Set(sample.values.map(({ reading }) => reading)).size;
  byId("groups").textContent = groups === 1
    ? "All three models share one gauge reading."
    : groups === 2 ? "Two models still share a gauge reading." : "Each model has its own gauge reading.";
  for (const item of readingCards) {
    const reading = sample.values.find(value => value.id === item.id).reading;
    item.reading.textContent = `${gaugeReading.format(reading)} r`;
  }
  for (const { id, dot } of cursor.series) {
    const reading = id === "baseline" ? test.config.baseline : sample.values.find(item => item.id === id).reading;
    dot.setAttribute("cy", cursor.y(reading));
  }
  moveCursor(sample.time);
}

function stopAnimation() {
  if (animation !== undefined) cancelAnimationFrame(animation);
  animation = undefined;
}

function animateTo(lastIndex) {
  if (sampleIndex >= lastIndex) {
    showSample(lastIndex);
    setVerdict();
    return;
  }
  const firstIndex = sampleIndex;
  const start = performance.now();
  const advance = now => {
    const elapsed = Math.max(0, now - start);
    const position = Math.min(lastIndex, firstIndex + elapsed / millisecondsPerSample);
    const index = Math.floor(position);
    if (index !== sampleIndex) showSample(index);
    if (index < lastIndex) {
      if (!reducedMotion.matches) {
        const currentTime = shown.samples[index].time;
        const nextTime = shown.samples[index + 1].time;
        moveCursor(currentTime + (position - index) * (nextTime - currentTime));
      }
      animation = requestAnimationFrame(advance);
    } else {
      animation = undefined;
      setVerdict();
    }
  };
  animation = requestAnimationFrame(advance);
}

function render(replay = false) {
  stopAnimation();
  shown = active ?? test.candidates.find(item => item.gaugeId === byId("gauge").value && item.amplitude === 0);
  const slider = byId("sample");
  slider.max = shown.samples.length - 1;
  plot();
  renderLegend();
  renderReadings();
  const focusTime = active
    ? active.eligible ? active.firstDistinct : test.config.deadline
    : 0;
  const focusIndex = shown.samples.findIndex(sample => sample.time === focusTime);
  if (replay) {
    setVerdict(true);
    showSample(0);
    animateTo(focusIndex);
  } else {
    setVerdict();
    showSample(focusIndex);
  }
}

async function load() {
  byId("error").hidden = true;
  byId("retry").hidden = true;
  byId("loading").hidden = false;
  try {
    const response = await fetch("./api/disturbance", { cache: "no-store" });
    if (!response.ok) throw new Error("The disturbance test could not load.");
    test = await response.json();
    byId("gauge").replaceChildren(...test.gauges.map(gauge => {
      const option = element("option", gauge.label);
      option.value = gauge.id;
      return option;
    }));
    const { recommended, config } = test;
    if (recommended) byId("gauge").value = recommended.gaugeId;
    fillPulses(recommended?.amplitude);
    byId("deadline").textContent = time(config.deadline);
    byId("limit").textContent = `Exercise limit ${number.format(config.limit)} r · sampled every ${config.sampleInterval} s`;
    render();
    byId("layout").hidden = false;
  } catch {
    byId("error").textContent = "Could not load the disturbance test. Make sure the local server is running and reload the test.";
    byId("error").hidden = false;
    byId("retry").hidden = false;
  } finally {
    byId("loading").hidden = true;
  }
}

byId("gauge").addEventListener("change", () => {
  const amplitude = Number(byId("pulse").value);
  fillPulses(amplitude);
  const pulse = candidate();
  if (active) active = pulse.safe && pulse.amplitude === amplitude ? pulse : null;
  render(Boolean(active));
});
byId("pulse").addEventListener("change", () => {
  active = null;
  render();
});
function runPulse() {
  const pulse = candidate();
  if (!pulse.safe) return;
  active = pulse;
  render(true);
}

byId("run").addEventListener("click", runPulse);
byId("suggest").addEventListener("click", () => {
  byId("pulse").value = selectedGauge().recommendedAmplitude;
  runPulse();
  byId("run").focus();
});
byId("sample").addEventListener("input", event => {
  if (animation !== undefined) setVerdict();
  stopAnimation();
  showSample(Number(event.target.value));
});
byId("retry").addEventListener("click", load);

load();
