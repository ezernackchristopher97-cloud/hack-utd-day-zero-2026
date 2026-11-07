import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAppServer } from '../server.mjs';
import { scenarios } from '../lib/scenarios.mjs';

async function localServer(t, available) {
  const directory = await mkdtemp(join(tmpdir(), 'avon-relay-'));
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
