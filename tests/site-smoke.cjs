// Сквозная проверка сайта в браузере на НАСТОЯЩЕМ сервере с тестовой базой (боевые данные и сервер не затрагиваются):
// разделы, каталог (поиск, «Показать ещё»), карточка товара, корзина, калькулятор, форма КП → PDF → заявка в базе и «Telegram»,
// игра, мобильная версия (нет горизонтальной прокрутки), отсутствие ошибок в консоли и битых запросов.
// Второй проход — с включённым согласием на обработку ПДн (PD_CONSENT=1 / REQUIRE_CONSENT=1): без галочки заявка НЕ уходит.
// Запуск: node tests/site-smoke.cjs   (нужны playwright и chromium; PLAYWRIGHT_PATH=/путь/к/playwright, CHROMIUM=/путь/к/chromium)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const http = require('node:http');

const root = resolve(__dirname, '..');
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const shots = resolve(root, 'test-results');
let failed = 0;
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('ПРОВАЛ:', name, '\n ', String(e.message).split('\n').slice(0, 5).join('\n  ')); } }

function telegramStub(port) {
  const received = [];
  const server = http.createServer((req, res) => {
    const parts = []; req.on('data', p => parts.push(p));
    req.on('end', () => { const body = Buffer.concat(parts); received.push({ path: req.url, type: req.headers['content-type'] || '', size: body.length, text: /json/.test(req.headers['content-type'] || '') ? JSON.parse(body.toString()).text : '', pdf: /multipart/.test(req.headers['content-type'] || '') && body.includes('%PDF') }); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); });
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok({ received, close: () => server.close() })));
}
async function startServer(releaseDir, port, tgPort, db, extraEnv = {}) {
  const child = spawn(process.execPath, ['server/server.mjs'], { cwd: releaseDir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', APP_ORIGIN: `http://127.0.0.1:${port}`, DB_PATH: db, TELEGRAM_BOT_TOKEN: 'TEST', TELEGRAM_CHAT_ID: '1,2', TELEGRAM_API_BASE: `http://127.0.0.1:${tgPort}`, ...extraEnv } });
  let err = ''; child.stderr.on('data', d => err += d);
  await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('сервер не стартовал: ' + err)), 15000); child.stdout.on('data', d => { if (String(d).includes('"ready"')) { clearTimeout(t); ok(); } }); child.on('exit', c => bad(new Error('сервер завершился ' + c + ' ' + err))); });
  return { stop: () => new Promise(ok => { child.once('exit', ok); child.kill('SIGTERM'); }) };
}
const quotesIn = db => { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(db, { readOnly: true }); try { return d.prepare('SELECT phone, customer, consent_at, consent_version, telegram_ok FROM quotes ORDER BY id').all(); } finally { d.close(); } };

