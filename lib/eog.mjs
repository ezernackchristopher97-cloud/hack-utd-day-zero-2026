const SAMPLE_SECONDS = 300;
const BARRELS_PER_MINUTE = 1 / 1440;
const MINUTES_PER_HOUR = 60;
const HEADROOM_BBL = 0.1;

const utc = (seconds) => new Date(seconds * 1000).toISOString();
const usd = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);
const round = (value, digits = 2) => Number(value.toFixed(digits));
const show = (value, unit) => Number.isFinite(value) ? `${round(value)} ${unit}` : 'No reading';

function field(value, name, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new Error(`Invalid EOG ${name}.`);
  return value;
}

function id(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) {
    throw new Error(`Invalid EOG ${name}.`);
  }
  return value;
}

function readNetwork(network, ops) {
  if (!Array.isArray(network?.systems) || network.systems.length === 0) {
    throw new Error('EOG network.json needs a systems array.');
  }
  const limits = network.defaults?.tank_limits_pct;
  const warning = field(limits?.warning, 'warning limit', 1);
  const shutdown = field(limits?.shutdown, 'shutdown limit', warning);
  if (shutdown > 100) throw new Error('EOG shutdown percentage exceeds 100.');
  const oil = field(ops?.prices?.oil_per_bbl, 'oil price');
  const gas = field(ops?.prices?.gas_per_mcf, 'gas price');
  const repair = MINUTES_PER_HOUR * field(ops?.expected_repair_hours?.pump_failure, 'pump repair time', 0.1);
  const tripVolume = field(ops?.emergency_trucking?.truck_capacity_bbl, 'truck capacity', 0.1);
  const tripCost = field(ops?.emergency_trucking?.cost_per_trip, 'truck cost');
  const seen = new Set();
  function unique(value, name) {
    const key = id(value, name);
    if (seen.has(key)) throw new Error(`Duplicate EOG asset: ${key}.`);
    seen.add(key);
    return key;
  }
  return network.systems.flatMap((system) => {
    const systemId = unique(system.id, 'system ID');
    const fleet = ops.systems?.[systemId];
    const fleetSize = field(fleet?.emergency_fleet_size, `${systemId} fleet size`);
    if (!Number.isInteger(fleetSize)) throw new Error(`Invalid EOG ${systemId} fleet size.`);
    const disposal = unique(system.disposal_site?.id, 'disposal site ID');
    if (!Array.isArray(system.facilities) || system.facilities.length === 0) {
      throw new Error(`EOG ${systemId} needs a facilities array.`);
    }
    return system.facilities.map((facility) => {
      const facilityId = unique(facility.id, 'facility ID');
      const transport = fleet.facilities?.[facilityId];
      if (!Array.isArray(facility.wells) || facility.wells.length === 0 || facility.wells.length > 10) {
        throw new Error(`EOG ${facilityId} needs 1 to 10 wells.`);
      }
      return {
        systemId, facilityId, disposal, warning, shutdown, repair, tripVolume, tripCost, fleetSize,
        pressureBaseline: Number.isFinite(system.disposal_site.pressure_psi)
          ? system.disposal_site.pressure_psi + 50 : null,
        tankId: unique(facility.tank?.id, 'tank ID'),
        pumpId: unique(facility.pump?.id, 'pump ID'),
        pipeId: unique(facility.pipeline?.id, 'pipeline ID'),
        capacity: field(facility.tank?.capacity_bbl, 'tank capacity', 0.1),
        pumpRating: field(facility.pump?.max_flow_bpd, 'pump rating', 0.1),
        response: field(transport?.response_min, 'truck arrival time'),
        cycle: field(transport?.cycle_min, 'truck round trip time', 1),
        wells: facility.wells.map((well) => ({
          id: unique(well.id, 'well ID'),
          rate: field(well.baseline_water_bpd, 'well water rate') * BARRELS_PER_MINUTE,
          cost: (
            field(well.oil_bpd, 'well oil rate') * oil + field(well.gas_mcfd, 'well gas rate') * gas
          ) * BARRELS_PER_MINUTE,
        })),
      };
    });
  });
}

