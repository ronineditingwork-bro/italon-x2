// Проверка работающего приложения (запускается внутри контейнера: docker exec -i <контейнер> node - <аргументы> < smoke.mjs).
//   node - <host> <min-items> [live]   (live — на рабочем сайте не трогать корзину: запрос /api/cart создаёт строку в базе)
// host — домен для заголовка Host (сервер отвечает 421 на чужой Host). min-items — не меньше стольких позиций в каталоге.
// Печатает JSON, код возврата 1 при любой ошибке. Ничего не пишет: только GET-запросы (корзина создаётся без записи в базу).
import { request } from 'node:http';
const [host = 'italon-x2.ru', minItems = '1', mode = ''] = process.argv.slice(2);
const live = mode === 'live';        // на рабочем сайте ничего не создаём: запрос корзины создал бы пустую корзину в базе
const errors = [];
const get = path => new Promise(accept => {
  const req = request({ host: '127.0.0.1', port: Number(process.env.SMOKE_PORT || 3000), path, method: 'GET', headers: { Host: host } }, res => {
    const parts = []; res.on('data', p => parts.push(p)); res.on('end', () => accept({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
  });
  req.on('error', e => accept({ status: 0, error: e.message, headers: {}, body: Buffer.alloc(0) }));
  req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  req.end();
});
const expect = async (path, status = 200, test) => {
  const r = await get(path);
  if (r.status !== status) { errors.push(`${path}: код ${r.status} вместо ${status}${r.error ? ' (' + r.error + ')' : ''}`); return r; }
  if (test) { const why = test(r); if (why) errors.push(`${path}: ${why}`); }
  return r;
};
const health = await expect('/healthz', 200, r => JSON.parse(r.body).catalogItems >= Number(minItems) ? '' : `в каталоге меньше ${minItems} позиций`);
const api = await expect('/api/catalog', 200, r => JSON.parse(r.body).products.length >= Number(minItems) ? '' : 'каталог в API меньше ожидаемого');
const products = api.status === 200 ? JSON.parse(api.body).products : [];
await expect('/', 200, r => /<main id="main"/.test(r.body) ? '' : 'нет <main>');
for (const p of ['/catalog/', '/calculator/', '/collections/', '/x2/', '/salon/', '/inspiration/']) await expect(p, 200, r => /<main id="main"/.test(r.body) ? '' : 'нет <main>');
for (const p of [products[0], products[Math.floor(products.length / 2)], products.at(-1)].filter(Boolean)) {
  await expect(`/product/${p.code}/`, 200, r => r.body.includes(p.code) ? '' : 'нет артикула на странице');
  if (p.image?.src) await expect('/' + p.image.src.replace(/^\//, ''), 200, r => r.body.subarray(8, 12).toString() === 'WEBP' || /\.jpe?g$/.test(p.image.src) ? '' : 'фото не WebP');
}
await expect('/data/catalog.json', 200, r => JSON.parse(r.body).products.length >= Number(minItems) ? '' : 'catalog.json меньше ожидаемого');
await expect('/sitemap.xml', 200, r => /<loc>/.test(r.body) ? '' : 'пустой sitemap');
await expect('/robots.txt', 200);
await expect('/assets/site.css'.replace('site.css', (/assets\/([\w.-]+\.css)/.exec((await get('/')).body.toString()) || [, 'site.css'])[1]), 200);
if (!live) await expect('/api/cart', 200, r => Array.isArray(JSON.parse(r.body).lines) ? '' : 'корзина вернула не то');
await expect('/no-such-page-check/', 404);
const wrong = await new Promise(accept => { const req = request({ host: '127.0.0.1', port: Number(process.env.SMOKE_PORT || 3000), path: '/', headers: { Host: 'evil.example' } }, res => { res.resume(); accept(res.statusCode); }); req.on('error', () => accept(0)); req.end(); });
if (wrong !== 421) errors.push(`чужой Host должен давать 421, а дал ${wrong}`);
console.log(JSON.stringify({ ok: errors.length === 0, catalogItems: products.length, errors }));
process.exit(errors.length ? 1 : 0);
