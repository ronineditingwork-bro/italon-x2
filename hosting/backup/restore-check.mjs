// Проверка восстановления из зашифрованной копии НА ВАШЕМ КОМПЬЮТЕРЕ (Windows/macOS/Linux, нужны Node.js 22+ и age в PATH).
// Рабочую базу и сервер не трогает: всё происходит во временной папке, которая удаляется в конце.
//   node restore-check.mjs <cart-….sqlite.gz.age> <файл-закрытого-ключа.txt>
// Делает то же, что restore-test.sh: расшифровка → распаковка → целостность → открытие приложением (миграции на копии) → сверка с паспортом (*.manifest.json рядом).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [file, key] = process.argv.slice(2);
if (!file || !key) { console.error('Использование: node restore-check.mjs <файл.sqlite.gz.age> <закрытый-ключ.txt>'); process.exit(2); }
const here = import.meta.dirname || dirname(new URL(import.meta.url).pathname);
const fail = msg => { console.error('ПРОВАЛ: ' + msg); process.exitCode = 1; };
const work = mkdtempSync(resolve(tmpdir(), 'italon-restore-'));
try {
  const dec = spawnSync(process.env.AGE || 'age', ['-d', '-i', key, file], { maxBuffer: 2 ** 31 - 1 });
  if (dec.error) throw new Error('не удалось запустить age (установите: winget install FiloSottile.age, затем откройте новое окно PowerShell): ' + dec.error.message);
  if (dec.status !== 0) throw new Error('age не расшифровал файл (не тот ключ или файл повреждён): ' + String(dec.stderr).trim());
  const db = resolve(work, 'restored.sqlite');
  writeFileSync(db, gunzipSync(dec.stdout));
  console.log(`Расшифровано и распаковано: ${readFileSync(db).length} байт`);
  const verify = [resolve(here, '../backup-verify.mjs'), resolve(here, 'backup-verify.mjs')].find(existsSync);
  if (!verify) throw new Error('не найден backup-verify.mjs рядом со скриптом');
  const rep = spawnSync(process.execPath, [verify, db, '--migrate-check'], { encoding: 'utf8', env: { ...process.env, DATABASE_MODULE: resolve(here, '../database.mjs') } });
  if (rep.status !== 0) throw new Error('проверка базы не прошла: ' + (rep.stderr || rep.stdout));
  const got = JSON.parse(rep.stdout);
  console.log(rep.stdout.trim());
  const manifestPath = file.replace(/\.age$/, '.manifest.json');
  if (existsSync(manifestPath)) {
    const want = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const bad = ['sha256', 'tables', 'quotes'].filter(k => JSON.stringify(got[k]) !== JSON.stringify(want[k]));
    if (bad.length) throw new Error('не совпало с паспортом копии: ' + bad.join(', '));
    console.log('Паспорт копии совпал: контрольная сумма, таблицы, число заявок');
  } else console.log(`Внимание: паспорта ${manifestPath} нет — сверка с исходным состоянием пропущена`);
  if (got.integrity !== 'ok' || got.migrateCheck !== 'ok') throw new Error('база не прошла проверку целостности/миграций');
  console.log('ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО: копия расшифровывается, цела и открывается приложением.');
} catch (e) { fail(e.message); } finally { rmSync(work, { recursive: true, force: true }); }