function readTelemetry(csv, facilities) {
  if (typeof csv !== 'string') throw new Error('EOG telemetry.csv needs CSV text.');
  const required = new Map();
  for (const item of facilities) {
    required.set(item.facilityId, new Set(['inflow_bpd']));
    required.set(item.tankId, new Set(['level_pct']));
    required.set(item.pumpId, new Set(['status', 'flow_bpd', 'discharge_psi']));
    required.set(item.pipeId, new Set(['receive_flow_bpd', 'pressure_psi']));
  }

  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines[0].split(',').map((entry) => entry.trim().replace(/^"|"$/g, ''));
  const indices = ['ts_unix', 'asset_id', 'metric', 'value'].map((column) => header.indexOf(column));
  if (indices.includes(-1)) throw new Error('EOG telemetry.csv needs ts_unix, asset_id, metric and value columns.');

  const readings = new Map();
  let now = -Infinity;
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const row = lines[i].split(',');
    if (row.length !== header.length) throw new Error(`Invalid EOG telemetry row ${i + 1}.`);
    const [ts, asset, metric, value] = indices.map((index) => row[index].trim().replace(/^"|"$/g, ''));
    const time = Number(ts);
    if (!ts || !Number.isInteger(time) || time <= 0 || time >= 8.64e12) {
      throw new Error(`Invalid EOG timestamp on row ${i + 1}.`);
    }
    now = Math.max(now, time);
    if (!required.get(asset)?.has(metric)) continue;
    if (!value || !Number.isFinite(Number(value))) throw new Error(`Invalid EOG reading on row ${i + 1}.`);
    if (!readings.has(asset)) readings.set(asset, new Map());
    const series = readings.get(asset);
    if (!series.has(time)) series.set(time, {});
    const sample = series.get(time);
    if (Object.hasOwn(sample, metric)) throw new Error(`Duplicate EOG reading on row ${i + 1}.`);
    sample[metric] = Number(value);
  }
  if (!Number.isFinite(now)) throw new Error('EOG telemetry.csv is empty.');
  return { readings, now };
}

function getSample(item, readings, time) {
  return {
    time,
    level: readings.get(item.tankId)?.get(time)?.level_pct,
    inflow: readings.get(item.facilityId)?.get(time)?.inflow_bpd,
    status: readings.get(item.pumpId)?.get(time)?.status,
    flow: readings.get(item.pumpId)?.get(time)?.flow_bpd,
    received: readings.get(item.pipeId)?.get(time)?.receive_flow_bpd,
    discharge: readings.get(item.pumpId)?.get(time)?.discharge_psi,
    pressure: readings.get(item.pipeId)?.get(time)?.pressure_psi,
  };
}

