// MATERIAL LAB в настоящем браузере (Chromium, программный WebGL 2): запуск и витрина, раскладка «пиксель в пиксель» с JS-эталоном, жесты мышью и касаниями,
// режимы света и сутки, укладка, сравнение с любым вторым материалом, каталог (поиск, фильтры, полная и упрощённая симуляция), ссылка на композицию,
// снимок JPG, ролик, корзина, измерение скорости, лёгкий режим и запасной режим без WebGL 2.
// Запуск: PLAYWRIGHT_PATH=/путь/к/playwright node tests/lab-e2e.cjs   (нужна собранная public/: npm run build:site)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname, join } = require('node:path');

const root = resolve(__dirname, '..'), pub = resolve(root, 'public'), exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(pub, p); if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
let failed = 0;
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.stack || e.message).split('\n').slice(0, 7).join('\n  ')); } }
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const api = (page, fn, arg) => page.evaluate(([f, a]) => { const l = document.querySelector('[data-lab]').labApi; return eval(f)(l, a); }, [fn, arg]);
const wait = ms => new Promise(r => setTimeout(r, ms));
const tab = async (page, id) => { const s = await page.evaluate(id => ({ sel: document.querySelector(`[data-tab="${id}"]`).getAttribute('aria-selected') === 'true', folded: document.querySelector('[data-panel]').classList.contains('is-folded') }), id); if (!s.sel || s.folded) await page.locator(`[data-tab="${id}"]`).click(); };
const zlib = require('node:zlib'), fs = require('node:fs');
function makePng(w, h) {   // простой градиентный PNG для проверки подключения оригиналов
  const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }), crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 120 + ((x * 90 / w) | 0); raw[o + 1] = 90 + ((y * 100 / h) | 0); raw[o + 2] = 70 + (((x + y) % 40) | 0); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const FEATURED = ['610010003167', '610010002765', '610010002799', '610010002696', '610010001319', '610010002735', '610010002664', '610010002667'];
