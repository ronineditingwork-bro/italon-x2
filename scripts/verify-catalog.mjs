// Проверка целостности собранного сайта и каталога (запускается после `npm run build:site`, в CI перед каждой выкладкой).
//   node scripts/verify-catalog.mjs                 проверить public/ и сверить с ops/catalog-baseline.json
//   node scripts/verify-catalog.mjs --update-baseline   осознанно обновить эталон (после изменения прайса)
// Ничего не меняет, кроме эталона при --update-baseline. Код возврата 1 — есть ошибки (выкладывать нельзя).
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pub = resolve(process.env.PUBLIC_DIR || resolve(root, 'public'));
const baselinePath = resolve(process.env.BASELINE_PATH || resolve(root, 'ops/catalog-baseline.json'));
const update = process.argv.includes('--update-baseline');
const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);
const read = p => readFileSync(resolve(pub, p), 'utf8');
const exists = p => existsSync(resolve(pub, String(p).replace(/^\/+/, '')));

// ---- каталог ----
if (!exists('data/catalog.json')) { console.error('ОШИБКА: нет public/data/catalog.json — сначала npm run build:site'); process.exit(1); }
const catalog = JSON.parse(read('data/catalog.json'));
const products = catalog.products || [], collections = catalog.collections || [];
const collectionIds = new Set(collections.map(c => c.id));
const sections = new Set(['italon', 'x2', 'coliseum', 'contract']);
if (products.length < 1) err('каталог пуст');
if (new Set(products.map(p => p.code)).size !== products.length) err('в каталоге повторяются артикулы');
// фото — WebP (узкие полоски плинтуса бывают очень маленькими) либо JPEG (одно служебное фото поддона)
const isPhoto = f => {
  const b = readFileSync(resolve(pub, f.replace(/^\/+/, '')));
  if (/\.jpe?g$/i.test(f)) return b.length > 1000 && b[0] === 0xff && b[1] === 0xd8;
  return b.length > 100 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
};
const NO_COLLECTION_PAGE = new Set(['packaging']);          // позиция «поддон» не относится ни к одной коллекции
let noImage = 0;
for (const p of products) {
  if (!/^\d{12}$/.test(p.code)) err(`артикул «${p.code}» не из 12 цифр`);
  if (!p.name || typeof p.name !== 'string') err(`${p.code}: нет названия`);
  if (!Number.isInteger(p.priceKopecks) || p.priceKopecks <= 0) err(`${p.code}: некорректная цена ${p.priceKopecks}`);
  if (!sections.has(p.section)) err(`${p.code}: неизвестная линия «${p.section}»`);
  if (!collectionIds.has(p.collectionId) && !NO_COLLECTION_PAGE.has(p.collectionId)) err(`${p.code}: нет коллекции «${p.collectionId}»`);
  if (p.image?.src) { if (!exists(p.image.src)) err(`${p.code}: нет файла фото ${p.image.src}`); else if (!isPhoto(p.image.src)) err(`${p.code}: ${p.image.src} не фото или повреждён`); } else noImage++;
  if (!exists(`product/${p.code}/index.html`)) err(`${p.code}: нет страницы товара`);
  else if (!read(`product/${p.code}/index.html`).includes(p.code)) err(`${p.code}: на странице нет артикула`);
}
if (noImage) warn(`позиций без фото: ${noImage}`);
for (const c of collections) {
  if (!exists(`collections/${c.id}/index.html`)) err(`коллекция ${c.id}: нет страницы`);
  for (const img of [c.image, c.cover].filter(Boolean)) if (img.src && !exists(img.src)) err(`коллекция ${c.id}: нет файла ${img.src}`);
}

