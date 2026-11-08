import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { disturbanceTest } from './lib/disturbance.mjs';
import { analyze } from './lib/engine.mjs';
import { readEvidence } from './lib/evidence.mjs';
import { phaseCheck } from './lib/phase-check.mjs';
import { scenarios } from './lib/scenarios.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/disturbance.js', ['disturbance.js', 'text/javascript; charset=utf-8']],
  ['/phase-check.js', ['phase-check.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function createBrief(scenario, analysis, option, minute) {
  const first = analysis.baseline.earliest;
  const remaining = first === null ? 'No modeled limit crossing in the forecast.' :
    first > minute ? `Earliest modeled limit in ${first - minute} min (T+${first}).` : `Earliest modeled limit at T+${first}.`;
  const observation = analysis.evidence.observation;
  const actions = option.actionIds.map(id => scenario.actions.find(action => action.id === id));
  return [
    `AVON RELAY / SIMULATED SHIFT HANDOFF`,
    `${scenario.name} | Replay T+${minute} min`,
    `Without response: ${remaining}`,
    observation ? `Independent reading: ${observation.label} (T+${observation.delay} min).` : null,
    `Response: ${option.label}. Modeled cost ${currency.format(option.cost)}.`,
    ...actions.map(action => `• ${action.label} at T+${action.delay} min.`),
    `Result: ${option.safe ? 'Below the protective limit in every modeled case.' : 'Protective limit is crossed in at least one modeled case.'} Peak ${value.format(option.worstPeak)} ${scenario.unit} in the worst case.`,
    ...((analysis.tenantExposure?.options[option.id] ?? []).map(tenant =>
      `${tenant.label}: ${tenant.minutes} min modeled disruption, ${currency.format(tenant.loss)} modeled exposure.`)),
    'Next shift: verify the next reading and rerun the forecast if the rate changes.'
  ].filter(Boolean).join('\n');
}

function tenantExposure(scenario, analysis) {
  if (!scenario.tenants?.length) return undefined;
  const exposure = forecast => scenario.tenants.map(({ id, label, nodeId, commitment, lossPerMinute }) => {
    const at = forecast.impacts.find(impact => impact.id === nodeId)?.at ?? null;
    const minutes = at === null ? 0 : Math.max(0, scenario.horizon - at);
    return { id, label, commitment, at, minutes, loss: minutes * lossPerMinute };
  });
  return {
    baseline: exposure(analysis.baseline.nominal),
    options: Object.fromEntries(analysis.options.map(option => [option.id, exposure(option.nominal)]))
  };
}

function forecast(scenario, caseIds, delay = 0, cost = 0) {
  const timedScenario = delay ? {
    ...scenario,
    actions: scenario.actions.map(action => ({ ...action, delay: action.delay + delay }))
  } : scenario;
  const analysis = analyze(timedScenario, caseIds);
  if (cost) {
    for (const option of analysis.options) {
      option.cost += cost;
      option.nominal.cost += cost;
    }
  }
  return analysis;
}

function forecastSummary(analysis) {
  const recommended = analysis?.options.find(option => option.id === analysis.recommendedId);
  return {
    activeCaseCount: analysis?.baseline.caseCount ?? 0,
    earliest: analysis?.baseline.earliest ?? null,
    latest: analysis?.baseline.latest ?? null,
    recommendedId: recommended?.id ?? null,
    recommendedLabel: recommended?.label ?? null,
    cost: recommended?.cost ?? null,
    safe: recommended != null
  };
}

function scenarioAnalysis(scenario, probeId, outcomeId) {
  const result = readEvidence(scenario, probeId, outcomeId);
  if (result.error) return result;

  const before = forecast(scenario);
  const observation = result.evidence.observation;
  const analysis = observation ? forecast(scenario, result.caseIds, result.delay, result.cost) : before;
  const probes = result.rankedProbes.map(({ outcomes, ...probe }) => ({
    ...probe,
    outcomes: outcomes.map(({ id, label, probability, bits, caseIds }) => {
      const isSelected = probe.id === observation?.probeId && id === observation.id;
      const branch = isSelected ? analysis : probability > 0 ? forecast(scenario, caseIds, probe.delay, probe.cost) : null;
      return { id, label, probability, bits, ...forecastSummary(branch) };
    })
  }));
  const decisionScenario = {
    ...analysis.scenario,
    hypotheses: (scenario.hypotheses ?? []).map(({ id, label, prior }) => ({ id, label, prior })),
    probes
  };
  return {
    ...analysis,
    scenario: decisionScenario,
    beforeProbe: forecastSummary(before),
    evidence: result.evidence,
    tenantExposure: tenantExposure(scenario, analysis)
  };
}

async function readDispatchRequest(request) {
  let raw = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4096) return null;
  }
  try {
    const body = JSON.parse(raw);
    return body && typeof body.plan === 'string' && Number.isInteger(body.minute) &&
      (body.probe == null || typeof body.probe === 'string') &&
      (body.outcome == null || typeof body.outcome === 'string') ? body : null;
  } catch {
    return null;
  }
}

