const liveStatus = document.getElementById('live-status')!;
document.getElementById('live-start')!.addEventListener('click', async () => {
  try {
    if (!(document.getElementById('live-consent') as HTMLInputElement).checked)
      throw new Error('주기적 화면 분석 동의가 필요합니다.');
    const token = (
      document.getElementById('token') as HTMLInputElement
    ).value.trim();
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error('artifacts/server-token.txt 파일의 연결 토큰을 입력하세요.');
    // Chrome requires the permission request directly inside a real button gesture.
    const allowed = await chrome.permissions.request({
      origins: ['<all_urls>'],
    });
    if (!allowed)
      throw new Error(
        '다른 사이트에서도 캡처하려면 사이트 접근 권한이 필요합니다.',
      );
    const response = await fetch('http://127.0.0.1:8787/live/state', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok)
      throw new Error('프로그램 실행 및 연결 토큰을 확인하세요.');
    await fetch('http://127.0.0.1:8787/live/control', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'resume' }),
    });
    await chrome.storage.local.set({ liveToken: token, liveEnabled: true });
    await chrome.storage.session.clear();
    liveStatus.textContent =
      '연결 완료. 프로그램 실행 중 활성 탭을 주기적으로 분석합니다. 다음 실행부터 자동 재개됩니다.';
  } catch (e) {
    liveStatus.textContent = e instanceof Error ? e.message : '연결 실패';
  }
});
document.getElementById('live-stop')!.addEventListener('click', async () => {
  await chrome.storage.local.set({ liveEnabled: false });
  const { liveToken } = await chrome.storage.local.get('liveToken');
  try {
    await fetch('http://127.0.0.1:8787/live/control', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${liveToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'pause' }),
    });
    await fetch('http://127.0.0.1:8787/live/control', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${liveToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'clear' }),
    });
  } catch {}
  await chrome.permissions.remove({ origins: ['<all_urls>'] });
  await chrome.storage.local.remove('liveToken');
  liveStatus.textContent =
    '동의 철회 완료. 다시 연결하기 전까지 자동 캡처하지 않습니다.';
});
void chrome.storage.local.get(['liveEnabled', 'liveToken']).then((config) => {
  if (typeof config.liveToken === 'string')
    (document.getElementById('token') as HTMLInputElement).value =
      config.liveToken;
  liveStatus.textContent = config.liveEnabled
    ? '자동 분석 연결이 저장되어 있습니다.'
    : '최초 1회 연결이 필요합니다.';
});
