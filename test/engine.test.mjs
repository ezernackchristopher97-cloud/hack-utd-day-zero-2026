import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze, simulate } from "../lib/engine.mjs";

const scenario = {
  id: "avon-test",
  name: "Avon Tank",
  unit: "bbl",
  horizon: 10,
  initial: 50,
  limit: 70,
  capacity: 75,
  rate: 5,
  cases: [
    { id: "low", label: "Low inflow", delta: -2, weight: 0.25 },
    { id: "nominal", label: "Nominal", delta: 0, weight: 0.5 },
    { id: "high", label: "High inflow", delta: 2, weight: 0.25 },
  ],
  actions: [
    { id: "divert", label: "Divert line", delay: 2, delta: -4, cost: 50, costPerMinute: 1, group: "valve" },
    { id: "reduce", label: "Reduce inflow", delay: 1, delta: -3, cost: 100 },
    { id: "pump", label: "Start spare pump", delay: 0, delta: -8, cost: 300, group: "valve" },
    { id: "truck", label: "Unload truck", delay: 2, delta: -75, duration: 1, cost: 200 },
  ],
  nodes: [
    { id: "primary", at: 0 },
    { id: "tank", threshold: 70 },
    { id: "line" },
    { id: "reuse" },
  ],
  edges: [
    { from: "primary", to: "tank" },
    { from: "tank", to: "line", delay: 1 },
    { from: "line", to: "tank", delay: 0 },
    { from: "line", to: "reuse", delay: 3 },
  ],
  observations: [],
};

test("tracks the limit and physical capacity separately and times downstream impacts", () => {
  const run = simulate(scenario);
  assert.equal(run.firstLimit, 4);
  assert.equal(run.firstOverflow, 6);
  assert.equal(run.trace[5].level, 75);
  assert.equal(run.peak, 100);
  assert.deepEqual(run.impacts, [
    { id: "primary", at: 0 },
    { id: "tank", at: 4 },
    { id: "line", at: 5 },
    { id: "reuse", at: 8 },
  ]);
});

test("applies a delayed, one minute transfer without making the tank negative", () => {
  const run = simulate(scenario, ["truck"]);
  assert.deepEqual(run.trace.slice(0, 5).map(({ level }) => level), [50, 55, 60, 0, 5]);
  assert.equal(run.final, 35);
  assert.equal(run.cost, 200);
});

test("runs compound actions on their own clocks and records a crossing before an exact transfer", () => {
  const compound = {
    ...scenario,
    actions: [{
      id: "fleet", label: "Use fleet", delay: 2, cost: 230,
      effects: [{ delay: 0, delta: -2, duration: 2 }, { delay: 3, quantity: -32 }],
    }],
  };
  const run = simulate(compound, ["fleet"]);
  assert.deepEqual(run.trace.slice(2, 6), [
    { minute: 2, level: 60 },
    { minute: 3, level: 63 },
    { minute: 4, level: 66 },
    { minute: 5, level: 39, before: 71 },
  ]);
  assert.equal(run.firstLimit, 5);
  assert.equal(run.impacts.find(({ id }) => id === "tank").at, 5);
  assert.equal(run.peak, 71);
  assert.equal(run.cost, 230);
});

test("picks the least expensive option that works in every case", () => {
  const analysis = analyze(scenario);
  assert.equal(analysis.baseline.earliest, 3);
  assert.equal(analysis.baseline.latest, 7);
  assert.equal(analysis.recommendedId, "divert+reduce");
  const best = analysis.options[0];
  assert.equal(best.cost, 158);
  assert.equal(best.margin, 9);
  assert.equal(best.nominal.firstLimit, null);
  assert.deepEqual(analysis.baseline.band[3], { minute: 3, min: 59, max: 71 });
  assert.equal(analysis.options.find(({ id }) => id === "divert").safe, false);
  assert.equal(analysis.options.some(({ id }) => id === "divert+pump"), false);
});

test("leaves a recommendation unset if no option protects the site", () => {
  const analysis = analyze({ ...scenario, actions: [] });
  assert.equal(analysis.recommendedId, null);
  assert.equal(analysis.options[0].id, "none");
  assert.equal(analysis.options[0].overflowCases, 3);
});

test("represents a deadline reached in some cases only", () => {
  const bounded = { ...scenario, horizon: 5 };
  const analysis = analyze(bounded);
  assert.equal(analysis.baseline.limitCases, 2);
  assert.equal(analysis.baseline.caseCount, 3);
  assert.equal(analysis.baseline.latest, 4);
  assert.equal(analyze(bounded, ["low"]).recommendedId, "none");
});

test("keeps the representative trace inside the selected cases", () => {
  const weighted = {
    ...scenario,
    cases: scenario.cases.map((item) => item.id === "high" ? { ...item, weight: 0.35 } : item),
  };
  const analysis = analyze(weighted, ["low", "high"]);
  assert.equal(analysis.representativeCase, "high");
  assert.equal(analysis.baseline.nominal.trace[2].level, 64);
  assert.deepEqual(analysis.baseline.band[2], { minute: 2, min: 56, max: 64 });
  assert.equal(analyze(scenario, ["low", "high"]).representativeCase, "low");
  assert.equal(analyze(weighted).representativeCase, "nominal");
});

test("reaches an exact decimal threshold despite accumulated rounding", () => {
  const decimal = {
    ...scenario,
    initial: 26,
    limit: 30,
    capacity: 30,
    rate: 0.4,
    nodes: [{ id: "rack", threshold: 30 }],
  };
  const run = simulate(decimal);
  assert.equal(run.firstLimit, 10);
  assert.equal(run.firstOverflow, null);
  assert.deepEqual(run.impacts, [{ id: "rack", at: 10 }]);
});

test("rejects bad inputs instead of silently forecasting another plan", () => {
  assert.throws(() => simulate(scenario, ["unknown"]), /Unknown action/);
  assert.throws(() => simulate(scenario, ["truck", "truck"]), /only be selected once/);
  assert.throws(() => simulate(scenario, ["divert", "pump"]), /cannot run together/);
  assert.throws(() => analyze(scenario, ["mislabeled"]), /Unknown forecast case/);
});
