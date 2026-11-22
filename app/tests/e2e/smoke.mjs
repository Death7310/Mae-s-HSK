// End-to-end smoke test against a production build.
//   npm run build && node tests/e2e/smoke.mjs [screenshot-dir]
// Starts `vite preview`, walks through the main flows in a phone-sized
// viewport, fails on any console error or failed assertion.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/`;
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: 'ignore',
});
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

await waitForServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'fa-IR' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
let n = 0;
const snap = async (name) => shots && page.screenshot({ path: join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) });

try {
  // --- onboarding ---
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'خوش آمدید!' }).waitFor();
  assert((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'document is RTL in Persian');
  await snap('onboarding');
  await page.getByRole('button', { name: 'شروع', exact: true }).click();

  // --- home ---
  await page.getByRole('heading', { name: 'بخش‌ها' }).waitFor();
  await page.getByText('کل واژه‌ها').waitFor();
  await snap('home');

  // --- flashcards: reveal + grade a few cards ---
  await page.getByRole('link', { name: /شروع مرور|ادامهٔ یادگیری/ }).click();
  await page.getByRole('button', { name: 'نمایش پاسخ' }).waitFor();
  await snap('study-front');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'نمایش پاسخ' }).click();
    if (i === 0) await snap('study-back');
    await page.locator('.grades .g3').click();
  }
  const logs = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('mae-hsk');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('logs').objectStore('logs').count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );
  assert(logs === 4, `4 review logs stored, got ${logs}`);

  // --- word list + search + detail with stroke order ---
  await page.goto(`${BASE}#/words`);
  await page.locator('.wrow').first().waitFor();
  await page.getByRole('searchbox').fill('ni');
  await page.locator('.wrow', { hasText: '你' }).first().waitFor();
  await snap('words-search');
  await page.locator('.wrow', { hasText: '你' }).first().click();
  await page.getByRole('heading', { name: 'ترتیب خط‌ها' }).waitFor();
  await page.locator('.hw-box svg path').first().waitFor({ state: 'attached' });
  await snap('word-detail');

  // --- settings: switch UI to English and back ---
  await page.goto(`${BASE}#/settings`);
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  assert((await page.evaluate(() => document.documentElement.dir)) === 'ltr', 'document is LTR in English');
  await snap('settings-en');
  await page.getByRole('button', { name: 'فارسی' }).click();
  await page.getByRole('heading', { name: 'تنظیمات' }).first().waitFor();

  // --- level switch ---
  await page.goto(`${BASE}#/levels`);
  await page.getByRole('button', { name: /HSK ۳/ }).first().click();
  await page.getByRole('heading', { name: 'HSK ۳' }).waitFor();
  await snap('home-level3');

  // --- offline: the service worker must serve the app with the network gone ---
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 }).catch(() => undefined);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'بخش‌ها' }).waitFor({ timeout: 15000 });
  await page.goto(`${BASE}#/words`);
  await page.locator('.wrow').first().waitFor({ timeout: 15000 });
  await snap('offline-words');
  await ctx.setOffline(false);

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('SMOKE OK');
} catch (e) {
  if (shots) await page.screenshot({ path: join(shots, 'FAILED.png') }).catch(() => undefined);
  console.error(String(e));
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
}
