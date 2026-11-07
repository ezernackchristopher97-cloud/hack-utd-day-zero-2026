import { assetRegister } from '../data/exchange/asset-register.mjs';
import { telemetryFeed } from '../data/exchange/telemetry-feed.mjs';
import { tenantObligations } from '../data/exchange/tenant-obligations.mjs';

const avon = {
  id: 'avon',
  name: 'Avon produced water',
  description: 'Transfer flow drops while a collection tank keeps filling. Protect the tank without shutting down the well pads.',
  unit: 'bbl',
  levelLabel: 'Tank inventory',
  limitLabel: 'Shutdown trigger',
  capacityLabel: 'Tank capacity',
  horizon: 45,
  initial: 799,
  limit: 875,
  capacity: 940,
  rate: 5,
  cases: [
    { id: 'low', label: 'Lower net inflow', delta: -1, weight: 0.25 },
    { id: 'nominal', label: 'Observed net inflow', delta: 0, weight: 0.5 },
    { id: 'high', label: 'Higher net inflow', delta: 1.5, weight: 0.25 },
  ],
  actions: [
    {
      id: 'throttle', label: 'Throttle North Pad', delay: 3, delta: -3, cost: 160, costPerMinute: 9,
      group: 'well-output',
      description: 'Reduce produced water entering the tank by 3 bbl/min. The pad keeps producing at a lower rate.',
    },
    {
      id: 'truck', label: 'Dispatch a vacuum truck', delay: 8, delta: -3.5, cost: 440, duration: 28,
      description: 'Send the available truck. It removes 98 bbl over 28 minutes after arrival.',
    },
    {
      id: 'reroute', label: 'Open the West Yard bypass', delay: 5, delta: -7.5, cost: 1720,
      description: 'Buy spare transfer capacity and send 7.5 bbl/min to the neighboring treatment yard.',
    },
    {
      id: 'shut-in', label: 'Shut in both pads', delay: 2, delta: -10, cost: 860, costPerMinute: 42,
      group: 'well-output',
      description: 'Stop production at both pads. Inflow falls by 10 bbl/min and both pads lose production.',
    },
  ],
  nodes: [
    { id: 'well', label: 'North and East well pads', role: 'Upstream supply' },
    { id: 'tank', label: 'Collection tank T-204', role: 'Rising inventory', at: 0 },
    { id: 'pump', label: 'Transfer pump P-14', role: 'Flow alarm', at: 0 },
    { id: 'reuse', label: 'Reuse treatment yard', role: 'Receiving plant' },
    { id: 'stop', label: 'Well interlock', role: 'Production shutdown', threshold: 875 },
    { id: 'containment', label: 'Tank containment', role: 'Overflow exposure', threshold: 940 },
  ],
  edges: [
    { from: 'well', to: 'tank' }, { from: 'tank', to: 'pump' }, { from: 'pump', to: 'reuse', delay: 2 },
    { from: 'tank', to: 'stop' }, { from: 'tank', to: 'containment' },
  ],
  observations: [
    { label: 'T-204 level gauge', value: '799 bbl and rising' },
    { label: 'Well header and treatment receipt', value: '14 bbl/min in · 9 bbl/min out, last confirmed' },
    { label: 'Transfer bank', value: 'Parallel stage remains online' },
    { label: 'P-14 flow transmitter', value: '32% below the shift baseline' },
  ],
  hypotheses: [
    { id: 'pump-fault', label: 'Transfer pump drive tripped', prior: 0.55, caseIds: ['nominal', 'high'] },
    { id: 'flow-channel', label: 'Flow channel stuck low', prior: 0.45, caseIds: ['low', 'nominal'] },
  ],
  probes: [
    {
      id: 'local-trip-contact', label: 'Check the local drive trip contact', delay: 1, cost: 12,
      description: 'Read the latched hardware trip contact at the drive panel. A stale flow channel cannot change this contact.',
      outcomes: [
        { id: 'tripped', label: 'Drive trip contact latched', likelihood: { 'pump-fault': 1, 'flow-channel': 0 } },
        { id: 'clear', label: 'Drive trip contact clear', likelihood: { 'pump-fault': 0, 'flow-channel': 1 } },
      ],
      demoOutcome: 'tripped',
    },
    {
      id: 'portable-flow', label: 'Check flow with a portable meter', delay: 4, cost: 28,
      description: 'Measure discharge at the pipe with a second instrument. The truck remains available while you wait.',
      outcomes: [
        { id: 'low', label: 'Independent flow is low', likelihood: { 'pump-fault': 0.9, 'flow-channel': 0.2 } },
        { id: 'normal', label: 'Independent flow is near baseline', likelihood: { 'pump-fault': 0.1, 'flow-channel': 0.8 } },
      ],
      demoOutcome: 'low',
    },
  ],
};

