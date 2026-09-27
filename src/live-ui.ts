const el = (id: string) => document.getElementById(id)!;
let token = sessionStorage.getItem('liveToken') || '';
(el('token') as HTMLInputElement).value = token;
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function show(state: any) {
  el('connection').textContent = '프로그램 연결됨';
  el('status').textContent = state.status;
  el('counts').textContent =
    `· 분석 ${state.frames}회 · 제외 ${state.skipped}회 · ${state.interval_seconds}초 간격`;
  if (document.activeElement !== el('interval'))
    (el('interval') as HTMLSelectElement).value = String(
      state.interval_seconds,
    );
  const body = el('interests');
  body.replaceChildren();
  for (const interest of state.interests) {
    const row = document.createElement('tr');
    for (const value of [
      interest.label,
      String(interest.observations),
      interest.source,
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    const cell = document.createElement('td');
    const link = document.createElement('a');
    link.textContent = `${interest.label} 검색`;
    link.href =
      'https://www.google.com/search?tbm=shop&q=' +
      encodeURIComponent(interest.label);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    cell.append(link);
    row.append(cell);
    body.append(row);
  }
  const metrics = state.latest?.timings;
  el('resources').textContent = metrics
    ? `최근 처리 ${metrics.total_ms.toFixed(0)}ms · CPU ${metrics.cpu_percent.toFixed(1)}% (전체 논리 CPU 기준) · 백엔드 RAM ${metrics.memory_mb.toFixed(0)}MB`
    : '측정 대기';
  el('debug').textContent = JSON.stringify(state, null, 2);
}
async function refresh() {
  if (!token) return;
  try {
    show(await api('/live/state'));
  } catch (e) {
    el('connection').textContent = `연결 실패: ${String(e)}`;
  }
}
el('connect').onclick = () => {
  token = (el('token') as HTMLInputElement).value.trim();
  sessionStorage.setItem('liveToken', token);
  void refresh();
};
for (const action of ['pause', 'resume', 'clear'])
  el(action).onclick = () => {
    void api('/live/control', { action })
      .then(show)
      .catch((e) => {
        el('connection').textContent = String(e);
      });
  };
el('interval').onchange = () => {
  void api('/live/control', {
    action: 'interval',
    interval_seconds: Number((el('interval') as HTMLSelectElement).value),
  })
    .then(show)
    .catch((e) => {
      el('connection').textContent = String(e);
    });
};
el('sample').onclick = async () => {
  (el('sample') as HTMLButtonElement).disabled = true;
  el('test-result').textContent = '로컬 모델 분석 중…';
  try {
    const blob = await (await fetch('/demo-objects.jpg')).blob();
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    show(
      await api('/live/frame', {
        image,
        domain: 'manual-test',
        source: 'manual_test',
        capture_ms: 0,
      }),
    );
    el('test-result').textContent =
      '분석 완료. 아래 관심 목록과 DEBUG를 확인하세요.';
  } catch (e) {
    el('test-result').textContent = `실패: ${String(e)}`;
  } finally {
    (el('sample') as HTMLButtonElement).disabled = false;
  }
};
setInterval(() => {
  void refresh();
}, 2000);
void refresh();