function findAnomalies(item, readings, now) {
  const pumpReadings = readings.get(item.pumpId);
  if (!pumpReadings) throw new Error(`EOG telemetry has no pump readings for ${item.pumpId}.`);
  const samples = [...pumpReadings.keys()].sort((a, b) => a - b)
    .map((time) => getSample(item, readings, time));
  const events = [];
  const signs = {
    pipeline_leak: { recent: [], active: null, normal: 0 },
    pump_degradation: { recent: [], active: null, normal: 0 },
  };
  let failure = null;
  let previous = null;

  function finish(state, time) {
    if (state.active) {
      events.push({ ...state.active, end: time });
      state.active = null;
    }
    state.recent = [];
    state.normal = 0;
  }

  for (const sample of samples) {
    if (previous && sample.time - previous.time !== SAMPLE_SECONDS) {
      if (failure) {
        events.push({ ...failure, end: null, observedThrough: previous.time });
        failure = null;
      }
      for (const state of Object.values(signs)) finish(state, previous.time);
    }
    previous = sample;
    if (sample.status === 2) {
      if (!failure) {
        failure = { kind: 'pump_failure', start: sample.time };
        finish(signs.pump_degradation, sample.time);
      }
      continue;
    }
    if (failure && Number.isFinite(sample.status)) {
      events.push({ ...failure, end: sample.time });
      failure = null;
    }
    if (sample.status !== 1 || !Number.isFinite(sample.flow) || sample.flow <= 0) continue;

    const ratios = {
      pipeline_leak: Number.isFinite(sample.received) ? (sample.flow - sample.received) / sample.flow : null,
      pump_degradation: 1 - sample.flow / item.pumpRating,
    };
    for (const [kind, value] of Object.entries(ratios)) {
      if (value === null) continue;
      const state = signs[kind];
      const isLeak = kind === 'pipeline_leak';
      const pressureDrop = isLeak && item.pressureBaseline !== null && Number.isFinite(sample.pressure)
        ? item.pressureBaseline - sample.pressure : 0;
      const elevated = value >= (isLeak ? 0.035 : 0.025) || (isLeak && value >= 0.01 && pressureDrop >= 12);
      const normal = value < 0.015 && pressureDrop < 8;
      state.recent.push({ time: sample.time, elevated });
      if (state.recent.length > 3) state.recent.shift();
      if (!state.active && state.recent.length === 3 && state.recent.every((point) => point.elevated)) {
        state.active = { kind, start: state.recent[0].time, detected: sample.time, value };
      }
      if (!state.active) continue;
      if (!normal) {
        state.active.value = value;
        state.active.lastEvidence = sample.time;
      }
      state.normal = normal ? state.normal + 1 : 0;
      if (state.normal === 3) finish(state, state.recent[0].time);
    }
  }

  const last = samples.at(-1);
  if (last.time !== now || ![last.level, last.inflow, last.status].every(Number.isFinite)) {
    throw new Error(`Incomplete EOG latest readings for ${item.facilityId}.`);
  }
  if (last.level < 0 || last.level > 100 || ![0, 1, 2].includes(last.status) || last.inflow < 0) {
    throw new Error(`Invalid EOG latest readings for ${item.facilityId}.`);
  }
  if (failure) events.push({ ...failure, end: null });
  for (const state of Object.values(signs)) {
    if (state.active) events.push({ ...state.active, end: null });
  }
  return { ...item, last, events };
}

function attachForecast(item, event, sample) {
  const initial = sample.level * item.capacity / 100;
  const limit = item.shutdown * item.capacity / 100;
  const totalRate = item.wells.reduce((sum, well) => sum + well.rate, 0);
  const revenuePerMinute = item.wells.reduce((sum, well) => sum + well.cost, 0);
  const horizon = Math.max(1, Math.ceil(item.repair - (sample.time - event.start) / 60));
  const tripped = initial >= limit;
  const rate = tripped ? 0 : sample.inflow * BARRELS_PER_MINUTE;
  const countdown = tripped ? 0 : rate > 0 ? (limit - initial) / rate : Infinity;
  return { ...item, event, sample, initial, limit, revenuePerMinute, totalRate, rate, countdown, horizon, tripped };
}

function simulateForecast(forecast, arrivals, shutRate, shutStart) {
  let time = 0;
  let volume = forecast.initial;
  let used = 0;
  for (const minute of [...arrivals, forecast.horizon]) {
    const available = forecast.rate * (minute - time);
    const avoided = shutRate * Math.max(0, minute - Math.max(time, shutStart));
    volume += available - avoided;
    if (volume >= forecast.limit) return false;
    if (used < arrivals.length) {
      if (volume < forecast.tripVolume) return false;
      volume -= forecast.tripVolume;
      used += 1;
    }
    time = minute;
  }
  return true;
}

