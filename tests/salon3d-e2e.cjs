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
    const sceneColors = async () => {          // WebGL-холст не читается напрямую: смотрим готовый снимок элемента
      const shot = (await page.locator('dialog[open] canvas').screenshot()).toString('base64');
      return page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const o = document.createElement('canvas'); o.width = 64; o.height = 40; const g = o.getContext('2d'); g.drawImage(img, 0, 0, 64, 40); const d = g.getImageData(0, 0, 64, 40).data; const set = new Set(); for (let i = 0; i < d.length; i += 16) set.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5)); return set.size; }, shot);
    };
    const barWidth = () => page.locator('[data-sh="bar"]').evaluate(el => parseFloat(el.style.width) || 0);
    await check(`[${label}] «Войти в 3D-салон»: превью до нажатия, по нажатию открывается на весь экран, сцена рисуется, пауза и подписи работают`, async () => {
      await page.goto(base + '/salon/', { waitUntil: 'load' });
      assert.ok(!(await page.evaluate(() => performance.getEntriesByType('resource').some(r => /showroom3d|three/.test(r.name)))), 'до нажатия библиотека не должна грузиться');
      await page.locator('[data-sh-start]').scrollIntoViewIfNeeded(); await page.waitForFunction(() => { const i = document.querySelector('.sh3d__poster'); return i && i.complete && i.naturalWidth > 100; }, null, { timeout: 15000 });
      assert.equal(await page.evaluate(() => document.querySelector('dialog[data-sh-root]').open), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'горизонтальная прокрутка');
      await page.locator('[data-sh-start]').click(); await page.waitForSelector('dialog[open] canvas', { timeout: 30000 }); await wait(2500);
      const box = await page.locator('dialog[open]').boundingBox(), vp = page.viewportSize();
      assert.ok(Math.abs(box.width - vp.width) <= 1 && Math.abs(box.height - vp.height) <= 1, `диалог не на весь экран: ${JSON.stringify(box)} vs ${JSON.stringify(vp)}`);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('has-dialog')), true, 'прокрутка страницы под диалогом должна быть заблокирована');
      assert.ok(await page.locator('.sh3d-full__exit').isVisible(), 'нет кнопки выхода');
      const colors = await sceneColors(); assert.ok(colors > 6, `сцена выглядит пустой: ${colors} оттенков`);
      const w0 = await barWidth(); await wait(2500); const w1 = await barWidth(); assert.ok(w1 > w0, `время модели не идёт: ${w0} → ${w1}`);
      await page.locator('[data-sh="play"]').click(); assert.equal(await page.locator('[data-sh="play"]').textContent(), 'Продолжить'); const w2 = await barWidth(); await wait(1500); assert.equal(await barWidth(), w2, 'пауза не остановила модель');
      await page.locator('[data-sh="labels"]').click(); assert.equal(await page.locator('[data-sh="labels"]').getAttribute('aria-pressed'), 'false');
      if (shots) { await page.locator('[data-sh="play"]').click(); await page.locator('[data-sh="labels"]').click(); await wait(1200); await page.screenshot({ path: `${shots}/${label}-3d-fullscreen.png` }); }
    });
    await check(`[${label}] выход: кнопка и Esc закрывают 3D и освобождают сцену; повторный вход работает с чистым состоянием`, async () => {
      await page.locator('.sh3d-full__exit').click(); await wait(400);
      assert.equal(await page.evaluate(() => document.querySelector('dialog[data-sh-root]').open), false, 'диалог не закрылся');
      assert.equal(await page.evaluate(() => !!document.querySelector('dialog[data-sh-root] canvas')), false, 'холст остался в странице');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('has-dialog')), false, 'прокрутка страницы не вернулась');
      await page.locator('[data-sh-start]').click(); await page.waitForSelector('dialog[open] canvas', { timeout: 30000 }); await wait(2000);
      assert.equal(await page.locator('[data-sh="play"]').textContent(), 'Пауза'); assert.equal(await page.locator('[data-sh="labels"]').getAttribute('aria-pressed'), 'true');
      const colors = await sceneColors(); assert.ok(colors > 6, `после повторного входа сцена пустая: ${colors}`);
      await page.keyboard.press('Escape'); await wait(400); assert.equal(await page.evaluate(() => document.querySelector('dialog[data-sh-root]').open), false, 'Esc не закрыл диалог');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'горизонтальная прокрутка после выхода');
    });
    await check(`[${label}] без WebGL: внутри окна понятное сообщение, выйти можно`, async () => {
      const c2 = await browser.newContext({ ...opts }), p2 = await c2.newPage(); await p2.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
      await p2.goto(base + '/salon/', { waitUntil: 'load' }); await p2.locator('[data-sh-start]').click(); await p2.waitForFunction(() => !document.querySelector('[data-sh="err"]').hidden, null, { timeout: 20000 });
      assert.ok(await p2.locator('.sh3d-full__exit').isVisible()); await p2.locator('.sh3d-full__exit').click(); await wait(300); assert.equal(await p2.evaluate(() => document.querySelector('dialog[data-sh-root]').open), false); await c2.close();
    });
    await ctx.close();
  }
  await browser.close(); server.close();
  if (external.length) { problems.push('внешние запросы: ' + [...new Set(external)].join(', ')); }
  const real = [...new Set(problems)]; if (real.length) { console.log('ПРОБЛЕМЫ:\n ' + real.join('\n ')); failed++; }
  console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nвсё прошло'); process.exit(failed ? 1 : 0);
})();
