import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.tools/browsers');
await build({
  entryPoints: ['src/extension/frame-guard.ts'],
  outfile: 'dist/privacy-harness.js',
  bundle: true,
  format: 'iife',
  globalName: 'PrivacyTest',
  target: 'chrome120',
});
const browser = await chromium.launch({ headless: true });
const cases: any[] = [];
const htmlCases = [
  ['public_article', '<h1>Public review</h1>', false, false],
  ['visible_password', '<input type="password">', true, false],
  [
    'hidden_password',
    '<input type="password" style="display:none">',
    false,
    false,
  ],
  [
    'offscreen_password',
    '<input type="password" style="position:absolute;top:2000px">',
    false,
    false,
  ],
  ['credit_card', '<input autocomplete="cc-number">', true, false],
  ['otp', '<input autocomplete="one-time-code">', true, false],
  [
    'editable',
    '<div contenteditable="true" id="focus">typing</div>',
    false,
    true,
  ],
  ['input_focus', '<input id="focus">', false, true],
  ['iframe_mask', '<iframe srcdoc="private text"></iframe>', false, false],
  ['pii_mask', '<p>user@example.com 010-1234-5678</p>', false, false],
  [
    'legacy_widget_hidden',
    '<aside id="omni-poc-host">Galaxy Buds3 Pro</aside>',
    false,
    false,
  ],
  ['no_media_fallback', '<p>No images on this page</p>', false, false],
] as const;
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  for (const [name, html, sensitive, editing] of htmlCases) {
    try {
      await page.setContent(`<title>Public content</title>${html}`);
      await page.addScriptTag({ path: 'dist/privacy-harness.js' });
      if (editing) await page.locator('#focus').focus();
      const result = await page.evaluate(() =>
        (globalThis as any).PrivacyTest.frameGuard('prepare'),
      );
      assert.equal(result.sensitive, sensitive);
      assert.equal(result.editing, editing);
      if (name.endsWith('_mask')) assert(result.masks > 0);
      if (name === 'legacy_widget_hidden')
        assert.equal(
          await page
            .locator('#omni-poc-host')
            .evaluate((e) => (e as HTMLElement).style.visibility),
          'hidden',
        );
      if (name === 'no_media_fallback') assert.equal(result.roi, undefined);
      await page.evaluate(() =>
        (globalThis as any).PrivacyTest.frameGuard('remove'),
      );
      cases.push({ name, pass: true });
    } catch (e) {
      cases.push({ name, pass: false, error: String(e) });
    }
  }
  const bytes = (await readFile('.tools/test-assets/objects.jpg')).toString(
    'base64',
  );
  for (const scale of [1, 1.25, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 800 },
      deviceScaleFactor: scale,
    });
    const p = await context.newPage();
    await p.setContent(
      `<img src="data:image/jpeg;base64,${bytes}" style="position:absolute;left:100px;top:120px;width:400px;height:300px"><img src="data:image/jpeg;base64,${bytes}" style="position:absolute;left:600px;top:200px;width:200px;height:180px">`,
    );
    await p.addScriptTag({ path: 'dist/privacy-harness.js' });
    const g = await p.evaluate(() =>
      (globalThis as any).PrivacyTest.frameGuard('check'),
    );
    assert.deepEqual(g.roi, {
      left: 100,
      top: 120,
      width: 700,
      height: 300,
      viewport_width: 1000,
      viewport_height: 800,
    });
    cases.push({ name: `media_union_DPR_${scale}`, pass: true, roi: g.roi });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    'artifacts/guard-validation.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        cases,
        pass: cases.every((c) => c.pass),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ cases, pass: cases.every((c) => c.pass) }));
  if (cases.some((c) => !c.pass)) process.exitCode = 1;
}
