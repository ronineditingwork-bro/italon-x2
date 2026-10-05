import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
await import('../scripts/build-hosting.mjs');
const release = resolve(import.meta.dirname, '../.hosting-runtime/release');

async function start(databasePath) {
  const child = spawn(process.execPath, ['server/server.mjs'], { cwd: release,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'production', APP_ORIGIN: 'https://italon-x2.ru', DB_PATH: databasePath }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stderr.on('data', part => { errors += part; });
  const port = await new Promise((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out: ' + errors)), 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', part => {
      output += part;
      const line = output.split('\n').find(line => line.startsWith('{'));
      if (line) { clearTimeout(timeout); accept(JSON.parse(line).port); }
    });
  });
  return { port, async stop() { const done = new Promise((accept, reject) => child.once('exit', code => code === 0 ? accept() : reject(new Error('Server stop failed: ' + errors)))); child.kill('SIGTERM'); await done; } };
}
function call(port, path, options = {}) {
  return new Promise((accept, reject) => {
    const body = options.body === undefined ? null : typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    const headers = { Host: 'italon-x2.ru', ...options.headers };
    if (body !== null) headers['Content-Length'] = Buffer.byteLength(body);
    const req = request({ host: '127.0.0.1', port, path, method: options.method || 'GET', headers }, res => {
      const parts = [];
      res.on('data', part => parts.push(part)); res.on('error', reject);
      res.on('end', () => accept({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts), json() { return JSON.parse(this.body); } }));
    });
    req.once('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('HTTP request timed out')));
    req.end(body);
  });
}
async function run(script, env, input) {
  const child = spawn(process.execPath, [script, ...(input ? ['-'] : [])], { cwd: release, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { errors += part; });
  const complete = new Promise((accept, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? accept(output) : reject(new Error(errors))); });
  child.stdin.end(input ? JSON.stringify(input) : undefined);
  return complete;
}

test('independent hosting preserves cart semantics across a proxy and restart', { timeout: 30000 }, async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'italon-hosting-'));
  const dbPath = resolve(temporary, 'cart.sqlite');
  const token = 'a'.repeat(64), cookie = '__Host-italon_cart=' + token;
  const id = createHash('sha256').update(token).digest('hex');
  const snapshot = { capturedAt: new Date().toISOString(), rows: [{ id, items: JSON.stringify([{ code: '620110000263', packs: 2 }]), version: 4, updated_at: Date.now() }] };
  let server;
  try {
    assert.equal(JSON.parse(await run('server/import-carts.mjs', { DB_PATH: dbPath }, snapshot)).imported, 1);
    server = await start(dbPath);
    assert.equal((await call(server.port, '/healthz')).json().catalogItems, 993);
    const home = await call(server.port, '/');
    assert.equal(home.status, 200); assert.match(home.body.toString(), /Italon Experience/); assert.match(home.body.toString(), /Бабушкина/);
    assert.equal((await call(server.port, '/', { headers: { Host: 'other.example' } })).status, 421);
    assert.equal((await call(server.port, '/', { headers: { 'If-None-Match': home.headers.etag } })).status, 304);
    assert.equal((await call(server.port, '/.env')).status, 404);
    assert.equal((await call(server.port, '/%2e%2e/%2e%2e/server/api.mjs')).status, 404);
    const catalog = await call(server.port, '/api/catalog');
    assert.equal(catalog.status, 200); assert.equal(catalog.json().products.length, 993);
    const productPhoto = catalog.json().products.find(product => product.image?.src)?.image.src;
    assert.ok(productPhoto);
    const homeImages = [...home.body.toString().matchAll(/src="(media\/(?:collections|laying)\/[^" ]+)"/g)].map(match => '/' + match[1]);
    assert.ok(homeImages.length >= 6, 'главная показывает фото коллекций');
    const imagePaths = [productPhoto, ...homeImages];
    // многостраничный сайт: разделы, страницы коллекций и товаров, 404, каталог для клиента
    for (const path of ['/collections/', '/collections/aura/', '/x2/', '/catalog/', '/calculator/', '/salon/', '/inspiration/', '/product/620110000263/']) {
      const page = await call(server.port, path); assert.equal(page.status, 200, path); assert.match(page.body.toString(), /<main id="main"/, path);
    }
    assert.equal((await call(server.port, '/salon')).headers.location, '/salon/');
    const missing = await call(server.port, '/no-such-page/'); assert.equal(missing.status, 404); assert.match(missing.body.toString(), /Такой страницы нет/);
    const clientCatalog = await call(server.port, '/data/catalog.json'); assert.equal(clientCatalog.status, 200); assert.equal(clientCatalog.json().products.length, 993);
    assert.equal((await call(server.port, '/.site-manifest.json')).status, 404);
    for (const path of new Set(imagePaths)) {
      const photo = await call(server.port, path); assert.equal(photo.status, 200, path);
      assert.equal(photo.headers['content-type'], 'image/webp'); assert.equal(photo.body.subarray(8, 12).toString(), 'WEBP');
    }
    const font = await call(server.port, '/fonts/Inter-Quote.ttf'); assert.equal(font.status, 200); assert.ok(font.body.length > 10000);
    const restored = await call(server.port, '/api/cart', { headers: { Cookie: cookie } });
    assert.equal(restored.status, 200); assert.equal(restored.json().version, 4); assert.equal(restored.json().totalKopecks, 4450600);
    assert.match(restored.headers['set-cookie'][0], /__Host-italon_cart=/); assert.match(restored.headers['set-cookie'][0], /; Secure/); assert.match(restored.headers['set-cookie'][0], /; HttpOnly/);
    assert.equal((await call(server.port, '/api/cart')).json().lines.length, 0);
    const put = body => call(server.port, '/api/cart', { method: 'PUT', headers: { Cookie: cookie, Origin: 'https://italon-x2.ru', 'Content-Type': 'application/json' }, body });
    const saved = await put({ version: 4, items: [{ code: '620110000263', packs: 3, priceKopecks: 1 }] });
    assert.equal(saved.status, 200); assert.equal(saved.json().totalKopecks, 6675900);
    assert.equal((await put({ version: 4, items: [] })).status, 409);
    assert.equal((await call(server.port, '/api/cart', { method: 'PUT', headers: { Cookie: cookie, Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: { version: 5, items: [] } })).status, 403);
    assert.equal((await call(server.port, '/api/cart', { headers: { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await put({ version: 5, items: [{ code: '610010001539', packs: 35 }] })).status, 400);
    assert.equal((await put(' '.repeat(20001))).status, 413);
    await server.stop(); server = null;
    server = await start(dbPath);
    const afterRestart = await call(server.port, '/api/cart', { headers: { Cookie: cookie } });
    assert.equal(afterRestart.json().lines[0].packs, 3); assert.equal(afterRestart.json().version, 5);
    assert.equal(JSON.parse(await run('server/import-carts.mjs', { DB_PATH: dbPath }, snapshot)).imported, 0);
    const backup = JSON.parse(await run('server/backup.mjs', { DB_PATH: dbPath }));
    const copy = new DatabaseSync(backup.backup, { readOnly: true });
    try { assert.equal(copy.prepare('SELECT version FROM carts WHERE id = ?').get(id).version, 5); } finally { copy.close(); }
    const manifest = JSON.parse(await readFile(resolve(release, 'release-manifest.json')));
    for (const file of manifest.files) {
      const contents = await readFile(resolve(release, file.path));
      assert.equal(createHash('sha256').update(contents).digest('hex'), file.sha256, file.path);
    }
  } finally { if (server) await server.stop(); await rm(temporary, { recursive: true, force: true }); }
});
