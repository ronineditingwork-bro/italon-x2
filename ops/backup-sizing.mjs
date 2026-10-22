// Оценка размера базы и хранилища резервных копий на синтетических данных ТОГО ЖЕ формата, что у сайта (схема из drizzle/).
// Реальной базы здесь нет, поэтому результат — оценка для сценариев; подставьте свои цифры:
//   node ops/backup-sizing.mjs [--carts-per-day 150] [--quotes-per-day 8] [--years 3] [--price 2.01] [--cart-lines 8] [--quote-lines 12]
// Реальные числа возьмите из ops/vps/preflight.sh --db (число заявок и корзин) и размера cart.sqlite.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomBytes, createHash } from 'node:crypto';
import { openDatabase } from '../hosting/database.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const cartsPerDay = arg('carts-per-day', 150), quotesPerDay = arg('quotes-per-day', 8), years = arg('years', 3), price = arg('price', 2.01);
const cartLines = arg('cart-lines', 8), quoteLines = arg('quote-lines', 12);
const pick = () => String(620110000000 + Math.floor(Math.random() * 99999));      // артикулы сайта — 12 цифр
const rnd = n => Math.floor(Math.random() * n);
const names = ['Иванов Иван Петрович', 'ООО «Строй-Мастер»', 'Петрова А. С.', 'ИП Сидоров', 'Дизайн-студия Лофт'];
const lines = n => JSON.stringify(Array.from({ length: n }, () => ({ code: pick(), packs: 1 + rnd(20), totalKopecks: 100000 + rnd(9000000) })));

// openDatabase отдаёт обёртку, поэтому для оценки открываем файл напрямую и применяем миграции теми же файлами
function make(days) {
  const dir = mkdtempSync(resolve(tmpdir(), 'italon-sizing-'));
  const file = resolve(dir, 'cart.sqlite');
  openDatabase(file, resolve(import.meta.dirname, '../drizzle'));
  const db = new DatabaseSync(file);
  db.exec('BEGIN');
  const c = db.prepare('INSERT INTO carts (id, items, version, updated_at) VALUES (?, ?, ?, ?)');
  const q = db.prepare('INSERT INTO quotes (created_at, customer, phone, project, note, items, total_kopecks, telegram_ok, consent_at, consent_version) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const t0 = Date.now() - days * 86400000;
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < cartsPerDay; i++) c.run(createHash('sha256').update(randomBytes(32)).digest('hex'), lines(1 + rnd(cartLines * 2)), rnd(12), t0 + d * 86400000 + rnd(86400000));
    for (let i = 0; i < quotesPerDay; i++) q.run(t0 + d * 86400000 + rnd(86400000), names[rnd(names.length)], '+7' + String(9000000000 + rnd(999999999)), 'Квартира, ' + (30 + rnd(120)) + ' м²', rnd(2) ? 'Позвонить после 18:00' : '', lines(quoteLines), 5000000 + rnd(90000000), 1, Date.now(), '2026-11-01');
  }
  db.exec('COMMIT'); db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM');
  db.close();
  const size = statSync(file).size, gz = gzipSync(readFileSync(file), { level: 9 }).length;
  rmSync(dir, { recursive: true, force: true });
  return { size, gz, enc: Math.ceil(gz * 1.0005) + 300 };      // age: +≈0,05% и заголовок
}

const MB = 1048576, GB = 1073741824;
const fmt = b => b >= GB ? (b / GB).toFixed(2) + ' ГБ' : (b / MB).toFixed(1) + ' МБ';
const probe = make(30), perDay = probe.size / 30, ratio = probe.enc / probe.size;
console.log(`Параметры: корзин в день ${cartsPerDay}, заявок в день ${quotesPerDay}, строк в корзине до ${cartLines * 2}, в заявке ${quoteLines}.`);
console.log(`Рост базы: ≈ ${(perDay / 1024).toFixed(0)} КБ/сутки; после сжатия и шифрования копия занимает ≈ ${(ratio * 100).toFixed(0)}% размера базы.`);
console.log('(Корзины в базе не удаляются сами — рост линейный; при желании можно чистить старые пустые корзины отдельной задачей.)');
// Ротация: 14 суточных + 8 недельных + 12 месячных копий (минимум 3); в худшем случае одновременно хранится 34 копии.
const COPIES = 14 + 8 + 12;
console.log(`\nХранилище при ротации (${COPIES} копий одновременно) и цене ${price.toFixed(2)} ₽/ГБ·мес (первый 1 ГБ бесплатно; цену проверьте по прайсу Yandex Cloud):`);
console.log('год  размер базы   копия      всего в хранилище   стоимость/мес');
const rows = [];
for (let y = 0.5; y <= years + 1e-9; y += y < 1 ? 0.5 : 1) {
  const size = perDay * 365 * y, copy = size * ratio, total = copy * COPIES;
  const cost = Math.max(0, total / GB - 1) * price;
  rows.push(y); console.log(`${String(y).padEnd(4)} ${fmt(size).padEnd(13)} ${fmt(copy).padEnd(10)} ${fmt(total).padEnd(19)} ${cost.toFixed(2)} ₽`);
}
const ops = 31 * 6;      // за месяц: загрузка копии и паспорта, проверка размера, перечень, удаление старых — порядка 6 операций в сутки
console.log(`\nОперации: ≈ ${ops} в месяц (в основном запись и перечень) — при любой разумной цене за 1000 операций это доли копейки; цена операций на итог не влияет.`);
const sc = [['мало (50 корзин, 3 заявки/день)', 50, 3], ['средне (150/8)', 150, 8], ['много (1000/40)', 1000, 40]];
console.log('\nСценарии за 3 года (размер одной копии → всего в хранилище → ₽/мес в конце 3-го года):');
for (const [label, cp, qp] of sc) {
  const copy = (cp + qp * 1.8) * (perDay / (cartsPerDay + quotesPerDay * 1.8)) * 365 * 3 * ratio;
  const total = copy * COPIES;
  console.log(`  ${label.padEnd(36)} ${fmt(copy).padEnd(9)} → ${fmt(total).padEnd(9)} → ${(Math.max(0, total / GB - 1) * price).toFixed(2)} ₽`);
}