const cooling = {
  id: 'cooling',
  name: 'Avon data center',
  description: 'A cooling alarm and a warming rack row show up at shift change. Buy time before capacity drops.',
  unit: '°C',
  levelLabel: 'Rack inlet temperature',
  limitLabel: 'Load shed trigger',
  capacityLabel: 'Emergency temperature',
  horizon: 35,
  initial: 26,
  limit: 30,
  capacity: 33,
  rate: 0.28,
  cases: [
    { id: 'low', label: 'Lower heat load', delta: -0.07, weight: 0.25 },
    { id: 'nominal', label: 'Observed warming', delta: 0, weight: 0.5 },
    { id: 'high', label: 'Higher heat load', delta: 0.12, weight: 0.25 },
  ],
  actions: [
    {
      id: 'pause-jobs', label: 'Pause the batch queue', delay: 2, delta: -0.18, cost: 45, costPerMinute: 3,
      group: 'compute-load',
      description: 'Pause deferrable jobs while keeping interactive traffic on the row.',
    },
    {
      id: 'open-loop', label: 'Open the secondary loop', delay: 6, delta: -0.26, cost: 270, costPerMinute: 2,
      group: 'cooling-route',
      description: 'Bring spare cooling online and confirm flow before committing the incoming shift.',
    },
    {
      id: 'reserve', label: 'Start reserve cooling', delay: 4, delta: -0.47, cost: 1160, costPerMinute: 2,
      group: 'cooling-route',
      description: 'Start the contracted reserve plant for the affected row.',
    },
    {
      id: 'migrate', label: 'Migrate the row', delay: 7, delta: -0.47, cost: 1800,
      group: 'compute-load',
      description: 'Transfer the row workload to spare capacity at another site.',
    },
  ],
  nodes: [
    { id: 'loop', label: 'Primary cooling loop', role: 'Low flow alarm', at: 0 },
    { id: 'air', label: 'Air handler AH-07', role: 'Supplies row K' },
    { id: 'racks', label: 'Rack row K', role: 'Warming inlets', threshold: 28 },
    { id: 'batch', label: 'Batch queue', role: 'Deferrable workload' },
    { id: 'compute', label: 'Interactive service', role: 'Capacity reduced', threshold: 30 },
    { id: 'trip', label: 'Thermal interlock', role: 'Emergency trip', threshold: 33 },
  ],
  edges: [
    { from: 'loop', to: 'air', delay: 2 }, { from: 'air', to: 'racks' }, { from: 'batch', to: 'racks' },
    { from: 'racks', to: 'compute' }, { from: 'racks', to: 'trip' },
  ],
  observations: [
    { label: 'Row K inlet array', value: '26.0 °C and rising' },
    { label: 'Primary loop transmitter', value: '24% below target' },
    { label: 'Batch queue demand', value: '18% above the shift baseline' },
    { label: 'Shift handoff', value: 'Local pump reading pending' },
  ],
  hypotheses: [
    { id: 'flow-loss', label: 'Primary loop has lost flow', prior: 0.6, caseIds: ['nominal', 'high'] },
    { id: 'load-shift', label: 'Heat load rose and flow telemetry is stale', prior: 0.4, caseIds: ['low', 'nominal'] },
  ],
  probes: [
    {
      id: 'local-pressure', label: 'Read local differential pressure', delay: 1, cost: 8,
      description: 'Compare the local gauge against the normal pressure band for this pump speed.',
      outcomes: [
        { id: 'low', label: 'Local pressure is low', likelihood: { 'flow-loss': 0.93, 'load-shift': 0.12 } },
        { id: 'normal', label: 'Local pressure is normal', likelihood: { 'flow-loss': 0.07, 'load-shift': 0.88 } },
      ],
      demoOutcome: 'low',
    },
    {
      id: 'return-temperature', label: 'Cross-check return temperature', delay: 3, cost: 18,
      description: 'Compare a spot temperature with the rack heat load and the remote return sensor.',
      outcomes: [
        { id: 'high', label: 'Return temperature is elevated', likelihood: { 'flow-loss': 0.78, 'load-shift': 0.31 } },
        { id: 'normal', label: 'Return temperature is normal', likelihood: { 'flow-loss': 0.22, 'load-shift': 0.69 } },
      ],
      demoOutcome: 'high',
    },
  ],
};