function alternativePlans(forecast, maximumTrucks) {
  const automaticCost = Math.max(0, forecast.horizon - forecast.countdown) * forecast.revenuePerMinute;
  const best = new Map([[0, {
    trucks: 0, trips: [], wells: [], start: 0, cost: automaticCost,
    label: forecast.tripped ? 'Wait for repair' : forecast.countdown <= forecast.horizon
      ? 'Accept automatic shut-in' : 'Wait for repair',
  }]]);
  if (forecast.tripped || forecast.countdown > forecast.horizon) return [...best.values()];

  const maxTrips = Math.min(20, Math.max(0, Math.ceil((forecast.horizon - forecast.response) / forecast.cycle)));
  const wellGroups = [];
  for (let mask = 1; mask < 2 ** forecast.wells.length; mask += 1) {
    const wells = forecast.wells.filter((_, index) => mask & (1 << index));
    wellGroups.push({
      wells,
      rate: forecast.totalRate > 0
        ? forecast.rate * wells.reduce((sum, well) => sum + well.rate, 0) / forecast.totalRate : 0,
      cost: wells.reduce((sum, well) => sum + well.cost, 0),
    });
  }

  function addPlan(trips, trucks, group, start) {
    const cost = trips.length * forecast.tripCost + (group?.cost ?? 0) * (forecast.horizon - start);
    if (cost >= (best.get(trucks)?.cost ?? Infinity)) return;
    const wells = group?.wells ?? [];
    const truckLabel = trips.length ? `${trips.length} truck trip${trips.length === 1 ? '' : 's'}` : '';
    const wellLabel = wells.length ? `shut in ${wells.map((well) => well.id).join(', ')} at +${start} min` : '';
    const label = [truckLabel, wellLabel].filter(Boolean).join(' + ');
    best.set(trucks, { trucks, trips, wells, start, cost, label, shutRate: group?.rate ?? 0 });
  }

  function testSchedule(trips, trucks) {
    const arrivals = [...trips].sort((a, b) => a - b);
    if (simulateForecast(forecast, arrivals, 0, 0)) {
      if (trucks > 0) addPlan(arrivals, trucks, null, 0);
      return;
    }
    const checkpoints = [...arrivals, forecast.horizon];
    for (const group of wellGroups) {
      if (group.rate <= 0) continue;
      let start = forecast.horizon;
      for (const [index, time] of checkpoints.entries()) {
        const excess = forecast.initial + forecast.rate * time
          - forecast.tripVolume * index - forecast.limit + HEADROOM_BBL;
        if (excess > 0) start = Math.min(start, Math.floor(time - excess / group.rate));
      }
      if (start >= 0 && simulateForecast(forecast, arrivals, group.rate, start)) {
        addPlan(arrivals, trucks, group, start);
      }
    }
  }

  testSchedule([], 0);
  function assignTrips(trips, trucks, remaining, mostTrips) {
    if (remaining === 0) {
      testSchedule(trips, trucks);
      return;
    }
    for (let count = 1; count <= mostTrips; count += 1) {
      const next = Array.from({ length: count }, (_, index) => forecast.response + forecast.cycle * index);
      assignTrips([...trips, ...next], trucks, remaining - 1, count);
    }
  }
  for (let trucks = 1; trucks <= Math.min(forecast.fleetSize, 5); trucks += 1) {
    assignTrips([], trucks, trucks, maxTrips);
  }
  return [...best.values()];
}

function allocateFleet(forecasts) {
  const groups = new Map();
  for (const forecast of forecasts) {
    if (!groups.has(forecast.systemId)) groups.set(forecast.systemId, []);
    groups.get(forecast.systemId).push(forecast);
  }

  for (const group of groups.values()) {
    const size = group[0].fleetSize;
    let states = new Map([[0, { cost: 0, picks: [] }]]);
    for (const forecast of group) {
      forecast.plans = alternativePlans(forecast, size);
      const next = new Map();
      for (const [used, state] of states) {
        for (const plan of forecast.plans) {
          const trucks = used + plan.trucks;
          const cost = state.cost + plan.cost;
          if (trucks <= size && cost < (next.get(trucks)?.cost ?? Infinity)) {
            next.set(trucks, { cost, picks: [...state.picks, plan] });
          }
        }
      }
      states = next;
    }
    const best = [...states.values()].sort((a, b) => a.cost - b.cost)[0];
    group.forEach((forecast, index) => {
      forecast.sharedPlan = best.picks[index];
      forecast.sharedTotal = best.cost;
      forecast.faultsInSystem = group.length;
      forecast.spareTrucks = size - best.picks.reduce((sum, plan) => sum + plan.trucks, 0);
    });
  }
}

const eventLabels = {
  pump_failure: 'Pump failure',
  pipeline_leak: 'Possible pipeline leak',
  pump_degradation: 'Possible pump wear',
  normal: 'Monitoring',
};

