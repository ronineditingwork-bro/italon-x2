// Новые служебные файлы не должны конфликтовать с действующим автообновлением (hosting/auto-update.sh + hosting/deploy-reg-ru.sh).
// Проверка по текстам скриптов: пути, которые пишет прежний механизм, и пути, которые ставит новый, не пересекаются, кроме явно разрешённых.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = f => readFileSync(resolve(root, f), 'utf8');
const legacy = read('hosting/deploy-reg-ru.sh') + '\n' + read('hosting/auto-update.sh');

// Пути, которые создаёт или перезаписывает прежний механизм
const LEGACY_WRITES = ['/usr/local/bin/italon-autoupdate', '/etc/italon-autoupdate.env', '/etc/systemd/system/italon-autoupdate.service', '/etc/systemd/system/italon-autoupdate.timer', '/var/log/italon-autoupdate.log', '/swapfile', '/opt/italon-x2', '/opt/italon-x2-src'];
// Что ставят/создают новые установщики
function newPaths() {
  const out = new Set();
  for (const f of ['hosting/release/install.sh', 'hosting/backup/install.sh']) {
    for (const m of read(f).matchAll(/(\/(?:usr\/local\/(?:lib|bin)|etc|var\/backups|var\/lib|var\/log)\/[\w./-]+)/g)) out.add(m[1].replace(/[.,]$/, ''));
  }
  for (const d of ['hosting/release/systemd', 'hosting/backup/systemd']) for (const n of readdirSync(resolve(root, d))) out.add('/etc/systemd/system/' + n);
  for (const m of read('hosting/release/systemd/italon-release-update.service').matchAll(/(\/var\/log\/[\w.-]+)/g)) out.add(m[1]);
  return [...out];
}

test('новые установщики не пишут туда же, куда прежний механизм (имена файлов, службы, журналы)', () => {
  const written = newPaths();
  assert.ok(written.length > 10, 'нашли пути нового механизма');
  for (const p of written) for (const l of LEGACY_WRITES) {
    if (l === '/opt/italon-x2') continue;                                      // каталог сайта: см. следующий тест
    assert.ok(p !== l && !p.startsWith(l + '/'), `${p} пересекается с ${l}`);
  }
  for (const l of LEGACY_WRITES) assert.ok(legacy.includes(l), `прежний механизм должен по-прежнему упоминать ${l} (список в тесте устарел?)`);
});

test('в каталоге сайта новый механизм создаёт только свои служебные файлы; прежний rsync --delete их удалит, но не трогает .env, базу и .deployed-commit', () => {
  assert.match(legacy, /rsync -a --delete --exclude='\.env' --exclude='\.deployed-commit' --exclude='\.attempted-commit'/);
  const mine = ['compose.release.yaml', '.deployed-tag', '.previous-tag', '.freeze', '.rejected-commit', 'releases.log'];
  const all = ['hosting/release/install.sh', 'hosting/release/deploy-release.sh', 'hosting/release/rollback.sh', 'hosting/release/auto-update.sh', 'hosting/release/lib.sh'].map(read).join('\n');
  for (const f of mine) assert.ok(all.includes(f), 'новый механизм использует ' + f);
  for (const f of ['.env', 'cart.sqlite']) assert.ok(!new RegExp(`(rm|>)\\s+"?\\$APP_DIR/${f.replace('.', '\\.')}`).test(all), 'новый механизм не удаляет/не перезаписывает ' + f);
});

test('общий замок: оба механизма берут /var/lock/italon-autoupdate.lock, значит одновременно выкладывать не могут', () => {
  assert.match(legacy, /LOCK="\$\{LOCK:-\/var\/lock\/italon-autoupdate\.lock\}"/);
  assert.match(read('hosting/release/lib.sh'), /LOCK="\$\{LOCK:-\/var\/lock\/italon-autoupdate\.lock\}"/);
  assert.match(read('hosting/release/deploy-release.sh'), /flock -n 8/); assert.match(read('hosting/release/rollback.sh'), /flock -w \d+ 8/);
});

test('новый автообновитель не читает и не меняет конфигурацию прежнего (/etc/italon-autoupdate.env) — возврат к прежнему механизму не требует правок', () => {
  for (const f of ['auto-update.sh', 'lib.sh', 'deploy-release.sh', 'rollback.sh', 'install.sh']) {
    const code = read('hosting/release/' + f).split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    assert.doesNotMatch(code, /italon-autoupdate\.env/, f);
    assert.doesNotMatch(code, /italon-autoupdate\.(timer|service)/, f + ': новый механизм не включает и не выключает прежний таймер сам');
    assert.doesNotMatch(code, /systemctl\s+(enable|disable|start|stop|restart)/, f + ': установка ничего не включает');
  }
});

test('общий каталог исходников /opt/italon-x2-src совместим: оба используют shallow fetch и checkout -f; образы нового механизма не затираются прежним (тег latest ≠ sha12)', () => {
  const lib = read('hosting/release/lib.sh');
  assert.match(lib, /SRC="\$\{SRC:-\/opt\/italon-x2-src\}"/);
  assert.match(read('hosting/release/deploy-release.sh'), /fetch -q --depth 1 origin/); assert.match(read('hosting/release/deploy-release.sh'), /checkout -q -f/);
  assert.match(legacy, /fetch -q --depth 1 origin "\$BRANCH"/);
  assert.match(lib, /tag_of\(\) \{ echo "\$\{1:0:12\}"; \}/);            // теги новых образов — 12 символов sha; прежняя сборка использует тег latest
  assert.match(read('hosting/release/deploy-release.sh'), /grep -E '\^\[0-9a-f\]\{12\}\$'/, 'очистка образов трогает только sha12-теги');
});

test('прежний установщик при повторном запуске включит свой таймер заново — об этом есть предупреждение в документации', () => {
  assert.match(legacy, /systemctl enable --now italon-autoupdate\.timer/);
  assert.match(read('ops/release.md'), /deploy-reg-ru\.sh[^\n]*(заново|снова|воскрес)/);
});
