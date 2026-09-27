let token = '';
let timer;
const sections = [
  'raw',
  'capture',
  'extracted',
  'classification',
  'queries',
  'providers',
  'results',
  'storage',
  'discarded',
  'resources',
  'timings',
  'logs'
];
async function refresh() {
  try {
    const r = await fetch('/runs', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const runs = await r.json();
    document.getElementById('status').textContent =
      `${runs.length}개 세션 · ${new Date().toLocaleTimeString()}`;
    const root = document.getElementById('runs');
    const open = new Set(
      [...root.querySelectorAll('details[open]')].map(d => d.dataset.key)
    );
    root.replaceChildren();
    for (const run of runs.reverse()) {
      const el = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = `${run.session_id} — ${run.status}`;
      el.append(title);
      for (const key of sections) {
        const d = document.createElement('details');
        d.dataset.key = `${run.session_id}:${key}`;
        d.open = open.has(d.dataset.key);
        const summary = document.createElement('summary');
        summary.textContent = key.toUpperCase();
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(run[key], null, 2);
        d.append(summary, pre);
        el.append(d);
      }
      root.append(el);
    }
  } catch (e) {
    document.getElementById('status').textContent = String(e);
  }
}
document.getElementById('connect').onclick = () => {
  token = document.getElementById('token').value;
  clearInterval(timer);
  refresh();
  timer = setInterval(refresh, 1000);
};
document.getElementById('erase').onclick = async () => {
  await fetch('/runs', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  await refresh();
};
