import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { cp, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.tools/browsers');
const token = (await readFile('artifacts/server-token.txt', 'utf8')).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
const base = 'http://127.0.0.1:8787';
async function state() {
  return (await fetch(base + '/live/state', { headers })).json();
}
async function control(action: string, interval_seconds?: number) {
  const response = await fetch(base + '/live/control', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, interval_seconds }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function until(check: () => Promise<boolean>, timeout = 60000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('WAIT_TIMEOUT');
    await new Promise((r) => setTimeout(r, 500));
  }
}
const fixture = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    `<title>${req.url === '/login' ? 'Login' : 'Independent video feed'}</title><style>body{font:20px sans-serif}img{width:640px}</style><h1>Video feed · no product schema</h1><img src="${base}/demo-objects.jpg"><p>Galaxy Buds3 Pro</p>${req.url === '/login' ? '<input type="password" value="FAKE_SECRET">' : '<p>test-person@example.com</p><input placeholder="Search">'}`,
  );
});
await new Promise<void>((r) => fixture.listen(8788, '127.0.0.1', r));
await cp('dist/extension', 'dist/live-test-extension', { recursive: true });
const manifest = JSON.parse(
  await readFile('dist/live-test-extension/manifest.json', 'utf8'),
);
manifest.host_permissions = ['<all_urls>'];
manifest.name += ' LIVE TEST ONLY';
await writeFile(
  'dist/live-test-extension/manifest.json',
  JSON.stringify(manifest),
);
const ext = resolve('dist/live-test-extension');
const profile = await mkdtemp(resolve('artifacts/browser-profile-live-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1100, height: 900 },
});
const output: any = {
  timestamp: new Date().toISOString(),
  cases: [],
  errors: [],
  permission_note:
    'Fresh headless Chromium profile, TEST ONLY manifest pregrants host access. Chrome initial optional permission dialog remains a manual step.',
  social_note:
    'Non-shopping feed fixture tested; logged-in Instagram/YouTube sessions not tested.',
};
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  page.on('pageerror', (error) => output.errors.push(error.message));
  // Exercise the actual control center and sample-image path first.
  await page.goto(base + '/live');
  await page.locator('#token').fill(token);
  await page.locator('#connect').click();
  await page.getByText('프로그램 연결됨', { exact: true }).waitFor();
  await control('resume');
  await control('clear');
  await control('interval', 5);
  await page.locator('#sample').click();
  await page
    .getByText('분석 완료. 아래 관심 목록과 DEBUG를 확인하세요.', {
      exact: true,
    })
    .waitFor({ timeout: 60000 });
  assert((await state()).interests.some((i: any) => i.key === 'remote'));
  output.cases.push({ name: 'control_center_sample_actual_model', pass: true });
  await control('clear');
  await worker.evaluate(async (token) => {
    await chrome.storage.local.set({ liveToken: token, liveEnabled: true });
  }, token);
  await page.goto('http://127.0.0.1:8788/feed');
  await page.bringToFront();
  await until(async () => (await state()).frames >= 3);
  let s = await state();
  assert(
    s.interests.some((i: any) => i.key === 'remote' && i.observations >= 3),
  );
  assert.equal(s.latest.source, 'chrome_periodic');
  output.cases.push({
    name: 'same_url_periodic_capture_and_interest',
    pass: true,
    frames: s.frames,
    interests: s.interests,
  });
  await control('pause');
  const paused = (await state()).frames;
  await page.waitForTimeout(6500);
  assert.equal((await state()).frames, paused);
  output.cases.push({ name: 'pause_prevents_capture_analysis', pass: true });
  await page.goto('http://127.0.0.1:8788/login');
  await control('resume');
  await page.waitForTimeout(6500);
  s = await state();
  assert.equal(s.frames, paused);
  assert(
    s.events.some(
      (e: any) =>
        !e.capture && e.reason.some((r: string) => r.startsWith('sensitive')),
    ),
  );
  output.cases.push({ name: 'sensitive_password_page_blocked', pass: true });
  await page.goto('http://127.0.0.1:8788/feed');
  await until(async () => (await state()).frames > paused);
  const beforeEdit = (await state()).frames;
  await page.locator('input').focus();
  await page.waitForTimeout(6500);
  assert.equal((await state()).frames, beforeEdit);
  output.cases.push({ name: 'typing_blocks_capture', pass: true });
  await page.locator('h1').click();
  await page.evaluate(() => history.pushState({}, '', '/direct/inbox/'));
  await page.waitForTimeout(6500);
  assert.equal((await state()).frames, beforeEdit);
  output.cases.push({ name: 'spa_sensitive_route_blocked', pass: true });
  await page.evaluate(() => history.pushState({}, '', '/reels/demo'));
  await until(async () => (await state()).frames > beforeEdit);
  output.cases.push({ name: 'spa_return_to_feed_resumes', pass: true });
  // Actual screenshots, same URL, no synthetic frame submission or mocked vision.
  const startFrames = (await state()).frames;
  await until(async () => (await state()).frames >= startFrames + 30, 240000);
  s = await state();
  output.repeat = {
    count: 30,
    success: 30,
    timeout: 0,
    screenshots: s.frames,
    latest: s.latest,
    samples: s.samples,
    interests: s.interests,
  };
  const count = s.frames;
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ liveEnabled: false });
  });
  await page.waitForTimeout(6500);
  assert.equal((await state()).frames, count);
  output.cases.push({
    name: 'consent_withdrawal_stops_periodic_capture',
    pass: true,
  });
  output.pass = true;
} catch (e) {
  output.pass = false;
  output.errors.push(String(e));
  process.exitCode = 1;
} finally {
  await writeFile('artifacts/live-e2e.json', JSON.stringify(output, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: output.pass,
        cases: output.cases,
        errors: output.errors,
        repeat: output.repeat?.count,
      },
      null,
      2,
    ),
  );
  await control('pause');
  await control('clear');
  await context.close();
  await new Promise<void>((r) => fixture.close(() => r()));
}
