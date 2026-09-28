import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { stats } from '../src/core.js';
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.tools/browsers');
const base = 'http://127.0.0.1:8787';
const token = (await readFile('artifacts/server-token.txt', 'utf8')).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean>, timeout = 60000) {
  const t = Date.now();
  while (!(await fn())) {
    if (Date.now() - t > timeout) throw new Error('TIMEOUT');
    await sleep(200);
  }
}
async function state() {
  return (await fetch(base + '/live/state', { headers })).json();
}
async function control(action: string, interval_seconds?: number) {
  const r = await fetch(base + '/live/control', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, interval_seconds }),
  });
  assert.equal(r.status, 200);
  return r.json();
}
try {
  await fetch(base + '/health', { headers });
  throw new Error('Stop existing backend first');
} catch (e) {
  if (e instanceof Error && e.message.startsWith('Stop')) throw e;
}
let backend: ChildProcess;
async function start() {
  backend = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
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
}
async function stop() {
  if (backend && backend.exitCode === null) {
    const done = new Promise<void>((r) => backend.once('exit', () => r()));
    backend.kill();
    await done;
  }
}
const picture = await readFile('.tools/test-assets/objects.jpg');
const fixture = createServer((req, res) => {
  if (req.url === '/objects.jpg') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.end(picture);
    return;
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8');
  if (req.url === '/empty') {
    res.end('<title>Empty public page</title><body>Nothing here</body>');
    return;
  }
  const sensitive = req.url === '/login';
  res.end(
    `<title>${sensitive ? 'Login' : 'Public video feed'}</title><style>body{font:24px sans-serif;margin:20px;background:#fff}canvas{display:block;width:640px;height:480px}input{display:block}</style><h1>Video feed</h1><canvas id="scene" width="640" height="480"></canvas><p>Galaxy Buds3 Pro</p><p id="pii">test-person@example.com</p><input ${sensitive ? 'type="password"' : 'placeholder="Search"'}><script>const img=new Image();img.onload=()=>{const c=document.querySelector('canvas'),x=c.getContext('2d');window.paint=(n)=>{x.fillStyle=n%2?'#ddd':'#fff';x.fillRect(0,0,640,480);x.drawImage(img,0,0,640,480);x.fillStyle='#202020';x.fillRect(600,430,30+(n%10),20);};window.paint(0)};img.src='/objects.jpg';</script>`,
  );
});
await new Promise<void>((r) => fixture.listen(8788, '127.0.0.1', r));
await cp('dist/extension', 'dist/realtime-test-extension', { recursive: true });
const manifest = JSON.parse(
  await readFile('dist/realtime-test-extension/manifest.json', 'utf8'),
);
manifest.host_permissions = ['<all_urls>'];
manifest.name += ' VALIDATION ONLY';
await writeFile(
  'dist/realtime-test-extension/manifest.json',
  JSON.stringify(manifest),
);
await build({
  entryPoints: ['src/extension/frame-guard.ts'],
  outfile: 'dist/privacy-harness.js',
  bundle: true,
  format: 'iife',
  globalName: 'PrivacyTest',
  target: 'chrome120',
});
const ext = resolve('dist/realtime-test-extension'),
  profile = await mkdtemp(resolve('artifacts/browser-profile-realtime-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1100, height: 900 },
});
const report: any = {
  timestamp: new Date().toISOString(),
  cases: [],
  errors: [],
  permission_note:
    'Isolated Chromium profile with TEST ONLY host permissions, public/synthetic fixtures only. No logged-in social account used.',
};
const record = async (name: string, fn: () => Promise<unknown>) => {
  try {
    const detail = await fn();
    report.cases.push({ name, pass: true, detail });
  } catch (e) {
    report.cases.push({ name, pass: false, error: String(e) });
  }
  console.log(JSON.stringify(report.cases.at(-1)));
};
try {
  await start();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8788/feed');
  // Exercise actual DOM guard and rendered privacy masks independently of inference.
  await page.addScriptTag({ path: 'dist/privacy-harness.js' });
  await record('privacy_masks_paint_and_cleanup', async () => {
    const guard = await page.evaluate(() =>
      (globalThis as any).PrivacyTest.frameGuard('prepare'),
    );
    assert(guard.masks >= 2);
    assert(guard.roi);
    const rect = await page.locator('#pii').boundingBox();
    assert(rect);
    const shot = await page.screenshot();
    const { data } = await sharp(shot)
      .extract({
        left: Math.round(rect.x + 10),
        top: Math.round(rect.y + 10),
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert(data[0] < 30 && data[1] < 30 && data[2] < 30);
    await page.evaluate(() =>
      (globalThis as any).PrivacyTest.frameGuard('remove'),
    );
    assert.equal(await page.locator('#__omni_privacy_masks').count(), 0);
    return { masked_regions: guard.masks, pixel: [...data] };
  });
  await record('old_mask_timeout_cannot_remove_new_capture_mask', async () => {
    await page.evaluate(() =>
      (globalThis as any).PrivacyTest.frameGuard('prepare'),
    );
    await sleep(1100);
    await page.evaluate(() =>
      (globalThis as any).PrivacyTest.frameGuard('prepare'),
    );
    await sleep(1100);
    assert.equal(await page.locator('#__omni_privacy_masks').count(), 1);
    await page.evaluate(() =>
      (globalThis as any).PrivacyTest.frameGuard('remove'),
    );
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async (token) => {
    const original = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
    (globalThis as any).captures = [];
    (globalThis as any).failCapture = false;
    (chrome.tabs as any).captureVisibleTab = (...args: any[]) => {
      if ((globalThis as any).failCapture) {
        (globalThis as any).failCapture = false;
        throw new Error('synthetic capture failure');
      }
      (globalThis as any).captures.push(Date.now());
      return (original as any)(...args);
    };
    await chrome.storage.local.set({ liveEnabled: true, liveToken: token });
  }, token);
  const captureCount = () =>
    worker.evaluate(() => (globalThis as any).captures.length);
  await page.bringToFront();
  await control('interval', 1);
  await record('one_second_periodic_60_actual_captures', async () => {
    await until(async () => (await state()).frames >= 60, 180000);
    const s = await state();
    assert(s.interests.some((i: any) => i.key === 'remote'));
    assert.equal(s.latest.input.detection_scope, 'visible_media_region');
    assert(s.latest.masked_regions >= 2);
    const times: number[] = await worker.evaluate(
      () => (globalThis as any).captures,
    );
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    report.static = {
      frames: s.frames,
      interval_ms: stats(gaps),
      samples: s.samples,
    };
    assert(stats(gaps.slice(3)).p95 < 2000);
    return { frames: s.frames, p95_gap_ms: stats(gaps.slice(3)).p95 };
  });
  await record('changing_scene_30_fresh_inferences', async () => {
    await control('pause');
    await control('clear');
    await control('interval', 2);
    await control('resume');
    for (let i = 0; i < 30; i++) {
      await page.evaluate((n) => (globalThis as any).paint(n), i + 1);
      const count = (await state()).frames;
      await until(async () => (await state()).frames > count);
    }
    const s = await state();
    report.changing = {
      frames: s.frames,
      samples: s.samples,
      history: s.history,
      interests: s.interests,
    };
    assert(
      s.interests.some(
        (i: any) => i.key === 'remote' && i.independent_frames >= 25,
      ),
    );
    return {
      frames: s.frames,
      fresh_remote: s.interests.find((i: any) => i.key === 'remote')
        ?.independent_frames,
    };
  });
  await record('password_page_no_screenshots', async () => {
    await page.goto('http://127.0.0.1:8788/login');
    await sleep(3000);
    const n = await captureCount();
    await sleep(3000);
    assert.equal(await captureCount(), n);
    assert(
      (await state()).events.some((e: any) =>
        e.reason.includes('sensitive_content_visible'),
      ),
    );
  });
  await page.goto('http://127.0.0.1:8788/feed');
  await sleep(3000);
  await record('typing_no_screenshots', async () => {
    await page.locator('input').focus();
    await sleep(3000);
    const n = await captureCount();
    await sleep(3000);
    assert.equal(await captureCount(), n);
    await page.locator('h1').click();
  });
  await record('spa_direct_route_blocked_and_return_resumes', async () => {
    await page.evaluate(() => history.pushState({}, '', '/direct/inbox'));
    await sleep(3000);
    const n = await captureCount();
    await sleep(3000);
    assert.equal(await captureCount(), n);
    await page.evaluate(() => history.pushState({}, '', '/reels/demo'));
    await until(async () => (await captureCount()) > n);
  });
  await record('capture_failure_logged_then_recovers', async () => {
    const n = (await state()).frames;
    await worker.evaluate(() => ((globalThis as any).failCapture = true));
    await until(async () =>
      (await state()).events.some((e: any) =>
        e.reason.includes('capture_failed'),
      ),
    );
    await until(async () => (await state()).frames > n);
  });
  await record('invalid_image_returns_error_then_recovers', async () => {
    await control('pause');
    await sleep(3000);
    await control('resume');
    const response = await fetch(base + '/live/frame', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image: 'data:image/jpeg;base64,YWJj',
        domain: 'manual-test',
        source: 'manual_test',
        capture_ms: 0,
      }),
    });
    assert.equal(response.status, 422);
    await until(async () => (await state()).last_error === null);
  });
  await record('backend_stop_prevents_capture_restart_resumes', async () => {
    await stop();
    await sleep(2500);
    const n = await captureCount();
    await sleep(3000);
    assert.equal(await captureCount(), n);
    await start();
    await until(async () => (await state()).frames > 0);
  });
  await record('inspector_rows_positions_history_and_export', async () => {
    await page.goto(base + '/live');
    await page.locator('#token').fill(token);
    await page.locator('#connect').click();
    await page.getByText('프로그램 연결됨', { exact: true }).waitFor();
    assert((await page.locator('#detections tr').count()) > 0);
    assert((await page.locator('#history tr').count()) > 0);
    const pending = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await pending;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    assert(!text.includes(token));
    assert(!text.includes('data:image'));
    assert(JSON.parse(text).history.length > 0);
    await page.locator('#token').fill('');
    await page.screenshot({
      path: '.tools/test-assets/inspector-v03.png',
      fullPage: true,
    });
  });
  report.pass = report.cases.every((c: any) => c.pass);
  if (!report.pass) process.exitCode = 1;
} catch (e) {
  report.pass = false;
  report.errors.push(String(e));
  process.exitCode = 1;
} finally {
  await context.close();
  await stop();
  await new Promise<void>((r) => fixture.close(() => r()));
  await writeFile(
    'artifacts/realtime-validation.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      pass: report.pass,
      cases: report.cases.length,
      errors: report.errors,
    }),
  );
}
