// Пересчёт признаков внешнего вида всех фото каталога для подбора по изображению → data/picker-features.json.
// Запускается вручную после смены фото/каталога (результат лежит в git, обычная сборка сайта браузер не требует):
//   node scripts/build-site.mjs && PLAYWRIGHT_PATH=/путь/к/playwright node scripts/build-picker-features.cjs
// Признаки считает ТОТ ЖЕ код (site/shared/picker-features.mjs), что работает в браузере посетителя, — в headless Chromium.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const { readFileSync, writeFileSync, existsSync, createReadStream, statSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const { createHash } = require('node:crypto');

const root = resolve(__dirname, '..');
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp', '.json': 'application/json' };
const catalog = JSON.parse(readFileSync(resolve(root, 'public/data/catalog.json'), 'utf8'));
const srcs = [...new Set(catalog.products.map(p => p.image && p.image.src).filter(Boolean))].sort();

(async () => {
  const server = http.createServer((req, res) => {
    const file = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream'); createReadStream(file).pipe(res);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage();
  await page.goto(base + '/site/shared/picker-features.mjs');             // любая страница того же origin
  const result = await page.evaluate(async ({ base, srcs }) => {
    const F = await import(base + '/site/shared/picker-features.mjs'), B = await import(base + '/site/shared/picker-browser.mjs');
    const out = {};
    for (const src of srcs) {
      const blob = await (await fetch(`${base}/public/${src}`)).blob();
      const d = F.describe(await B.imageDataFrom(blob), { crop: true });
      out[src] = F.toBase64(F.pack(d));
    }
    return out;
  }, { base, srcs });
  await browser.close(); server.close();
  const items = {};
  for (const src of srcs) items[src] = { h: createHash('sha1').update(readFileSync(resolve(root, 'public', src))).digest('hex').slice(0, 8), f: result[src] };
  writeFileSync(resolve(root, 'data/picker-features.json'), JSON.stringify({ version: 1, count: srcs.length, items }));
  console.log(`признаков: ${srcs.length} изображений → data/picker-features.json`);
})().catch(e => { console.error(e); process.exit(1); });
