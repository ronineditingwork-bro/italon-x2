// Проверка копии базы заявок и корзин. Ничего не изменяет: файл открывается только для чтения.
//   node server/backup-verify.mjs <файл.sqlite> [--migrate-check]
// Печатает JSON-«паспорт» копии (без персональных данных: только числа и контрольная сумма).
// --migrate-check — дополнительно открывает ВРЕМЕННУЮ КОПИЮ файла кодом приложения (openDatabase), как при запуске сервера:
// так проверяется, что приложение сможет подняться на этой базе (миграции применяются к копии, исходный файл не меняется).
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const migrateCheck = args.includes('--migrate-check');
if (!file) { console.error('Usage: backup-verify.mjs <file.sqlite> [--migrate-check]'); process.exit(2); }
const path = resolve(file);
if (!existsSync(path)) { console.error('Файл не найден: ' + path); process.exit(2); }

const fail = message => { console.error('ПРОВАЛ: ' + message); process.exit(1); };
const bytes = readFileSync(path);
if (bytes.length < 4096 || bytes.subarray(0, 15).toString() !== 'SQLite format 3') fail('это не база SQLite');

const db = new DatabaseSync(path, { readOnly: true });
const report = { file: basename(path), bytes: statSync(path).size, sha256: createHash('sha256').update(bytes).digest('hex') };
try {
  const integrity = db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0]);
  report.integrity = integrity.length === 1 && integrity[0] === 'ok' ? 'ok' : integrity.slice(0, 5);
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  report.foreignKeyViolations = fk.length;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  report.tables = {};
  for (const name of tables) report.tables[name] = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n);
  for (const need of ['carts', 'quotes']) if (!tables.includes(need)) fail(`в копии нет таблицы ${need}`);
  const q = db.prepare('SELECT MAX(id) AS maxId, MAX(created_at) AS lastAt, SUM(telegram_ok) AS sent FROM quotes').get();
  report.quotes = { count: report.tables.quotes, maxId: q.maxId === null ? 0 : Number(q.maxId), lastCreatedAt: q.lastAt === null ? null : Number(q.lastAt), telegramOk: Number(q.sent || 0) };
  report.migrations = tables.includes('hosting_migrations') ? db.prepare('SELECT name FROM hosting_migrations ORDER BY name').all().map(r => r.name) : [];
} finally { db.close(); }
if (report.integrity !== 'ok') { console.log(JSON.stringify(report, null, 2)); fail('integrity_check: ' + JSON.stringify(report.integrity)); }
if (report.foreignKeyViolations) fail('нарушены внешние ключи');

if (migrateCheck) {
  const dir = mkdtempSync(resolve(tmpdir(), 'italon-verify-'));
  try {
    const copy = resolve(dir, 'copy.sqlite');
    copyFileSync(path, copy);
    const { openDatabase } = await import('./database.mjs');
    const opened = openDatabase(copy, process.env.MIGRATIONS_DIR || resolve(import.meta.dirname, '../drizzle'));
    try {
      const after = opened.database.prepare('SELECT COUNT(*) AS n FROM quotes').get().n;
      if (Number(after) !== report.quotes.count) fail('после применения миграций число заявок изменилось');
      report.migrateCheck = 'ok';
    } finally { opened.close(); }
  } catch (error) { fail('приложение не смогло открыть копию: ' + error.message); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(JSON.stringify(report, null, 2));
