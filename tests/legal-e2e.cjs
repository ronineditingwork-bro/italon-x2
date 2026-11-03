// Формы с персональными данными в настоящем браузере: без согласия ничего не уходит на сервер, с согласием заявка принимается и согласие записывается; в КП есть пояснение о предварительном расчёте.
// Сервер — настоящий worker/api.mjs с SQLite и заглушкой Telegram. Нужна собранная public/: npm run build:site. Запуск: node tests/legal-e2e.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync } = require('node:fs');
const { resolve, extname, join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const pub = resolve(__dirname, '..', 'public'), exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.png': 'image/png' };
const requests = [], telegram = []; let env = null, DB = null;
async function setup() {
  const { localDatabase } = await import('../scripts/sqlite-adapter.mjs'); DB = localDatabase().DB;
  env = { DB, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1', fetch: async (url, init) => { telegram.push({ url: String(url), text: typeof init.body === 'string' ? JSON.parse(init.body).text : '[file]' }); return new Response('{"ok":true}'); } };
}
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname; requests.push({ method: req.method, path });
  if (path.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c); const origin = `http://${req.headers.host}`, { handleApi } = await import('../worker/api.mjs');
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const r = await handleApi(new Request(origin + req.url, { method: req.method, headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }) }), env);
    const out = Object.fromEntries(r.headers); const sc = r.headers.getSetCookie?.(); if (sc?.length) out['set-cookie'] = sc; res.writeHead(r.status, out); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = decodeURIComponent(path); if (p.endsWith('/')) p += 'index.html';
  const f = join(pub, p); if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
let failed = 0; const problems = [];
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.stack || e.message).split('\n').slice(0, 6).join('\n  ')); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await setup(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: exe });
  for (const [label, opts] of [['desktop', { viewport: { width: 1366, height: 820 }, acceptDownloads: true }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }]]) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage();
    page.on('pageerror', e => problems.push(`${label}: ${e.message}`));
    const calls = path => requests.filter(r => r.path === path && r.method === 'POST').length;
    await check(`[${label}] запись в салон: без согласия форма не уходит, с согласием заявка принята и согласие записано`, async () => {
      await page.goto(base + '/salon/', { waitUntil: 'load' }); await page.fill('#sf-name', 'Тест Тестович'); await page.fill('#sf-phone', `+7 900 111-22-${label === 'desktop' ? '33' : '44'}`);
      const n0 = calls('/api/salon/book'); await page.locator('#salon-form button[type=submit]').click(); await wait(500);
      assert.equal(calls('/api/salon/book'), n0, 'без согласия запрос не должен уходить'); assert.match(await page.locator('#sf-error').textContent(), /согласие/i);
      assert.match(await page.locator('.salon-form__consent').textContent(), /Текст согласия/); assert.equal(await page.locator('.salon-form__consent a[href*="consent/#salon"]').count(), 1);
      await page.locator('#sf-consent').check(); await page.locator('#salon-form button[type=submit]').click(); await wait(1200);
      assert.equal(calls('/api/salon/book'), n0 + 1); const row = await DB.prepare("SELECT * FROM consents WHERE purpose='salon' ORDER BY id DESC").first(); assert.ok(row && /^[0-9a-f]{64}$/.test(row.contact_hash));
      assert.match(telegram.at(-1).text, /Согласие на обработку ПДн/);
    });
    await check(`[${label}] КП из корзины: без согласия PDF не формируется и ничего не уходит; с согласием КП скачивается, заявка и согласие сохранены, в PDF есть пояснение`, async () => {
      await page.goto(base + '/catalog/', { waitUntil: 'load' }); await page.waitForSelector('[data-add]'); await page.locator('[data-add]:not([disabled])').first().click(); await wait(1200);
      await page.waitForSelector('#quote-phone', { state: 'attached' }); if (!(await page.locator('#quote-phone').isVisible())) await page.evaluate(() => document.querySelector('[data-cart-open]').click());
      await page.waitForSelector('#quote-phone', { state: 'visible' }); await page.waitForFunction(() => !document.querySelector('#quote-download').disabled, null, { timeout: 15000 });
      await page.fill('#quote-phone', `+7 918 555-66-${label === 'desktop' ? '77' : '88'}`); const q0 = calls('/api/quote');
      await page.locator('#quote-download').click(); await wait(800);
      assert.equal(calls('/api/quote'), q0, 'без согласия заявка не уходит'); assert.match(await page.locator('#cart-error').textContent(), /согласие/i);
      assert.ok(await page.locator('.quote-form a[href*="consent/#quote"]').count() && await page.locator('.quote-form a[href*="privacy/"]').count(), 'ссылки на согласие и политику');
      await page.locator('#quote-consent').check(); const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#quote-download').click()]);
      const file = join(mkdtempSync(join(tmpdir(), 'kp-')), 'kp.pdf'); await dl.saveAs(file); await wait(1500);
      assert.equal(calls('/api/quote'), q0 + 1); const row = await DB.prepare("SELECT * FROM consents WHERE purpose='quote' ORDER BY id DESC").first(); assert.ok(row);
      assert.ok(telegram.some(t => /Согласие на обработку ПДн/.test(t.text) && /Для DAS/.test(t.text)), 'менеджер видит отметку о согласии');
      const text = execFileSync('pdftotext', ['-layout', file, '-']).toString().replace(/\s+/g, ' ');
      assert.match(text, /Предварительный расчёт/); assert.match(text, /не является подтверждением заказа/); assert.match(text, /заказ оформляется и оплачивается в салоне/);
    });
    await ctx.close();
  }
  await check('страницы документов и пояснение о ценах: /privacy/, /consent/, карточка товара', async () => {
    const page = await browser.newPage(); for (const [path, re] of [['/privacy/', /ООО «АМАНА ГРУПП»/], ['/consent/', /Согласие: Запись в салон/], ['/product/610010004077/', /носят справочный характер/]]) { await page.goto(base + path, { waitUntil: 'load' }); assert.match(await page.locator('body').innerText(), re, path); }
    await page.close();
  });
  await browser.close(); server.close();
  const real = [...new Set(problems)]; if (real.length) { console.log('ПРОБЛЕМЫ:\n ' + real.join('\n ')); failed++; }
  console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nвсё прошло'); process.exit(failed ? 1 : 0);
})();
