import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAppServer } from '../server.mjs';
import { disturbanceTest } from '../lib/disturbance.mjs';
import { phaseCheck } from '../lib/phase-check.mjs';
import { scenarios } from '../lib/scenarios.mjs';

async function localServer(t, available) {
  const directory = await mkdtemp(join(tmpdir(), 'absurdity-gate-'));
  const server = createAppServer(available, directory);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${server.address().port}`, directory };
}

test('routes imported scenario IDs from the returned scenario list', async t => {
  const id = 'eog-S2-B_pump_failure';
  const { base } = await localServer(t, [{ ...scenarios[0], id }]);
  const list = await (await fetch(`${base}/api/scenarios`)).json();
  const response = await fetch(`${base}/api/scenarios/${encodeURIComponent(list.scenarios[0].id)}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).scenario.id, id);
});

test('serves the disturbance test with the console', async t => {
  const { base } = await localServer(t);
  const page = await (await fetch(base)).text();
  assert.match(page, /src="[^"]*disturbance\.js"/);
  const asset = await fetch(`${base}/disturbance.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  const response = await fetch(`${base}/api/disturbance`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), disturbanceTest());
  assert.equal((await fetch(`${base}/api/disturbance`, { method: 'POST' })).status, 405);
  assert.match(page, /src="[^"]*phase-check\.js"/);
  assert.equal((await fetch(`${base}/phase-check.js`)).status, 200);
  const phases = await fetch(`${base}/api/phase-check`);
  assert.equal(phases.status, 200);
  assert.deepEqual(await phases.json(), phaseCheck());
});

test('serves exercises and accounts for probe delays in the saved response', async t => {
  const { base, directory } = await localServer(t);
  const list = await (await fetch(`${base}/api/scenarios`)).json();
  assert.deepEqual(list.scenarios.map(({ id }) => id), ['avon', 'cooling', 'exchange']);
  const path = `${base}/api/scenarios/avon`;
  const initial = await (await fetch(path)).json();
  const probe = 'local-trip-contact';
  const checked = await (await fetch(`${path}?probe=${probe}`)).json();
  assert.deepEqual([initial.baseline.earliest, initial.baseline.latest], [12, 19]);
  assert.deepEqual([checked.baseline.earliest, checked.baseline.latest], [12, 16]);
  assert.equal(checked.evidence.bits, 0);
  const slower = await (await fetch(`${path}?probe=portable-flow`)).json();
  assert.equal(slower.recommendedId, 'reroute');
  const response = await fetch(`${path}/dispatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: checked.recommendedId, probe, minute: 0 })
  });
  assert.equal(response.status, 201);
  const { id, text } = await response.json();
  assert.match(text, /Throttle North Pad at T\+4 min/);
  assert.match(text, /Dispatch a vacuum truck at T\+9 min/);
  const stored = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
  assert.equal(stored.text, text);
  assert.equal(stored.probe, probe);
  assert.equal(stored.outcome, 'tripped');
});

test('replays each probe reading with its own deadline and response', async t => {
  const { base, directory } = await localServer(t);
  const path = `${base}/api/scenarios/avon`;
  const prior = await (await fetch(path)).json();
  const probe = prior.scenario.probes.find(item => item.id === 'local-trip-contact');
  assert.ok(!('demoOutcome' in probe));
  assert.ok(probe.outcomes.every(outcome => !('likelihood' in outcome) && !('caseIds' in outcome)));
  assert.deepEqual(probe.outcomes.map(({ id, probability, earliest, latest, recommendedId, cost }) =>
    [id, probability, earliest, latest, recommendedId, cost]), [
    ['tripped', 0.55, 12, 16, 'throttle+truck', 981],
    ['clear', 0.45, 16, 19, 'auxiliary', 662]
  ]);

  const query = `probe=${probe.id}&outcome=clear`;
  const reading = await (await fetch(`${path}?${query}`)).json();
  assert.deepEqual(reading.beforeProbe, prior.beforeProbe);
  assert.deepEqual([reading.baseline.earliest, reading.baseline.latest, reading.recommendedId], [16, 19, 'auxiliary']);
  assert.deepEqual(reading.evidence.hypotheses.map(item => item.probability), [0, 1]);
  assert.equal(reading.evidence.observation.id, 'clear');
  assert.equal(reading.evidence.observation.probeId, probe.id);

  const { text: handoff } = await (await fetch(`${path}/handoff?${query}`)).json();
  const response = await fetch(`${path}/dispatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: reading.recommendedId, probe: probe.id, outcome: 'clear', minute: 0 })
  });
  assert.equal(response.status, 201);
  const { id, text } = await response.json();
  assert.equal(text, handoff);
  assert.match(text, /Drive trip contact clear/);
  assert.match(text, /Open the auxiliary tank at T\+13 min/);
  const stored = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
  assert.equal(stored.probe, probe.id);
  assert.equal(stored.outcome, 'clear');
});

test('rejects missing, unknown and impossible readings at the appropriate status', async t => {
  const scenario = structuredClone(scenarios[0]);
  const probe = scenario.probes.find(item => item.id === 'local-trip-contact');
  probe.outcomes.push({ id: 'impossible', label: 'Impossible contact reading', likelihood: {} });
  const { base } = await localServer(t, [scenario]);
  const path = `${base}/api/scenarios/avon`;
  const options = [
    ['outcome=clear', 400],
    [`probe=${probe.id}&outcome=unknown`, 404],
    [`probe=${probe.id}&outcome=impossible`, 422]
  ];
  for (const [query, status] of options) {
    assert.equal((await fetch(`${path}?${query}`)).status, status);
  }
  const prior = await (await fetch(path)).json();
  const impossible = prior.scenario.probes.find(item => item.id === probe.id).outcomes.find(item => item.id === 'impossible');
  assert.equal(impossible.probability, 0);
  assert.equal(impossible.recommendedId, null);
  assert.equal(impossible.safe, false);

  const response = await fetch(`${path}/dispatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'auxiliary', probe: probe.id, outcome: 'impossible', minute: 0 })
  });
  assert.equal(response.status, 422);
});

test('joins tenant impacts to a baseline and response', async t => {
  const { base } = await localServer(t);
  const response = await fetch(`${base}/api/scenarios/exchange`);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.tenantExposure.baseline.reduce((total, tenant) => total + tenant.loss, 0), 2391);
  assert.ok(report.tenantExposure.options[report.recommendedId].every(tenant => tenant.loss === 0));
  const rejected = await fetch(`${base}/api/scenarios/exchange/dispatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://outside.example' },
    body: JSON.stringify({ plan: report.recommendedId, minute: 0 })
  });
  assert.equal(rejected.status, 403);
});
