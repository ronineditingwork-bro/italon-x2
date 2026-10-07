// Сборка статического сайта в public/:
//   1) CSS (site/css/site.css + site/css/pages/*.css) и JS (site/js/main.mjs + site/js/pages/*.mjs) через esbuild → public/assets/
//   2) public/data/catalog.json — каталог для клиентских страниц (поиск, корзина без сервера, калькулятор)
//   3) HTML всех страниц из site/pages/*.mjs через site/layout.mjs (относительные пути — работает в корне и под /italon-x2/)
// Сгенерированные файлы перечислены в public/.site-manifest.json и удаляются перед следующей сборкой;
// исходные public/media, public/fonts, public/favicon.svg не трогаются.
import { build } from 'esbuild';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const site = resolve(root, 'site');
const out = resolve(root, 'public');
const manifestPath = resolve(out, '.site-manifest.json');
const quiet = process.argv.includes('--quiet') || process.env.SITE_BUILD_QUIET === '1';
const started = Date.now();
// Боевой адрес сайта для sitemap.xml. Предпросмотр (GitHub Pages) собирается с SITE_NOINDEX=1: страницы закрыты от индексации.
const ORIGIN = (process.env.SITE_ORIGIN || 'https://italon-x2.ru').replace(/\/+$/, '');
const NOINDEX = process.env.SITE_NOINDEX === '1';

// ---------- 0. Очистка прошлой сборки ----------
if (existsSync(manifestPath)) {
  const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const file of previous.files || []) await rm(resolve(out, file), { force: true });
  for (const dir of (previous.dirs || []).sort((a, b) => b.length - a.length)) {
    try { if (!(await readdir(resolve(out, dir))).length) await rm(resolve(out, dir), { recursive: true }); } catch {}
  }
}
await rm(resolve(out, 'assets'), { recursive: true, force: true });
// старый одностраничный сайт
for (const legacy of ['styles.css', 'app.js']) await rm(resolve(out, legacy), { force: true });

const written = new Set();
async function emit(relPath, content) {
  const file = resolve(out, relPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  written.add(relPath);
}

// ---------- 1. CSS и JS ----------
const list = async (dir, ext) => existsSync(dir) ? (await readdir(dir)).filter(f => f.endsWith(ext)).sort() : [];
const pageCss = await list(resolve(site, 'css/pages'), '.css');
const pageJs = await list(resolve(site, 'js/pages'), '.mjs');
const common = { bundle: true, minify: true, legalComments: 'none', write: false, logLevel: 'warning' };
const cssResult = await build({ ...common,
  entryPoints: { 'site': resolve(site, 'css/site.css'), ...Object.fromEntries(pageCss.map(f => [`pages/${f.slice(0, -4)}`, resolve(site, 'css/pages', f)])) },
  outdir: resolve(out, 'assets'), external: ['*.woff2', '*.svg', '*.webp', '*.jpg', '*.png'], target: ['chrome100', 'safari15', 'firefox100'] });
const jsResult = await build({ ...common,
  entryPoints: { 'main': resolve(site, 'js/main.mjs'), ...Object.fromEntries(pageJs.map(f => [`pages/${f.slice(0, -4)}`, resolve(site, 'js/pages', f)])) },
  outdir: resolve(out, 'assets'), splitting: true, format: 'esm', platform: 'browser', target: 'es2020',
  chunkNames: 'chunks/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' } });
