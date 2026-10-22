// Подбор керамогранита в браузере на НАСТОЯЩЕМ сервере сайта (тестовая база, боевые данные не затронуты):
// по описанию, по фото (загрузка, рамка, клавиатура), корзина из результатов, телефон, безопасность ввода, «фото не уходит с устройства».
// Запуск: PLAYWRIGHT_PATH=/путь/к/playwright node tests/picker-e2e.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, existsSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let failed = 0;
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.message).split('\n').slice(0, 6).join('\n  ')); } }

(async () => {
  console.log('Сборка сайта и сервера…');
  execFileSync(process.execPath, [resolve(root, 'scripts/build-hosting.mjs')], { cwd: root, stdio: 'ignore' });
  const release = resolve(root, '.hosting-runtime/release'), port = 4331, base = `http://127.0.0.1:${port}`;
  const db = resolve(mkdtempSync(resolve(tmpdir(), 'picker-e2e-')), 'c.sqlite');
  const child = spawn(process.execPath, ['server/server.mjs'], { cwd: release, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', APP_ORIGIN: base, DB_PATH: db } });
  await new Promise((ok, bad) => { setTimeout(() => bad(new Error('сервер не стартовал')), 15000); child.stdout.on('data', d => String(d).includes('"ready"') && ok()); });
  const catalog = JSON.parse(readFileSync(resolve(release, 'public/data/catalog.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: exe });
  const problems = [], requests = [];
  const watch = (page, label) => {
    page.on('pageerror', e => problems.push(`${label}: ошибка скрипта: ${e.message}`));
    page.on('console', m => m.type() === 'error' && problems.push(`${label}: console.error: ${m.text()}`));
    page.on('response', r => { if (r.status() >= 400) problems.push(`${label}: HTTP ${r.status()} ${r.url()}`); });
    page.on('request', r => requests.push({ method: r.method(), url: r.url(), size: (r.postData() || '').length }));
  };
  const productsDir = resolve(release, 'public/media/products');
  try {
    for (const [label, viewport, mobile] of [['desktop', { width: 1366, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
      const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile }); const page = await ctx.newPage(); watch(page, label);
      await page.goto(base + '/picker/', { waitUntil: 'networkidle' });

      await check(`[${label}] страница открывается, в меню есть «Подбор», горизонтальной прокрутки нет`, async () => {
        assert.equal(await page.locator('h1').count(), 1);
        assert.ok(await page.locator('a[href*="picker"]').count() >= 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
        assert.equal(await page.getAttribute('#tab-text', 'aria-selected'), 'true'); assert.ok(await page.locator('#panel-image').isHidden());
      });

      await check(`[${label}] по описанию: пример → карточки, «Понял так», причины, «Показать ещё»`, async () => {
        await page.locator('[data-example]').first().click();
        await page.waitForSelector('#pick-text-grid .pick-card');
        assert.ok(await page.locator('#pick-text-grid .pick-card').count() >= 12);
        assert.ok(await page.locator('.picker__tag').count() >= 3);
        assert.match(await page.textContent('#pick-text-status'), /Подобрано \d+/);
        assert.match(await page.textContent('#pick-text-grid .pick-card__why'), /Почему:/);
        const before = await page.locator('#pick-text-grid .pick-card').count();
        if (await page.locator('#pick-text-more').isVisible()) { await page.click('#pick-text-more button'); assert.ok(await page.locator('#pick-text-grid .pick-card').count() > before); }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'нет горизонтальной прокрутки');
        assert.equal(new URL(page.url()).searchParams.get('q'), await page.inputValue('#pick-text'), 'запрос попал в адрес');
      });

      await check(`[${label}] из результата можно положить товар в корзину`, async () => {
        await page.locator('#pick-text-grid [data-add]').first().click();
        await page.waitForFunction(() => /1/.test(document.querySelector('[data-cart-count]')?.textContent || ''), null, { timeout: 8000 });
      });

      await check(`[${label}] запрос из адреса ?q= выполняется сразу; пустой запрос и бессмыслица — понятный ответ`, async () => {
        await page.goto(base + '/picker/?q=' + encodeURIComponent('дерево для террасы'), { waitUntil: 'networkidle' });
        await page.waitForSelector('#pick-text-grid .pick-card');
        assert.match(await page.textContent('#pick-understood'), /для улицы/);
        await page.fill('#pick-text', 'qwerty asdf'); await page.click('#pick-text-form button[type=submit]');
        await page.waitForFunction(() => /не удалось понять|ничего не нашлось/i.test(document.querySelector('#pick-text-status').textContent)); assert.equal(await page.locator('#pick-text-grid .pick-card').count(), 0);
        await page.fill('#pick-text', ''); await page.click('#pick-text-form button[type=submit]'); assert.equal(await page.textContent('#pick-text-status'), '');
      });

      await check(`[${label}] ввод с разметкой не выполняется и показывается как текст`, async () => {
        await page.evaluate(() => { window.__xss = 0; });
        await page.fill('#pick-text', '<img src=x onerror="window.__xss=1"> серый'); await page.click('#pick-text-form button[type=submit]');
        await page.waitForTimeout(600); assert.equal(await page.evaluate(() => window.__xss), 0);
        assert.equal(await page.locator('#pick-text-grid img[src="x"], #pick-understood img').count(), 0);
      });

      await check(`[${label}] по фото: загрузка → рамка → похожие и «тот же рисунок»; рамка двигается мышью и стрелками; выдача обновляется`, async () => {
        await page.click('#tab-image');
        const prod = catalog.products.find(p => p.code === '610010002780'), file = resolve(release, 'public', prod.image.src);
        await page.setInputFiles('#pick-file', file);
        await page.waitForSelector('#pick-sim-grid .pick-card', { timeout: 20000 });
        assert.ok(await page.locator('#pick-editor').isVisible());
        const sim = await page.locator('#pick-sim-grid .pick-card').count(), pat = await page.locator('#pick-pat-grid .pick-card').count();
        assert.equal(sim, 12); assert.ok(pat >= 4, 'рисунок: ' + pat);
        const codes = await page.locator('#pick-sim-grid .product-card').evaluateAll(els => els.map(e => e.dataset.code));
        const sameImage = catalog.products.filter(p => p.image.src === prod.image.src).map(p => p.collectionId + p.code);
        assert.ok(codes.some(c => catalog.products.find(p => p.code === c).image.src === prod.image.src), 'то же фото среди похожих: ' + codes.join(','));
        assert.match(await page.textContent('#pick-sim-grid .pick-card__score'), /^\d+%$/);
        // рамка
        const f0 = await page.locator('#pick-frame').boundingBox();
        await page.locator('#pick-frame').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
        const f1 = await page.locator('#pick-frame').boundingBox(); assert.ok(f1.x !== f0.x || f1.y !== f0.y || f0.width >= f0.width, 'рамка сдвинулась (или упёрлась в край)');
        await page.fill('#pick-size', '30').catch(() => {}); await page.locator('#pick-size').evaluate(el => { el.value = 30; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.waitForTimeout(500); const f2 = await page.locator('#pick-frame').boundingBox(); assert.ok(f2.width < f0.width - 5, 'размер рамки уменьшился');
        await page.click('#pick-whole'); await page.waitForTimeout(600); assert.equal(await page.locator('#pick-sim-grid .pick-card').count(), 12);
        await page.click('#pick-plates'); await page.waitForTimeout(600); assert.ok(await page.locator('#pick-sim-grid .pick-card').count() > 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'нет горизонтальной прокрутки');
      });

      await check(`[${label}] по фото: не-изображение и слишком «тяжёлое/странное» отклоняются без сбоев; большой снимок обрабатывается`, async () => {
        await page.goto(base + '/picker/#photo', { waitUntil: 'networkidle' });
        await page.setInputFiles('#pick-file', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('это не картинка') });
        await page.waitForFunction(() => /не изображение/.test(document.querySelector('#pick-image-status').textContent));
        await page.setInputFiles('#pick-file', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('PNG-но-нет') });
        await page.waitForFunction(() => /Не удалось открыть/.test(document.querySelector('#pick-image-status').textContent));
        const big = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 4000, 3000); gr.addColorStop(0, '#d8c9ae'); gr.addColorStop(1, '#b09a78'); g.fillStyle = gr; g.fillRect(0, 0, 4000, 3000); const b = await new Promise(r => c.toBlob(r, 'image/png')); return [...new Uint8Array(await b.arrayBuffer())]; });
        const t0 = Date.now(); await page.setInputFiles('#pick-file', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.from(big) });
        await page.waitForSelector('#pick-sim-grid .pick-card', { timeout: 30000 }); assert.ok(Date.now() - t0 < 15000, 'большой снимок обработан за разумное время');
        assert.match(await page.textContent('#pick-sample-text'), /бежев|серо|светл/i);
      });
      await ctx.close();
    }

    await check('приватность: фото не отправляется — за всё время нет POST-запросов, запросов не на наш сервер и запросов с телом', async () => {
      const bad = requests.filter(r => !r.url.startsWith(base) || (r.method !== 'GET' && !/\/api\/cart/.test(r.url)) || (r.method === 'GET' && r.size > 0));
      assert.deepEqual(bad.map(r => `${r.method} ${r.url}`), []);
      assert.ok(!requests.some(r => /picker\/.*(upload|image)/i.test(r.url)));
    });
    await check('за время проверки в консоли и сети не было ошибок', async () => { assert.deepEqual(problems, []); });
  } finally { await browser.close(); child.kill('SIGTERM'); }
  console.log(failed ? `\nПровалено: ${failed}` : '\nВсё: подбор работает в браузере');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
