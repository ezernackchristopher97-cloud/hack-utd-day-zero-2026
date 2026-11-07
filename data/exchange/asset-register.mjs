export const assetRegister = [
  { id: 'plant-n', label: 'North chiller plant', role: 'Low flow alarm', at: 0, feeds: [{ to: 'riser-n', delay: 2 }] },
  { id: 'plant-e', label: 'East chiller plant', role: 'Spare cooling capacity', feeds: [{ to: 'riser-n' }] },
  { id: 'riser-n', label: 'North riser', role: 'Common cooling dependency', feeds: [{ to: 'zone-lab' }, { to: 'zone-market' }, { to: 'zone-archive' }] },
  { id: 'zone-lab', label: 'Research suite air handler', role: 'Temperature controlled workspace', threshold: 26.5, feeds: [] },
  { id: 'zone-market', label: 'Market hall air handler', role: 'Occupied retail floor', threshold: 28, feeds: [] },
  { id: 'zone-archive', label: 'Archive room air handler', role: 'Tenant storage space', threshold: 29, feeds: [] },
];
