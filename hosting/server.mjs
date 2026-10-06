import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { openDatabase } from './database.mjs';
import { handleApi, products } from './api.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'public');
const origin = new URL(process.env.APP_ORIGIN || '');
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('APP_ORIGIN must be the public site origin, for example https://italon-x2.ru');
}
if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production APP_ORIGIN requires HTTPS');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const storage = openDatabase(resolve(process.env.DB_PATH || resolve(root, 'data/cart.sqlite')));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
};

const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  try {
    // A trusted, fixed public origin preserves Secure cookies and same-origin checks
    // behind a TLS proxy, without trusting visitor-supplied forwarded headers.
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return sendJson(res, 400, { error: 'Некорректный адрес.' });
    const url = new URL(origin.origin + req.url);
    if (url.pathname === '/healthz' && req.method === 'GET') {
      storage.database.prepare('SELECT 1').get();
      return sendJson(res, 200, { status: 'ok', catalogItems: products.length });
    }
    if (req.headers.host?.toLowerCase() !== origin.host.toLowerCase()) return sendJson(res, 421, { error: 'Некорректный домен.' });
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      let size = 0;
      const limit = url.pathname === '/api/quote' ? 3_000_000 : 20000;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > limit) { sendJson(res, 413, { error: 'Слишком большая корзина.' }); req.resume(); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(url, { method: req.method, headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      const response = await handleApi(request, { DB: storage.DB, TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return sendJson(res, 400, { error: 'Некорректный адрес.' }); }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
      return sendJson(res, 404, { error: 'Страница не найдена.' });
    }
    // Многостраничный сайт: «/раздел/» → «/раздел/index.html»; «/раздел» без слэша → редирект на «/раздел/».
    let filename = resolve(publicRoot, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!filename.startsWith(publicRoot + sep)) return sendJson(res, 404, { error: 'Страница не найдена.' });
    let info, status = 200;
    try { info = await stat(filename); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    if (info?.isDirectory() && !extname(pathname)) {
      try { if ((await stat(resolve(filename, 'index.html'))).isFile()) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); res.end(); return; } } catch {}
    }
    if (!info?.isFile()) {
      // HTML-страница 404 для адресов без расширения, JSON — для файлов
      const notFound = resolve(publicRoot, '404.html');
      if (extname(pathname) && extname(pathname) !== '.html') return sendJson(res, 404, { error: 'Страница не найдена.' });
      try { info = await stat(notFound); filename = notFound; status = 404; } catch { return sendJson(res, 404, { error: 'Страница не найдена.' }); }
    }
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': types[extname(filename).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': filename.endsWith('.html') || filename.endsWith('.json') ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Robots-Tag': 'noindex, nofollow', 'ETag': etag,
    };
    if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    res.writeHead(status, { ...headers, 'Content-Length': info.size });
    if (req.method === 'HEAD') { res.end(); return; }
    await pipeline(createReadStream(filename), res);
  } catch (error) {
    console.error('request_error', error.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'Сервис временно недоступен.' });
    else res.destroy();
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(JSON.stringify({ ready: true, port: server.address().port, origin: origin.origin })));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => { storage.close(); process.exit(1); }, 10000).unref();
  server.close(() => { clearTimeout(timeout); storage.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
