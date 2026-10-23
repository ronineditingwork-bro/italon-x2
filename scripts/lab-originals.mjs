// Оригиналы изображений для MATERIAL LAB (режим слэбов и все материалы): проверка и подключение.
//
// Зачем: фото каталога слэбов 120×278 имеют размер ~148×341 px — для крупной стены этого мало, и лаборатория показывает их в «эскизном» режиме.
// Если у вас есть настоящий оригинал фото изделия (от производителя или ваш собственный), он подключается так, и позиция автоматически получает полную симуляцию:
//
//   node scripts/lab-originals.mjs add 600180000076 путь/к/original.jpg --source-url=https://… --evidence="по какому признаку файл относится к этому артикулу"
//   node scripts/lab-originals.mjs check
//
// Что проверяется: код есть в каталоге; пропорции файла совпадают с форматом изделия (допуск 3 %); меньшая сторона не меньше 700 px; файл читается.
// Ничего не растягивается и не дорисовывается: файл либо подходит как есть, либо отклоняется. Чужую плитку вместо нужной подставить нельзя —
// без указанного источника (--source-url) и подтверждения соответствия (--evidence) запись не добавляется.
//
// Хранение: файлы — public/media/lab/<код>-<sha8>.<расширение> (в Git), список — data/lab-originals.json, сборка сайта публикует public/data/lab-originals.json.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { imageSize } from '../site/shared/lab/image-size.mjs';
import { checkOriginal } from '../site/shared/lab/catalog.mjs';

const root = resolve(import.meta.dirname, '..');
const MANIFEST = resolve(root, 'data/lab-originals.json'), DIR = resolve(root, 'public/media/lab');
const sha = buf => createHash('sha256').update(buf).digest('hex');

/** Проверка списка оригиналов. Возвращает { items, rejected }: items — то, что публикуется (src относительно корня сайта). */
export async function buildOriginals({ products, manifestPath = MANIFEST, dir = DIR, log = () => {} } = {}) {
  const out = { items: {}, rejected: [] };
  if (!existsSync(manifestPath)) return out;
  const man = JSON.parse(await readFile(manifestPath, 'utf8')), byCode = new Map(products.map(p => [p.code, p]));
  for (const [code, o] of Object.entries(man.items || {})) {
    const reject = reason => { out.rejected.push({ code, reason }); log(`оригинал ${code} пропущен: ${reason}`); };
    const p = byCode.get(code); if (!p) { reject('нет такого артикула в каталоге'); continue; }
    if (!o.sourceUrl || !o.evidence) { reject('не указаны источник и подтверждение соответствия артикулу'); continue; }
    const file = resolve(dir, basename(o.file || ''));
    if (!o.file || !existsSync(file)) { reject(`нет файла ${o.file}`); continue; }
    const buf = readFileSync(file); if (o.sha256 && sha(buf) !== o.sha256) { reject('контрольная сумма файла не совпадает'); continue; }
    const size = imageSize(buf); if (!size) { reject('не удалось прочитать размер файла (поддерживаются JPEG, PNG, WebP)'); continue; }
    const why = checkOriginal(p, { src: o.file, ...size }); if (why) { reject(why); continue; }
    out.items[code] = { src: `media/lab/${basename(o.file)}`, width: size.width, height: size.height, sourceUrl: o.sourceUrl, evidence: o.evidence };
  }
  return out;
}

async function cli() {
  const [cmd, ...args] = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; })), pos = args.filter(a => !a.startsWith('--'));
  const data = await import(pathToFileURL(resolve(root, 'site/data.mjs')).href), products = data.products;
  if (cmd === 'check') {
    const r = await buildOriginals({ products, log: console.log }); console.log(`подключено оригиналов: ${Object.keys(r.items).length}, отклонено: ${r.rejected.length}`); process.exit(r.rejected.length ? 1 : 0);
  }
  if (cmd === 'add') {
    const [code, src] = pos; if (!code || !src) throw new Error('использование: add <артикул> <файл> --source-url=… --evidence="…"');
    if (!opt['source-url'] || !opt.evidence || opt.evidence === true) throw new Error('нужны --source-url и --evidence: откуда файл и почему он относится именно к этому артикулу');
    const p = products.find(x => x.code === code); if (!p) throw new Error(`артикул ${code} не найден в каталоге`);
    const buf = await readFile(resolve(src)), size = imageSize(buf); if (!size) throw new Error('не удалось прочитать файл (JPEG, PNG или WebP)');
    const why = checkOriginal(p, { src, ...size }); if (why) throw new Error(`файл не подходит: ${why}`);
    const hash = sha(buf), name = `${code}-${hash.slice(0, 8)}${extname(src).toLowerCase()}`;
    await mkdir(DIR, { recursive: true }); await copyFile(resolve(src), resolve(DIR, name));
    const man = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : { v: 1, items: {} };
    man.items[code] = { file: name, sha256: hash, sourceUrl: opt['source-url'], evidence: opt.evidence, addedOn: new Date().toISOString().slice(0, 10) };
    await writeFile(MANIFEST, JSON.stringify(man, null, 2) + '\n'); console.log(`добавлено: ${code} ← ${name} (${size.width}×${size.height}). Пересоберите сайт: npm run build:site`); return;
  }
  console.log('команды: add <артикул> <файл> --source-url=… --evidence="…" | check');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) cli().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