// ---- страницы, карта сайта, ссылки ----
const manifest = JSON.parse(read('.site-manifest.json'));
const allHtml = manifest.files.filter(f => f.endsWith('.html'));
for (const f of allHtml) if (!exists(f)) err(`страница из манифеста сборки отсутствует: ${f}`);
const htmlFiles = allHtml.filter(exists);
const indexable = htmlFiles.filter(f => f !== '404.html' && !/<meta name="robots" content="noindex/.test(read(f)));
const sitemap = exists('sitemap.xml') ? read('sitemap.xml') : '';
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
if (!sitemap) err('нет sitemap.xml');
else {
  if (locs.length !== indexable.length) err(`в sitemap.xml ${locs.length} адресов, а индексируемых страниц ${indexable.length}`);
  if (new Set(locs).size !== locs.length) err('в sitemap.xml повторы');
  if (locs.some(u => /\/api\/|404\.html/.test(u))) err('в sitemap.xml попали служебные адреса');
}
if (!/Sitemap: https:\/\/italon-x2\.ru\/sitemap\.xml/.test(exists('robots.txt') ? read('robots.txt') : '')) err('в robots.txt нет ссылки на sitemap');
const attr = /\s(href|src|data-photo|poster)="([^"]+)"/g;      // data-photo считается от корня сайта (его открывает скрипт), остальное — от страницы
const checked = new Map();
let links = 0;
for (const file of htmlFiles) {
  if (file === '404.html') continue;
  const html = read(file);
  for (const m of html.matchAll(attr)) {
    const raw = m[2].replace(/&amp;/g, '&');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(raw)) continue;
    const path = raw.split(/[?#]/)[0]; if (!path) continue;
    const target = m[1] === 'data-photo' ? resolve(pub, path.replace(/^\/+/, '')) : resolve(pub, dirname(file), path);
    if (!target.startsWith(pub)) { err(`${file}: ссылка выходит за пределы сайта: ${raw}`); continue; }
    links++;
    let ok = checked.get(target);
    if (ok === undefined) { ok = existsSync(target) && (!statSync(target).isDirectory() || existsSync(join(target, 'index.html'))); checked.set(target, ok); }
    if (!ok) err(`${file}: битая ссылка → ${raw}`);
  }
}
for (const f of ['index.html', '404.html', 'favicon.svg', 'robots.txt', 'fonts/inter-cyrillic.woff2', 'fonts/Inter-Quote.ttf']) if (!exists(f)) err(`нет обязательного файла ${f}`);

// ---- бюджеты размера (грубые пороги: ловят случайные регрессии, а не мелкие изменения) ----
const size = p => statSync(resolve(pub, p)).size;
const walk = dir => readdirSync(resolve(pub, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
for (const f of walk('media')) if (size(f) > 900_000) err(`файл ${f} весит ${(size(f) / 1024) | 0} КБ (порог 900 КБ)`); else if (size(f) > 400_000) warn(`${f}: ${(size(f) / 1024) | 0} КБ`);
if (size('assets/site.css') > 80_000) err('site.css больше 80 КБ');
if (size('data/catalog.json') > 1_600_000) err('catalog.json больше 1,6 МБ');
const mainJs = readdirSync(resolve(pub, 'assets')).find(f => /^main\.js$/.test(f)); if (mainJs && size('assets/main.js') > 150_000) err('main.js больше 150 КБ');

// ---- эталон: ничего из прежнего каталога не должно исчезнуть ----
const snapshot = { products: products.length, collections: collections.length, pages: htmlFiles.length, productCodes: products.map(p => p.code).sort(), collectionIds: [...collectionIds].sort(), sitemapUrls: locs.length };
if (update) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, JSON.stringify({ note: 'Эталон каталога для scripts/verify-catalog.mjs. Обновлять осознанно: node scripts/verify-catalog.mjs --update-baseline', ...snapshot }, null, 1) + '\n');
  console.log(`Эталон обновлён: ${snapshot.products} позиций, ${snapshot.collections} коллекций`);
} else if (!existsSync(baselinePath)) warn('нет эталона ops/catalog-baseline.json — сверка пропущена');
else {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const have = new Set(snapshot.productCodes), haveC = new Set(snapshot.collectionIds);
  const lost = base.productCodes.filter(c => !have.has(c)), lostC = base.collectionIds.filter(c => !haveC.has(c));
  if (lost.length) err(`из каталога пропали позиции (${lost.length}): ${lost.slice(0, 8).join(', ')}${lost.length > 8 ? '…' : ''}`);
  if (lostC.length) err(`пропали коллекции: ${lostC.join(', ')}`);
  if (snapshot.pages < base.pages * 0.98) err(`страниц стало ${snapshot.pages} вместо ${base.pages}`);
  const added = snapshot.productCodes.filter(c => !new Set(base.productCodes).has(c)).length;
  if (added) warn(`новых позиций относительно эталона: ${added} (обновите эталон, если это ожидаемо)`);
}

// ---- юридические черновики не должны попасть в релиз (152-ФЗ) ----
for (const f of ['privacy/index.html', 'consent/index.html']) {
  if (!exists(f)) continue;
  const html = read(f);
  if (process.env.RELEASE_BUILD === '1' && /legal-draft/.test(html)) err(`${f}: на странице черновик юридического текста — нельзя выкладывать как релиз`);
  if (process.env.PD_LEGAL_APPROVED === '1' && /\[\[[^\]]+\]\]/.test(html)) err(`${f}: остались незаполненные места [[…]]`);
}
if (exists('index.html') && /id="quote-consent"/.test(read('index.html')) !== (exists('privacy/index.html') && exists('consent/index.html'))) err('форма согласия и страницы /privacy/, /consent/ должны появляться вместе');

const summary = { products: products.length, collections: collections.length, htmlPages: htmlFiles.length, indexable: indexable.length, sitemapUrls: locs.length, linksChecked: links, errors: errors.length, warnings: warnings.length };
console.log(JSON.stringify(summary));
for (const w of warnings) console.log('  предупреждение:', w);
for (const e of errors.slice(0, +(process.env.MAX_ERRORS || 60))) console.error('  ОШИБКА:', e);
if (errors.length > 60) console.error(`  … и ещё ${errors.length - 60}`);
process.exit(errors.length ? 1 : 0);
