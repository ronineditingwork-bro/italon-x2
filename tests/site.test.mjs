// Проверки собранного сайта (scripts/build-site.mjs): страницы на месте, пути относительные,
// внутренние ссылки и ресурсы ведут на существующие файлы, на главной не грузится каталог.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
process.env.SITE_BUILD_QUIET = '1';
const { pages } = await import('../scripts/build-site.mjs');
const pub = resolve(import.meta.dirname, '../public');
const fileFor = path => resolve(pub, path.endsWith('/') ? `.${path}index.html` : `.${path}`);
const exists = async file => { try { return (await stat(file)).isFile(); } catch { return false; } };

test('все страницы собраны: главная, разделы, 75 коллекций, 1202 товара, 404', async () => {
  const paths = new Set(pages.map(p => p.path));
  for (const path of ['/', '/collections/', '/x2/', '/catalog/', '/calculator/', '/inspiration/', '/salon/', '/404.html']) assert.ok(paths.has(path), path);
  assert.equal(pages.filter(p => /^\/collections\/[^/]+\/$/.test(p.path)).length, 75);
  assert.equal(pages.filter(p => p.path.startsWith('/product/')).length, 1202);
  const catalog = JSON.parse(await readFile(resolve(pub, 'data/catalog.json'), 'utf8'));
  assert.equal(catalog.products.length, 1202);
});

test('пути относительные, ссылки и ресурсы существуют (выборка страниц)', async () => {
  const sample = pages.filter((p, i) => !p.path.startsWith('/product/') || i % 97 === 0);
  for (const page of sample) {
    if (page.is404) continue;
    const file = fileFor(page.path);
    const html = await readFile(file, 'utf8');
    assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/, `${page.path}: абсолютный путь от корня домена`);
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
      const clean = decodeURIComponent(ref.split('?')[0]);
      const target = resolve(dirname(file), clean.endsWith('/') || clean === '' ? `${clean}index.html` : clean);
      assert.ok(await exists(target), `${page.path}: нет файла для ${ref}`);
    }
  }
});

test('главная не загружает каталог и показывает данные без JS', async () => {
  const html = await readFile(resolve(pub, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /catalog\.json/);
  assert.match(html, /Пространство, в котором хочется быть/);
  assert.match(html, /Бабушкина, 248/);
  assert.match(html, /\+7 918 24 89 248/);
  assert.doesNotMatch(html, /<html[^>]*class="(?:[^"]* )?js[ "]/); // скрытие до анимации — только классом, который ставит скрипт
});

test('sitemap.xml: только публичные индексируемые страницы, адреса абсолютные и без повторов', async () => {
  const xml = await readFile(resolve(pub, 'sitemap.xml'), 'utf8');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(new Set(urls).size, urls.length, 'повторы адресов');
  const expected = pages.filter(p => !p.is404 && !p.noindex).map(p => 'https://italon-x2.ru' + p.path).sort();
  assert.deepEqual(urls, expected);
  assert.equal(urls.length, 1288);       // + /outdoor/ и /privacy/ 
  for (const url of urls) {
    assert.match(url, /^https:\/\/italon-x2\.ru\/([a-z0-9-]+\/)*$/, url);
    assert.doesNotMatch(url, /\/404\.html|\/api\/|\?|yandex_|\.json/, url);
  }
  assert.ok(urls.includes('https://italon-x2.ru/') && urls.includes('https://italon-x2.ru/product/610010004077/'));
  const robots = await readFile(resolve(pub, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*\nDisallow: \/api\/\n\nSitemap: https:\/\/italon-x2\.ru\/sitemap\.xml\n$/);
});

test('индексация: страницы открыты, 404 закрыта', async () => {
  const noindex = /<meta name="robots" content="noindex/;
  assert.doesNotMatch(await readFile(fileFor('/'), 'utf8'), noindex);
  assert.doesNotMatch(await readFile(fileFor('/product/610010004077/'), 'utf8'), noindex);
  assert.match(await readFile(fileFor('/404.html'), 'utf8'), noindex);
});

test('редакционные эффекты подключены с прогрессивным улучшением, без React', async () => {
  const home = await readFile(fileFor('/'), 'utf8');
  assert.match(home, /data-motion-parallax/);
  assert.match(home, /data-motion-magnet/);
  assert.match(home, /data-motion-spotlight/);
  const css = await readFile(resolve(pub, 'assets/site.css'), 'utf8');
  assert.match(css, /motion-enhanced/);
  assert.match(css, /lenis/);
  const pkg = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.dependencies.gsap, '3.15.0');
  assert.equal(pkg.dependencies.lenis, '1.3.27');
  assert.ok(!pkg.dependencies.react, 'React runtime must not be added to this site');
});

test('слой движения: хуки на четырёх страницах, панель сравнения только в тестовой сборке', async () => {
  for (const [path, attr] of [['/x2/', 'data-motion-spotlight'], ['/x2/', 'data-motion-magnet'], ['/inspiration/', 'data-motion-spotlight'], ['/inspiration/', 'data-motion-magnet'], ['/collections/', 'data-motion-spotlight']]) {
    assert.match(await readFile(fileFor(path), 'utf8'), new RegExp(attr), `${path}: ${attr}`);
  }
  const home = await readFile(fileFor('/'), 'utf8');
  if (process.env.SITE_PREVIEW !== '1') assert.doesNotMatch(home, /data-preview/, 'панель сравнения не должна попадать в рабочую сборку');
  for (const path of ['/catalog/', '/lab/', '/outdoor/', '/product/610010004077/']) assert.doesNotMatch(await readFile(fileFor(path), 'utf8'), /data-motion-/, `${path} не должна получать эффекты`);
});
