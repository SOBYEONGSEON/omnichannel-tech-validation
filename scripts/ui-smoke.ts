import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const checks: Record<string, boolean> = {};
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8787');
  await page
    .locator('#token')
    .fill((await readFile('artifacts/server-token.txt', 'utf8')).trim());
  await page.locator('#connect').click();
  await page.locator('#runs section').first().waitFor();
  checks.sessions_visible = (await page.locator('#runs section').count()) > 0;
  await page.locator('#runs details summary').first().click();
  await page.waitForTimeout(1300);
  checks.inspector_stays_open_after_poll =
    (await page.locator('#runs details[open]').count()) === 1;
  checks.all_stage_sections =
    (await page.locator('#runs section').first().locator('details').count()) ===
    12;
  checks.no_page_errors = errors.length === 0;
  await writeFile(
    'artifacts/ui-smoke.json',
    JSON.stringify(
      { timestamp: new Date().toISOString(), checks, errors },
      null,
      2
    )
  );
  console.log(JSON.stringify(checks));
  if (Object.values(checks).some(x => !x)) process.exitCode = 1;
} finally {
  await browser.close();
}
