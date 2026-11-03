// 3D-модель салона на /salon/ в настоящем браузере (WebGL через SwiftShader): запускается по нажатию, рисует сцену, события идут, кнопки работают, внешних запросов нет.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, existsSync, statSync, mkdirSync } = require('node:fs');
const { resolve, extname, join } = require('node:path');
const pub = resolve(__dirname, '..', 'public'), exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const shots = process.env.SHOTS; if (shots) mkdirSync(shots, { recursive: true });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(pub, p); if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
let failed = 0; const problems = [], external = [];
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.stack || e.message).split('\n').slice(0, 6).join('\n  ')); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  for (const [label, opts] of [['desktop', { viewport: { width: 1366, height: 820 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['mobile320', { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage();
    page.on('pageerror', e => problems.push(`${label}: ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/404|api\/cart/.test(m.text())) problems.push(`${label} console: ${m.text().slice(0, 160)}`); });
    page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
    await check(`[${label}] 3D-модель: до нажатия не загружается, после — рисует сцену, события меняются, пауза и подписи работают`, async () => {
      await page.goto(base + '/salon/', { waitUntil: 'load' });
      assert.ok(!(await page.evaluate(() => performance.getEntriesByType('resource').some(r => /showroom3d|three/.test(r.name)))), 'до нажатия библиотека не должна грузиться');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'горизонтальная прокрутка');
      await page.locator('[data-sh-start]').scrollIntoViewIfNeeded(); await page.locator('[data-sh-start]').click();
      await page.waitForFunction(() => !document.querySelector('[data-sh="stage"]').hidden && document.querySelector('[data-sh-poster]').hidden, null, { timeout: 30000 }); await wait(2500);
      const shot = (await page.locator('[data-sh="stage"]').screenshot()).toString('base64');       // WebGL-холст не читается напрямую: смотрим готовый снимок элемента
      const px = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const o = document.createElement('canvas'); o.width = 64; o.height = 40; const g = o.getContext('2d'); g.drawImage(img, 0, 0, 64, 40); const d = g.getImageData(0, 0, 64, 40).data; const set = new Set(); for (let i = 0; i < d.length; i += 16) set.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5)); return set.size; }, shot);
      assert.ok(px > 6, `сцена выглядит пустой: ${px} оттенков`);
      const e0 = await page.locator('[data-sh="evt"]').textContent(), w0 = await page.locator('[data-sh="bar"]').evaluate(el => parseFloat(el.style.width) || 0); await wait(2500);
      const w1 = await page.locator('[data-sh="bar"]').evaluate(el => parseFloat(el.style.width) || 0); assert.ok(w1 > w0, `время модели не идёт: ${w0} → ${w1}`);
      await page.locator('[data-sh="play"]').click(); assert.equal(await page.locator('[data-sh="play"]').textContent(), 'Продолжить'); const w2 = await page.locator('[data-sh="bar"]').evaluate(el => parseFloat(el.style.width)); await wait(1500); assert.equal(await page.locator('[data-sh="bar"]').evaluate(el => parseFloat(el.style.width)), w2, 'пауза не остановила модель');
      await page.locator('[data-sh="labels"]').click(); assert.equal(await page.locator('[data-sh="labels"]').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'горизонтальная прокрутка после запуска');
      if (shots) { await page.locator('[data-sh="play"]').click(); await page.locator('.sh3d').scrollIntoViewIfNeeded(); await wait(1500); await page.screenshot({ path: `${shots}/${label}-salon-3d.png` }); }
    });
    await check(`[${label}] без WebGL понятное сообщение вместо пустого экрана`, async () => {
      const c2 = await browser.newContext({ ...opts }), p2 = await c2.newPage(); await p2.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
      await p2.goto(base + '/salon/', { waitUntil: 'load' }); await p2.locator('[data-sh-start]').click(); await p2.waitForFunction(() => !document.querySelector('[data-sh="err"]').hidden, null, { timeout: 20000 }); await c2.close();
    });
    await ctx.close();
  }
  await browser.close(); server.close();
  if (external.length) { problems.push('внешние запросы: ' + [...new Set(external)].join(', ')); }
  const real = [...new Set(problems)]; if (real.length) { console.log('ПРОБЛЕМЫ:\n ' + real.join('\n ')); failed++; }
  console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nвсё прошло'); process.exit(failed ? 1 : 0);
})();
