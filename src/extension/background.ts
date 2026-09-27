import { decide, safeUrl } from '../core.js';
import type { RawPage } from '../types.js';
import './live-background.js';
const last = new Map<number, number>();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['ANALYZE', 'POLL', 'METRICS'].includes(message?.type)) return false;
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !sender.tab?.id
  )
    return false;
  const tabId = sender.tab.id;
  void (async () => {
    const { token, consentedTab, consentedOrigin } =
      await chrome.storage.session.get([
        'token',
        'consentedTab',
        'consentedOrigin'
      ]);
    if (
      consentedTab !== tabId ||
      new URL(sender.url!).origin !== consentedOrigin ||
      !token
    )
      throw new Error('CONSENT_REQUIRED');
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    if (message.type === 'METRICS' && /^[a-f0-9-]{36}$/.test(message.id)) {
      const r = await fetch('http://127.0.0.1:8787/metrics', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: message.id,
          render_ms: message.render_ms,
          client_total_ms: message.client_total_ms
        }),
        signal: AbortSignal.timeout(5000)
      });
      respond({ ok: r.ok });
      return;
    }
    if (message.type === 'POLL' && /^[a-f0-9-]{36}$/.test(message.id)) {
      const r = await fetch('http://127.0.0.1:8787/runs/' + message.id, {
        headers,
        signal: AbortSignal.timeout(5000)
      });
      if (!r.ok) throw new Error(`BACKEND_${r.status}`);
      respond(await r.json());
      return;
    }
    if (message.type !== 'ANALYZE') throw new Error('INVALID_MESSAGE');
    if (Date.now() - (last.get(tabId) || 0) < 2500)
      throw new Error('RATE_LIMIT');
    last.set(tabId, Date.now());
    const raw = message.raw as RawPage;
    if (!raw || new URL(raw.url).origin !== consentedOrigin)
      throw new Error('URL_MISMATCH');
    // Recheck live page immediately before capture; never trust a stale content-script decision.
    const [{ result: guard }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        url: location.href,
        sensitive: !!document.querySelector(
          'input[type=password],input[autocomplete*="cc-"],[contenteditable="true"],input[autocomplete="email"],input[autocomplete="tel"]'
        )
      })
    });
    if (!guard || new URL(guard.url).origin !== consentedOrigin)
      throw new Error('NAVIGATION_CHANGED');
    raw.signals.sensitive ||= guard.sensitive;
    const decision = decide(raw);
    if (decision.capture && safeUrl(guard.url) !== raw.url)
      throw new Error('NAVIGATION_CHANGED');
    let image: string | undefined;
    let capture_error: string | undefined;
    const t = performance.now();
    if (decision.capture) {
      try {
        const active = await chrome.tabs.get(tabId);
        if (!active.active || active.url !== guard.url)
          throw new Error('INACTIVE_OR_CHANGED_TAB');
        image = await chrome.tabs.captureVisibleTab(active.windowId, {
          format: 'png'
        });
        const after = await chrome.tabs.get(tabId);
        if (!after.active || after.url !== guard.url) {
          image = undefined;
          throw new Error('NAVIGATION_DURING_CAPTURE');
        }
      } catch {
        capture_error = 'CAPTURE_FAILED';
      }
    }
    try {
      const r = await fetch('http://127.0.0.1:8787/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          raw,
          image,
          capture_ms: performance.now() - t,
          capture_error
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) throw new Error(`BACKEND_${r.status}`);
      respond(await r.json());
    } finally {
      image = undefined;
    }
  })().catch(e =>
    respond({ error: e instanceof Error ? e.message : 'UNKNOWN' })
  );
  return true;
});
chrome.tabs.onRemoved.addListener(id => {
  last.delete(id);
  void chrome.storage.session.get('consentedTab').then(v => {
    if (v.consentedTab === id) return chrome.storage.session.clear();
  });
});
