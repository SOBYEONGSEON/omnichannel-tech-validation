import './live-popup.js';
const byId = (id: string) => document.getElementById(id)!;
byId('start').addEventListener('click', async () => {
  try {
    if (!(byId('consent') as HTMLInputElement).checked)
      throw new Error('동의를 선택하세요.');
    const token = (byId('token') as HTMLInputElement).value.trim();
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error('64자리 로컬 토큰이 필요합니다.');
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab?.id) throw new Error('탭 없음');
    await chrome.storage.session.set({
      token,
      consentedTab: tab.id,
      consentedOrigin: new URL(tab.url!).origin
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    byId('status').textContent = '분석 시작됨';
  } catch (e) {
    byId('status').textContent = String(e);
  }
});
byId('stop').addEventListener('click', async () => {
  const { token, consentedTab } = await chrome.storage.session.get([
    'token',
    'consentedTab'
  ]);
  try {
    await fetch('http://127.0.0.1:8787/runs', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (typeof consentedTab === 'number')
      await chrome.tabs.sendMessage(consentedTab, { type: 'STOP' });
  } catch {}
  await chrome.storage.session.clear();
  byId('status').textContent =
    '동의 철회 완료. 서버가 처리 중이면 데이터는 TTL로 삭제됩니다.';
});
