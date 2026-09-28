import { liveDecision } from '../live-policy.js';
import { frameGuard } from './frame-guard.js';

const base = 'http://127.0.0.1:8787';
let inFlight = false;
let lastFrame = 0;
async function syncRegistration() {
  const { liveEnabled } = await chrome.storage.local.get('liveEnabled');
  const allowed =
    liveEnabled &&
    (await chrome.permissions.contains({ origins: ['<all_urls>'] }));
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: ['omni-periodic'],
  });
  if (!allowed) {
    if (registered.length)
      await chrome.scripting.unregisterContentScripts({
        ids: ['omni-periodic'],
      });
    return;
  }
  if (!registered.length)
    await chrome.scripting.registerContentScripts([
      {
        id: 'omni-periodic',
        matches: ['http://*/*', 'https://*/*'],
        js: ['live-content.js'],
        runAt: 'document_idle',
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  for (const tab of await chrome.tabs.query({ active: true })) {
    if (tab.id && /^https?:/.test(tab.url || '')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['live-content.js'],
        });
      } catch {}
    }
  }
}
chrome.runtime.onStartup.addListener(() => {
  void syncRegistration();
});
chrome.runtime.onInstalled.addListener(() => {
  void syncRegistration();
});
chrome.permissions.onRemoved.addListener(() => {
  void syncRegistration();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.liveEnabled) void syncRegistration();
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.storage.local.get('liveEnabled').then(async ({ liveEnabled }) => {
    if (liveEnabled)
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['live-content.js'],
        });
      } catch {}
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    !['LIVE_TICK', 'LIVE_STOP'].includes(message?.type) ||
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !sender.tab?.id
  )
    return false;
  const tabId = sender.tab.id;
  void (async () => {
    const config = await chrome.storage.local.get(['liveEnabled', 'liveToken']);
    if (!config.liveEnabled || !config.liveToken) return { stopped: true };
    const headers = {
      Authorization: `Bearer ${config.liveToken}`,
      'Content-Type': 'application/json',
    };
    if (message.type === 'LIVE_STOP') {
      await chrome.storage.local.set({ liveEnabled: false });
      for (const action of ['pause', 'clear']) {
        try {
          await fetch(base + '/live/control', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action }),
            signal: AbortSignal.timeout(1500),
          });
        } catch {}
      }
      return { stopped: true };
    }
    const stateResponse = await fetch(base + '/live/state', {
      headers,
      signal: AbortSignal.timeout(1500),
    });
    if (!stateResponse.ok) throw new Error('PAIRING_REQUIRED');
    const state = await stateResponse.json();
    if (!state.running) return { state };
    if (inFlight || state.busy) return { state, retry_after_ms: 250 };
    const remaining = state.interval_seconds * 1000 - (Date.now() - lastFrame);
    if (remaining > 0) return { state, retry_after_ms: remaining };
    inFlight = true;
    let image: string | undefined;
    try {
      const tab = await chrome.tabs.get(tabId);
      const window = await chrome.windows.get(tab.windowId);
      const [{ result: guard }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: frameGuard,
        args: ['check'],
      });
      if (!guard) throw new Error('PRIVACY_GUARD_FAILED');
      const decision = liveDecision({
        url: guard.url,
        consent: true,
        focused: tab.active && window.focused && !sender.tab?.incognito,
        visibleSensitive: guard.sensitive,
        editing: guard.editing,
        serverRunning: state.running,
      });
      if (!decision.capture) {
        await fetch(base + '/live/skip', {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason: decision.reason }),
          signal: AbortSignal.timeout(1500),
        });
        return { state, decision };
      }
      lastFrame = Date.now();
      const [{ result: prepared }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: frameGuard,
        args: ['prepare'],
      });
      if (
        !prepared ||
        prepared.url !== guard.url ||
        prepared.sensitive ||
        prepared.editing
      )
        throw new Error('NAVIGATION_CHANGED');
      // One animation frame allows privacy masks to paint before capture.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 250);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      });
      const before = await chrome.tabs.get(tabId);
      const latestConsent = await chrome.storage.local.get('liveEnabled');
      if (
        !latestConsent.liveEnabled ||
        !before.active ||
        before.url !== guard.url ||
        !(await chrome.windows.get(tab.windowId)).focused
      )
        throw new Error('NAVIGATION_CHANGED');
      const start = performance.now();
      image = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 80,
      });
      const capture_ms = performance.now() - start;
      const captured_at = new Date().toISOString();
      const after = await chrome.tabs.get(tabId);
      const [{ result: afterGuard }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: frameGuard,
        args: ['check'],
      });
      const afterConsent = await chrome.storage.local.get('liveEnabled');
      if (
        !afterConsent.liveEnabled ||
        !after.active ||
        after.url !== guard.url ||
        !afterGuard ||
        afterGuard.sensitive ||
        afterGuard.editing ||
        !afterGuard.mask_present ||
        afterGuard.url !== guard.url ||
        JSON.stringify(afterGuard.roi) !== JSON.stringify(prepared.roi) ||
        !(await chrome.windows.get(tab.windowId)).focused
      )
        throw new Error('NAVIGATION_CHANGED');
      await chrome.scripting.executeScript({
        target: { tabId },
        func: frameGuard,
        args: ['remove'],
      });
      const response = await fetch(base + '/live/frame', {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          image,
          domain: new URL(guard.url).hostname,
          capture_ms,
          source: 'chrome_periodic',
          captured_at,
          masked_regions: prepared.masks,
          roi: prepared.roi,
        }),
      });
      if (!response.ok) throw new Error(`ANALYSIS_${response.status}`);
      return { state: await response.json(), decision, masks: prepared.masks };
    } catch (error) {
      const reason =
        error instanceof Error && error.message === 'NAVIGATION_CHANGED'
          ? 'navigation_changed'
          : 'capture_failed';
      try {
        await fetch(base + '/live/skip', {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason: [reason] }),
          signal: AbortSignal.timeout(1500),
        });
      } catch {}
      return { error: `분석 제외: ${reason} · 다음 주기에 재시도`, state };
    } finally {
      image = undefined;
      inFlight = false;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: frameGuard,
          args: ['remove'],
        });
      } catch {}
    }
  })()
    .then(respond)
    .catch(() =>
      respond({ error: '프로그램 연결 또는 분석 실패 · 다음 주기에 재시도' }),
    );
  return true;
});
