import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.tools/browsers');
const base = 'http://127.0.0.1:8787';
const token = (await readFile('artifacts/server-token.txt', 'utf8')).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let server: ChildProcess | undefined;
async function until(check: () => Promise<boolean>, timeout = 45000) {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeout) throw new Error('TIMEOUT');
    await sleep(300);
  }
}
async function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
  });
  await until(async () => {
    try {
      return (await fetch(base + '/health', { headers })).ok;
    } catch {
      return false;
    }
  });
  assert.equal(
    (await readFile('artifacts/server-token.txt', 'utf8')).trim(),
    token,
  );
  await fetch(base + '/live/control', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'interval', interval_seconds: 5 }),
  });
}
async function stopServer() {
  if (server && server.exitCode === null) {
    const exited = new Promise<void>((r) => server!.once('exit', () => r()));
    server.kill();
    await exited;
  }
}
try {
  await fetch(base + '/health', { headers });
  throw new Error('Stop the existing backend before this test');
} catch (e) {
  if (e instanceof Error && e.message.startsWith('Stop')) throw e;
}
await cp('dist/extension', 'dist/live-startup-extension', { recursive: true });
const manifest = JSON.parse(
  await readFile('dist/live-startup-extension/manifest.json', 'utf8'),
);
manifest.host_permissions = ['<all_urls>'];
manifest.name += ' STARTUP TEST ONLY';
await writeFile(
  'dist/live-startup-extension/manifest.json',
  JSON.stringify(manifest),
);
const ext = resolve('dist/live-startup-extension');
const profile = await mkdtemp(resolve('artifacts/browser-profile-startup-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1100, height: 900 },
});
const evidence: any = {
  timestamp: new Date().toISOString(),
  cases: [],
  errors: [],
  permission_note:
    'TEST ONLY host grant; persisted pairing configured by harness.',
};
try {
  await startServer();
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async (token) => {
    const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
    (globalThis as any).captureCount = 0;
    (chrome.tabs as any).captureVisibleTab = (...args: any[]) => {
      (globalThis as any).captureCount++;
      return (original as any)(...args);
    };
    await chrome.storage.local.set({ liveEnabled: true, liveToken: token });
  }, token);
  const page = await context.newPage();
  await page.goto(base + '/demo');
  await page.bringToFront();
  const state = async () =>
    (await fetch(base + '/live/state', { headers })).json();
  await until(async () => (await state()).frames > 0);
  evidence.cases.push({
    name: 'program_start_begins_analysis_with_stored_consent',
    pass: true,
  });
  await stopServer();
  const before = await worker.evaluate(() => (globalThis as any).captureCount);
  await sleep(7000);
  assert.equal(
    await worker.evaluate(() => (globalThis as any).captureCount),
    before,
  );
  evidence.cases.push({
    name: 'backend_off_zero_additional_screenshots',
    pass: true,
  });
  await startServer();
  await until(async () => (await state()).frames > 0);
  assert(
    (await worker.evaluate(() => (globalThis as any).captureCount)) > before,
  );
  evidence.cases.push({
    name: 'backend_restart_same_token_resumes_without_click',
    pass: true,
  });
  // UI stop uses production content -> background -> backend path.
  await page
    .getByRole('button', { name: '자동 분석 중지', exact: true })
    .click();
  await until(async () => !(await state()).running);
  const count = await worker.evaluate(() => (globalThis as any).captureCount);
  await sleep(6500);
  assert.equal(
    await worker.evaluate(() => (globalThis as any).captureCount),
    count,
  );
  assert.equal((await state()).interests.length, 0);
  evidence.cases.push({ name: 'widget_stop_disables_and_erases', pass: true });
  await page.goto(base + '/live');
  await page.locator('#token').fill(token);
  await page.locator('#connect').click();
  await page.getByText('프로그램 연결됨', { exact: true }).waitFor();
  // Password field is empty before a synthetic UI screenshot; no pairing secret is recorded.
  await page.locator('#token').fill('');
  await page.screenshot({
    path: '.tools/test-assets/live-ui.png',
    fullPage: true,
  });
  evidence.pass = true;
} catch (e) {
  evidence.pass = false;
  evidence.errors.push(String(e));
  process.exitCode = 1;
} finally {
  await context.close();
  await stopServer();
  await writeFile(
    'artifacts/live-startup-e2e.json',
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
}