function networkView(item, activeKind, limit) {
  const node = (id, label, role, extra = {}) => ({ id, label, role, ...extra });
  const edge = (from, to, delay) => ({ from, to, ...(delay === undefined ? {} : { delay }) });
  const stopId = `${item.facilityId}-production`;
  const flagged = (kind) => activeKind === kind ? { at: 0 } : {};
  return {
    nodes: [
      ...item.wells.map((well) => node(well.id, well.id, 'source')),
      node(item.tankId, item.tankId, 'buffer', { threshold: limit }),
      node(item.pumpId, item.pumpId, 'transfer', {
        ...flagged('pump_failure'), ...flagged('pump_degradation'),
      }),
      node(item.pipeId, item.pipeId, 'transfer', flagged('pipeline_leak')),
      node(item.disposal, item.disposal, 'service'),
      node(stopId, 'Production stops', 'impact'),
    ],
    edges: [
      ...item.wells.map((well) => edge(well.id, item.tankId)),
      edge(item.tankId, item.pumpId),
      edge(item.pumpId, item.pipeId),
      edge(item.pipeId, item.disposal),
      edge(item.tankId, stopId, 0),
    ],
  };
}

function planAction(item, plan, index) {
  if (!plan.trips.length && !plan.wells.length) return null;
  const effects = plan.trips.map((delay) => ({
    delay: Math.ceil(delay), delta: 0, quantity: -item.tripVolume,
  }));
  if (plan.wells.length) effects.push({ delay: plan.start, delta: -plan.shutRate });
  const first = Math.min(...effects.map(({ delay }) => delay));
  return {
    id: `response-${index}`,
    label: plan.label,
    description: plan.trips.length
      ? `Haul ${item.tripVolume} bbl each at +${plan.trips.join(', +')} min. Cost includes any lost production.`
      : 'The listed wells stay off until pump repair. Cost is estimated lost oil and gas sales.',
    group: 'facility-response',
    delay: first,
    cost: plan.cost,
    delta: 0,
    effects: effects.map((effect) => ({ ...effect, delay: effect.delay - first })),
  };
}

function scenarioFor(item, event, sample, forecast = null, replay = false) {
  const kind = event?.kind ?? 'normal';
  const title = eventLabels[kind];
  const awaitingReading = event && !forecast && event.lastEvidence !== sample.time;
  const initial = sample.level * item.capacity / 100;
  const limit = item.shutdown * item.capacity / 100;
  const shared = forecast?.sharedPlan;
  const actions = forecast && shared ? forecast.plans
    .filter((plan) => plan.trucks <= shared.trucks + forecast.spareTrucks)
    .map((plan, index) => planAction(item, plan, index)).filter(Boolean) : [];
  const observations = [
    { label: 'Recording time', value: utc(sample.time) },
    { label: 'Tank fill / automatic stop', value: `${show(sample.level, '%')} / ${item.shutdown}%` },
    { label: 'Water entering the tank', value: show(sample.inflow, 'bbl/day') },
    { label: 'Pump discharge / pipeline receipt', value: `${show(sample.flow, 'bbl/day')} / ${show(sample.received, 'bbl/day')}` },
    { label: 'Pump / pipeline pressure', value: `${show(sample.discharge, 'psi')} / ${show(sample.pressure, 'psi')}` },
  ];
  let description = 'No qualifying failure, leak or wear signal in the latest readings.';
  if (forecast) {
    const risk = forecast.tripped ? 'The automatic stop has already occurred.'
      : forecast.countdown > forecast.horizon ? 'Repair is expected before the tank reaches the stop level.'
      : `The tank reaches automatic shut-in in about ${Math.round(forecast.countdown)} min at the current inflow.`;
    const automaticLoss = Math.max(0, forecast.horizon - forecast.countdown) * forecast.revenuePerMinute;
    description = `${replay ? 'Recorded replay. ' : ''}${risk} ${shared.label}. Fleet plan: ${usd(forecast.sharedTotal)} across ${forecast.faultsInSystem} pump failure${forecast.faultsInSystem === 1 ? '' : 's'}.`;
    observations.push(
      { label: 'Pump fault first reported', value: utc(event.start) },
      { label: 'Expected repair remaining', value: show(forecast.horizon, 'min') },
      { label: 'Projected automatic shut-in loss', value: usd(automaticLoss) },
      { label: 'Shared fleet response here', value: `${shared.label} · ${usd(shared.cost)}` },
      { label: 'Dispatch rules', value: `${item.fleetSize} trucks in ${item.systemId}. Trucks stay with their assigned facility. Wells in a plan stop together.` },
    );
  } else if (event) {
    const evidence = kind === 'pipeline_leak' ? 'pump discharge exceeds the pipeline receipt'
      : 'running pump flow is below the rated flow';
    const assetId = kind === 'pipeline_leak' ? item.pipeId : item.pumpId;
    description = `${replay ? 'Recorded replay. ' : ''}Send a field inspector to ${assetId}. The ${evidence} in repeated running samples.`;
    if (awaitingReading) description += ' Awaiting a new running sample to confirm that the signal persists.';
    observations.push(
      { label: 'First qualifying reading', value: utc(event.start) },
      { label: 'Last qualifying reading', value: utc(event.lastEvidence) },
      { label: 'Most recent qualifying deficit', value: show(event.value * 100, '%') },
    );
  }
  return {
    id: `eog-${item.facilityId}-${kind}${replay ? `-replay-${event.start}` : ''}`,
    name: `${item.facilityId} · ${title}${replay ? ' replay' : ''}`,
    description, unit: 'bbl', horizon: forecast?.horizon ?? 120, initial, limit,
    capacity: item.capacity, rate: forecast?.rate ?? 0,
    cases: [{ id: 'nominal', label: forecast ? 'Measured inflow held constant' : 'Latest measured level', delta: 0, weight: 1 }],
    actions, ...networkView(item, kind, limit), observations, hypotheses: [], probes: [],
    eog: {
      category: kind, facilityId: item.facilityId, systemId: item.systemId,
      asOf: utc(sample.time), replay,
      status: replay ? 'replay' : awaitingReading ? 'unconfirmed' : event ? 'ongoing' : 'monitoring',
      onset: event ? utc(event.start) : null,
      countdownMinutes: Number.isFinite(forecast?.countdown) ? forecast.countdown : null,
      fleetSize: item.fleetSize,
      assignedTrucks: shared?.trucks ?? 0,
      arrivals: shared?.trips ?? [],
      wellIds: shared?.wells.map((well) => well.id) ?? [],
      wellStart: shared?.wells.length ? shared.start : null,
      expectedCost: shared?.cost ?? null,
      sharedTotal: forecast?.sharedTotal ?? null,
      nextStep: event && !forecast ? 'Request field inspection' : shared?.label ?? 'Monitor',
    },
  };
}