(async () => {
  mkdirSync(shots, { recursive: true });
  console.log('Сборка сервера…');
  execFileSync(process.execPath, [resolve(root, 'scripts/build-hosting.mjs')], { cwd: root, stdio: 'ignore' });
  const release = resolve(root, '.hosting-runtime/release');
  const T = mkdtempSync(resolve(tmpdir(), 'italon-smoke-'));
  const tg = await telegramStub(4320);
  const browser = await chromium.launch({ executablePath: exe });
  const CODE = '610010002780';
  const problems = [];
  const watch = (page, label) => {
    page.on('pageerror', e => problems.push(`${label}: ошибка скрипта: ${e.message}`));
    page.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && problems.push(`${label}: console.error: ${m.text()}`));
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith('http://127.0.0.1') && !/no-such-page/.test(r.url())) problems.push(`${label}: HTTP ${r.status()} ${r.url()}`); });
  };

  // ============ проход 1: как сейчас на боевом сайте (согласие выключено) ============
  const db1 = resolve(T, 'one.sqlite'); const s1 = await startServer(release, 4319, 4320, db1); const base = 'http://127.0.0.1:4319';
  try {
    for (const [label, viewport, mobile] of [['desktop', { width: 1366, height: 800 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
      const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
      const page = await ctx.newPage(); watch(page, label);

      await check(`[${label}] разделы открываются без ошибок, фото загружены, горизонтальной прокрутки нет`, async () => {
        for (const path of ['/', '/collections/', '/collections/aura/', '/x2/', '/catalog/', '/calculator/', '/salon/', '/inspiration/', '/x2/game/', `/product/${CODE}/`]) {
          const r = await page.goto(base + path, { waitUntil: 'networkidle' }); assert.equal(r.status(), 200, path);
          await page.waitForTimeout(150);
          const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1: document.querySelectorAll('h1').length,
            broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc).map(i => i.currentSrc.slice(-60)) }));
          assert.ok(m.over <= 1, `${path}: горизонтальная прокрутка ${m.over}px`); assert.equal(m.h1, 1, `${path}: h1`); assert.deepEqual(m.broken, [], `${path}: битые фото`);
        }
      });

      await check(`[${label}] каталог: счётчик, поиск, «Показать ещё»`, async () => {
        await page.goto(base + '/catalog/', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelectorAll('#catalog-grid .product-card').length > 0);
        const first = await page.locator('#catalog-grid .product-card').count();
        const total = (await page.textContent('#catalog-count')).replace(/\D/g, '');
        assert.ok(+total >= 1000, 'позиций в каталоге: ' + total);
        await page.fill('input[name="q"]', 'этернум');
        await page.waitForFunction(t => { const n = +document.querySelector('#catalog-count').textContent.replace(/\D/g, ''); return n > 0 && n < t; }, +total);
        assert.ok(await page.locator('#catalog-grid .product-card').count() > 0);
        await page.fill('input[name="q"]', 'абвгдеёжз-нет-такого');
        await page.waitForFunction(() => /0|нет|не найден/i.test(document.querySelector('#catalog-count').textContent));
        await page.fill('input[name="q"]', '');
        await page.waitForFunction(t => +document.querySelector('#catalog-count').textContent.replace(/\D/g, '') === t, +total);
        const more = page.locator('#catalog-more button, #catalog-more a').first();
        if (await more.count()) { await more.click(); await page.waitForFunction(n => document.querySelectorAll('#catalog-grid .product-card').length > n, first); }
      });

      await check(`[${label}] калькулятор: материал → площадь → упаковки`, async () => {
        await page.goto(base + '/calculator/', { waitUntil: 'networkidle' });
        await page.fill('#calc-material', 'этернум');
        await page.waitForSelector('#calc-listbox [role="option"]'); await page.locator('#calc-listbox [role="option"]').first().click();
        await page.fill('#calc-area', '25');
        await page.waitForFunction(() => /упаков|коробк/i.test(document.querySelector('#calc-output').textContent) && /₽/.test(document.querySelector('#calc-output').textContent));
      });
      await ctx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); watch(page, 'quote');
    await check('карточка → корзина → КП в PDF → заявка сохранена в базе и ушла в «Telegram» (согласие выключено — как сейчас)', async () => {
      await page.goto(base + `/product/${CODE}/`, { waitUntil: 'networkidle' });
      await page.locator('[data-add]').first().click();
      await page.waitForTimeout(600);
      await page.locator('.site-header [data-cart-open]').first().click();
      await page.waitForSelector('#cart-dialog[open] #cart-list .cart-line, #cart-dialog[open] #cart-list li, #cart-dialog[open] #cart-list article');
      assert.match(await page.textContent('#cart-list'), new RegExp(CODE));
      assert.match(await page.textContent('#cart-total'), /\d/);
      assert.equal(await page.locator('#quote-consent').count(), 0, 'галочки согласия нет, пока флаг не включён');
      await page.fill('#quote-phone', '12'); await page.waitForTimeout(100);
      const dl = page.waitForEvent('download', { timeout: 30000 });
      await page.fill('#quote-phone', '8 918 000-11-22'); await page.fill('#quote-customer', 'Тестов Тест Тестович'); await page.fill('#quote-address', 'Краснодар, ул. Тестовая, 1');
      await page.click('#quote-download');
      const d = await dl; const stream = await d.createReadStream(); const chunks = []; for await (const c of stream) chunks.push(c);
      assert.equal(Buffer.concat(chunks).subarray(0, 4).toString(), '%PDF');
      await page.waitForFunction(() => /готово|скачано/i.test(document.querySelector('#toast').textContent));
      const rows = quotesIn(db1); assert.equal(rows.length, 1); assert.equal(rows[0].phone, '+79180001122'); assert.equal(rows[0].consent_at, null);
      assert.ok(tg.received.some(r => r.path.endsWith('/sendMessage') && /Тестов Тест/.test(r.text) && !/Согласие на обработку/.test(r.text)));
      assert.ok(tg.received.some(r => r.path.endsWith('/sendDocument') && r.pdf), 'PDF ушёл в Telegram');
    });
    await ctx.close();
  } finally { await s1.stop(); }

  // ============ проход 2: согласие включено ============
  const rel2 = resolve(T, 'release2');
  cpSync(release, rel2, { recursive: true });
  execFileSync(process.execPath, [resolve(root, 'scripts/build-site.mjs'), '--quiet'], { cwd: root, env: { ...process.env, PD_CONSENT: '1', CONSENT_VERSION: 'smoke-1', SITE_OUT_DIR: resolve(rel2, 'public') }, stdio: 'ignore' });
  const db2 = resolve(T, 'two.sqlite'); const s2 = await startServer(rel2, 4321, 4320, db2, { REQUIRE_CONSENT: '1', CONSENT_VERSION: 'smoke-1' }); const base2 = 'http://127.0.0.1:4321';
  tg.received.length = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); watch(page, 'consent');
    const posts = []; page.on('request', r => r.method() === 'POST' && r.url().includes('/api/quote') && posts.push(r.url()));
    await check('согласие включено: страницы политики и согласия открываются, помечены черновиком', async () => {
      for (const p of ['/privacy/', '/consent/']) { const r = await page.goto(base2 + p); assert.equal(r.status(), 200); const t = await page.textContent('main'); assert.match(t, /ЧЕРНОВИК/); assert.match(await page.getAttribute('meta[name=robots]', 'content'), /noindex/); }
    });
    await check('без галочки КП скачивается, а заявка менеджеру НЕ отправляется; с галочкой — отправляется и согласие записано', async () => {
      await page.goto(base2 + `/product/${CODE}/`, { waitUntil: 'networkidle' });
      await page.locator('[data-add]').first().click(); await page.waitForTimeout(600);
      await page.locator('.site-header [data-cart-open]').first().click(); await page.waitForSelector('#cart-dialog[open] #quote-consent');
      assert.equal(await page.isChecked('#quote-consent'), false, 'галочка не отмечена заранее');
      await page.fill('#quote-phone', '8 918 000-33-44');
      let dl = page.waitForEvent('download', { timeout: 30000 }); await page.click('#quote-download'); await dl;
      await page.waitForFunction(() => /не отправлена/i.test(document.querySelector('#toast').textContent));
      assert.equal(posts.length, 0, 'запрос к /api/quote без согласия не отправлялся'); assert.equal(quotesIn(db2).length, 0); assert.equal(tg.received.length, 0, 'в Telegram ничего не ушло');
      await page.waitForTimeout(400);
      await page.check('#quote-consent');
      dl = page.waitForEvent('download', { timeout: 30000 }); await page.click('#quote-download'); await dl;
      await page.waitForFunction(() => /готово/i.test(document.querySelector('#toast').textContent));
      const rows = quotesIn(db2); assert.equal(rows.length, 1); assert.equal(rows[0].phone, '+79180003344'); assert.ok(rows[0].consent_at > 0); assert.equal(rows[0].consent_version, 'smoke-1');
      assert.ok(tg.received.some(r => /Согласие на обработку персональных данных получено/.test(r.text)));
    });
    // защита на стороне сервера: прямой запрос без согласия отклоняется
    await check('сервер сам отклоняет заявку без согласия (защита, даже если форму обойти)', async () => {
      const cookies = await ctx.cookies(base2); const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const fd = new FormData(); fd.set('phone', '+79180005566');
      const res = await fetch(base2 + '/api/quote', { method: 'POST', body: fd, headers: { Origin: base2, Cookie: cookie } });
      assert.equal(res.status, 400); assert.equal(quotesIn(db2).length, 1);
    });
    await ctx.close();
  } finally { await s2.stop(); }

  await check('за время проверки в консоли и сети не было ошибок', async () => { assert.deepEqual(problems, []); });
  await browser.close(); tg.close(); rmSync(T, { recursive: true, force: true });
  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсё: сквозные сценарии пройдены');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('Сбой запуска:', e); process.exit(2); });