export function createAppServer(available = scenarios, receiptDir = resolve('.relay', 'dispatches')) {
  const byId = new Map(available.map(item => [item.id, item]));
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(request.url, 'http://localhost');
      const route = url.pathname.match(/^\/api\/scenarios\/([^/]+)(\/(?:handoff|dispatch))?$/);
      let scenario;
      try {
        scenario = route ? byId.get(decodeURIComponent(route[1])) : null;
      } catch {
        return json(response, 400, { error: 'Scenario ID is malformed.' });
      }
      const dispatch = route?.[2] === '/dispatch';
      const allowed = dispatch ? ['POST'] : ['GET', 'HEAD'];
      if (!allowed.includes(request.method)) {
        response.setHeader('Allow', allowed.join(', '));
        return json(response, 405, { error: 'This route does not accept that request method.' });
      }
      if (dispatch) {
        if (!scenario) return json(response, 404, { error: 'Scenario not found.' });
        if (request.headers['content-type']?.split(';')[0] !== 'application/json' ||
            (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)) {
          return json(response, 403, { error: 'Open the console to dispatch a simulated response.' });
        }
        const body = await readDispatchRequest(request);
        if (!body || body.minute < 0 || body.minute > scenario.horizon) {
          return json(response, 400, { error: 'Choose a plan and minute inside this replay.' });
        }
        const analysis = scenarioAnalysis(scenario, body.probe, body.outcome);
        if (analysis.error) return json(response, analysis.status, { error: analysis.error });
        const option = analysis.options.find(item => item.id === body.plan && item.actionIds.length);
        if (!option) return json(response, 404, { error: 'Choose an available response with at least one action.' });

        const id = `AR-${randomUUID()}`;
        const text = createBrief(analysis.scenario, analysis, option, body.minute);
        const receipt = {
          id, createdAt: new Date().toISOString(), scenario: scenario.id, plan: option.id, minute: body.minute,
          probe: analysis.evidence.observation?.probeId ?? null,
          outcome: analysis.evidence.observation?.id ?? null,
          text
        };
        await mkdir(receiptDir, { recursive: true, mode: 0o700 });
        await writeFile(join(receiptDir, `${id}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        return json(response, 201, { id, text });
      }
      const asset = assets.get(url.pathname);
      if (asset) {
        const [name, contentType] = asset;
        const body = await readFile(new URL(`./public/${name}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
        return response.end(request.method === 'HEAD' ? undefined : body);
      }
      if (url.pathname === '/api/scenarios') {
        return json(response, 200, { scenarios: available.map(({ id, name, description, unit }) => ({ id, name, description, unit })) });
      }
      if (url.pathname === '/api/disturbance') return json(response, 200, disturbanceTest());
      if (url.pathname === '/api/phase-check') return json(response, 200, phaseCheck());
      if (!scenario) return json(response, 404, { error: 'Scenario or route not found.' });
      const analysis = scenarioAnalysis(scenario, url.searchParams.get('probe'), url.searchParams.get('outcome'));
      if (analysis.error) return json(response, analysis.status, { error: analysis.error });
      if (!route[2]) return json(response, 200, analysis);

      const option = analysis.options.find(item => item.id === (url.searchParams.get('plan') ?? analysis.recommendedId));
      const minute = Number(url.searchParams.get('minute') ?? 0);
      if (!option) return json(response, 404, { error: 'Choose a response from this forecast.' });
      if (!Number.isInteger(minute) || minute < 0 || minute > scenario.horizon) {
        return json(response, 400, { error: 'Choose a minute inside the replay.' });
      }
      return json(response, 200, { text: createBrief(analysis.scenario, analysis, option, minute) });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'Unable to load this forecast.' });
      else response.end();
    }
  });
}

async function loadSponsorScenarios(folder) {
  const { loadEogScenarios } = await import('./lib/eog.mjs');
  const [network, ops, telemetry] = await Promise.all(
    ['network.json', 'ops.json', 'telemetry.csv'].map(name => readFile(resolve(folder, name), 'utf8'))
  );
  const imported = loadEogScenarios({ network: JSON.parse(network), ops: JSON.parse(ops), telemetry });
  console.log(`EOG import: ${imported.length} scenario${imported.length === 1 ? '' : 's'} from ${resolve(folder)}`);
  return imported;
}

function lanAddresses() {
  try {
    const addresses = Object.values(networkInterfaces()).flat().filter(address =>
      address && !address.internal && (address.family === 'IPv4' || address.family === 4)
    ).map(address => address.address);
    return [...new Set(addresses)];
  } catch {
    return [];
  }
}

async function start() {
  const { values } = parseArgs({ options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '2026' },
    eog: { type: 'string' },
    help: { type: 'boolean' }
  }});
  if (values.help) {
    console.log('npm start -- [--port 2026] [--host 127.0.0.1] [--eog path/to/dataset]');
    return;
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535.');
  const imported = values.eog ? await loadSponsorScenarios(values.eog) : [];
  const server = createAppServer([...imported, ...scenarios]);
  server.on('error', error => { console.error(`Could not start Avon Relay. ${error.message}`); process.exitCode = 1; });
  server.listen(port, values.host, () => {
    const host = values.host === '0.0.0.0' ? '127.0.0.1' : values.host.includes(':') ? `[${values.host}]` : values.host;
    console.log(`Avon Relay · http://${host}:${port}`);
    if (values.host === '0.0.0.0') {
      const addresses = lanAddresses();
      for (const address of addresses) console.log(`Wi-Fi / LAN · http://${address}:${port}`);
      if (!addresses.length) console.log(`Wi-Fi / LAN · use this computer’s IPv4 address and port ${port}.`);
    }
    console.log('Press Ctrl+C to stop.');
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
