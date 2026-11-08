const panel = document.getElementById('phase-check');
const status = document.getElementById('phase-status');
const controls = document.getElementById('phase-test-controls');
const metrics = document.getElementById('phase-metrics');
const read = document.getElementById('phase-read');
const reset = document.getElementById('phase-reset');
const list = document.getElementById('phase-states');
let data;
let loading = false;
let count = 0;

function render() {
  const sample = data.states.find(state => state.id === '010');
  const observed = sample.readout.slice(0, count);
  const remaining = data.states.filter(state => observed.every((value, index) => state.readout[index] === value));
  const readings = sample.phase.slice(0, count).map(bit => bit ? 'π' : '0').join(', ');
  const detail = count ? `Phase readings ${readings}.` : 'No phase readings yet.';
  status.textContent = `${remaining.length} possible ${remaining.length === 1 ? 'state' : 'states'}. ${detail}`;
  read.disabled = count === sample.phase.length;
  read.textContent = read.disabled ? 'All phases read' : `Read phase ${count + 1}`;
  list.replaceChildren(...remaining.map(({ phase }) => {
    const item = document.createElement('li');
    item.textContent = `(${phase.map(bit => bit ? 'π' : '0').join(', ')})`;
    return item;
  }));
}

async function load() {
  if (!panel.open || data || loading) return;
  loading = true;
  status.textContent = 'Loading phase states…';
  try {
    const response = await fetch('./api/phase-check');
    if (!response.ok) throw new Error('Unable to load phase states.');
    data = await response.json();
    for (const [label, value] of [['Entropy', `${data.entropy.toFixed(6)} nats`], ['Memory', data.memory.toFixed(6)]]) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      metrics.append(term, description);
    }
    controls.hidden = false;
    render();
  } catch {
    status.textContent = 'Phase states could not load. Close and reopen this section to try again.';
  } finally {
    loading = false;
  }
}

document.getElementById('phase-link').addEventListener('click', () => { panel.open = true; });
panel.addEventListener('toggle', load);
read.addEventListener('click', () => { count += 1; render(); });
reset.addEventListener('click', () => { count = 0; render(); });
load();