const exchangeAssets = new Map(assetRegister.map(asset => [asset.id, asset]));
const exchangeReadings = telemetryFeed.filter(reading => reading.assetId === 'zone-lab' && reading.signal === 'Zone air');
const [firstReading] = exchangeReadings;
const latestReading = exchangeReadings.at(-1);
const warmingRate = (latestReading.value - firstReading.value) / (latestReading.minute - firstReading.minute);
const exchangeTenants = tenantObligations.map(({ assetId, ...tenant }) => ({ ...tenant, nodeId: assetId }));

const exchange = {
  id: 'exchange',
  name: 'Avon Exchange property',
  description: 'A chiller alarm puts three tenants on a shared cooling riser at risk. Trace the affected leases and compare response costs with projected exposure.',
  unit: '°C',
  levelLabel: 'North zone temperature',
  limitLabel: 'First lease threshold',
  capacityLabel: 'Emergency cooling trigger',
  horizon: 30,
  initial: latestReading.value,
  limit: Math.min(...exchangeTenants.map(tenant => exchangeAssets.get(tenant.nodeId).threshold)),
  capacity: 30.5,
  rate: Math.round(warmingRate * 100) / 100,
  cases: [
    { id: 'low', label: 'Lower occupancy heat', delta: -0.07, weight: 0.25 },
    { id: 'nominal', label: 'Observed warming', delta: 0, weight: 0.5 },
    { id: 'high', label: 'Higher occupancy heat', delta: 0.1, weight: 0.25 },
  ],
  actions: [
    {
      id: 'reduce-load', label: 'Reduce lower floor heat load', delay: 2, delta: -0.13, cost: 65, costPerMinute: 2,
      description: 'Pause scheduled equipment use and move nonessential work out of the shared cooling zone.',
    },
    {
      id: 'east-crossover', label: 'Open the East plant crossover', delay: 4, delta: -0.31, cost: 350, costPerMinute: 1,
      group: 'property-cooling',
      description: 'Route spare East plant capacity through the approved crossover to the North riser.',
    },
    {
      id: 'reserve-cooling', label: 'Start the reserve chiller', delay: 5, delta: -0.48, cost: 1500,
      group: 'property-cooling',
      description: 'Dispatch the onsite reserve crew and activate the building standby chiller.',
    },
  ],
  nodes: assetRegister.map(({ feeds, ...asset }) => asset),
  edges: assetRegister.flatMap(({ id, feeds }) => feeds.map(feed => ({ from: id, ...feed }))),
  observations: telemetryFeed.filter(reading => reading.minute === 0).map(reading => ({
    label: `${exchangeAssets.get(reading.assetId).label} · ${reading.signal}`,
    value: `${reading.value} ${reading.unit}${reading.note ? ` (${reading.note})` : ''}`,
    source: 'Telemetry feed joined to equipment register',
  })),
  tenants: exchangeTenants,
  hypotheses: [
    { id: 'plant-flow', label: 'North plant has lost chilled water flow', prior: 0.6, caseIds: ['nominal', 'high'] },
    { id: 'local-load', label: 'Tenant heat load rose and pressure telemetry is stale', prior: 0.4, caseIds: ['low', 'nominal'] },
  ],
  probes: [
    {
      id: 'valve-pressure', label: 'Read the riser pressure locally', delay: 1, cost: 10,
      description: 'Read the analog riser gauge and compare against the equipment register target.',
      outcomes: [
        { id: 'low', label: 'Local pressure is low', likelihood: { 'plant-flow': 0.94, 'local-load': 0.1 } },
        { id: 'normal', label: 'Local pressure is normal', likelihood: { 'plant-flow': 0.06, 'local-load': 0.9 } },
      ],
      demoOutcome: 'low',
    },
    {
      id: 'zone-audit', label: 'Check independent floor loads', delay: 4, cost: 26,
      description: 'Compare equipment and occupancy counts across the three tenant floors.',
      outcomes: [
        { id: 'normal', label: 'Floor loads are near baseline', likelihood: { 'plant-flow': 0.82, 'local-load': 0.28 } },
        { id: 'high', label: 'Floor loads are elevated', likelihood: { 'plant-flow': 0.18, 'local-load': 0.72 } },
      ],
      demoOutcome: 'normal',
    },
  ],
};

export const scenarios = [avon, cooling, exchange];
