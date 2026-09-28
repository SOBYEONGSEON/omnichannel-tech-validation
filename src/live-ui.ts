const el = (id: string) => document.getElementById(id)!;
let token = sessionStorage.getItem('liveToken') || '';
let lastState: any = null;
const rowCells = (body: HTMLElement, values: string[]) => {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  body.append(row);
  return row;
};
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
  lastState = state;
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
      `${interest.observations}회 / ${interest.independent_frames || 0}회`,
      `${interest.source === 'ocr_dictionary' ? 'OCR 상품명 언급' : '로컬 사물 인식'} · ${interest.status === 'repeated' ? '반복 검출' : '단일 근거 후보'}`,
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
  const latest = state.latest;
  el('frame-info').textContent = latest
    ? `#${latest.frame_number} · ${latest.domain} · ${latest.captured_at || latest.timestamp} · ${latest.cache_hit ? '동일 이미지 결과 재사용' : '새 이미지 추론'} · ${latest.input?.detection_scope === 'visible_media_region' ? '이미지·영상 영역 분석' : '전체 화면 분석'} · 가린 영역 ${latest.masked_regions || 0}개`
    : '아직 분석한 화면이 없습니다.';
  const detections = el('detections');
  detections.replaceChildren();
  const canvas = el('positions') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f1f4f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const shape = latest?.input;
  if (shape?.region) {
    const r = shape.region;
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      (r.left / shape.width) * 700,
      (r.top / shape.height) * 360,
      (r.width / shape.width) * 700,
      (r.height / shape.height) * 360,
    );
    ctx.setLineDash([]);
  }
  (latest?.objects || []).forEach((o: any, index: number) => {
    const b = o.box;
    rowCells(detections, [
      `${index + 1}. ${o.label}`,
      `사물 종류 (${o.key})`,
      `${(o.confidence * 100).toFixed(1)}%`,
      `왼쪽 ${(b.xmin * 100).toFixed(0)}%, 위 ${(b.ymin * 100).toFixed(0)}% · 모델명 미확인`,
    ]);
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = '#1347ab';
    ctx.font = '14px sans-serif';
    ctx.strokeRect(
      b.xmin * 700,
      b.ymin * 360,
      (b.xmax - b.xmin) * 700,
      (b.ymax - b.ymin) * 360,
    );
    ctx.fillText(
      `${index + 1}. ${o.label}`,
      b.xmin * 700,
      Math.max(14, b.ymin * 360 - 4),
    );
  });
  for (const term of latest?.term_evidence || [])
    rowCells(detections, [
      term.label,
      'OCR + 상품명 사전',
      `${(term.confidence * 100).toFixed(1)}% (OCR 전체)`,
      '화면 글자에서 언급 · 사진 속 사물과 관계 미확인',
    ]);
  if (!detections.childElementCount)
    rowCells(detections, [
      '추출된 사물·상품명 없음',
      '—',
      '—',
      '지원 종류·화질에 따라 누락될 수 있음',
    ]);
  const history = el('history');
  history.replaceChildren();
  for (const h of [...(state.history || [])].reverse())
    rowCells(history, [
      `#${h.frame_number} ${h.timestamp}`,
      [...h.objects.map((o: any) => o.label), ...h.product_terms].join(', ') ||
        '없음',
      `${h.cache_hit ? '재사용' : '새 추론'} / ${h.input?.detection_scope || '—'}`,
      `${h.timings.total_ms.toFixed(0)}ms`,
    ]);
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
}, 1000);
el('export').onclick = () => {
  if (!lastState) {
    el('connection').textContent = '먼저 연결하고 분석하세요.';
    return;
  }
  const blob = new Blob([JSON.stringify(lastState, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `screen-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
void refresh();
