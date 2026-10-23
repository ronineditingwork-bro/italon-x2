// Список всех больших слэбов из ИСТОЧНИКА ИСТИНЫ — src/catalog.mjs.
// Никакого ручного списка артикулов. Применяется локальным загрузчиком ARCHITALON.
// Запуск: node scripts/lab-slab-targets.mjs --out=incoming/slabs/targets.json
//        node scripts/lab-slab-targets.mjs --csv --out=incoming/slabs/targets.csv
import { products } from '../src/catalog.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const is120x278 = format => /^120[XХ×]278$/i.test(String(format ?? '').replace(/\s+/g, ''));
const items = products.filter(p => p.collectionId !== 'packaging' && is120x278(p.format))
  .map(p => ({
    code: String(p.code),
    collectionId: String(p.collectionId),
    collection: String(p.collection),
    name: String(p.name),
    finish: String(p.finish ?? ''),
    format: '120X278',
    currentImage: p.image ? {
      src: p.image.src, width: p.image.width, height: p.image.height,
    } : null,
  }))
  .sort((a, b) => a.collection.localeCompare(b.collection, 'ru') || a.name.localeCompare(b.name, 'ru') || a.code.localeCompare(b.code));

const ids = new Set(items.map(item => item.code));
if (ids.size !== items.length) throw new Error('В каталоге повторяющиеся артикулы слэбов');
const groups = [...new Set(items.map(item => item.collectionId))].sort();
const result = { schemaVersion: 1, format: '120X278', count: items.length, collections: groups.length,
  source: 'Только существующий каталог Italon-X2; официальные оригиналы получаются с ARCHITALON отдельно',
  items };

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Указатель слэбов: --out=<путь.json> или --csv --out=<путь.csv>; без --out печатает результат в stdout');
  process.exit(0);
}
const isCsv = args.includes('--csv');
const target = args.find(a => a.startsWith('--out='))?.slice(6);
const csvQuote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const columns = ['code', 'collectionId', 'collection', 'name', 'finish', 'format', 'currentImageWidth', 'currentImageHeight'];
const csv = [columns.map(csvQuote).join(','),
  ...items.map(x => [x.code, x.collectionId, x.collection, x.name, x.finish, x.format, x.currentImage?.width ?? '', x.currentImage?.height ?? ''].map(csvQuote).join(',')),
].join('\r\n') + '\r\n';
const output = isCsv ? '\uFEFF' + csv : JSON.stringify(result, null, 2) + '\n';
if (target) {
  const file = resolve(target);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, output, 'utf8');
  console.error('Записан список: ' + file + ', артикулов: ' + result.count + ', коллекций: ' + result.collections);
} else {
  process.stdout.write(output);
}