const frameSum = (page, area = [0, 0, 1, 1]) => api(page, `(l)=>{l.markDirty();return new Promise(r=>requestAnimationFrame(()=>{const c=document.createElement('canvas');c.width=48;c.height=48;const g=c.getContext('2d');const W=l.canvas.width,H=l.canvas.height,a=${JSON.stringify(area)};g.drawImage(l.canvas,a[0]*W,a[1]*H,(a[2]-a[0])*W,(a[3]-a[1])*H,0,0,48,48);const d=g.getImageData(0,0,48,48).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]*2+d[i+2];r(s)}))}`);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const problems = [];
  const watch = (page, label) => { page.on('pageerror', e => problems.push(`${label}: ${e.message}`)); page.on('console', m => m.type() === 'error' && !/favicon|404/.test(m.text()) && problems.push(`${label}: console.error ${m.text()}`)); };
  const open = async (browser, label, opts = {}, url = '/lab/') => { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); watch(page, label); await page.goto(base + url, { waitUntil: 'load' }); await page.waitForFunction(() => document.querySelector('[data-lab]')?.dataset.state === 'ready', null, { timeout: 40000 }); await wait(800); await api(page, '(l)=>l.setAuto(false)'); return { ctx, page }; };
  const browser = await chromium.launch({ executablePath: exe, args: GL_ARGS });
  try {
    for (const [label, vp, mobile] of [['desktop', { viewport: { width: 1366, height: 820 } }, false], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]].filter(x => !process.env.LAB_ONLY || x[0] === process.env.LAB_ONLY)) {
      const { ctx, page } = await open(browser, label, vp);
      await check(`[${label}] стартовый экран: заголовок, кнопка, 8 материалов витрины с артикулами, WebGL 2, без горизонтальной прокрутки`, async () => {
        const r = await page.evaluate(() => { const l = document.querySelector('[data-lab]'); return { tier: l.dataset.tier, h1: l.querySelector('h1').textContent, cta: !!l.querySelector('[data-start]'), mats: [...l.querySelectorAll('[data-strip] [data-mat]')].map(b => b.dataset.mat + '|' + b.textContent.replace(/\s+/g, ' ').trim()), sw: document.documentElement.scrollWidth, iw: innerWidth, fb: !!l.labApi.view.fallback, all: !!l.querySelector('[data-open-catalog]') }; });
        assert.equal(r.h1, 'MATERIAL LAB'); assert.ok(r.cta && r.all); assert.notEqual(r.tier, 'fallback'); assert.equal(r.fb, false); assert.equal(r.mats.length, 8);
        FEATURED.forEach((code, i) => assert.ok(r.mats[i].startsWith(code) && r.mats[i].includes(code), r.mats[i])); assert.ok(r.sw <= r.iw, `scrollWidth ${r.sw} > ${r.iw}`);
      });
      await check(`[${label}] галерея: горизонтальная прокрутка${mobile ? ' и свайп пальцем' : ''}, выбор карточки меняет материал и товар`, async () => {
        const m = await page.evaluate(() => { const s = document.querySelector('[data-strip]'); return { sw: s.scrollWidth, cw: s.clientWidth, left: s.scrollLeft }; });
        if (mobile) assert.ok(m.sw > m.cw + 50, `галерея не прокручивается: ${m.sw}/${m.cw}`);
        if (mobile) { const bb = await page.locator('[data-strip]').boundingBox(), cdp = await page.context().newCDPSession(page), pt = (x, y) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }), y = bb.y + bb.height / 2;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(bb.x + bb.width - 30, y)] }); for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(bb.x + bb.width - 30 - i * 30, y)] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(500);
          assert.ok((await page.evaluate(() => document.querySelector('[data-strip]').scrollLeft)) > m.left + 40, 'свайп не прокрутил галерею'); }
        await page.locator('[data-strip] [data-mat="610010002765"]').scrollIntoViewIfNeeded(); await page.locator('[data-strip] [data-mat="610010002765"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.material === '610010002765', null, { timeout: 15000 });
        assert.equal(await api(page, '(l)=>l.cur.code'), '610010002765'); assert.equal(await page.locator('[data-strip] [aria-checked="true"]').getAttribute('data-mat'), '610010002765');
      });
      await check(`[${label}] раскладка в шейдере совпадает с JS-эталоном (id плитки, шов) во всех схемах укладки`, async () => {
        for (const [format, bond] of [['60x60', 'straight'], ['30x60', 'half'], ['20x120', 'third']]) {
          const bad = await page.evaluate(([format, bond]) => {
            const l = document.querySelector('[data-lab]').labApi, { tileAt, variantOf, unproject } = l.lib, st = l.st;
            const FM = { '60x60': [60, 60], '30x60': [30, 60], '20x120': [20, 120] }[format];
            st.format = format; st.bond = bond; st.cam = { center: [17.3, -9.1], rot: 0.37, tilt: 0.45, ppcm: 6 }; st.jointMm = 4;
            l.resize(); l.syncSlots(); const rs = l.renderState(); const cv = l.canvas, W = cv.width, H = cv.height, k = W / cv.getBoundingClientRect().width;
            l.view.render(rs, { cssWidth: cv.getBoundingClientRect().width, debug: true }); const gl = l.view.gl, buf = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            const mode = { straight: 0, half: 1, third: 2 }[bond]; let bad = 0, n = 0, tested = 0;
            for (let i = 0; i < 400; i++) {
              const x = Math.floor((i * 7919) % W), y = Math.floor((i * 104729) % (H * 0.8)) + Math.floor(H * 0.2); if (y >= H) continue;
              const P = unproject(st.cam, (x + 0.5) / k, (H - y - 0.5) / k, W / k, H / k); if (!P) continue;
              const t = tileAt(P[0], P[1], { w: FM[0], h: FM[1], joint: rs.joint, mode }); n++;
              if (Math.abs(t.edge) < 0.12) continue; tested++;
              const o = (y * W + x) * 4, inside = buf[o + 1] > 127;
              if (inside !== t.inside) { bad++; continue; }
              if (t.inside) { const a = variantOf(t.col, t.row).id; if (Math.abs(buf[o] / 255 - a) > 0.012) bad++; }
            }
            return { bad, tested, n };
          }, [format, bond]);
          assert.ok(bad.tested > 150, `мало проверенных точек: ${JSON.stringify(bad)}`); assert.equal(bad.bad, 0, `${format}/${bond}: расхождений ${bad.bad} из ${bad.tested}`);
        }
        await page.evaluate(() => { const l = document.querySelector('[data-lab]').labApi; Object.assign(l.st, { format: '60x60', bond: 'straight', jointMm: 2 }); l.resetView(); });
      });
      await check(`[${label}] режимы света, высота, формат, шов, цвет шва, раскладка и поворот укладки меняют состояние и картинку`, async () => {
        const sums = new Set(); await tab(page, 'light');
        for (const m of ['day', 'evening', 'side', 'time']) { await page.locator(`[data-mode="${m}"]`).click(); await wait(1700); assert.equal(await api(page, '(l)=>l.st.mode'), m); sums.add(await frameSum(page)); }
        assert.equal(sums.size, 4, 'режимы света должны давать разные кадры'); await page.locator('[data-mode="evening"]').click(); await wait(1300);
        await tab(page, 'layout'); const s0 = await frameSum(page);
        await page.locator('[data-format="30x60"]').click(); assert.equal(await api(page, '(l)=>l.st.format'), '30x60'); const s1 = await frameSum(page); assert.notEqual(s0, s1);
        await page.locator('[data-turn]').click(); assert.equal(await api(page, '(l)=>l.st.turned'), true);
        await page.locator('[data-jc="black"]').click(); assert.equal(await api(page, '(l)=>l.st.jointColor'), 'black');
        await page.locator('[data-seg="bond"][data-value="half"]').click(); assert.equal(await api(page, '(l)=>l.st.bond'), 'half');
        await page.locator('[data-joint]').fill('8'); assert.equal(await api(page, '(l)=>l.st.jointMm'), 8); assert.match(await page.locator('[data-joint-out]').textContent(), /8/);
        const s2 = await frameSum(page); assert.notEqual(s1, s2);
        await page.evaluate(() => { const l = document.querySelector('[data-lab]').labApi; Object.assign(l.st, { format: '60x60', bond: 'straight', jointMm: 2, turned: false, jointColor: 'white' }); l.resetView(); });
      });
      await check(`[${label}] «Архитектурная машина времени»: комната с окном, пресеты Утро/День/Вечер/Ночь, ползунок времени, сутки за 14 секунд`, async () => {
        await tab(page, 'time'); await page.locator('[data-tpreset="day"]').click(); await wait(2600);
        assert.equal(await api(page, '(l)=>l.st.mode'), 'time'); assert.ok(Math.abs(await api(page, '(l)=>l.st.hour') - 13) < 0.05); assert.match(await page.locator('[data-clock]').textContent(), /13:00 · День/); assert.equal(await page.locator('[data-clock]').isVisible(), true);
        const cam = await api(page, '(l)=>l.st.cam'); assert.ok(cam.tilt > 0.9 && cam.center[1] > 30, `камера не перешла на вид комнаты: ${JSON.stringify(cam)}`);
        const sums = new Set([await frameSum(page)]);
        for (const id of ['morning', 'evening', 'night']) { await page.locator(`[data-tpreset="${id}"]`).click(); await wait(2600); sums.add(await frameSum(page)); assert.equal(await page.locator(`[data-tpreset="${id}"]`).getAttribute('aria-checked'), 'true'); }
        assert.equal(sums.size, 4, 'четыре времени суток дают четыре разных кадра');
        await page.locator('[data-hour]').fill('16.5'); assert.match(await page.locator('[data-hour-out]').textContent(), /16:30/); assert.match(await page.locator('[data-clock]').textContent(), /16:30/);
        await page.locator('[data-day-play]').click(); await wait(1500); const h1 = await api(page, '(l)=>l.st.hour'); await page.waitForFunction(h => document.querySelector('[data-lab]').labApi.st.hour > h + 0.2, h1, { timeout: 25000 });
        await page.locator('[data-day-play]').click(); assert.equal(await page.locator('[data-day-play]').getAttribute('aria-pressed'), 'false');
        await tab(page, 'light'); await page.locator('[data-mode="evening"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').labApi.st.cam.tilt < 0.9, null, { timeout: 25000 });
      });
      await check(`[${label}] перетаскивание сдвигает поверхность, колесо/щипок меняют масштаб, поворот, наклон, сброс вида`, async () => {
        await api(page, '(l)=>{l.resetView()}'); await wait(200); const c0 = await api(page, '(l)=>JSON.stringify(l.st.cam)'); const box = await page.locator('[data-canvas]').boundingBox();
        const cx = box.x + box.width * 0.4, cy = box.y + box.height * (mobile ? 0.3 : 0.5);
        if (!mobile) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 120, cy + 60, { steps: 6 }); await page.mouse.up(); await page.mouse.wheel(0, -400); await wait(200); }
        else {
          const cdp = await page.context().newCDPSession(page); const pt = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(1, cx, cy)] });
          for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(1, cx + i * 15, cy + i * 8)] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await wait(500); const ob = await page.locator('[data-orb]').boundingBox(), py = [cy, 170, 330, 240].find(y => !ob || Math.abs(ob.y + ob.height / 2 - y) > 80); const p1 = [cx - 40, py], p2 = [cx + 40, py];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(1, ...p1), pt(2, ...p2)] }); await wait(120);
          for (let i = 1; i <= 8; i++) { const a = i * 0.08, r = 40 + i * 9; await wait(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(1, cx - r * Math.cos(a), py - r * Math.sin(a)), pt(2, cx + r * Math.cos(a), py + r * Math.sin(a))] }); }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(200);
        }
        const c1 = JSON.parse(await api(page, '(l)=>JSON.stringify(l.st.cam)')), c = JSON.parse(c0);
        assert.notDeepEqual(c1.center, c.center, 'поверхность не сдвинулась'); assert.ok(c1.ppcm > c.ppcm * 1.1, `масштаб не вырос: ${c0} → ${JSON.stringify(c1)}`);
        if (mobile) assert.ok(Math.abs(c1.rot - c.rot) > 0.2, `поворот двумя пальцами не сработал: ${c1.rot}`);
        await tab(page, 'light'); await page.locator('[data-tilt]').fill('0.2'); assert.ok(Math.abs((await api(page, '(l)=>l.st.cam.tilt')) - 0.2) < 0.01);
        await page.locator('[data-drag="rotate"]').click(); const r0 = await api(page, '(l)=>l.st.cam.rot');
        if (!mobile) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 100, cy, { steps: 5 }); await page.mouse.up(); assert.ok(Math.abs((await api(page, '(l)=>l.st.cam.rot')) - r0) > 0.3); }
        await page.locator('[data-drag="move"]').click(); await page.locator('[data-reset]').click(); assert.ok(Math.abs((await api(page, '(l)=>l.st.cam.center[0]'))) < 1e-6);
        await page.locator('[data-canvas]').focus(); await page.keyboard.press('+'); assert.ok((await api(page, '(l)=>l.st.cam.ppcm')) > 0); await page.keyboard.press('ArrowLeft');
      });
      await check(`[${label}] источник света перетаскивается и двигает свет; клавиатура двигает свет`, async () => {
        await api(page, '(l)=>{l.resetView();l.setAuto(false)}'); await wait(400);
        const ob = await page.locator('[data-orb]').boundingBox(); assert.ok(ob, 'шар света не виден'); const l0 = await api(page, '(l)=>JSON.stringify(l.st.light)');
        const sx = ob.x + ob.width / 2, sy = ob.y + ob.height / 2, box = await page.locator('[data-canvas]').boundingBox(), tx = box.x + box.width * 0.3, ty = box.y + box.height * (mobile ? 0.3 : 0.6);
        if (!mobile) { await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 8 }); await page.mouse.up(); }
        else { const cdp = await page.context().newCDPSession(page), pt = (x, y) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(sx, sy)] }); for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(sx + (tx - sx) * i / 8, sy + (ty - sy) * i / 8)] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        await wait(300); const l1 = await api(page, '(l)=>JSON.stringify(l.st.light)'); assert.notEqual(l0, l1); await tab(page, 'light'); assert.equal(await page.locator('[data-auto]').getAttribute('aria-pressed'), 'false');
        await page.locator('[data-orb]').focus(); await page.keyboard.press('ArrowRight'); assert.notEqual(l1, await api(page, '(l)=>JSON.stringify(l.st.light)'));
      });
      await check(`[${label}] каталог «Все материалы»: 760 изделий для лаборатории, поиск по артикулу и названию среди всех 1202, фильтры, сортировка`, async () => {
        await page.locator('[data-open-catalog]').click(); await page.waitForSelector('[data-cat]:not([hidden])');
        await page.waitForFunction(() => /^Найдено 760/.test(document.querySelector('[data-cat-count]').textContent), null, { timeout: 30000 });
        const all = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-cat-grid] .lab-card').length, count: document.querySelector('[data-cat-count]').textContent })); assert.ok(all.cards >= 40 && all.cards <= 60, `первая страница: ${all.cards}`); assert.match(all.count, /из 760/);
        const q = async text => { await page.fill('[data-cat-q]', text); await wait(450); return page.evaluate(() => ({ count: document.querySelector('[data-cat-count]').textContent, first: document.querySelector('[data-cat-grid] .lab-card b')?.textContent, code: document.querySelector('[data-cat-grid] .lab-card [data-code], [data-cat-grid] .lab-card small:last-child')?.textContent, ms: +document.querySelector('[data-lab]').dataset.searchMs, off: document.querySelectorAll('[data-cat-grid] .lab-card.is-off').length, n: document.querySelectorAll('[data-cat-grid] .lab-card').length })); };
        let r = await q('610010003167'); assert.equal(r.first, 'Ривьера Уайт'); assert.match(r.code, /610010003167/); assert.equal(r.n, 1);
        r = await q('6100100027'); assert.ok(r.n > 3, 'поиск по началу артикула');
        r = await q('вояджер'); assert.ok(/Вояджер/.test(r.first) && r.n >= 3, 'поиск по названию');
        r = await q('мозаика'); assert.ok(r.off > 0 && /без фото для лаборатории|Найдено 0/.test(r.count), 'мозаика найдена, но помечена как не входящая в лабораторию');
        r = await q('zzzzqq'); assert.equal(r.n, 0); assert.match(await page.locator('.lab-cat__empty').textContent(), /Ничего не найдено/);
        r = await q('уайт'); assert.ok(r.ms < 80, `поиск в браузере: ${r.ms} мс`); await page.click('[data-f-reset]'); await wait(300);
        await page.waitForFunction(() => !document.querySelector('[data-f="color"]').disabled, null, { timeout: 30000 });
        const sel = async (f, v) => { await page.selectOption(`[data-f="${f}"]`, v); await wait(300); return +(await page.locator('[data-cat-count]').textContent()).match(/Найдено (\d+)/)[1]; };
        const opts = await page.evaluate(() => ({ coll: document.querySelectorAll('[data-f="collection"] option').length, color: document.querySelectorAll('[data-f="color"] option').length, look: document.querySelectorAll('[data-f="look"] option').length, fmt: document.querySelectorAll('[data-f="format"] option').length }));
        assert.ok(opts.coll > 30 && opts.color >= 5 && opts.look >= 4 && opts.fmt >= 6, JSON.stringify(opts));
        const nFmt = await sel('format', '60X60'); assert.ok(nFmt > 100 && nFmt < 760, `формат 60×60: ${nFmt}`);
        const colorVals = await page.evaluate(() => [...document.querySelectorAll('[data-f="color"] option')].map(o => o.value).filter(Boolean)); const nColor = await sel('color', colorVals[0]); assert.ok(nColor > 0 && nColor < nFmt, `цвет внутри формата: ${nColor}`);
        const lookVals = await page.evaluate(() => [...document.querySelectorAll('[data-f="look"] option')].map(o => o.value).filter(Boolean)); const nLook = await sel('look', lookVals[0]); assert.ok(nLook <= nColor);
        await page.click('[data-f-reset]'); await wait(300); assert.match(await page.locator('[data-cat-count]').textContent(), /Найдено 760/);
        const nColl = await sel('collection', await page.evaluate(() => document.querySelectorAll('[data-f="collection"] option')[3].value)); assert.ok(nColl > 0 && nColl < 100);
        await page.click('[data-f-reset]'); await page.selectOption('[data-sort]', 'name'); await wait(300); const names = await page.evaluate(() => [...document.querySelectorAll('[data-cat-grid] .lab-card b')].slice(0, 12).map(b => b.textContent)); assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ru')));
        await page.selectOption('[data-sort]', 'popular'); await page.locator('[data-cat-more] button').click(); await wait(300); assert.ok((await page.evaluate(() => document.querySelectorAll('[data-cat-grid] .lab-card').length)) > 90, '«Показать ещё»');
        await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-cat]').isHidden(), true);
      });
      await check(`[${label}] выбор из каталога: полноценное фото — полная симуляция; маленькое — упрощённый режим без дорисовки и с пределом приближения`, async () => {
        await page.locator('[data-open-catalog]').click(); await page.waitForSelector('[data-cat]:not([hidden])'); await page.waitForFunction(() => /^Найдено/.test(document.querySelector('[data-cat-count]').textContent), null, { timeout: 30000 });
        await page.fill('[data-cat-q]', '610010002664'); await wait(450); await page.locator('[data-cat-grid] [data-pick="610010002664"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.material === '610010002664', null, { timeout: 15000 });
        assert.equal(await page.locator('[data-lab]').getAttribute('data-quality'), 'hd'); assert.ok(await api(page, '(l)=>l.cur.surf.relief') > 0);
        const lite = await api(page, '(l)=>{const e=l.catalog.data.eligible.find(x=>x.quality==="lite"&&x.imgW<200);return e&&{code:e.code,max:e.maxPpcm,w:e.imgW}}'); assert.ok(lite, 'в каталоге нет упрощённых позиций');
        await page.locator('[data-open-catalog]').click(); await page.waitForSelector('[data-cat]:not([hidden])'); await page.fill('[data-cat-q]', lite.code); await wait(450); await page.locator(`[data-cat-grid] [data-pick="${lite.code}"]`).click();
        await page.waitForFunction(c => document.querySelector('[data-lab]').dataset.material === c, lite.code, { timeout: 15000 });
        assert.equal(await page.locator('[data-lab]').getAttribute('data-quality'), 'lite'); const surf = await api(page, '(l)=>l.cur.surf'); assert.equal(surf.relief, 0); assert.equal(surf.micro, 0);
        await tab(page, 'item'); assert.match(await page.locator('[data-item-quality]').textContent(), /Упрощённый режим/); assert.match(await page.locator('[data-item-meta]').textContent(), new RegExp(lite.code));
        await api(page, '(l)=>l.resetView()'); const box = await page.locator('[data-canvas]').boundingBox(); await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -900); await wait(40); }
        await wait(300); const ppcm = await api(page, '(l)=>l.st.cam.ppcm'); assert.ok(ppcm <= lite.max + 1e-6, `приближение ${ppcm} выше предела ${lite.max}`);
        await page.locator('[data-open-catalog]').click(); await page.waitForSelector('[data-cat]:not([hidden])'); await page.fill('[data-cat-q]', 'мозаика'); await wait(450);
        const off = page.locator('[data-cat-grid] .lab-card.is-off').first(); assert.equal(await off.evaluate(e => e.tagName), 'A'); assert.match(await off.getAttribute('href'), /product\/\d{12}\/$/); await page.keyboard.press('Escape');
        await page.locator('[data-strip] [data-mat="610010002799"]').scrollIntoViewIfNeeded(); await page.locator('[data-strip] [data-mat="610010002799"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.material === '610010002799', null, { timeout: 15000 });
      });
      await check(`[${label}] скорость: смена материалов, память текстур ограничена, разбор признаков не блокирует интерфейс`, async () => {
        const r = await page.evaluate(async () => {
          const l = document.querySelector('[data-lab]').labApi, d = l.catalog.data, pick = [...d.eligible.filter(e => e.quality === 'hd').slice(10, 16), ...d.eligible.filter(e => e.quality === 'lite').slice(0, 6)], t0 = performance.now(), times = [];
          for (const e of pick) { const t = performance.now(); await l.selectEntry(e, { animate: false }); l.markDirty(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(performance.now() - t); }
          return { times, total: performance.now() - t0, cache: l.view.cache.size, bytes: l.view.textureBytes, uploads: l.view.uploads.map(u => [u.hd, Math.round(u.ms), u.w]), loaded: l.loadedCount };
        });
        assert.ok(Math.max(...r.times) < 4000, `самая медленная смена материала ${Math.round(Math.max(...r.times))} мс`); assert.ok(r.cache <= 5, `в видеопамяти ${r.cache} материалов`); assert.ok(r.bytes < 90e6, `текстуры ${(r.bytes / 1e6).toFixed(1)} МБ`);
        const lite = r.uploads.filter(u => !u[0]), hd = r.uploads.filter(u => u[0]); assert.ok(lite.length && hd.length); assert.ok(lite.every(u => u[2] <= 400), 'фото низкого разрешения не увеличиваются при загрузке'); console.log(`     смена материала: макс ${Math.round(Math.max(...r.times))} мс, среднее ${Math.round(r.times.reduce((a, b) => a + b, 0) / r.times.length)} мс; текстуры ${(r.bytes / 1e6).toFixed(1)} МБ`);
        await page.locator('[data-strip] [data-mat="610010002799"]').scrollIntoViewIfNeeded(); await page.locator('[data-strip] [data-mat="610010002799"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.material === '610010002799', null, { timeout: 15000 });
      });
      await check(`[${label}] сравнение двух материалов: вторым — любой товар каталога; линия, перетаскивание, переход-шторка`, async () => {
        await api(page, '(l)=>{l.resetView()}'); await tab(page, 'compare'); await page.locator('[data-compare]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').labApi.st.compare === true); assert.equal(await page.locator('[data-split]').isHidden(), false); await wait(600);
        const left = () => api(page, `(l)=>{l.markDirty();return new Promise(r=>requestAnimationFrame(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');const W=l.canvas.width,H=l.canvas.height;const f=(x)=>{g.drawImage(l.canvas,x*W,H*0.5,W*0.1,H*0.2,0,0,32,32);const d=g.getImageData(0,0,32,32).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2];return s/(d.length/4)};r([f(0.1),f(0.8)])}))}`);
        const a = await left(); assert.ok(a[0] > 0 && a[1] > 0, 'обе половины отрисованы');
        await page.locator('[data-second="610010002667"]').scrollIntoViewIfNeeded(); await page.locator('[data-second="610010002667"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').labApi.sec.code === '610010002667'); await wait(900); assert.match(await page.locator('[data-second-name]').textContent(), /Экспо Дарк/); const a2 = await left(); assert.ok(Math.abs(a2[1] - a[1]) > 15, `правая половина не изменилась при смене второго материала: ${a} → ${a2}`); assert.ok(Math.abs(a2[0] - a[0]) < 12, `левая половина изменилась: ${a} → ${a2}`);
        await page.locator('[data-second-open]').click(); await page.waitForSelector('[data-cat]:not([hidden])'); assert.match(await page.locator('[data-cat-title]').textContent(), /Второй материал/); await page.waitForFunction(() => /^Найдено/.test(document.querySelector('[data-cat-count]').textContent), null, { timeout: 30000 });
        const anyCode = await api(page, '(l)=>l.catalog.data.eligible.find(e=>e.quality==="lite"&&e.code!==l.cur.code).code'); await page.fill('[data-cat-q]', anyCode); await wait(450); await page.locator(`[data-cat-grid] [data-pick="${anyCode}"]`).click();
        await page.waitForFunction(c => document.querySelector('[data-lab]').labApi.sec.code === c, anyCode, { timeout: 15000 }); assert.equal(await api(page, '(l)=>l.st.compare'), true); assert.match(await page.locator('[data-second-code]').textContent(), new RegExp(anyCode)); await wait(500); const b = await left(); assert.notDeepEqual(a.map(Math.round), b.map(Math.round), 'второй материал сменился на экране');
        await page.locator('[data-split-handle]').focus(); await page.keyboard.press('ArrowRight'); assert.ok((await api(page, '(l)=>l.st.split')) > 0.5);
        await page.locator('[data-compare]').click(); assert.equal(await api(page, '(l)=>l.st.compare'), false);
        const from = await api(page, '(l)=>l.cur.code'); await page.locator('[data-transition]').click(); await wait(400); assert.ok(await api(page, '(l)=>!!l.trans'), 'шторка перехода не запустилась'); await wait(2400); assert.equal(await api(page, '(l)=>l.trans'), null); assert.notEqual(await api(page, '(l)=>l.cur.code'), from);
      });
      await check(`[${label}] товар: название, артикул, ссылка из каталога и «В корзину»`, async () => {
        await page.locator('[data-strip] [data-mat="610010002765"]').scrollIntoViewIfNeeded(); await page.locator('[data-strip] [data-mat="610010002765"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.material === '610010002765'); await tab(page, 'item');
        assert.match(await page.locator('[data-item-name]').textContent(), /Вояджер/); assert.match(await page.locator('[data-item-meta]').textContent(), /610010002765/); assert.match(await page.locator('[data-item-quality]').textContent(), /Полная симуляция/);
        assert.match(await page.locator('[data-item-link]').getAttribute('href'), /product\/610010002765\/$/); assert.equal(await page.locator('[data-item-add]').getAttribute('data-add'), '610010002765');
        await page.locator('[data-item-add]').click(); await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent.trim() === '1', null, { timeout: 8000 });
        assert.ok(await page.evaluate(() => /610010002765/.test(localStorage.getItem('italon-cart') || JSON.stringify(localStorage))), 'товар не оказался в корзине');
        const r = await page.goto(base + '/product/610010002765/'); assert.equal(r.status(), 200); await page.goBack(); await page.waitForFunction(() => document.querySelector('[data-lab]')?.dataset.state === 'ready'); await wait(500); await api(page, '(l)=>l.setAuto(false)');
      });
      await check(`[${label}] слэбы 120×278: раздел «Слэбы», стена в реальном масштабе, 57 слэбов в галерее, первый — с оригиналом высокого разрешения`, async () => {
        await page.locator('[data-view="slabs"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.labView === 'slabs', null, { timeout: 40000 }); await wait(1500);
        const r = await page.evaluate(() => { const l = document.querySelector('[data-lab]').labApi, g = l.wallGeom(); return { n: document.querySelectorAll('[data-strip] [data-mat]').length, first: document.querySelector('[data-strip] [data-mat]').dataset.mat, cur: l.cur.code, q: l.cur.quality, img: l.cur.image, imgW: l.cur.imgW, g: { cols: g.cols, rows: g.rows, w: g.w, h: g.h }, notice: document.querySelector('[data-notice]').hidden ? '' : document.querySelector('[data-notice-text]').textContent, title: document.querySelector('[data-gallery-title]').textContent, sub: document.querySelector('[data-gallery-sub]').textContent, label: document.querySelector('[data-open-label]').textContent, hero: getComputedStyle(document.querySelector('[data-hero]')).display, pill: document.querySelector('.lab-views [data-view="slabs"]').getAttribute('aria-checked') }; });
        assert.equal(r.n, 57); assert.equal(r.first, '600180000076'); assert.equal(r.cur, '600180000076'); assert.equal(r.q, 'hd'); assert.equal(r.notice, '');
        if (mobile) { assert.match(r.img, /600180000076-m-[0-9a-f]{8}\.webp$/); assert.ok(r.imgW < 1100, `телефон грузит мобильную копию: ${r.imgW}`); } else { assert.match(r.img, /600180000076-[0-9a-f]{8}\.webp$/); assert.ok(r.imgW > 1900); }   // у первого слэба подключён оригинал Architalon (data/lab-originals.json); эскизный режим проверяется ниже, в «оригиналах» assert.match(r.title, /Слэбы 120×278/); assert.match(r.sub, /57 больших плит.*16 коллекций/); assert.equal(r.label, 'Все слэбы'); assert.equal(r.hero, 'none'); assert.equal(r.pill, 'true');
        assert.equal(r.g.cols, 2); assert.equal(r.g.rows, 1); assert.ok(Math.abs(r.g.h - 278) < 0.01 && Math.abs(r.g.w - 240.0) < 1, JSON.stringify(r.g));
        // реальные пропорции на экране: вид строго спереди, плита 120×278 занимает на экране столько же, сколько в жизни
        await tab(page, 'light'); await page.locator('[data-mode="day"]').click(); await api(page, '(l)=>{l.setAuto(false);l.resetView();l.st.cam.tilt=0;l.st.jointMm=0}'); await wait(900);
        const m = await api(page, `(l)=>{l.markDirty();return new Promise(res=>requestAnimationFrame(()=>{const W=l.canvas.width,H=l.canvas.height,rc=l.canvas.getBoundingClientRect(),k=W/rc.width,gm=l.wallGeom(),[x0,y0,x1,y1]=gm.rect,pr=(x,y)=>l.lib.project(l.st.cam,[x,y,0],rc.width,rc.height).map(v=>v*k),a=pr(x0,y1),b=pr(x1,y0);
          const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.drawImage(l.canvas,0,0);const mean=(x,y,w,h)=>{const d=g.getImageData(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h))).data;let t=0;for(let i=0;i<d.length;i+=4)t+=d[i]+d[i+1]+d[i+2];return t/(d.length/4*3)};
          const my=(a[1]+b[1])/2-20;res({pw:b[0]-a[0],ph:b[1]-a[1],inL:mean(a[0]+3,my,8,40),outL:mean(a[0]-12,my,8,40),inR:mean(b[0]-11,my,8,40),outR:mean(b[0]+4,my,8,40),inT:mean((a[0]+b[0])/2,a[1]+3,40,8),outT:mean((a[0]+b[0])/2,a[1]-12,40,8)})}))}`);
        const ratio = m.pw / m.ph, want = r.g.w / r.g.h; assert.ok(Math.abs(ratio / want - 1) < 0.01, `пропорции стены на экране ${ratio.toFixed(4)} вместо ${want.toFixed(4)}`);
        assert.ok(m.inL > m.outL + 15 && m.inR > m.outR + 15 && m.inT > m.outT + 15, `границы стены на картинке не там, где в расчёте: ${JSON.stringify(m)}`);
        await api(page, '(l)=>{l.setMode("evening",{fly:false});l.resetView()}');
      });
      await check(`[${label}] слэбы: число плит 1–4, горизонтальный поворот с поворотом рисунка, шов и цвет шва, свет и сутки на стене`, async () => {
        await tab(page, 'layout'); const geom = () => api(page, '(l)=>{const g=l.wallGeom();return {c:g.cols,r:g.rows,w:Math.round(g.w),h:Math.round(g.h)}}');
        assert.equal(await page.locator('[data-for="floor"]').first().isHidden(), true); assert.equal(await page.locator('[data-for="slabs"]').first().isVisible(), true);
        for (const [n, w] of [[1, 120], [3, 360], [4, 480], [2, 240]]) { await page.locator(`[data-slabs="${n}"]`).click(); const g = await geom(); assert.equal(g.c, n); assert.ok(Math.abs(g.w - w) <= 1 && g.h === 278, JSON.stringify(g)); }
        await page.locator('[data-slabs="4"]').click(); await page.locator('[data-turn]').click(); let g = await geom(); assert.deepEqual([g.c, g.r], [1, 2], 'повёрнутые плиты — в один столбец, не выше двух'); assert.ok(Math.abs(g.w - 278) <= 1 && Math.abs(g.h - 240) <= 1, JSON.stringify(g)); assert.match(await page.locator('[data-turn-label]').textContent(), /вертикально/);
        await page.locator('[data-turn]').click(); g = await geom(); assert.deepEqual([g.c, g.r], [4, 1]); await page.locator('[data-slabs="2"]').click();
        const ja = [0.47, 0.3, 0.53, 0.6], sums = new Set([await frameSum(page, ja)]); await page.locator('[data-joint]').fill('9'); sums.add(await frameSum(page, ja)); await page.locator('[data-jc="black"]').click(); sums.add(await frameSum(page, ja)); assert.equal(sums.size, 3, 'шов и его цвет меняют картинку');
        await page.locator('[data-joint]').fill('3'); await page.locator('[data-jc="tone"]').click();
        await tab(page, 'light'); const ls = new Set(); for (const m of ['day', 'evening', 'side']) { await page.locator(`[data-mode="${m}"]`).click(); await wait(1500); ls.add(await frameSum(page)); } assert.equal(ls.size, 3, 'три режима света на стене');
        await page.locator('[data-mode="time"]').click(); await wait(1200); assert.ok((await api(page, '(l)=>l.st.cam.tilt')) < 0.3, 'у стены камера не уходит в комнату'); await tab(page, 'time');
        const ts = new Set(); for (const id of ['morning', 'day', 'evening', 'night']) { await page.locator(`[data-tpreset="${id}"]`).click(); await wait(2500); ts.add(await frameSum(page)); } assert.equal(ts.size, 4, 'сутки на стене: 4 разных кадра');
        await tab(page, 'light'); await page.locator('[data-mode="evening"]').click(); await wait(800);
      });
      await check(`[${label}] слэбы: повёрнутая плита — рисунок поворачивается (верх фото уходит влево), а не растягивается`, async () => {
        const res = await page.evaluate(async () => {
          const l = document.querySelector('[data-lab]').labApi, norm = a => { const t = a[0] + a[1] + a[2] || 1; return [a[0] / t, a[1] / t, a[2] / t]; };
          const bands = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const f = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; let r = 0, gg = 0, b = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return norm([r / n, gg / n, b / n]); }; const bh = Math.round(img.height * 0.08); return { top: f(0, 0, img.width, bh), bottom: f(0, img.height - bh, img.width, bh) }; };
          let best = null; for (const e of l.slabs.slice(0, 14)) { const m = await l.loadMaterial(e), b = bands(m.source), d = Math.hypot(...b.top.map((v, i) => v - b.bottom[i])); if (!best || d > best.d) best = { e, b, d }; }
          await l.selectEntry(best.e, { animate: false }); l.setMode('day', { fly: false }); l.setAuto(false); l.st.slabs = 1; l.st.joint = 0; l.st.turned = true; l.st.cam.tilt = 0; Object.assign(l.st.cam, l.wallCam({ tilt: 0 })); l.st.cam.ppcm = Math.min(l.st.cam.ppcm, 2.2);
          await new Promise(r => setTimeout(r, 800)); l.markDirty(); return new Promise(r => requestAnimationFrame(() => { const W = l.canvas.width, H = l.canvas.height, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(l.canvas, 0, 0); const gm = l.wallGeom(), rc = l.canvas.getBoundingClientRect(), k = W / rc.width, [x0, y0, x1, y1] = gm.rect, pr = (x, y) => l.lib.project(l.st.cam, [x, y, 0], rc.width, rc.height).map(v => v * k), a = pr(x0, y1), b = pr(x1, y0), pw = b[0] - a[0], ph = b[1] - a[1], bw = pw * 0.08;
            const f = (x, y, w, h) => { const d = g.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data; let aa = 0, bb = 0, cc = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) { aa += d[i]; bb += d[i + 1]; cc += d[i + 2]; } return norm([aa / n, bb / n, cc / n]); };
            const left = f(a[0] + 4, a[1] + ph * 0.2, bw, ph * 0.6), right = f(b[0] - bw - 4, a[1] + ph * 0.2, bw, ph * 0.6), dist = (p, q) => Math.hypot(...p.map((v, i) => v - q[i])); r({ name: best.e.name, d: best.d, leftTop: dist(left, best.b.top), leftBottom: dist(left, best.b.bottom), rightTop: dist(right, best.b.top), rightBottom: dist(right, best.b.bottom), w: pw, h: ph }); }));
        });
        assert.ok(res.d > 0.02, `не нашёл слэб с разным верхом и низом: ${JSON.stringify(res)}`); assert.ok(res.leftTop < res.leftBottom && res.rightBottom < res.rightTop, `верх фото должен быть слева, низ справа: ${JSON.stringify(res)}`); assert.ok(res.w > res.h, 'плита лежит горизонтально');
        await api(page, '(l)=>{l.st.turned=false;l.st.slabs=2;l.setMode("evening",{fly:false});l.resetView()}'); await page.evaluate(() => document.querySelector('[data-turn]').setAttribute('aria-pressed', 'false'));
      });
      await check(`[${label}] слэбы: каталог только 120×278 (57 из 57, 16 коллекций), поиск по названию и артикулу, фильтры, выбор, второй материал для сравнения`, async () => {
        await page.locator('[data-open-catalog]').click(); await page.waitForSelector('[data-cat]:not([hidden])'); assert.equal(await page.locator('[data-cat]').getAttribute('data-scope'), 'slabs'); assert.match(await page.locator('[data-cat-title]').textContent(), /Слэбы 120×278/);
        await page.waitForFunction(() => /^Найдено 57 .*из 57/.test(document.querySelector('[data-cat-count]').textContent), null, { timeout: 30000 }); assert.equal(await page.locator('[data-f="format"]').locator('xpath=ancestor::label').isHidden(), true);
        assert.equal(await page.evaluate(() => document.querySelectorAll('[data-f="collection"] option').length), 17);
        const q = async t => { await page.fill('[data-cat-q]', t); await wait(450); return page.evaluate(() => ({ n: document.querySelectorAll('[data-cat-grid] [data-pick]').length, off: document.querySelectorAll('[data-cat-grid] .is-off').length, first: document.querySelector('[data-cat-grid] .lab-card b')?.textContent })); };
        let r = await q('калакатта'); assert.ok(r.n >= 2 && /Калакатта/.test(r.first)); r = await q('600180000133'); assert.deepEqual([r.n, r.first], [1, 'Прима Волкано Грин']); r = await q('мозаика'); assert.equal(r.n + r.off, 0, 'мозаики в разделе слэбов нет'); r = await q('60x60'); assert.equal(r.n, 0, 'другие форматы в разделе слэбов не показываются');
        await page.click('[data-f-reset]'); await wait(300); await page.waitForFunction(() => !document.querySelector('[data-f="color"]').disabled, null, { timeout: 30000 });
        await page.selectOption('[data-f="collection"]', { index: 3 }); await wait(300); const nColl = +(await page.locator('[data-cat-count]').textContent()).match(/Найдено (\d+)/)[1]; assert.ok(nColl > 0 && nColl < 12, `слэбов в коллекции: ${nColl}`); await page.click('[data-f-reset]');
        await page.locator('[data-cat-grid] [data-pick="600180000133"]').scrollIntoViewIfNeeded(); await page.locator('[data-cat-grid] [data-pick="600180000133"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.material === '600180000133', null, { timeout: 20000 });
        assert.equal(await api(page, '(l)=>l.cur.code'), '600180000133'); await tab(page, 'item'); assert.match(await page.locator('[data-item-meta]').textContent(), /600180000133 · 120\s×\s278/); assert.match(await page.locator('[data-item-price]').textContent(), /₽/); assert.match(await page.locator('[data-item-quality]').textContent(), /Полная симуляция/);   // у всех 57 слэбов есть оригиналы ARCHITALON
        await tab(page, 'compare'); await page.locator('[data-compare]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').labApi.st.compare === true); await page.locator('[data-second-open]').click(); await page.waitForSelector('[data-cat]:not([hidden])'); assert.match(await page.locator('[data-cat-title]').textContent(), /Второй материал/);
        await page.waitForFunction(() => /^Найдено 57/.test(document.querySelector('[data-cat-count]').textContent)); await page.fill('[data-cat-q]', '600180000086'); await wait(450); await page.locator('[data-cat-grid] [data-pick="600180000086"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').labApi.sec.code === '600180000086', null, { timeout: 20000 });
        await wait(700); const a = await frameSum(page, [0.05, 0.3, 0.3, 0.7]), b2 = await frameSum(page, [0.7, 0.3, 0.95, 0.7]); assert.notEqual(a, b2, 'слева и справа от линии разные слэбы'); await page.locator('[data-compare]').click();
      });
      await check(`[${label}] слэбы: ссылка на композицию восстанавливает стену, экспорт изображения, возврат в раздел «Материалы»`, async () => {
        await api(page, '(l)=>{l.st.slabs=3}'); await page.evaluate(() => document.querySelector('[data-slabs="3"]').click()); const url = await api(page, '(l)=>l.shareUrl()'); assert.match(url, /w=s&n=3/); assert.ok(url.includes('m=600180000133'), url);
        const p2 = await open(browser, label + '-slabshare', vp, '/lab/' + url.slice(url.indexOf('#'))); await p2.page.waitForFunction(() => document.querySelector('[data-lab]').dataset.labView === 'slabs', null, { timeout: 40000 }); await wait(800);
        assert.deepEqual(await api(p2.page, '(l)=>({v:l.st.view,n:l.st.slabs,c:l.cur.code})'), { v: 'slabs', n: 3, c: '600180000133' }); await p2.ctx.close();
        await tab(page, 'share'); await page.locator('[data-size="story"]').click(); await page.locator('[data-shot]').click(); await page.waitForSelector('[data-modal]:not([hidden])', { timeout: 60000 });
        const im = await page.evaluate(async () => { const img = document.querySelector('[data-modal-media] img'); await img.decode(); return [img.naturalWidth, img.naturalHeight]; }); assert.deepEqual(im, [720, 1280]); await page.locator('[data-modal-close]').click();
        await page.locator('[data-view="floor"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.labView === 'floor', null, { timeout: 30000 }); await wait(800);
        assert.equal(await page.evaluate(() => document.querySelectorAll('[data-strip] [data-mat]').length), 8); assert.deepEqual(await page.evaluate(() => [!document.querySelector('[data-for="floor"]').hidden, document.querySelector('[data-for="slabs"]').hidden]), [true, true]);
        assert.equal(await page.locator('[data-open-label]').textContent(), 'Все материалы'); assert.equal(await api(page, '(l)=>l.st.view'), 'floor'); assert.ok((await api(page, '(l)=>l.cur.code')) !== '600180000133', 'вернулся прежний материал');
      });
      await check(`[${label}] изображение JPG, ссылка на композицию (и восстановление по ней), окно результата`, async () => {
        await tab(page, 'share'); await page.locator('[data-size="story"]').click(); await page.locator('[data-shot]').click(); await page.waitForSelector('[data-modal]:not([hidden])', { timeout: 40000 });
        const r = await page.evaluate(async () => { const img = document.querySelector('[data-modal-media] img'); await img.decode(); const b = await (await fetch(img.src)).blob(); const u = new Uint8Array(await b.arrayBuffer()); return { w: img.naturalWidth, h: img.naturalHeight, size: b.size, sig: [...u.slice(0, 3)], name: document.querySelector('[data-modal-save]').download }; });
        assert.deepEqual(r.sig, [255, 216, 255]); assert.equal(r.w, 720); assert.equal(r.h, 1280); assert.ok(r.size > 20000, `слишком маленький JPG: ${r.size}`); assert.match(r.name, /\.jpg$/);
        await page.locator('[data-modal-close]').click(); assert.equal(await page.locator('[data-modal]').isHidden(), true);
        await page.evaluate(() => { const l = document.querySelector('[data-lab]').labApi; l.setMode('time', { fly: false }); l.setHour(19.5); }); const url = await api(page, '(l)=>l.shareUrl()'); const curCode = await api(page, '(l)=>l.cur.code'); assert.ok(url.includes('#m=' + curCode) && /l=3.*h=19\.5/.test(url), url);
        await page.locator('[data-share-link]').click(); await wait(300); assert.match(await page.locator('[data-share-hint]').textContent(), /скопирована|Отправлено|http/);
        const p2 = await open(browser, label + '-share', vp, '/lab/' + url.slice(url.indexOf('#')));
        assert.equal(await api(p2.page, '(l)=>l.cur.code'), curCode); assert.equal(await api(p2.page, '(l)=>l.st.mode'), 'time'); assert.ok(Math.abs((await api(p2.page, '(l)=>l.st.hour')) - 19.5) < 0.06); await p2.ctx.close();
        await api(page, '(l)=>l.setMode("evening",{fly:false})');
      });
      if (!mobile) await check(`[${label}] ролик: запись 9:16 завершается и воспроизводится`, async () => {
        const sup = await page.evaluate(() => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream); if (!sup) { console.log('     (MediaRecorder недоступен — пропуск)'); return; }
        await tab(page, 'share'); let r = { size: 0 };
        for (let attempt = 0; attempt < 2 && !(r.size > 15000); attempt++) {          // запись в реальном времени на программной графике иногда не успевает дать кадры — одна повторная попытка
          if (attempt) await page.locator('[data-modal-close]').click();
          await page.locator('[data-video]').click(); await page.waitForSelector('[data-modal]:not([hidden])', { timeout: 120000 });
          r = await page.evaluate(async () => { const v = document.querySelector('[data-modal-media] video'); const b = await (await fetch(v.src)).blob(); return { size: b.size, type: b.type }; });
        }
        assert.ok(r.size > 15000, `ролик слишком мал: ${r.size}`); assert.match(r.type, /^video\//); await page.locator('[data-modal-close]').click();
      });
      await check(`[${label}] качество «Лайт» снижает разрешение, «Авто» возвращает; панель управляется с клавиатуры`, async () => {
        await tab(page, 'share'); await page.locator('[data-q="quality"]').click(); await wait(300); const wq = await api(page, '(l)=>l.canvas.width*l.canvas.height');
        await page.locator('[data-q="lite"]').click(); await wait(300); const wl = await api(page, '(l)=>l.canvas.width*l.canvas.height'); assert.ok(wl < wq, `лёгкий режим не уменьшил кадр: ${wq} → ${wl}`); assert.equal(await api(page, '(l)=>l.level'), 3);
        await page.locator('[data-q="auto"]').click(); assert.equal(await page.locator('[data-q="auto"]').getAttribute('aria-checked'), 'true');
        await page.locator('#tab-share').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#tab-item').getAttribute('aria-selected'), 'true');
      });
      if (mobile) await check(`[${label}] крупные зоны касания (≥ 40 px) у кнопок, ползунков и карточек`, async () => {
        await tab(page, 'light');
        const small = await page.evaluate(() => [...document.querySelectorAll('.lab button, .lab a.lab-btn, .lab input[type=range], .lab select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]') && (r.height < 38 || r.width < 36) && !e.matches('[data-orb]') && !e.closest('.lab-quick') && !e.closest('.lab-cat'); }).map(e => (e.textContent || e.getAttribute('aria-label') || e.className).trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
        assert.deepEqual(small, []);
      });
      await ctx.close();
    }
    await check('[оригиналы] подключённый оригинал с верными пропорциями даёт слэбу полную симуляцию; оригинал с неверными пропорциями игнорируется, ничего не растягивается', async () => {
      const dir = resolve(pub, 'media/lab'), file = resolve(dir, '_e2e-original.png'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, makePng(720, 1668));
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
      try {
        await ctx.route('**/data/lab-originals.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 1, items: { '600180000076': { src: 'media/lab/_e2e-original.png', width: 720, height: 1668 }, '600180000132': { src: 'media/lab/_e2e-original.png', width: 800, height: 800 } } }) }));
        const page = await ctx.newPage(); watch(page, 'originals'); await page.goto(base + '/lab/'); await page.waitForFunction(() => document.querySelector('[data-lab]')?.dataset.state === 'ready', null, { timeout: 40000 }); await wait(600);
        await page.locator('[data-start]').click(); await page.locator('[data-view="slabs"]').click(); await page.waitForFunction(() => document.querySelector('[data-lab]').dataset.labView === 'slabs', null, { timeout: 40000 }); await wait(1500);
        const a = await api(page, '(l)=>({q:l.cur.quality,o:l.cur.original,relief:l.cur.surf.relief,max:l.cur.maxPpcm,w:l.cur.imgW,h:l.cur.imgH,notice:!document.querySelector("[data-notice]").hidden})'); assert.deepEqual([a.q, a.o, a.w, a.h, a.notice], ['hd', true, 720, 1668, false]); assert.ok(a.relief === 0 && a.max === 40);   // слэб ровный: рельеф по фото не строится
        await tab(page, 'item'); assert.match(await page.locator('[data-item-quality]').textContent(), /Полная симуляция света: фото 720×1668/);
        await page.locator('[data-canvas]').focus(); for (let i = 0; i < 12; i++) await page.keyboard.press('+'); assert.ok((await api(page, '(l)=>l.st.cam.ppcm')) > 4, 'у оригинала приближение не ограничено, как у фото каталога');
        const bad = await api(page, '(l)=>l.selectEntry(l.slabs.find(e=>e.code==="600180000132"),{animate:false}).then(()=>({q:l.cur.quality,o:l.cur.original,w:l.cur.imgW,notice:!document.querySelector("[data-notice]").hidden}))'); assert.deepEqual(bad, { q: 'lite', o: false, w: 148, notice: true });
        const card = await page.evaluate(() => [...document.querySelectorAll('[data-strip] [data-mat]')].length); assert.equal(card, 57);
      } finally { await ctx.close(); fs.rmSync(file, { force: true }); }
    });
    // запасной режим: WebGL 2 недоступен
    const fb = await chromium.launch({ executablePath: exe, args: ['--disable-3d-apis', '--disable-gpu'] });
    try {
      const { ctx, page } = await open(fb, 'fallback', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await check('[запасной] без WebGL 2 лаборатория работает на Canvas 2D: свет, сутки, укладка, сравнение, снимок', async () => {
        assert.equal(await page.evaluate(() => document.querySelector('[data-lab]').dataset.tier), 'fallback');
        await tab(page, 'light'); await page.locator('[data-mode="side"]').click(); await page.locator('[data-mode="time"]').click(); await wait(600); await page.locator('[data-mode="evening"]').click(); await tab(page, 'layout'); await page.locator('[data-format="30x30"]').click();
        await tab(page, 'compare'); await page.locator('[data-compare]').click(); await wait(500);
        const nonBlank = await api(page, `(l)=>{const g=l.canvas.getContext('2d');const d=g.getImageData(0,0,l.canvas.width,l.canvas.height).data;let s=0,n=0;for(let i=0;i<d.length;i+=400){s+=d[i];n++}return s/n}`); assert.ok(nonBlank > 8, `холст пуст: ${nonBlank}`);
        await page.locator('[data-compare]').click(); await tab(page, 'share'); await page.locator('[data-shot]').click(); await page.waitForSelector('[data-modal]:not([hidden])', { timeout: 30000 });
      });
      await ctx.close();
    } finally { await fb.close(); }
  } finally { await browser.close(); server.close(); }
  await check('в консоли браузера нет ошибок скриптов', async () => assert.deepEqual(problems, []));
  console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nВсе проверки лаборатории прошли'); process.exit(failed ? 1 : 0);
})();
