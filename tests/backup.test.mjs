// Проверка резервного копирования и восстановления на ТЕСТОВОЙ базе (боевая база и заявки не затрагиваются).
// Docker и rclone заменены заглушками, которые работают с локальными каталогами; age, gzip, SQLite — настоящие.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, chmodSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../hosting/database.mjs';

const root = resolve(import.meta.dirname, '..');
const sh = resolve(root, 'hosting/backup');
const hasTools = ['age', 'age-keygen', 'gzip', 'python3'].every(t => spawnSync('which', [t]).status === 0);

function sandbox() {
  const T = mkdtempSync(resolve(tmpdir(), 'italon-backup-test-'));
  for (const d of ['data/backups', 'bin', 'remote', 'local', 'state', 'etc', 'app']) mkdirSync(resolve(T, d), { recursive: true });
  // docker-заглушка: «внутри контейнера» /data = $T/data, node server/*.mjs = hosting/*.mjs
  writeFileSync(resolve(T, 'bin/docker'), `#!/usr/bin/env bash
set -e
T="${T}"; R="${root}"
map() { echo "\${1/#\\/data/$T/data}"; }
[ "$1" = compose ] || exit 90; shift
case "$1" in
  exec) shift; [ "$1" = -T ] && shift; while [ "$1" = -e ]; do shift 2; done; shift   # app
    if [ "$1" = node ] && [ "$2" = --input-type=module ]; then shift 3; args=(); for a in "$@"; do case "$a" in /data/*) args+=("$(map "$a")");; *) args+=("$a");; esac; done
      DB_PATH="$T/data/cart.sqlite" MIGRATIONS_DIR="$R/drizzle" DATABASE_MODULE="$R/hosting/database.mjs" exec "${process.execPath}" "$R/hosting/backup-verify.mjs" "\${args[@]}" </dev/null
    elif [ "$1" = node ]; then script="$2"; shift 2; args=(); for a in "$@"; do case "$a" in /data/*) args+=("$(map "$a")");; *) args+=("$a");; esac; done
      DB_PATH="$T/data/cart.sqlite" MIGRATIONS_DIR="$R/drizzle" exec "${process.execPath}" "$R/hosting/$(basename "$script")" "\${args[@]}"
    elif [ "$1" = rm ]; then shift; [ "$1" = -f ] && shift; for a in "$@"; do rm -f "$(map "$a")"; done; else exit 91; fi ;;
  cp) shift; src="\${1#app:}"; cp "$(map "$src")" "$2" ;;
  *) exit 92 ;;
esac
`);
  writeFileSync(resolve(T, 'bin/rclone'), `#!/usr/bin/env bash
set -e
R="${T}/remote"; p() { echo "$R/\${1#*:}"; }
[ -f "${T}/rclone-fail" ] && { echo "rclone: сбой (тест)" >&2; exit 1; }
case "$1" in
  copyto) mkdir -p "$(dirname "$(p "$3")")"; cp "$2" "$(p "$3")" ;;
  lsjson) f="$(p "$2")"; if [ -f "$f" ]; then echo "[{\\"Name\\":\\"$(basename "$f")\\",\\"Size\\":$(stat -c %s "$f")}]"; else echo "[]"; fi ;;
  lsf) ls -1 "$(p "$2")" 2>/dev/null || true ;;
  deletefile) rm -f "$(p "$2")" ;;
  *) exit 93 ;;
esac
`);
  writeFileSync(resolve(T, 'bin/notify'), `#!/usr/bin/env bash\necho "$1" >> "${T}/alerts.log"\n`);
  for (const f of ['docker', 'rclone', 'notify']) chmodSync(resolve(T, 'bin', f), 0o755);
  // ключи age: открытый — на «сервере», закрытый — у «владельца»
  const k = spawnSync('age-keygen', ['-o', resolve(T, 'owner.key')], { encoding: 'utf8' });
  const pub = (k.stderr + k.stdout).match(/age1[a-z0-9]+/)[0];
  writeFileSync(resolve(T, 'etc/recipients.txt'), pub + '\n');
  const { DB, database, close } = openDatabase(resolve(T, 'data/cart.sqlite'), resolve(root, 'drizzle'));
  const ins = database.prepare('INSERT INTO quotes (created_at, customer, phone, project, note, items, total_kopecks) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 300; i++) ins.run(1_700_000_000_000 + i, `Тест Тестович ${i}`, `+7900000${String(i).padStart(4, '0')}`, 'Объект', 'примечание', '[]', 100 * i);
  database.prepare('INSERT INTO carts (id, items, version, updated_at) VALUES (?, ?, ?, ?)').run('a'.repeat(64), '[]', 1, Date.now());
  close();
  const env = { ...process.env, PATH: `${T}/bin:${process.env.PATH}`, ITALON_BACKUP_CONF: '/nonexistent', APP_DIR: resolve(T, 'app'), LOCAL_DIR: resolve(T, 'local'), STATE_DIR: resolve(T, 'state'),
    AGE_RECIPIENTS: resolve(T, 'etc/recipients.txt'), RCLONE_REMOTE: 'stub:italon', NOTIFY: resolve(T, 'bin/notify'), MIN_FREE_MB: '1' };
  return { T, env, dbPath: resolve(T, 'data/cart.sqlite'), key: resolve(T, 'owner.key') };
}
const quotesDigest = path => { const db = new DatabaseSync(path, { readOnly: true }); try { return createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM quotes ORDER BY id').all())).digest('hex'); } finally { db.close(); } };
const runBackup = (env, extra = {}) => new Promise(res => { const c = spawn('bash', [resolve(sh, 'backup-run.sh')], { env: { ...env, ...extra } }); let out = '', err = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d); c.on('exit', code => res({ code, out, err })); });

test('резервная копия: снимок → проверка → шифрование → выгрузка; восстановление совпадает с паспортом; исходная база не меняется', { skip: !hasTools && 'нужны age и gzip' }, async () => {
  const s = sandbox();
  try {
    const before = quotesDigest(s.dbPath);
    const r = await runBackup(s.env);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(quotesDigest(s.dbPath), before, 'заявки в рабочей базе не изменились');
    const local = readdirSync(resolve(s.T, 'local')).filter(f => f.endsWith('.age'));
    const remote = readdirSync(resolve(s.T, 'remote/italon')).filter(f => f.endsWith('.age'));
    assert.equal(local.length, 1); assert.deepEqual(remote, local);
    assert.equal(readdirSync(resolve(s.T, 'local')).filter(f => f.startsWith('.work-')).length, 0, 'временный каталог убран');
    assert.equal(readdirSync(resolve(s.T, 'data/backups')).filter(f => f.startsWith('.snap-')).length, 0, 'снимок в контейнере удалён');
    const enc = readFileSync(resolve(s.T, 'local', local[0]));
    assert.ok(enc.subarray(0, 21).toString().startsWith('age-encryption.org'), 'файл зашифрован age');
    assert.ok(!enc.includes(Buffer.from('Тест Тестович')) && !enc.includes(Buffer.from('SQLite format 3')), 'открытых данных в файле нет');
    const manifest = JSON.parse(readFileSync(resolve(s.T, 'local', local[0].replace(/\.age$/, '.manifest.json'))));
    assert.equal(manifest.quotes.count, 300); assert.equal(manifest.integrity, 'ok'); assert.equal(manifest.migrateCheck, 'ok');
    assert.doesNotMatch(JSON.stringify(manifest), /\+7900|Тест/, 'в паспорте нет персональных данных');
    assert.ok(existsSync(resolve(s.T, 'state/last-success')));
    assert.ok(!existsSync(resolve(s.T, 'alerts.log')), 'при успехе тревоги нет');

    // восстановление на отдельном каталоге
    const ok = spawnSync('bash', [resolve(sh, 'restore-test.sh'), resolve(s.T, 'local', local[0]), s.key], { encoding: 'utf8', env: { ...process.env, TMPDIR: s.T } });
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /Паспорт копии совпал/); assert.match(ok.stdout, /ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО/);
    // кроссплатформенная проверка (Node) — для запуска на компьютере владельца из PowerShell
    const js = spawnSync(process.execPath, [resolve(sh, 'restore-check.mjs'), resolve(s.T, 'local', local[0]), s.key], { encoding: 'utf8' });
    assert.equal(js.status, 0, js.stderr + js.stdout);
    assert.match(js.stdout, /Паспорт копии совпал/); assert.match(js.stdout, /ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО/);
    const jsBad = spawnSync(process.execPath, [resolve(sh, 'restore-check.mjs'), resolve(s.T, 'local', local[0]), resolve(s.T, 'owner.key.нет')], { encoding: 'utf8' });
    assert.notEqual(jsBad.status, 0);
    // чужой ключ не открывает копию
    const other = resolve(s.T, 'other.key'); spawnSync('age-keygen', ['-o', other]);
    const bad = spawnSync('bash', [resolve(sh, 'restore-test.sh'), resolve(s.T, 'local', local[0]), other], { encoding: 'utf8', env: { ...process.env, TMPDIR: s.T } });
    assert.notEqual(bad.status, 0);
    const jsOther = spawnSync(process.execPath, [resolve(sh, 'restore-check.mjs'), resolve(s.T, 'local', local[0]), other], { encoding: 'utf8' });
    assert.notEqual(jsOther.status, 0); assert.match(jsOther.stderr, /не расшифровал/);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('копия во время записи в базу: целая и согласованная (WAL, штатный backup API)', { skip: !hasTools && 'нужны age и gzip' }, async () => {
  const s = sandbox();
  try {
    const writer = new DatabaseSync(s.dbPath, { timeout: 5000 }); writer.exec('PRAGMA journal_mode=WAL');
    const ins = writer.prepare('INSERT INTO quotes (created_at, customer, phone, project, note, items, total_kopecks) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let n = 0; const timer = setInterval(() => { for (let i = 0; i < 20; i++) ins.run(Date.now(), 'Параллельно', '+79001112233', '', '', '[]', ++n); }, 2);
    const r = await runBackup(s.env);
    clearInterval(timer);
    const total = writer.prepare('SELECT COUNT(*) AS c FROM quotes').get().c; writer.close();
    assert.equal(r.code, 0, r.err);
    const m = JSON.parse(readFileSync(resolve(s.T, 'local', readdirSync(resolve(s.T, 'local')).find(f => f.endsWith('.manifest.json')))));
    assert.equal(m.integrity, 'ok'); assert.ok(m.quotes.count >= 300 && m.quotes.count <= total, `${m.quotes.count} из ${total}`);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('сбои: нет ключа шифрования, недоступно хранилище, нет места — копия не считается успешной, администратор получает сообщение без персональных данных', { skip: !hasTools && 'нужны age и gzip' }, async () => {
  const s = sandbox();
  try {
    let r = await runBackup(s.env, { AGE_RECIPIENTS: resolve(s.T, 'etc/нет-такого.txt') });
    assert.notEqual(r.code, 0);
    writeFileSync(resolve(s.T, 'rclone-fail'), '');
    r = await runBackup(s.env);
    assert.notEqual(r.code, 0);
    assert.ok(!existsSync(resolve(s.T, 'state/last-success')), 'успех не отмечен');
    r = await runBackup(s.env, { MIN_FREE_MB: '99999999' });
    assert.notEqual(r.code, 0);
    const alerts = readFileSync(resolve(s.T, 'alerts.log'), 'utf8');
    assert.equal(alerts.split('\n').filter(Boolean).length, 3);
    assert.match(alerts, /НЕ выполнена/); assert.match(alerts, /проверка настроек/); assert.match(alerts, /выгрузка вне сервера/);
    assert.doesNotMatch(alerts, /\+7900|Тест/);
    assert.equal(quotesDigest(s.dbPath).length, 64);
    const withoutOffsite = await runBackup({ ...s.env, RCLONE_REMOTE: '' }, {});
    assert.notEqual(withoutOffsite.code, 0, 'без хранилища вне сервера копия считается неудачной');
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('проверка копии находит повреждения и «не-SQLite» файлы', () => {
  const s = sandbox();
  try {
    const bytes = readFileSync(s.dbPath);
    const good = spawnSync(process.execPath, [resolve(root, 'hosting/backup-verify.mjs'), s.dbPath], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).quotes.count, 300);
    writeFileSync(resolve(s.T, 'text.sqlite'), 'это не база данных'.repeat(1000));
    assert.notEqual(spawnSync(process.execPath, [resolve(root, 'hosting/backup-verify.mjs'), resolve(s.T, 'text.sqlite')]).status, 0);
    const broken = Buffer.from(bytes); for (let i = 8192; i < 8192 + 4096; i++) broken[i] = 0xff;
    writeFileSync(resolve(s.T, 'broken.sqlite'), broken);
    assert.notEqual(spawnSync(process.execPath, [resolve(root, 'hosting/backup-verify.mjs'), resolve(s.T, 'broken.sqlite')]).status, 0, 'повреждённая страница обнаружена');
    assert.notEqual(spawnSync(process.execPath, [resolve(root, 'hosting/backup-verify.mjs'), resolve(s.T, 'нет.sqlite')]).status, 0);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('ротация копий: свежие и «дедушка-отец-сын» остаются, старые уходят, самые новые не удаляются никогда', { skip: !hasTools && 'нужен python3' }, () => {
  const now = new Date('2026-10-22T00:20:00Z'); const names = [];
  for (let d = 0; d < 500; d++) { const t = new Date(now - d * 86400000); names.push(`cart-${t.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}.sqlite.gz.age`); }
  const run = (input, env = {}) => spawnSync('python3', [resolve(sh, 'prune.py')], { input: input.join('\n'), encoding: 'utf8', env: { ...process.env, NOW: '20261022T002000Z', ...env } }).stdout.split('\n').filter(Boolean);
  const del = new Set(run(names)); const keep = names.filter(n => !del.has(n));
  assert.ok(keep.length >= 14 + 8 && keep.length <= 14 + 8 + 12 + 2, `осталось ${keep.length}`);
  for (const n of names.slice(0, 14)) assert.ok(!del.has(n), 'последние 14 дней остаются: ' + n);
  assert.ok(del.has(names.at(-1)), 'самая старая удалена');
  assert.deepEqual(run(['cart-20200101T000000Z.sqlite.gz.age', 'cart-20200102T000000Z.sqlite.gz.age', 'cart-20200103T000000Z.sqlite.gz.age', 'cart-20200104T000000Z.sqlite.gz.age']).length, 1, 'при любых правилах остаются 3 новейшие');
  assert.deepEqual(run(['чужой-файл.txt', 'README']), [], 'непонятные файлы не трогаем');
});

test('страж: нет свежей копии → сообщение; свежая → тишина', () => {
  const s = sandbox();
  try {
    const env = { ...s.env, NOTIFY: resolve(s.T, 'bin/notify'), MAX_AGE_HOURS: '30' };
    let r = spawnSync('bash', [resolve(sh, 'watchdog.sh')], { env, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(readFileSync(resolve(s.T, 'alerts.log'), 'utf8'), /резервной копии заявок нет/);
    writeFileSync(resolve(s.T, 'state/last-success.epoch'), String(Math.floor(Date.now() / 1000) - 3600));
    r = spawnSync('bash', [resolve(sh, 'watchdog.sh')], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout);
    writeFileSync(resolve(s.T, 'state/last-success.epoch'), String(Math.floor(Date.now() / 1000) - 40 * 3600));
    r = spawnSync('bash', [resolve(sh, 'watchdog.sh')], { env, encoding: 'utf8' }); assert.equal(r.status, 1);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});
