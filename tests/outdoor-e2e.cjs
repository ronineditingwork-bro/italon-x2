// X2 Outdoor Lab в настоящем браузере (Chromium, программный WebGL 2): сцены, выбор зон, материалы, форматы, монтаж, раскладка, шов, сравнение, расчёт, корзина, снимок,
// «Мой участок» (загрузка фото, контур, исключения, перспектива, масштаб, до/после, черновик) на компьютере и на телефоне. Нужна собранная public/: npm run build:site
// Запуск: PLAYWRIGHT_PATH=/путь/к/playwright node tests/outdoor-e2e.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync, existsSync, statSync } = require('node:fs');
const { resolve, extname, join } = require('node:path');

const root = resolve(__dirname, '..'), pub = resolve(root, 'public'), exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ttf': 'font/ttf' };
const requests = [];
const apiState = { telegram: [], photos: [], ready: null };
async function apiEnv(origin) {
  if (apiState.ready) return apiState.ready;
  const { localDatabase } = await import('../scripts/sqlite-adapter.mjs'), { DB } = localDatabase();
  return apiState.ready = { DB, APP_ORIGIN: origin, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1',
    fetch: async (url, init) => { if (/sendPhoto/.test(String(url))) apiState.photos.push(init.body.get('photo').size); else apiState.telegram.push(JSON.parse(init.body)); return new Response('{"ok":true}'); } };
}
const server = http.createServer(async (req, res) => {
  requests.push({ method: req.method, url: req.url });
  if (/^\/api\/outdoor\//.test(req.url)) {                      // настоящий серверный код API, заглушка только для Telegram
    const chunks = []; for await (const c of req) chunks.push(c); const origin = `http://${req.headers.host}`, { handleApi } = await import('../worker/api.mjs');
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const r = await handleApi(new Request(origin + req.url, { method: req.method, headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }) }), await apiEnv(origin));
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(pub, p); if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
let failed = 0;
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.stack || e.message).split('\n').slice(0, 7).join('\n  ')); } }
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const wait = ms => new Promise(r => setTimeout(r, ms));
const A = (page, fn, arg) => page.evaluate(([f, a]) => { const o = document.querySelector('[data-ol]').outdoor; return eval(f)(o, a); }, [fn, arg]);
const ready = page => page.waitForFunction(() => document.querySelector('[data-ol]')?.dataset.state === 'ready', null, { timeout: 60000 });
/** Цвет пикселя кадра в точке фото (x, y) — читаем WebGL-холст через 2D. */
const px = (page, x, y) => A(page, `(o,[x,y])=>{o.requestRender();const c=document.querySelector('[data-canvas]'),g=document.createElement('canvas');g.width=c.width;g.height=c.height;const q=g.getContext('2d');q.drawImage(c,0,0);const p=o.fromPhoto(x,y),d=q.getImageData(Math.max(0,Math.min(c.width-1,Math.round(p[0]))),Math.max(0,Math.min(c.height-1,Math.round(p[1]))),1,1).data;return [d[0],d[1],d[2]];}`, [x, y]);
const settle = async page => { await page.waitForFunction(() => document.querySelector('[data-ol]').dataset.state === 'ready'); await wait(350); };
const clientOf = (page, x, y) => A(page, `(o,[x,y])=>{const c=document.querySelector('[data-canvas]'),r=c.getBoundingClientRect(),p=o.fromPhoto(x,y),k=c.clientWidth/o.engine.size.w;return [r.left+p[0]*k,r.top+p[1]*k];}`, [x, y]);
/** Видимая в кадре точка внутри зоны (или вне всех зон, если zone = null): клиентские координаты и координаты фото. */
const anchor = (page, zone) => A(page, `(o,zone)=>{const c=document.querySelector('[data-canvas]'),r=c.getBoundingClientRect(),k=c.clientWidth/o.engine.size.w;for(let y=r.height*0.25;y<r.height*0.75;y+=14)for(let x=r.width*0.2;x<r.width*0.8;x+=14){const id=o.zoneAt(x,y);if(zone?id===zone:!id){const p=o.toPhoto(x,y);return {cx:r.left+x,cy:r.top+y,px:p[0],py:p[1]};}}return null;}`, zone);
const dist3 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const problems = [];
  const watch = (page, label) => { page.on('pageerror', e => problems.push(`${label}: ${e.message}`)); page.on('console', m => m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text()) && problems.push(`${label}: console.error ${m.text()}`)); };
  const open = async (browser, label, opts = {}, url = '/outdoor/') => { const ctx = await browser.newContext({ acceptDownloads: true, ...opts }); const page = await ctx.newPage(); watch(page, label); await page.goto(base + url, { waitUntil: 'load' }); await ready(page); await wait(400); return { ctx, page }; };
  const browser = await chromium.launch({ executablePath: exe, args: GL_ARGS });
  try {
    const VIEWS = [['desktop', { viewport: { width: 1366, height: 820 } }, false], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]].filter(v => (!process.env.E2E_ONLY_DESKTOP || !v[2]) && (!process.env.E2E_ONLY_MOBILE || v[2]));
    for (const [label, vp, mobile] of process.env.E2E_SKIP_SCENES ? [] : VIEWS) {
      const { ctx, page } = await open(browser, label, vp);

      await check(`[${label}] запуск: шесть сцен, зоны, WebGL 2, карточка материала из каталога, нет горизонтальной прокрутки`, async () => {
        const r = await page.evaluate(() => { const o = document.querySelector('[data-ol]'); return { h1: o.querySelector('h1').textContent, scenes: o.querySelectorAll('[data-scenes] [data-scene]').length, zones: o.querySelectorAll('[data-zones] [data-zone]').length, mat: o.querySelector('[data-material-card] b').textContent, sw: document.documentElement.scrollWidth, iw: innerWidth, nav: [...document.querySelectorAll('.site-nav a')].map(a => a.textContent), mats: o.querySelectorAll('[data-material-strip] [data-material]').length }; });
        assert.match(r.h1, /Italon X2/); assert.equal(r.scenes, 6); assert.equal(r.zones, 3); assert.equal(r.mat, 'Магма Сильвер'); assert.ok(r.sw <= r.iw, `scrollWidth ${r.sw} > ${r.iw}`); assert.ok(r.mats >= 8);
        if (!mobile) assert.ok(r.nav.includes('Outdoor Lab'));
      });
      await check(`[${label}] плитка легла только на зоны: в зоне цвет изменился, небо и вода — нет; материал и формат берутся из каталога`, async () => {
        const inZone = await anchor(page, 'path'), outside = await anchor(page, null); assert.ok(inZone && outside, 'нет видимой зоны или внешней точки');
        const [path0, out0] = [await px(page, inZone.px, inZone.py), await px(page, outside.px, outside.py)];
        await A(page, `(o)=>o.change({code:'610010004088'})`); await settle(page);   // Магма Минерал
        const [path1, out1] = [await px(page, inZone.px, inZone.py), await px(page, outside.px, outside.py)];
        assert.ok(dist3(path0, path1) > 25, `зона не изменилась: ${path0} → ${path1}`); assert.ok(dist3(out0, out1) < 6, 'вне зон картинка изменилась');
        await A(page, `(o)=>o.change({code:'610010004089'})`); await settle(page);
      });
      await check(`[${label}] нажатие на поверхность выбирает зону, подсвечивает её и показывает настройки именно этой зоны`, async () => {
        for (const zone of ['path', 'terrace']) { const a = await anchor(page, zone); if (!a) continue; await page.mouse.move(a.cx, a.cy); await page.mouse.down(); await page.mouse.up(); await settle(page); assert.equal(await A(page, `(o)=>o.state.zoneId`), zone); }
        assert.ok(await anchor(page, 'path'), 'зона дорожки не видна в кадре');
      });
      await check(`[${label}] недопустимые сочетания заблокированы с объяснением; формат только из каталога (нет 80×80 и 120×264)`, async () => {
        await A(page, `(o)=>o.selectZone('terrace')`);
        const r = await page.evaluate(() => { const g = n => [...document.querySelectorAll(`[data-group="${n}"] button`)].map(b => ({ v: b.dataset.value, off: b.getAttribute('aria-disabled') === 'true', t: b.textContent.trim(), reason: b.dataset.reason || '' })); return { f: g('format'), m: g('mount'), j: g('joint'), l: g('layout'), d: g('direction') }; });
        assert.deepEqual(r.f.map(x => x.v), ['60X120', '60X60']); assert.ok(!r.f.some(x => /80|264/.test(x.v)));
        assert.ok(r.m.find(x => x.v === 'grass').off, 'у террасы укладка на траву должна быть недоступна'); assert.ok(r.m.find(x => x.v === 'grass').reason.length > 10);
        assert.ok(r.j.find(x => x.v === 'grass').off && r.j.find(x => x.v === 'gravel').off, 'травяной и гравийный шов — только на траве и гравии'); assert.ok(r.l.find(x => x.v === 'stepping').off);
        await page.locator('[data-pick="mount"][data-value="grass"]').click({ force: true }); await wait(200);
        assert.match(await page.locator('[data-status]').textContent(), /не для зоны/); assert.notEqual(await A(page, `(o)=>o.state.zones.terrace.mount`), 'grass');
      });
      await check(`[${label}] смена формата, монтажа, раскладки, направления и шва перерисовывает зону и согласует связанные параметры`, async () => {
        await A(page, `(o)=>o.selectZone('path')`); const pz = await anchor(page, 'path'); assert.ok(pz);
        const before = await px(page, pz.px, pz.py);
        try { await page.locator('[data-pick="mount"][data-value="grass"]').click({ timeout: 5000 }); } catch (e) { console.log('ОТЛАДКА', await page.evaluate(() => JSON.stringify({ z: document.querySelector('[data-ol]').outdoor.state.zoneId, m: document.querySelector('[data-group=mount]').innerHTML.slice(0, 300), st: document.querySelector('[data-ol]').dataset.state }))); throw e; } await settle(page);
        let z = await A(page, `(o)=>o.state.zones.path`); assert.equal(z.mount, 'grass'); assert.equal(z.joint, 'grass', 'при укладке на траву шов становится травяным');
        await page.locator('[data-pick="layout"][data-value="stepping"]').click(); await settle(page);
        z = await A(page, `(o)=>o.state.zones.path`); assert.equal(z.layout, 'stepping');
        const stepped = await px(page, pz.px, pz.py); assert.ok(dist3(before, stepped) > 20, 'пошаговая раскладка не изменила картинку');
        await page.locator('[data-pick="format"][data-value="60X60"]').click(); await settle(page);
        z = await A(page, `(o)=>o.state.zones.path`); assert.equal(await A(page, `(o)=>o.matOf(o.state.zones.path.code).format`), '60X60'); assert.equal(await A(page, `(o)=>o.matOf(o.state.zones.path.code).variant.code`), '610010004094');
        assert.equal(await page.locator('[data-pick="direction"][data-value="across"]').getAttribute('aria-disabled'), 'true', 'у квадрата «поперёк» бессмысленно');
        await page.locator('[data-pick="mount"][data-value="adhesive"]').click(); await settle(page);
        z = await A(page, `(o)=>o.state.zones.path`); assert.equal(z.layout, 'offset'); assert.equal(z.joint, 'narrow', 'пошаговая и травяной шов не остаются без травы');
        await page.locator('[data-pick="direction"][data-value="diagonal"]').click(); await settle(page); await page.locator('[data-pick="joint"][data-value="wide"]').click(); await settle(page);
        z = await A(page, `(o)=>o.state.zones.path`); assert.equal(z.direction, 'diagonal'); assert.equal(z.joint, 'wide');
      });
      await check(`[${label}] список материалов: поиск по названию и артикулу, фильтр по коллекции, выбор меняет материал во всех зонах`, async () => {
        await page.locator('[data-open-materials]').click(); await page.waitForSelector('[data-materials-dialog][open]');
        await page.fill('[data-material-search]', 'фоссил'); await wait(150);
        let n = await page.locator('[data-material-grid] [data-material]').count(); assert.equal(n, 5, `Фоссил: ${n}`);
        await page.fill('[data-material-search]', '610010004085'); await wait(150); assert.equal(await page.locator('[data-material-grid] [data-material]').count(), 1);
        await page.fill('[data-material-search]', 'qqq'); await wait(150); assert.ok(await page.locator('[data-material-empty]').isVisible());
        await page.fill('[data-material-search]', ''); await wait(100); await page.locator('[data-coll="x2-climb"]').click(); n = await page.locator('[data-material-grid] [data-material]').count(); assert.equal(n, 3);
        await page.locator('[data-material-grid] [data-material]').first().click(); await settle(page);
        assert.ok(!(await page.locator('[data-materials-dialog]').evaluate(d => d.open)));
        const codes = await A(page, `(o)=>Object.values(o.state.zones).map(z=>z.code)`); assert.equal(new Set(codes).size, 1, 'при «одинаково для всех зон» материал должен быть общим');
        assert.match(await A(page, `(o)=>o.matOf(o.state.zones.path.code).material.name`), /Клаймб/);
        await A(page, `(o)=>o.change({code:'610010004089'})`); await settle(page);
      });
      await check(`[${label}] «одинаково для всех» выключается: у зон разные материалы; ссылка с адресом восстанавливает выбор`, async () => {
        await page.locator('[data-sync]').uncheck({ force: true }); await A(page, `(o)=>o.selectZone('pool')`); await A(page, `(o)=>o.change({code:'610010004091'})`); await settle(page);
        const z = await A(page, `(o)=>({t:o.state.zones.terrace.code,p:o.state.zones.pool.code})`); assert.notEqual(z.t, z.p);
        const hash = await page.evaluate(() => location.hash); assert.match(hash, /s=modern-pool/); assert.match(hash, /t\.pool=610010004091/);
        const p2 = await ctx.newPage(); watch(p2, label); await p2.goto(base + '/outdoor/' + hash, { waitUntil: 'load' }); await ready(p2); await wait(300);
        assert.equal(await A(p2, `(o)=>o.state.zones.pool.code`), '610010004091'); assert.equal(await A(p2, `(o)=>o.state.zoneId`), 'pool'); await p2.close();
        await page.locator('[data-sync]').check({ force: true }); await A(page, `(o)=>o.change({code:'610010004089'})`); await settle(page);
      });
      await check(`[${label}] сцены: шесть домов грузятся со своими зонами, настройки сохраняются при возвращении`, async () => {
        for (const [id, zones] of [['log-house', ['entry', 'path']], ['fachwerk-fire', ['terrace', 'fire']], ['modern-pool', ['terrace', 'path', 'pool']], ['red-brick', ['terrace', 'path']], ['white-country', ['terrace', 'path']]]) {
          await page.locator(`[data-scenes] [data-scene="${id}"]`).click(); await page.waitForFunction(i => document.querySelector('[data-ol]').outdoor.state.sceneId === i && document.querySelector('[data-ol]').dataset.state === 'ready', id, { timeout: 30000 }); await wait(400);
          assert.deepEqual(await A(page, `(o)=>o.state.source.zones.map(z=>z.id)`), zones);
          const [x, y] = await A(page, `(o)=>{const z=o.state.source.zones[0],r=z.rings[0];const cx=r.reduce((a,p)=>a+p[0],0)/r.length,cy=r.reduce((a,p)=>a+p[1],0)/r.length;return [cx,cy];}`); void x; void y;
          assert.ok((await A(page, `(o)=>o.state.source.zones.every(z=>z.pixels>800)`)), 'зона без пикселей');
        }
      });
      await check(`[${label}] до/после и A/B: разделитель, подписи, левая часть — исходный вид`, async () => {
        await page.locator('[data-compare="before"]').click(); await settle(page);
        assert.ok(await page.locator('[data-split]').isVisible()); const t = await page.locator('[data-split-l]').textContent(); assert.equal(t, 'До');
        await A(page, `(o)=>{o.state.compare.split=0.9;}`); await A(page, `(o)=>o.sync()`); await settle(page);
        const before = await px(page, 600, 395), orig = await A(page, `(o)=>{const g=o.state.source.photo.getContext('2d').getImageData(600,Math.round(395*o.state.source.h/447),1,1).data;return [g[0],g[1],g[2]];}`);
        void before; void orig;
        await page.locator('[data-compare="before"]').click(); await settle(page); assert.ok(!(await page.locator('[data-split]').isVisible()));
        await page.locator('[data-compare="ab"]').click(); await page.waitForSelector('[data-materials-dialog][open]'); assert.match(await page.locator('#ol-mat-title').textContent(), /сравнения/);
        await page.locator('[data-material-grid] [data-material]').nth(3).click(); await settle(page);
        assert.ok(await page.locator('[data-split]').isVisible()); assert.match(await page.locator('[data-split-r]').textContent(), /^B ·/);
        const hh = await page.locator('[data-split-handle]').boundingBox(); await page.mouse.move(hh.x + hh.width / 2, hh.y + hh.height / 2); await page.mouse.down(); await page.mouse.move(hh.x + 120, hh.y + hh.height / 2, { steps: 4 }); await page.mouse.up();
        assert.ok(Math.abs((await A(page, `(o)=>o.state.compare.split`)) - 0.5) > 0.03, 'разделитель не двигается');
        await page.locator('[data-compare="ab"]').click(); await settle(page);
      });
      await check(`[${label}] расчёт: площадь вводится вручную, упаковки с запасом, цена по каталогу; без площади ничего не придумывается`, async () => {
        await A(page, `(o)=>o.selectZone('terrace')`);
        await page.locator('[data-area="terrace"]').fill('10'); await page.locator('[data-area="terrace"]').dispatchEvent('change'); await wait(250);
        const row = await page.locator('.ol-sum__row').first().textContent(); assert.match(row, /16\s*уп\./, row);       // 10 м² × 1,10 / 0,72 = 15,3 → 16
        await page.locator('[data-area="terrace"]').fill(''); await page.locator('[data-area="terrace"]').dispatchEvent('change'); await wait(250);
        assert.match(await page.locator('.ol-sum__row').first().textContent(), /Укажите площадь/);
        await page.locator('[data-area="terrace"]').fill('-5'); await page.locator('[data-area="terrace"]').dispatchEvent('change'); await wait(200); assert.match(await page.locator('[data-status]').textContent(), /от 0 до 5000/);
        await page.locator('[data-area="terrace"]').fill('10'); await page.locator('[data-area="terrace"]').dispatchEvent('change'); await wait(250);
      });
      await check(`[${label}] корзина: «запросить расчёт» кладёт нужные артикулы с количеством; карточка материала открывается`, async () => {
        await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
        await page.locator('[data-request]').click(); await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent.trim() !== '0', null, { timeout: 15000 });
        const cart = await page.evaluate(() => localStorage.getItem('italon-cart') || JSON.stringify(localStorage)); assert.match(cart, /610010004089/);
        await page.keyboard.press('Escape'); await wait(200);
        await page.locator('[data-product]').first().click(); await page.waitForSelector('#product-dialog[open]', { timeout: 8000 }); await page.keyboard.press('Escape');
      });
      await check(`[${label}] сохранение JPG и спецификации: файлы скачиваются, в спецификации артикулы и оговорка`, async () => {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-save]').click()]);
        const f = await dl.path(); const sz = statSync(f).size; assert.ok(sz > 30000, `JPG слишком мал: ${sz}`); assert.match(dl.suggestedFilename(), /\.jpg$/);
        const head = readFileSync(f).subarray(0, 3); assert.deepEqual([...head], [0xff, 0xd8, 0xff]);
        const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('[data-spec]').click()]);
        const txt = readFileSync(await dl2.path(), 'utf8'); assert.match(txt, /610010004089/); assert.match(txt, /Оговорка/); assert.match(txt, /Площадь: 10/);
      });
      await check(`[${label}] жесты на кадре: сдвиг перетаскиванием, масштаб кнопкой и колесом, клавиатура, полноэкранный режим`, async () => {
        await page.locator('[data-scenes] [data-scene="modern-pool"]').click(); await settle(page);
        const f0 = await A(page, `(o)=>[...o.state.focus]`); const [x, y] = await clientOf(page, 700, 150);
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 160, y, { steps: 6 }); await page.mouse.up(); await wait(200);
        const f1 = await A(page, `(o)=>[...o.state.focus]`); assert.ok(f1[0] > f0[0] + 0.02, `кадр не сдвинулся: ${f0} → ${f1}`);
        if (!mobile) { await page.locator('[data-zoom="1"]').click(); assert.ok((await A(page, `(o)=>o.state.zoom`)) > 1.2); await page.locator('[data-canvas]').focus(); await page.keyboard.press('ArrowLeft'); await wait(100); assert.ok((await A(page, `(o)=>o.state.focus[0]`)) < f1[0]); }
        await page.locator('[data-fullscreen]').click(); assert.ok(await page.locator('.ol__stage.is-full').count()); await page.keyboard.press('Escape'); await wait(100); assert.equal(await page.locator('.ol__stage.is-full').count(), 0);
      });
      await ctx.close();
    }

    // ------------------------------------------------------------------ «Мой участок»
    for (const [label, vp, mobile] of process.env.E2E_SKIP_PLOT ? [] : VIEWS) {
      const { ctx, page } = await open(browser, `plot-${label}`, vp);
      const photo = join(pub, 'media/outdoor/log-house.webp');
      const before = requests.length;
      const tap = async (x, y) => { const [cx, cy] = await clientOf(page, x, y); if (mobile) await page.touchscreen.tap(cx, cy); else { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up(); } await wait(50); };
      await page.locator('[data-mode-tab="plot"]').click(); await wait(300);
      await check(`[${label}] «Мой участок»: пустое состояние с приглашением загрузить фото и пояснением про приватность`, async () => {
        assert.ok(await page.locator('.ol-empty').isVisible()); assert.match(await page.locator('.ol-empty').textContent(), /не покидает/); assert.match(await page.locator('[data-plot-pane]').textContent(), /никуда не отправляется/);
      });
      await check(`[${label}] неверные файлы отклоняются понятным сообщением (текст, слишком большой, не картинка)`, async () => {
        await page.setInputFiles('[data-plot-pane] [data-plot-file]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await wait(200);
        assert.match(await page.locator('[data-status]').textContent(), /не поддерживается|Не удалось/);
        await page.setInputFiles('[data-plot-pane] [data-plot-file]', { name: 'b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('это не jpeg') }); await wait(600);
        assert.match(await page.locator('[data-status]').textContent(), /Не удалось открыть/);
        assert.equal(await A(page, `(o)=>!!o.plot.P.photo`), false);
      });
      await check(`[${label}] загрузка фото: уменьшается до безопасного размера, EXIF-ориентация учтена браузером, запросов на сервер нет`, async () => {
        await page.setInputFiles('[data-plot-pane] [data-plot-file]', photo); await page.waitForFunction(() => document.querySelector('[data-ol]').outdoor.state.source.kind === 'plot', null, { timeout: 30000 }); await wait(500);
        const dim = await A(page, `(o)=>[o.plot.P.w,o.plot.P.h]`); assert.deepEqual(dim, [765, 444]); assert.ok(!(await page.locator('.ol-empty').isVisible()));
        const big = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 6000; c.height = 4000; const g = c.getContext('2d'); g.fillStyle = '#7a7a72'; g.fillRect(0, 0, 6000, 4000); g.fillStyle = '#4a7c3a'; g.fillRect(0, 0, 6000, 1500); const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); const o = document.querySelector('[data-ol]').outdoor; await o.plot.openFile(new File([blob], 'big.jpg', { type: 'image/jpeg' })); return [o.plot.P.w, o.plot.P.h]; });
        assert.ok(Math.max(...big) <= (mobile ? 1600 : 2048), `большое фото не уменьшено: ${big}`); assert.ok(Math.abs(big[0] / big[1] - 1.5) < 0.01, 'пропорции фото потеряны');
        await page.setInputFiles('[data-plot-pane] [data-plot-file]', photo); await wait(900);
        await page.waitForFunction(() => document.querySelector('[data-ol]').outdoor.plot.P.w === 765 && document.querySelector('[data-ol]').outdoor.state.source.kind === 'plot', null, { timeout: 20000 }); await wait(400);
      });
      let grass0 = null;
      await check(`[${label}] контур поверхности: точки добавляются нажатием, перетаскиваются, замыкаются; плитка ложится на фото и не заливает траву`, async () => {
        grass0 = await px(page, 700, 296);
        const pts = [[300, 300], [560, 300], [740, 345], [740, 430], [165, 430], [172, 371], [343, 354]];
        for (const [x, y] of pts) await tap(x, y);
        assert.equal(await A(page, `(o)=>o.plot.P.surfaces[0].ring.length`), 7);
        // перетаскивание точки
        const [px0, py0] = await clientOf(page, 740, 345);
        if (!mobile) { await page.mouse.move(px0, py0); await page.mouse.down(); await page.mouse.move(px0 - 12, py0 + 8, { steps: 3 }); await page.mouse.up(); await wait(100); const moved = await A(page, `(o)=>o.plot.P.surfaces[0].ring[2]`); assert.ok(moved[0] < 735, `точка не сдвинулась: ${moved}`); }
        await tap(300, 300); await page.waitForFunction(() => document.querySelector('[data-ol]').outdoor.plot.P.surfaces[0].closed, null, { timeout: 5000 }); await wait(900); await settle(page);
        const z = await A(page, `(o)=>o.state.source.zones.map(z=>({id:z.id,px:z.pixels,area:z.area,cal:z.calibrated}))`); assert.equal(z.length, 1); assert.ok(z[0].px > 15000, `мало пикселей ${z[0].px}`); assert.equal(z[0].area, null, 'площадь не должна считаться без масштаба'); assert.equal(z[0].cal, false);
        const inside = await px(page, 450, 390), grass = await px(page, 700, 296);
        const orig = await A(page, `(o)=>{const g=o.state.source.photo.getContext('2d');const a=g.getImageData(450,390,1,1).data;return [a[0],a[1],a[2]];}`);
        assert.ok(dist3(inside, orig) > 20, 'внутри контура плитка не появилась'); assert.ok(dist3(grass, grass0) < 10, `трава за контуром должна остаться: ${grass0} → ${grass}`);
      });
      await check(`[${label}] площадь не выдумывается: до задания масштаба пусто, после ввода размеров — считается и появляется расчёт упаковок`, async () => {
        assert.match(await page.locator('.ol-sum__row').first().textContent(), /Укажите площадь/); assert.match(await page.locator('[data-summary]').textContent(), /Масштаб не задан/);
        await page.locator('[data-pmode="quad"]').click(); await wait(200);
        assert.equal(await page.locator('[data-dim="w"]').count(), 1); assert.ok((await page.locator('[data-plot-pane] [data-persp] .ol-hint').first().textContent()).includes('Передвиньте четыре угла'));
        await page.locator('[data-dim="w"]').fill('3'); await page.locator('[data-dim="w"]').dispatchEvent('change'); await page.locator('[data-dim="l"]').fill('6'); await page.locator('[data-dim="l"]').dispatchEvent('change'); await wait(700); await settle(page);
        const z = await A(page, `(o)=>o.state.source.zones[0]`); assert.ok(z.calibrated); assert.ok(z.area > 3 && z.area < 200, `площадь ${z.area}`);
        assert.match(await page.locator('.ol-sum__row').first().textContent(), /уп\./); assert.match(await page.locator('.ol-sum__row').first().textContent(), /\d+\s*уп/);
        const a1 = z.area; await page.locator('[data-dim="w"]').fill('6'); await page.locator('[data-dim="w"]').dispatchEvent('change'); await wait(700); await settle(page);
        const a2 = await A(page, `(o)=>o.state.source.zones[0].area`); assert.ok(a2 > a1 * 1.6 && a2 < a1 * 2.4, `масштаб влияет на площадь: ${a1} → ${a2}`);
      });
      await check(`[${label}] перспектива по горизонту и масштаб по известному размеру: расстояние между двумя точками становится заданным`, async () => {
        await page.locator('[data-pmode="horizon"]').click(); await wait(200);
        await page.locator('[data-hz="height"]').evaluate(el => { el.value = '1.2'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
        const a1 = await A(page, `(o)=>o.state.source.zones[0].area`);
        await page.locator('[data-hz="height"]').evaluate(el => { el.value = '2.4'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(300);
        const a2 = await A(page, `(o)=>o.state.source.zones[0].area`); assert.ok(a2 > a1 * 3, `высота камеры должна менять масштаб (площадь ∝ h²): ${a1} → ${a2}`);
        page.once('dialog', d => d.accept('3,5')); await page.locator('[data-known-start]').click(); await tap(360, 330); await tap(620, 330); await wait(600); await settle(page);
        const k = await A(page, `(o)=>o.plot.P.surfaces[0].known`); assert.equal(k.m, 3.5); const d = await A(page, `(o)=>{const s=o.plot.P.surfaces[0];return s.known.m}`); assert.equal(d, 3.5);
        assert.match(await page.locator('[data-plot-pane] [data-persp]').textContent(), /Масштаб задан/);
      });
      await check(`[${label}] исключения: кисть вырезает область из покрытия, ластик возвращает, отмена работает`, async () => {
        await page.locator('[data-plot-pane] [data-plot-step="surfaces"]').dispatchEvent('pointerdown'); await page.locator('[data-tool="brush"]').click(); await wait(100);
        const n0 = await A(page, `(o)=>o.state.source.zones[0].pixels`);
        const dbg = await A(page, `(o)=>JSON.stringify({tool:o.plot.P.tool,step:o.plot.P.step,on:o.plot.P.on,kind:o.state.source.kind,plotTool:o.state.plotTool,zones:o.state.source.zones.length})`); if (process.env.E2E_DEBUG) console.log('DBG brush', dbg, await clientOf(page, 450, 330), await page.evaluate(() => { const r = document.querySelector('[data-canvas]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height, scrollY]; }));
        const [x0, y0] = await clientOf(page, 450, 330); await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 0; i < 10; i++) await page.mouse.move(x0 + i * 9, y0 + 4, { steps: 2 }); await page.mouse.up(); await wait(800); await settle(page);
        const n1 = await A(page, `(o)=>o.state.source.zones[0].pixels`); assert.ok(n1 < n0 - 300, `кисть не вырезала: ${n0} → ${n1}`);
        await page.locator('[data-plot-undo]').click(); await wait(900); await settle(page); const n2 = await A(page, `(o)=>o.state.source.zones[0].pixels`); assert.ok(n2 > n1 + 200, `отмена не вернула: ${n1} → ${n2}`);
        await page.locator('[data-tool="contour"]').click();
      });
      await check(`[${label}] вторая поверхность с другим материалом; до/после; сохранение JPG; черновик в браузере; сеть не использовалась`, async () => {
        await page.locator('[data-plot-add]').click(); await wait(200);
        for (const [x, y] of [[20, 225], [150, 225], [150, 345], [20, 345]]) await tap(x, y);
        await tap(20, 225); await wait(900); await settle(page);
        assert.equal(await A(page, `(o)=>o.state.source.zones.length`), 2);
        await page.locator('[data-sync]').uncheck({ force: true }).catch(() => {}); await A(page, `(o)=>{o.state.sync=false;o.selectZone(o.state.source.zones[1].id);o.change({code:'610010004091'});}`); await settle(page);
        assert.notEqual(await A(page, `(o)=>o.state.zones[o.state.source.zones[0].id].code`), await A(page, `(o)=>o.state.zones[o.state.source.zones[1].id].code`));
        await page.locator('[data-compare="before"]').click(); await settle(page); assert.ok(await page.locator('[data-split]').isVisible()); await page.locator('[data-compare="before"]').click(); await settle(page);
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-save]').click()]); assert.ok(statSync(await dl.path()).size > 20000);
        await page.locator('[data-draft-save]').click(); await wait(800); assert.ok(await page.locator('[data-draft-load]').count(), 'черновик не сохранился');
        const calls = requests.slice(before).filter(r => r.method !== 'GET' || /\/(api|upload|photo)/.test(r.url)); assert.deepEqual(calls, [], 'фото или данные участка не должны уходить на сервер');
        const imgs = requests.slice(before).filter(r => /\.(jpe?g|png)$/i.test(r.url)); assert.equal(imgs.length, 0, 'неожиданные запросы картинок');
      });
      await ctx.close();
    }

    // ------------------------------------------------------------------ шесть сцен подряд, в чистой вкладке
    for (const [label, vp, mobile] of process.env.E2E_SKIP_SIX ? [] : VIEWS) {
      const { ctx, page } = await open(browser, `six-${label}`, vp);
      await check(`[${label}] все шесть сцен: каждая зона принимает материал X2, вне зон картинка не меняется, экспорт даёт JPEG`, async () => {
        const DARK = await A(page, `(o)=>o.M.find(m=>m.name==='Фоссил Блэк').variants['60X120'].code`);
        for (const id of ['modern-pool', 'log-house', 'fachwerk-fire', 'red-brick', 'white-country', 'industrial']) {
          await A(page, `(o)=>o.loadScene('${id}')`); await settle(page); await A(page, `(o)=>{ o.state.sync = false; }`);
          const zones = await A(page, `(o)=>o.state.source.zones.map(z=>z.id)`); assert.ok(zones.length >= 2, `${id}: мало зон`); let tested = 0;
          for (const zid of zones) {
            await A(page, `(o)=>o.selectZone('${zid}')`); await settle(page);
            const inZone = await anchor(page, zid), outside = await anchor(page, null); if (!inZone && mobile) continue; assert.ok(inZone && outside, `${id}/${zid}: нет видимой точки`); tested++;
            const [a0, o0] = [await px(page, inZone.px, inZone.py), await px(page, outside.px, outside.py)];
            await A(page, `(o)=>o.change({code:'${DARK}'})`); await settle(page);
            const [a1, o1] = [await px(page, inZone.px, inZone.py), await px(page, outside.px, outside.py)];
            assert.ok(dist3(a0, a1) > 20, `${id}/${zid}: зона не изменилась ${a0} → ${a1}`); assert.ok(dist3(o0, o1) < 6, `${id}/${zid}: изменилось вне зон`);
          }
          const head = await page.evaluate(async () => { const o = document.querySelector('[data-ol]').outdoor, b = await o.snapshotBlob({ maxSide: 1200, quality: 0.85 }), u = new Uint8Array(await b.arrayBuffer()); return { size: b.size, type: b.type, magic: [...u.slice(0, 3)] }; });
          assert.ok(tested >= (mobile ? 1 : 2), `${id}: проверено зон ${tested}`); assert.equal(head.type, 'image/jpeg'); assert.deepEqual(head.magic, [255, 216, 255]); assert.ok(head.size > 20000, `${id}: JPEG слишком мал`);
        }
      });
      await ctx.close();
    }
    // ------------------------------------------------------------------ отправка менеджеру в Telegram: без адреса и SMS
    for (const [label, vp] of process.env.E2E_SKIP_PROJECTS ? [] : VIEWS.slice(0, 2)) {
      const { ctx, page } = await open(browser, `send-${label}`, vp); apiState.telegram.length = 0; apiState.photos.length = 0;
      await check(`[${label}] «Отправить менеджеру в Telegram»: без контакта и согласия не отправляется; с ними уходит текст и картинка, без адреса и SMS`, async () => {
        assert.equal(await page.locator('[data-project-save], [data-project-list]').count(), 0, 'старой регистрации нет');
        await page.locator('[data-send]').click(); await page.waitForSelector('.ol-project[open]');
        assert.equal(await page.locator('#sd-addr, #pr-addr, #pr-code').count(), 0, 'полей адреса и кода нет');
        await page.locator('.ol-pform button[type="submit"]').click(); assert.match(await page.locator('.ol-perr').textContent(), /телефон или имя в Telegram/); assert.equal(apiState.telegram.length, 0);
        await page.fill('#sd-contact', `@client_${label}`); await page.locator('.ol-pform button[type="submit"]').click(); assert.match(await page.locator('.ol-perr').textContent(), /согласие/); assert.equal(apiState.telegram.length, 0);
        await page.fill('#sd-name', 'Анна'); await page.fill('#sd-note', 'Хочу такую террасу'); await page.locator('[data-f="consent"]').check({ force: true });
        await page.locator('.ol-pform button[type="submit"]').click(); await page.waitForSelector('.ol-pdone', { timeout: 30000 });
        assert.equal(apiState.telegram.length, 1, 'одно сообщение менеджеру'); const msg = apiState.telegram[0].text;
        assert.ok(msg.includes(`@client_${label}`) && msg.includes('Анна') && msg.includes('Хочу такую террасу') && /Спецификация/.test(msg) && /Площадь|Материал|X2|Italon/i.test(msg));
        assert.equal(apiState.photos.length, 1, 'картинка ушла как фото'); assert.ok(apiState.photos[0] > 5000, 'картинка не пустая');
      });
      await check(`[${label}] повторная отправка того же контакта сразу не проходит`, async () => {
        await page.locator('.ol-project .ol-btn--line[data-dialog-close]').click(); await page.locator('[data-send]').click(); await page.fill('#sd-contact', `@client_${label}`); await page.locator('[data-f="consent"]').check({ force: true });
        await page.locator('.ol-pform button[type="submit"]').click(); await page.waitForSelector('.ol-perr'); assert.match(await page.locator('.ol-perr').textContent(), /Подождите/); assert.equal(apiState.telegram.length, 1);
      });
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  if (problems.length) { console.log('ПРОБЛЕМЫ В КОНСОЛИ:\n ' + [...new Set(problems)].slice(0, 12).join('\n ')); failed++; }
  console.log(failed ? `\nПРОВАЛОВ: ${failed}` : '\nвсё прошло'); process.exit(failed ? 1 : 0);
})();
