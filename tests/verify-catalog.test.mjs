// Проверка самой проверки: на маленьком искусственном сайте она должна пропускать целое и ловить каждую поломку.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dirname, '../scripts/verify-catalog.mjs');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([200, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(300, 1)]);

function site() {
  const T = mkdtempSync(resolve(tmpdir(), 'italon-catalog-test-'));
  const put = (p, c) => { mkdirSync(dirname(resolve(T, 'public', p)), { recursive: true }); writeFileSync(resolve(T, 'public', p), c); };
  const products = [1, 2].map(i => ({ code: `61001000000${i}`, name: `Плитка ${i}`, priceKopecks: 100000 * i, section: 'italon', collectionId: 'aura', image: { src: `media/products/p${i}.webp` } }));
  put('data/catalog.json', JSON.stringify({ products, collections: [{ id: 'aura', image: { src: '/media/collections/aura.webp' } }] }));
  put('media/collections/aura.webp', webp);
  for (const p of products) { put(p.image.src, webp); put(`product/${p.code}/index.html`, `<main><a href="../../">главная</a><img src="../../${p.image.src}"><h1>${p.code}</h1></main>`); }
  put('collections/aura/index.html', '<main><a href="../../catalog/">каталог</a></main>');
  put('catalog/index.html', '<main></main>');
  put('index.html', '<main><a href="catalog/">каталог</a></main>');
  put('404.html', '<main></main>');
  for (const f of ['favicon.svg', 'fonts/inter-cyrillic.woff2', 'fonts/Inter-Quote.ttf', 'assets/site.css']) put(f, 'x');
  put('robots.txt', 'Sitemap: https://italon-x2.ru/sitemap.xml\n');
  const pages = ['index.html', 'catalog/index.html', 'collections/aura/index.html', ...products.map(p => `product/${p.code}/index.html`)];
  put('sitemap.xml', `<urlset>${pages.map(f => `<url><loc>https://italon-x2.ru/${f.replace('index.html', '')}</loc></url>`).join('')}</urlset>`);
  put('.site-manifest.json', JSON.stringify({ files: [...pages, '404.html'] }));
  const run = (extra = {}) => spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, PUBLIC_DIR: resolve(T, 'public'), BASELINE_PATH: resolve(T, 'baseline.json'), ...extra } });
  return { T, put, run, products };
}

test('целый сайт проходит проверку; эталон сохраняется и сверяется', () => {
  const s = site();
  try {
    assert.equal(s.run().status, 0);
    assert.equal(s.run({}).status, 0);
    const up = spawnSync(process.execPath, [script, '--update-baseline'], { encoding: 'utf8', env: { ...process.env, PUBLIC_DIR: resolve(s.T, 'public'), BASELINE_PATH: resolve(s.T, 'baseline.json') } });
    assert.equal(up.status, 0, up.stderr); assert.equal(JSON.parse(readFileSync(resolve(s.T, 'baseline.json'))).products, 2);
    assert.equal(s.run().status, 0);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

for (const [name, mutate, expect] of [
  ['нет страницы товара', s => rmSync(resolve(s.T, 'public/product/610010000001'), { recursive: true }), /нет страницы товара|битая ссылка|sitemap/],
  ['нет файла фото', s => rmSync(resolve(s.T, 'public/media/products/p1.webp')), /нет файла фото/],
  ['повреждённое фото', s => s.put('media/products/p2.webp', 'not an image'.repeat(20)), /не фото или повреждён/],
  ['битая ссылка на странице', s => s.put('index.html', '<main><a href="no-such/">x</a></main>'), /битая ссылка/],
  ['нулевая цена', s => { const c = JSON.parse(readFileSync(resolve(s.T, 'public/data/catalog.json'))); c.products[0].priceKopecks = 0; s.put('data/catalog.json', JSON.stringify(c)); }, /некорректная цена/],
  ['повтор артикула', s => { const c = JSON.parse(readFileSync(resolve(s.T, 'public/data/catalog.json'))); c.products[1].code = c.products[0].code; s.put('data/catalog.json', JSON.stringify(c)); }, /повторяются артикулы/],
  ['пустой sitemap', s => s.put('sitemap.xml', '<urlset></urlset>'), /sitemap/],
  ['sitemap со служебным адресом', s => s.put('sitemap.xml', readFileSync(resolve(s.T, 'public/sitemap.xml'), 'utf8').replace('</urlset>', '<url><loc>https://italon-x2.ru/api/cart</loc></url></urlset>')), /служебные|sitemap/],
  ['нет шрифта для PDF', s => rmSync(resolve(s.T, 'public/fonts/Inter-Quote.ttf')), /обязательного файла/],
  ['огромное фото', s => s.put('media/products/p1.webp', Buffer.concat([webp, Buffer.alloc(950_000)])), /порог 900/],
]) test(`проверка ловит: ${name}`, () => {
  const s = site();
  try {
    assert.equal(s.run().status, 0, 'исходный сайт целый');
    mutate(s);
    const r = s.run(); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, expect);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('черновик юридического текста не пропускается в релиз (RELEASE_BUILD=1) и незаполненные места — при PD_LEGAL_APPROVED=1', () => {
  const s = site();
  try {
    s.put('privacy/index.html', '<main><aside class="legal-draft">ЧЕРНОВИК</aside> [[ОПЕРАТОР]]</main>'); s.put('consent/index.html', '<main>x</main>');
    s.put('index.html', '<main><a href="catalog/">к</a><input id="quote-consent"></main>');
    const manifest = JSON.parse(readFileSync(resolve(s.T, 'public/.site-manifest.json'))); manifest.files.push('privacy/index.html', 'consent/index.html'); s.put('.site-manifest.json', JSON.stringify(manifest));
    s.put('sitemap.xml', readFileSync(resolve(s.T, 'public/sitemap.xml'), 'utf8').replace('</urlset>', '<url><loc>https://italon-x2.ru/privacy/</loc></url><url><loc>https://italon-x2.ru/consent/</loc></url></urlset>'));
    assert.equal(s.run().status, 0, 'обычная сборка с черновиком допустима (страницы закрыты от индексации в самой сборке)');
    const r = s.run({ RELEASE_BUILD: '1' }); assert.equal(r.status, 1); assert.match(r.stderr, /черновик юридического текста/);
    const q = s.run({ PD_LEGAL_APPROVED: '1' }); assert.equal(q.status, 1); assert.match(q.stderr, /незаполненные места/);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('проверка ловит пропажу позиции относительно эталона (каталог не должен «худеть» незаметно)', () => {
  const s = site();
  try {
    spawnSync(process.execPath, [script, '--update-baseline'], { env: { ...process.env, PUBLIC_DIR: resolve(s.T, 'public'), BASELINE_PATH: resolve(s.T, 'baseline.json') } });
    const c = JSON.parse(readFileSync(resolve(s.T, 'public/data/catalog.json'))); c.products.pop(); s.put('data/catalog.json', JSON.stringify(c));
    s.put('product/610010000002/index.html', '<main></main>');
    const r = s.run(); assert.equal(r.status, 1); assert.match(r.stderr, /пропали позиции \(1\): 610010000002/);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});
