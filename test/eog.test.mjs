import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEogScenarios } from '../lib/eog.mjs';
import { analyze } from '../lib/engine.mjs';

const start = 1_700_000_000;
const facilities = ['A', 'B', 'C', 'D'].map((suffix) => ({
  id: `Facility_${suffix}`,
  tank: { id: `Tank_${suffix}`, capacity_bbl: 100 },
  pump: { id: `Pump_${suffix}`, max_flow_bpd: 2000 },
  pipeline: { id: `Pipeline_${suffix}` },
  wells: [
    { id: `Well_${suffix}`, baseline_water_bpd: 1200, oil_bpd: 24, gas_mcfd: 0 },
    { id: `Well_${suffix}_2`, baseline_water_bpd: 240, oil_bpd: 240, gas_mcfd: 0 },
  ],
}));
const network = {
  defaults: { tank_limits_pct: { warning: 80, shutdown: 90 } },
  systems: [{ id: 'S', disposal_site: { id: 'Disposal' }, facilities }],
};
const ops = {
  prices: { oil_per_bbl: 60, gas_per_mcf: 3 },
  expected_repair_hours: { pump_failure: 1 },
  emergency_trucking: { truck_capacity_bbl: 50, cost_per_trip: 10 },
  systems: { S: {
    emergency_fleet_size: 1,
    facilities: Object.fromEntries(facilities.map(({ id }) => [id, { response_min: 8, cycle_min: 55 }])),
  } },
};
function input(snapshots) {
  const header = 'timestamp,ts_unix,asset_id,metric,value';
  const rows = snapshots.flatMap((snapshot, index) => facilities.flatMap((facility, f) => {
    const time = start + index * 300;
    const [level, status, flow, receipt] = snapshot[f];
    return [
      [facility.id, 'inflow_bpd', 1440],
      [facility.tank.id, 'level_pct', level],
      [facility.pump.id, 'status', status],
      [facility.pump.id, 'flow_bpd', flow],
      [facility.pipeline.id, 'receive_flow_bpd', receipt],
    ].map(([asset, metric, value]) => `${new Date(time * 1000).toISOString()},${time},${asset},${metric},${value}`);
  }));
  return { network, ops, telemetry: [header, ...rows].join('\r\n') };
}

test('ranks faults, shares a truck, and recommends inspection for repeated measured deficits', () => {
  const data = input([
    [[60, 2, 0, 0], [65, 2, 0, 0], [60, 1, 2000, 1800], [60, 1, 1800, 1800]],
    [[65, 2, 0, 0], [70, 2, 0, 0], [60, 1, 2000, 1800], [60, 1, 1800, 1800]],
    [[70, 2, 0, 0], [75, 2, 0, 0], [60, 1, 2000, 1800], [60, 1, 1800, 1800]],
  ]);
  const out = loadEogScenarios(data);

  assert.deepEqual(out.map(({ eog }) => [eog.facilityId, eog.category]), [
    ['Facility_B', 'pump_failure'], ['Facility_A', 'pump_failure'],
    ['Facility_C', 'pipeline_leak'], ['Facility_D', 'pump_degradation'],
  ]);
  assert.deepEqual(out.slice(0, 2).map(({ eog }) => eog.countdownMinutes), [15, 20]);
  assert.equal(out[0].horizon, 50);
  assert.equal(out[0].eog.assignedTrucks + out[1].eog.assignedTrucks, 1);
  assert.equal(out[0].eog.assignedTrucks, 1);
  assert.deepEqual(out[0].eog.arrivals, [8]);
  assert.equal(out[0].eog.expectedCost, 10);
  assert.deepEqual(out[1].eog.wellIds, ['Well_A']);
  assert.equal(out[2].eog.nextStep, 'Request field inspection');
  assert.equal(out[3].eog.nextStep, 'Request field inspection');

  const analysis = analyze(out[0]);
  const recommended = analysis.options.find((option) => option.id === analysis.recommendedId);
  assert.equal(analysis.baseline.nominal.firstLimit, 15);
  assert.equal(recommended.nominal.firstLimit, null);
  assert.equal(recommended.nominal.trace[8].before - recommended.nominal.trace[8].level, 50);
});

test('keeps uncertain leak evidence distinct from a current reading and replays closed faults by onset', () => {
  const healthy = [60, 1, 2000, 2000];
  const stopped = [65, 0, 0, 0];
  const failed = [72, 2, 0, 0];
  const leak = [60, 1, 2000, 1800];
  const out = loadEogScenarios(input([
    [healthy, healthy, leak, healthy],
    [healthy, healthy, leak, healthy],
    [healthy, healthy, leak, healthy],
    [healthy, healthy, stopped, healthy],
  ]));
  assert.equal(out[0].eog.category, 'pipeline_leak');
  assert.equal(out[0].eog.status, 'unconfirmed');
  assert.match(out[0].description, /Awaiting a new running sample/);

  const replays = loadEogScenarios(input([
    [failed, healthy, healthy, healthy],
    [healthy, healthy, healthy, healthy],
    [failed, healthy, healthy, healthy],
    [healthy, healthy, healthy, healthy],
  ]));
  assert.equal(replays.length, 2);
  assert.notEqual(replays[0].id, replays[1].id);
  assert.ok(replays.every(({ eog }) => eog.status === 'replay'));
  assert.ok(replays[0].eog.onset > replays[1].eog.onset);
});

test('rejects CSV data that cannot be used to build an honest forecast', () => {
  assert.throws(() => loadEogScenarios({ network, ops, telemetry: 'ts_unix,asset_id,value\n1,Pump_A,2' }), /metric/);
  const data = input([facilities.map(() => [60, 1, 2000, 2000])]);
  assert.throws(() => loadEogScenarios({ ...data, telemetry: data.telemetry.replace(',Tank_A,level_pct,60', ',Tank_A,level_pct,') }), /Invalid EOG reading/);
});
