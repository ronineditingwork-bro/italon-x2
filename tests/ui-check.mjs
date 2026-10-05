// Интерфейсная проверка общего магазинного модуля (site/js/shop.mjs) в happy-dom на собранной странице каталога:
// поиск, быстрый просмотр товара, добавление в корзину, количество, удаление, PDF КП;
// затем — запасной режим без API (корзина в localStorage) и PDF в нём.
// Запуск: npm run build:site && node tests/ui-check.mjs
import { Window } from 'happy-dom';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { handleApi } from '../worker/api.mjs';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';

const root = resolve(import.meta.dirname, '..');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(predicate, label) { for (let i = 0; i < 500; i++) { if (predicate()) return; await pause(10); } throw new Error('Timed out: ' + label); }
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => { const t = nativeTimeout(fn, ms, ...args); if (ms >= 1000) t.unref?.(); return t; };

async function session({ api }) {
  const win = new Window({ url: 'https://italon-x2.ru/catalog/', settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
  win.document.write(await readFile(resolve(root, 'public/catalog/index.html'), 'utf8'));
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLImageElement', 'CustomEvent', 'MutationObserver', 'localStorage'])
    Object.defineProperty(globalThis, key, { value: key === 'window' ? win : win[key], configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
  Object.defineProperty(globalThis, 'location', { value: win.location, configurable: true });
  Object.defineProperty(globalThis, 'history', { value: win.history, configurable: true });
  win.HTMLDialogElement.prototype.showModal ||= function () { this.open = true; };
  win.HTMLDialogElement.prototype.close ||= function () { this.open = false; };
  win.HTMLElement.prototype.scrollIntoView = function () {};
  const { DB, close } = localDatabase(); let cookie = '', downloaded = null;
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(String(url), 'https://italon-x2.ru/');
    if (u.pathname === '/data/catalog.json') return new Response(await readFile(resolve(root, 'public/data/catalog.json')));
    if (u.pathname === '/fonts/Inter-Quote.ttf') return new Response(await readFile(resolve(root, 'public/fonts/Inter-Quote.ttf')));
    if (u.pathname.startsWith('/api/')) {
      if (!api) return new Response('Not found', { status: 404 });
      const headers = new Headers(options.headers); if (cookie) headers.set('Cookie', cookie); if (options.method) headers.set('Origin', 'https://italon-x2.ru');
      const response = await handleApi(new Request(u, { ...options, headers }), { DB });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    }
    return new Response('Not found', { status: 404 });
  };
  URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; }; URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {};
  return { win, $: s => win.document.querySelector(s), $$: s => [...win.document.querySelectorAll(s)], close: async () => { close(); await win.happyDOM.close(); }, downloaded: () => downloaded };
}

async function flow(s, expectMode) {
  const { win, $ } = s;
  await until(() => win.Italon && /сохранен/i.test($('#cart-status').textContent), 'cart ready');
  assert.equal(win.Italon.cart.mode, expectMode);
  // каталог: поиск по артикулу из адреса и из поля
  await until(() => !$('#catalog-filters').hidden, 'catalog filters');
  const q = $('#catalog-filters [name=q]'); q.value = '620110000263'; q.dispatchEvent(new win.Event('input', { bubbles: true }));
  await until(() => s.$$('#catalog-grid .product-card').length === 1, 'search result');
  // быстрый просмотр
  $('[data-add="620110000263"]').closest('.product-card'); win.Italon.openProduct('620110000263');
  await until(() => $('#product-dialog').open, 'product dialog'); assert.match($('#product-dialog-title').textContent, /МОЗАИКА/);
  $('#product-dialog [data-dialog-close]').click(); assert.equal($('#product-dialog').open, false);
  // в корзину, количество, второй товар, удаление
  $('#catalog-grid [data-add="620110000263"]').click();
  await until(() => $('[data-cart-count]').textContent === '1', 'add');
  $('[data-cart-open]').click(); assert.equal($('#cart-dialog').open, true);
  const qty = $('[data-qty="620110000263"]'); qty.value = '2'; qty.dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => /44\s506/.test($('#cart-total').textContent), 'quantity');
  await win.Italon.cart.add('610010001539', 36);
  await until(() => $('[data-cart-count]').textContent === '2', 'add x2');
  $('[data-remove="620110000263"]').click();
  await until(() => $('[data-cart-count]').textContent === '1', 'remove');
  await until(() => !$('#quote-download').disabled, 'quote ready');
  $('#quote-customer').value = 'Проверка интерфейса';
  $('#quote-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !!s.downloaded(), 'PDF');
  const pdf = Buffer.from(await s.downloaded().arrayBuffer()); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  return pdf;
}

// каждый режим — в отдельном процессе (модули магазина хранят состояние)
const modeArg = process.argv.find(a => a.startsWith('--mode='))?.slice(7);
if (!modeArg) {
  const { execFileSync } = await import('node:child_process');
  for (const mode of ['server', 'local']) execFileSync(process.execPath, [import.meta.filename, `--mode=${mode}`], { stdio: 'inherit' });
  console.log('PASS: каталог (поиск), быстрый просмотр, корзина на сервере и в localStorage, количество, удаление, PDF КП.');
} else {
  const s = await session({ api: modeArg === 'server' });
  try {
    await import('../site/js/main.mjs');
    await import('../site/js/pages/catalog.mjs');
    const pdf = await flow(s, modeArg);
    if (modeArg === 'server') {
      await mkdir(resolve(root, 'test-results'), { recursive: true });
      await writeFile(resolve(root, 'test-results/quote-from-ui.pdf'), pdf);
    } else {
      assert.match(s.$('#cart-status').textContent, /в браузере/);
      assert.equal(JSON.parse(s.win.localStorage.getItem('italon-cart-v1')).items[0].code, '610010001539');
    }
    console.log(`ok: режим ${modeArg}`);
  } finally { await s.close(); }
}
