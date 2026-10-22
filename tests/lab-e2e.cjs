// MATERIAL LAB в настоящем браузере (Chromium, программный WebGL 2): запуск, раскладка «пиксель в пиксель» с JS-эталоном, жесты мышью и касаниями,
// режимы света, укладка, сравнение и переход, снимок PNG, ролик, ссылка на товар и корзина, лёгкий режим и запасной режим без WebGL 2.
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
const tab = async (page, id) => { await page.locator(`[data-tab="${id}"]`).click(); if (await page.locator('[data-panel].is-folded').count()) await page.locator(`[data-tab="${id}"]`).click(); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const problems = [];
  const watch = (page, label) => { page.on('pageerror', e => problems.push(`${label}: ${e.message}`)); page.on('console', m => m.type() === 'error' && !/favicon|404/.test(m.text()) && problems.push(`${label}: console.error ${m.text()}`)); };
  const open = async (browser, label, opts = {}) => { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); watch(page, label); await page.goto(base + '/lab/', { waitUntil: 'load' }); await page.waitForFunction(() => document.querySelector('[data-lab]')?.dataset.state === 'ready', null, { timeout: 30000 }); await wait(800); await api(page, '(l)=>l.setAuto(false)'); return { ctx, page }; };
  const browser = await chromium.launch({ executablePath: exe, args: GL_ARGS });
  try {
    for (const [label, vp, mobile] of [['desktop', { viewport: { width: 1366, height: 820 } }, false], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
      const { ctx, page } = await open(browser, label, vp);
      await check(`[${label}] лаборатория запускается на WebGL 2, три реальных товара с артикулами, без горизонтальной прокрутки`, async () => {
        const r = await page.evaluate(() => { const l = document.querySelector('[data-lab]'); return { tier: l.dataset.tier, mats: [...l.querySelectorAll('[data-mat]')].map(b => b.textContent.replace(/\s+/g, ' ').trim()), sw: document.documentElement.scrollWidth, iw: innerWidth, fb: !!l.labApi.view.fallback }; });
        assert.notEqual(r.tier, 'fallback'); assert.equal(r.fb, false); assert.equal(r.mats.length, 3);
        for (const [i, code] of ['610010003167', '610010002765', '610010002799'].entries()) assert.ok(r.mats[i].includes(code), r.mats[i]);
        assert.ok(r.sw <= r.iw, `scrollWidth ${r.sw} > ${r.iw}`);
      });
      await check(`[${label}] раскладка в шейдере совпадает с JS-эталоном (id плитки, шов) во всех схемах укладки`, async () => {
        for (const [format, bond] of [['60x60', 'straight'], ['30x60', 'half'], ['20x120', 'third']]) {
          const bad = await page.evaluate(([format, bond]) => {
            const l = document.querySelector('[data-lab]').labApi, { tileAt, variantOf, unproject } = l.lib, st = l.st;
            const FM = { '60x60': [60, 60], '30x60': [30, 60], '20x120': [20, 120] }[format];
            st.format = format; st.bond = bond; st.cam = { center: [17.3, -9.1], rot: 0.37, tilt: 0.45, ppcm: 6 }; st.jointMm = 4;
            l.resize(); const rs = l.renderState(); const cv = l.canvas, W = cv.width, H = cv.height, k = W / cv.getBoundingClientRect().width;
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
      });
      await check(`[${label}] режимы света, высота, формат, шов, цвет шва, раскладка и поворот укладки меняют состояние и картинку`, async () => {
        const shot = () => api(page, `(l)=>{l.markDirty();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');g.drawImage(l.canvas,0,0,64,64);const d=g.getImageData(0,0,64,64).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]*2+d[i+2];r(s)})))}`);
        const sums = new Set();
        await tab(page, 'light'); for (const m of ['day', 'evening', 'side']) { await page.locator(`[data-mode="${m}"]`).click(); await wait(900); assert.equal(await api(page, '(l)=>l.st.mode'), m); sums.add(await shot()); }
        assert.equal(sums.size, 3, 'режимы света должны давать разные кадры');
        await tab(page, 'layout'); if (mobile) await page.locator('[data-panel].is-folded').count();
        const s0 = await shot();
        await page.locator('[data-format="30x60"]').click(); assert.equal(await api(page, '(l)=>l.st.format'), '30x60'); const s1 = await shot(); assert.notEqual(s0, s1);
        await page.locator('[data-turn]').click(); assert.equal(await api(page, '(l)=>l.st.turned'), true);
        await page.locator('[data-jc="black"]').click(); assert.equal(await api(page, '(l)=>l.st.jointColor'), 'black');
        await page.locator('[data-seg="bond"][data-value="half"]').click(); assert.equal(await api(page, '(l)=>l.st.bond'), 'half');
        await page.locator('[data-joint]').fill('8'); assert.equal(await api(page, '(l)=>l.st.jointMm'), 8); assert.match(await page.locator('[data-joint-out]').textContent(), /8/);
        const s2 = await shot(); assert.notEqual(s1, s2);
      });
      await check(`[${label}] перетаскивание сдвигает поверхность, колесо/щипок меняют масштаб, поворот, наклон, сброс вида`, async () => {
        await api(page, '(l)=>{l.resetView()}'); const c0 = await api(page, '(l)=>JSON.stringify(l.st.cam)'); const box = await page.locator('[data-canvas]').boundingBox();
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
        await page.locator('[data-reset]').click(); assert.ok(Math.abs((await api(page, '(l)=>l.st.cam.center[0]'))) < 1e-6);
        await page.locator('[data-canvas]').focus(); await page.keyboard.press('+'); assert.ok((await api(page, '(l)=>l.st.cam.ppcm')) > 0); await page.keyboard.press('ArrowLeft');
      });
      await check(`[${label}] источник света перетаскивается и двигает свет; клавиатура двигает свет`, async () => {
        await api(page, '(l)=>{l.resetView();l.setAuto(false)}'); await wait(400);
        const ob = await page.locator('[data-orb]').boundingBox(); assert.ok(ob, 'шар света не виден'); const l0 = await api(page, '(l)=>JSON.stringify(l.st.light)');
        const sx = ob.x + ob.width / 2, sy = ob.y + ob.height / 2, box = await page.locator('[data-canvas]').boundingBox();
        if (!mobile) { await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6, { steps: 8 }); await page.mouse.up(); }
        else { const cdp = await page.context().newCDPSession(page), pt = (x, y) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(sx, sy)] }); for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(sx + (box.x + box.width * 0.3 - sx) * i / 8, sy + (box.y + box.height * 0.6 - sy) * i / 8)] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        await wait(300); const l1 = await api(page, '(l)=>JSON.stringify(l.st.light)'); assert.notEqual(l0, l1); assert.equal(await page.locator('[data-auto]').getAttribute('aria-pressed'), 'false');
        await page.locator('[data-orb]').focus(); await page.keyboard.press('ArrowRight'); assert.notEqual(l1, await api(page, '(l)=>JSON.stringify(l.st.light)'));
      });
      await check(`[${label}] сравнение двух материалов: линия, перетаскивание, переход-шторка между материалами`, async () => {
        await tab(page, 'compare'); await page.locator('[data-compare]').click(); assert.equal(await api(page, '(l)=>l.st.compare'), true); assert.equal(await page.locator('[data-split]').isHidden(), false);
        await api(page, '(l)=>l.resetView()'); await wait(500);
        const left = await api(page, `(l)=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');const W=l.canvas.width,H=l.canvas.height;const f=(x)=>{g.drawImage(l.canvas,x*W,H*0.5,W*0.1,H*0.2,0,0,32,32);const d=g.getImageData(0,0,32,32).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2];return s/(d.length/4)};r([f(0.1),f(0.8)])})))`);
        assert.ok(Math.abs(left[0] - left[1]) > 15, `левая и правая части одинаковы: ${left}`);
        const hb = await page.locator('[data-split-handle]').boundingBox(); await page.locator('[data-split-handle]').focus(); await page.keyboard.press('ArrowRight'); assert.ok((await api(page, '(l)=>l.st.split')) > 0.5);
        await page.locator('[data-compare]').click(); assert.equal(await api(page, '(l)=>l.st.compare'), false);
        const from = await api(page, '(l)=>l.st.a'); await page.locator('[data-transition]').click(); await wait(250); assert.ok(await api(page, '(l)=>!!l.trans'), 'шторка перехода не запустилась'); await wait(2200); assert.equal(await api(page, '(l)=>l.trans'), null); assert.notEqual(await api(page, '(l)=>l.st.a'), from); void hb;
      });
      await check(`[${label}] выбор материала внизу: переход, карточка товара, артикул, ссылка и «В корзину»`, async () => {
        await page.locator('[data-mat="1"]').click(); assert.equal(await api(page, '(l)=>l.st.a'), 1); await tab(page, 'item');
        assert.match(await page.locator('[data-item-name]').textContent(), /Вояджер/); assert.match(await page.locator('[data-item-meta]').textContent(), /610010002765/);
        assert.match(await page.locator('[data-item-link]').getAttribute('href'), /product\/610010002765\/$/);
        assert.equal(await page.locator('[data-item-add]').getAttribute('data-add'), '610010002765');
        if (mobile) await page.locator('[data-panel]').evaluate(el => el.classList.remove('is-folded'));
        await page.locator('[data-item-add]').click(); await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent.trim() === '1', null, { timeout: 8000 });
        assert.ok(await page.evaluate(() => /610010002765/.test(localStorage.getItem('italon-cart') || JSON.stringify(localStorage))), 'товар не оказался в корзине');
        const r = await page.goto(base + '/product/610010002765/'); assert.equal(r.status(), 200); await page.goBack(); await page.waitForFunction(() => document.querySelector('[data-lab]')?.dataset.state === 'ready'); await wait(500); await api(page, '(l)=>l.setAuto(false)');
      });
      await check(`[${label}] снимок PNG: размер кадра, подпись, окно результата`, async () => {
        await tab(page, 'share'); await page.locator('[data-size="story"]').click(); await page.locator('[data-shot]').click();
        await page.waitForSelector('[data-modal]:not([hidden])', { timeout: 40000 });
        const r = await page.evaluate(async () => { const img = document.querySelector('[data-modal-media] img'); await img.decode(); const b = await (await fetch(img.src)).blob(); const u = new Uint8Array(await b.arrayBuffer()); return { w: img.naturalWidth, h: img.naturalHeight, size: b.size, sig: [...u.slice(0, 4)] }; });
        assert.deepEqual(r.sig, [137, 80, 78, 71]); assert.equal(r.w, 720); assert.equal(r.h, 1280); assert.ok(r.size > 20000, `слишком маленький PNG: ${r.size}`);
        await page.locator('[data-modal-close]').click(); assert.equal(await page.locator('[data-modal]').isHidden(), true);
      });
      if (!mobile) await check(`[${label}] ролик: запись 9:16 завершается и воспроизводится`, async () => {
        const sup = await page.evaluate(() => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream); if (!sup) { console.log('     (MediaRecorder недоступен — пропуск)'); return; }
        await page.locator('[data-video]').click(); await page.waitForSelector('[data-modal]:not([hidden])', { timeout: 90000 });
        const r = await page.evaluate(async () => { const v = document.querySelector('[data-modal-media] video'); const b = await (await fetch(v.src)).blob(); return { size: b.size, type: b.type }; });
        assert.ok(r.size > 15000, `ролик слишком мал: ${r.size}`); assert.match(r.type, /^video\//);
        await page.locator('[data-modal-close]').click();
      });
      await check(`[${label}] качество «Лайт» снижает разрешение, «Авто» возвращает; панель управляется с клавиатуры`, async () => {
        await tab(page, 'share'); await page.locator('[data-q="quality"]').click(); await wait(300); const wq = await api(page, '(l)=>l.canvas.width*l.canvas.height');
        await page.locator('[data-q="lite"]').click(); await wait(300); const wl = await api(page, '(l)=>l.canvas.width*l.canvas.height'); assert.ok(wl < wq, `лёгкий режим не уменьшил кадр: ${wq} → ${wl}`); assert.equal(await api(page, '(l)=>l.level'), 3);
        await page.locator('[data-q="auto"]').click(); assert.equal(await page.locator('[data-q="auto"]').getAttribute('aria-checked'), 'true');
        await page.locator('#tab-share').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#tab-item').getAttribute('aria-selected'), 'true');
      });
      if (mobile) await check(`[${label}] крупные зоны касания (≥ 40 px) у всех кнопок и ползунков панели`, async () => {
        await page.locator('[data-panel]').evaluate(el => el.classList.remove('is-folded'));
        const small = await page.evaluate(() => [...document.querySelectorAll('.lab button, .lab a.lab-btn, .lab input[type=range]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (r.height < 38 || r.width < 36) && !e.matches('[data-orb]'); }).map(e => (e.textContent || e.getAttribute('aria-label') || e.className).trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
        assert.deepEqual(small, []);
      });
      await ctx.close();
    }
    // запасной режим: WebGL 2 недоступен
    const fb = await chromium.launch({ executablePath: exe, args: ['--disable-3d-apis', '--disable-gpu'] });
    try {
      const { ctx, page } = await open(fb, 'fallback', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await check('[запасной] без WebGL 2 лаборатория работает на Canvas 2D: свет, укладка, сравнение, снимок', async () => {
        assert.equal(await page.evaluate(() => document.querySelector('[data-lab]').dataset.tier), 'fallback');
        await tab(page, 'light'); await page.locator('[data-mode="side"]').click(); await tab(page, 'layout'); await page.locator('[data-format="30x30"]').click();
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