export function loadEogScenarios({ network, ops, telemetry }) {
  const facilities = readNetwork(network, ops);
  const { readings, now } = readTelemetry(telemetry, facilities);
  const current = facilities.map((item) => findAnomalies(item, readings, now));
  const ongoing = current.flatMap((item) => item.events
    .filter((event) => event.end === null && !event.observedThrough)
    .map((event) => ({ item, event })));
  const forecasts = ongoing
    .filter(({ event }) => event.kind === 'pump_failure')
    .map(({ item, event }) => attachForecast(item, event, item.last))
    .sort((a, b) => a.countdown - b.countdown || b.revenuePerMinute - a.revenuePerMinute);
  allocateFleet(forecasts);
  const scenarios = forecasts.map((forecast) => scenarioFor(forecast, forecast.event, forecast.sample, forecast));
  for (const { item, event } of ongoing.filter(({ event }) => event.kind !== 'pump_failure')) {
    scenarios.push(scenarioFor(item, event, item.last));
  }
  if (scenarios.length > 0) return scenarios;

  const replays = current.flatMap((item) => item.events
    .filter((event) => event.end !== null)
    .map((event) => ({ item, event })))
    .sort((a, b) => b.event.start - a.event.start);
  for (const { item, event } of replays) {
    const sample = getSample(item, readings, event.detected ?? event.start);
    if (!Number.isFinite(sample.level) || !Number.isFinite(sample.inflow)) continue;
    if (event.kind !== 'pump_failure') {
      const value = event.kind === 'pipeline_leak'
        ? (sample.flow - sample.received) / sample.flow : 1 - sample.flow / item.pumpRating;
      scenarios.push(scenarioFor(item, { ...event, value, lastEvidence: sample.time }, sample, null, true));
      continue;
    }
    const forecast = attachForecast(item, event, sample);
    allocateFleet([forecast]);
    scenarios.push(scenarioFor(item, event, sample, forecast, true));
  }
  return scenarios.length > 0 ? scenarios : current.map((item) => scenarioFor(item, null, item.last));
}
