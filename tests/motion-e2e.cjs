// Слой движения в настоящем браузере: компьютер (мышь) и телефон (касания). Нужна тестовая сборка: SITE_PREVIEW=1 node scripts/build-site.mjs
// Запуск: node tests/motion-e2e.cjs   (PLAYWRIGHT_PATH, CHROMIUM — как в остальных e2e)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, existsSync, statSync, mkdirSync } = require('node:fs');
const { resolve, extname, join } = require('node:path');
const pub = resolve(__dirname, '..', 'public'), exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png' };
const shots = process.env.MOTION_SHOTS; if (shots) mkdirSync(shots, { recursive: true });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(pub, p); if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
let failed = 0; const problems = [];
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.stack || e.message).split('\n').slice(0, 6).join('\n  ')); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const PAGES = ['/', '/collections/', '/x2/', '/inspiration/'];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: exe });
  const VIEWS = [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['mobile320', { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]];
  for (const [label, opts] of VIEWS) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), mobile = label !== 'desktop';
    page.on('pageerror', e => problems.push(`${label} pageerror: ${e.message}`)); page.on('console', m => { if (m.type() === 'error') problems.push(`${label} console: ${m.text().slice(0, 160)}`); });
    page.on('requestfailed', r => problems.push(`${label} failed: ${r.url()}`)); page.on('response', r => { if (r.status() >= 400) problems.push(`${label} ${r.status()} ${r.url()}`); });
    const state = () => page.evaluate(() => ({ cls: document.documentElement.className, st: window.ItalonMotion?.state(), sw: document.documentElement.scrollWidth, iw: innerWidth }));

    await check(`[${label}] по умолчанию слой включён нужного уровня, панель сравнения на месте, горизонтальной прокрутки нет (4 страницы)`, async () => {
      for (const path of PAGES) {
        await page.goto(base + path, { waitUntil: 'load' }); await page.waitForSelector('.motion-panel [data-mp-mode]'); await wait(400);
        const s = await state(); assert.equal(s.st.on, true, path); assert.equal(s.st.tier, mobile ? 'lite' : 'desktop', path); assert.ok(s.sw <= s.iw, `${path}: scrollWidth ${s.sw} > ${s.iw}`);
        assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex, nofollow');
      }
    });
    await check(`[${label}] «Как сейчас» убирает слой без перезагрузки и без потери места на странице; «С новыми эффектами» возвращает`, async () => {
      await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForSelector('.motion-panel [data-mp-mode]');
      await wait(800); await page.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await wait(1200); const y0 = await page.evaluate(() => scrollY); assert.ok(y0 > 300, `не прокрутилось: ${y0}`);
      await page.evaluate(() => { window.__same = 1; });
      await page.locator('[data-mp-mode="off"]').click(); await wait(300);
      const off = await state(); assert.equal(off.st.on, false); assert.ok(!/\bmotion-(on|enhanced|lite|desktop)\b/.test(off.cls), off.cls);
      assert.equal(await page.evaluate(() => window.__same), 1, 'страница перезагрузилась'); assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y0) < 60, 'потеряна позиция прокрутки');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-motion-parallax]')).transform), 'none', 'transform фото не сброшен');
      await page.locator('[data-mp-mode="on"]').click(); await wait(500); const on = await state(); assert.equal(on.st.on, true); assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y0) < 80, 'потеряна позиция после включения');
    });
    await check(`[${label}] сдвиг фото главного экрана идёт при прокрутке, края не оголяются`, async () => {
      await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForSelector('.motion-panel [data-mp-mode]'); await wait(500);
      const t0 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-motion-parallax]')).transform);
      await page.evaluate(() => scrollTo(0, 500)); await wait(1200);
      const r = await page.evaluate(() => { const i = document.querySelector('[data-motion-parallax]'), p = i.parentElement.getBoundingClientRect(), b = i.getBoundingClientRect(); return { t: getComputedStyle(i).transform, top: b.top - p.top, bottom: p.bottom - b.bottom, left: b.left - p.left, right: p.right - b.right }; });
      assert.notEqual(r.t, t0, 'transform не менялся'); assert.ok(r.top <= 0.5 && r.bottom <= 0.5 && r.left <= 0.5 && r.right <= 0.5, `оголён край: ${JSON.stringify(r)}`);
      if (shots) { await page.evaluate(() => scrollTo(0, 0)); await wait(600); await page.screenshot({ path: `${shots}/${label}-home-on.png` }); }
    });
    if (!mobile) {
      await check(`[${label}] Lenis: плавная прокрутка колесом, якорь не прячется под шапкой, диалог останавливает фон`, async () => {
        await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForSelector('.motion-panel [data-mp-mode]'); await wait(900);
        assert.ok(await page.evaluate(() => document.documentElement.classList.contains('lenis')), 'Lenis не запущен');
        await page.mouse.move(700, 500); await page.mouse.wheel(0, 600); await wait(120); const mid = await page.evaluate(() => scrollY); await wait(1400); const end = await page.evaluate(() => scrollY);
        assert.ok(end > 200 && end >= mid, `колесо: ${mid} → ${end}`);
        await page.locator('[data-menu-open], [data-search-open]').first().click().catch(() => {}); await wait(300);
        if (await page.evaluate(() => document.documentElement.classList.contains('has-dialog'))) { const y = await page.evaluate(() => scrollY); await page.mouse.wheel(0, 800); await wait(900); assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y) < 5, 'фон прокрутился под диалогом'); await page.keyboard.press('Escape'); await wait(300); assert.ok(!(await page.evaluate(() => document.documentElement.classList.contains('lenis-stopped'))), 'Lenis не возобновился'); }
      });
      await check(`[${label}] магнитная кнопка тянется к курсору и возвращается; подсветка карточки включается под курсором`, async () => {
        await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForSelector('.motion-panel [data-mp-mode]'); await wait(700);
        const b = await page.locator('[data-motion-magnet]').first(); const box = await b.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 6 }); await wait(500);
        const moved = await b.evaluate(el => getComputedStyle(el).transform); assert.notEqual(moved, 'none', 'кнопка не сдвинулась');
        await page.mouse.move(5, 5); await wait(700); const back = await b.evaluate(el => getComputedStyle(el).transform); assert.ok(back === 'none' || /matrix\(1, 0, 0, 1, (-?0(\.\d+)?|-?0), (-?0(\.\d+)?|-?0)\)/.test(back), `не вернулась: ${back}`);
        await page.evaluate(() => document.querySelector('.tiles')?.scrollIntoView({ block: 'center' })); await wait(1200);
        const card = page.locator('[data-motion-spotlight]').first(), cb = await card.boundingBox(); await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 3, { steps: 4 }); await wait(500);
        const op = await card.evaluate(el => getComputedStyle(el.querySelector('.media') || el, '::after').opacity); assert.ok(Number(op) > 0.9, `подсветка не включилась: ${op}`);
        if (shots) await page.screenshot({ path: `${shots}/${label}-home-spotlight.png` });
      });
    } else {
      await check(`[${label}] телефон: родная прокрутка без Lenis, нажатие на карточку и кнопку даёт отклик`, async () => {
        await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForSelector('.motion-panel [data-mp-mode]'); await wait(600);
        assert.ok(!(await page.evaluate(() => document.documentElement.classList.contains('lenis'))), 'на телефоне не должно быть Lenis');
        await page.evaluate(() => document.querySelector('.tiles')?.scrollIntoView({ block: 'center' })); await wait(1000);
        const hit = await page.evaluate(() => { const c = document.querySelector('[data-motion-spotlight]'), r = c.getBoundingClientRect(), m = c.querySelector('.media') || c; c.addEventListener('click', e => e.preventDefault(), { once: true }); const ev = new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 3 }); c.querySelector('img,figure,span')?.dispatchEvent(ev); return { spot: m.classList.contains('m-spot'), soft: c.classList.contains('m-press-soft') }; });
        assert.ok(hit.spot && hit.soft, `нет отклика карточки: ${JSON.stringify(hit)}`);
        const btn = await page.evaluate(() => { const b = document.querySelector('[data-motion-magnet]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 5, clientY: 5 })); return b.classList.contains('m-press'); }); assert.ok(btn, 'нет отклика кнопки');
        if (shots) await page.screenshot({ path: `${shots}/${label}-home-on.png` });
      });
    }
    await check(`[${label}] prefers-reduced-motion: слой не запускается, страница остаётся прежней`, async () => {
      const c2 = await browser.newContext({ ...opts, reducedMotion: 'reduce' }), p2 = await c2.newPage(); await p2.goto(base + '/', { waitUntil: 'load' }); await wait(800);
      const s = await p2.evaluate(() => ({ on: window.ItalonMotion?.state().on, cls: document.documentElement.className, panel: !!document.querySelector('.motion-panel') }));
      assert.equal(s.on, false); assert.ok(!/motion-on/.test(s.cls)); await c2.close();
    });
    await ctx.close();
  }
  await check('без JS: страницы читаются, панель и классы движения не появляются', async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false }), p = await ctx.newPage(); await p.goto(base + '/', { waitUntil: 'load' });
    assert.ok(await p.locator('h1').count()); assert.equal(await p.locator('.motion-panel').count(), 0); await ctx.close();
  });
  await browser.close(); server.close();
  const real = [...new Set(problems)].filter(x => !/favicon|api\/cart|status of 404/.test(x)); if (real.length) { console.log('ПРОБЛЕМЫ В КОНСОЛИ/СЕТИ:\n ' + real.slice(0, 15).join('\n ')); failed++; }
  console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nвсё прошло'); process.exit(failed ? 1 : 0);
})();
