import { nextCaptureDelay } from '../capture-cadence.js';
(() => {
  if (
    location.origin === 'http://127.0.0.1:8787' &&
    ['/', '/live'].includes(location.pathname)
  )
    return;
  if (document.getElementById('__omni_live_widget')) return;
  const host = document.createElement('aside');
  host.id = '__omni_live_widget';
  host.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483646';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{all:initial}section{font:13px system-ui;background:#182233;color:white;padding:14px;border-radius:12px;width:265px;box-shadow:0 4px 24px #0004}a{color:#93c5fd}button{margin:6px 6px 6px 0;padding:5px}p{margin:8px 0}';
  const section = document.createElement('section');
  const title = document.createElement('strong');
  title.textContent = '화면 관심 사물 분석';
  const status = document.createElement('p');
  status.textContent = '프로그램 연결 대기';
  const counts = document.createElement('p');
  const objects = document.createElement('p');
  const stop = document.createElement('button');
  stop.textContent = '자동 분석 중지';
  const inspector = document.createElement('a');
  inspector.textContent = 'DEBUG / 직접 테스트';
  inspector.href = 'http://127.0.0.1:8787/live';
  inspector.target = '_blank';
  inspector.rel = 'noopener noreferrer';
  section.append(title, status, counts, objects, stop, inspector);
  shadow.append(style, section);
  document.documentElement.append(host);
  let stopped = false;
  stop.onclick = async () => {
    stopped = true;
    await chrome.runtime.sendMessage({ type: 'LIVE_STOP' });
    host.remove();
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.liveEnabled?.newValue === false) {
      stopped = true;
      host.remove();
    }
  });
  async function tick() {
    if (stopped) return;
    const tickStart = performance.now();
    let delay = 2000;
    try {
      // Never submit background tabs. Backend must be alive before a frame is taken.
      if (document.visibilityState === 'visible') {
        const response = await chrome.runtime.sendMessage({
          type: 'LIVE_TICK',
        });
        if (response?.stopped) {
          stopped = true;
          host.remove();
          return;
        }
        const state = response?.state;
        status.textContent =
          response?.error ||
          (response?.decision?.capture === false
            ? `캡처 제외: ${response.decision.reason.join(', ')}`
            : state?.status || '연결 대기');
        if (state) {
          delay = nextCaptureDelay(
            state.interval_seconds,
            performance.now() - tickStart,
          );
          if (typeof response.retry_after_ms === 'number')
            delay = Math.max(100, response.retry_after_ms);
          counts.textContent = `${state.interval_seconds}초 간격 · 분석 ${state.frames}회 · 제외 ${state.skipped}회`;
          objects.textContent =
            state.interests
              .slice(0, 4)
              .map(
                (item: {
                  label: string;
                  observations: number;
                  confidence: number;
                  independent_frames: number;
                }) =>
                  `${item.label} · ${(item.confidence * 100).toFixed(0)}% · ${item.observations}회 (새 추론 ${item.independent_frames}회)`,
              )
              .join(' / ') || '아직 감지한 사물이 없습니다';
        }
      }
    } catch {
      status.textContent =
        '프로그램을 실행하거나 확장 프로그램을 다시 연결하세요';
    }
    if (!stopped)
      setTimeout(() => {
        void tick();
      }, delay);
  }
  void tick();
})();