const hashes = {};
for (const file of [...cssResult.outputFiles, ...jsResult.outputFiles]) {
  const rel = relative(out, file.path).split('\\').join('/');
  await emit(rel, file.contents);
  hashes[rel.replace(/^assets\//, '')] = createHash('sha256').update(file.contents).digest('hex').slice(0, 10);
}

// ---------- 2. Каталог для клиента ----------
const data = await import(pathToFileURL(resolve(site, 'data.mjs')).href);
const strip = image => image ? { ...image, src: image.src.replace(/^\//, '') } : null;
const catalog = {
  priceInfo: data.priceInfo,
  categories: data.categories,
  products: data.products.map(p => ({ ...p, image: strip(p.image), category: data.categoryOf(p), variantKey: data.variantKey(p) })),
  collections: data.collections.map(({ items, ...c }) => ({ ...c, image: strip(c.image) })),
  laying: Object.fromEntries(Object.entries(data.layingMethods).map(([id, m]) => [id, { ...m, image: strip(m.image) }])),
};
const catalogJson = JSON.stringify(catalog);
await emit('data/catalog.json', catalogJson);
const buildId = createHash('sha256').update(catalogJson + JSON.stringify(hashes)).digest('hex').slice(0, 10);

// ---------- 3. Страницы ----------
const { layout } = await import(pathToFileURL(resolve(site, 'layout.mjs')).href);
const pages = [];
for (const file of await list(resolve(site, 'pages'), '.mjs')) {
  const mod = await import(pathToFileURL(resolve(site, 'pages', file)).href);
  let exported = mod.default ?? mod.page ?? mod.pages;
  if (typeof exported === 'function') exported = await exported(data);
  for (const page of [exported].flat()) {
    if (!page?.path || typeof page.render !== 'function') throw new Error(`site/pages/${file}: страница должна экспортировать {path, render}`);
    pages.push({ name: file.replace(/\.mjs$/, ''), ...page, source: file });
  }
}
const seen = new Set();
for (const page of pages) {
  if (seen.has(page.path)) throw new Error(`Повтор адреса ${page.path} (${page.source})`);
  seen.add(page.path);
  const isFile = page.path.endsWith('.html');
  const depth = page.path.split('/').filter(Boolean).length - (isFile ? 1 : 0);
  const pageRoot = '../'.repeat(depth);
  const ctx = {
    root: pageRoot,
    path: page.path,
    noindex: NOINDEX,
    data,
    buildId,
    /** Ссылка на путь сайта («/x2/») относительно текущей страницы */
    url: path => (pageRoot + String(path).replace(/^\//, '')) || './',
    /** Файл из public/assets с меткой версии */
    asset: name => `${pageRoot}assets/${name}${hashes[name] ? `?v=${hashes[name]}` : ''}`,
    /** Медиа из данных («/media/…») относительно текущей страницы */
    media: src => pageRoot + String(src || '').replace(/^\//, ''),
    isCurrent: path => path === '/' ? page.path === '/' : page.path.startsWith(path),
  };
  const body = await page.render(ctx);
  const html = layout(page, ctx, body).replace('<html lang="ru"', `<html lang="ru" data-build="${buildId}"`);
  await emit(isFile ? page.path.slice(1) : `${page.path.slice(1)}index.html`, html);
}

// ---------- 3. sitemap.xml и robots.txt ----------
// В карту сайта попадают только публичные страницы: без 404 и страниц с noindex. Корзина — диалог без своего адреса, API и файлы данных адресов-страниц не имеют.
const xml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
if (NOINDEX) {
  await emit('robots.txt', 'User-agent: *\nDisallow: /\n');
} else {
  const urls = pages.filter(p => !p.is404 && !p.noindex).map(p => ORIGIN + p.path).sort();
  await emit('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${xml(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
  await emit('robots.txt', `User-agent: *\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
}

// ---------- 4. Манифест ----------
const files = [...written].sort();
const dirs = [...new Set(files.flatMap(f => { const parts = f.split('/').slice(0, -1); return parts.map((_, i) => parts.slice(0, i + 1).join('/')); }))];
await writeFile(manifestPath, JSON.stringify({ buildId, files, dirs }, null, 1));
if (!quiet) console.log(JSON.stringify({ site: 'built', pages: pages.length, files: files.length, buildId, ms: Date.now() - started }));
export { pages, buildId };
