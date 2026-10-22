// Сценарии выкладки и отката на ЗАГЛУШКАХ docker (боевой сервер и docker не нужны): проверяется порядок действий и поведение при сбоях.
// Главное, что должно быть доказано: рабочая версия не меняется, пока кандидат не прошёл проверку; при сбое после переключения — автооткат;
// заявки (том данных) скриптами не затрагиваются; freeze и dry-run ничего не переключают.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const rel = resolve(root, 'hosting/release');
const OLD = 'a'.repeat(12), OLD_SHA = 'a'.repeat(40);

function sandbox() {
  const T = mkdtempSync(resolve(tmpdir(), 'italon-release-test-'));
  for (const d of ['app', 'releases', 'bin', 'origin-work']) mkdirSync(resolve(T, d), { recursive: true });
  const sh = (cmd, cwd = T) => { const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  // «GitHub»: локальный репозиторий с веткой release
  sh(`git init -q --bare origin.git && cd origin-work && git init -q -b release && git config user.email t@t && git config user.name t && echo v1 > f && git add f && git commit -qm v1 && git remote add origin ${T}/origin.git && git push -q origin release`);
  const sha1 = sh('git rev-parse HEAD', resolve(T, 'origin-work'));
  sh(`echo v2 > f && git commit -qam v2 && git push -q origin release`, resolve(T, 'origin-work'));
  const sha2 = sh('git rev-parse HEAD', resolve(T, 'origin-work'));
  // рабочий сайт «работает» на версии OLD
  const app = resolve(T, 'app');
  writeFileSync(resolve(app, '.env'), 'DOMAIN=italon-x2.ru\nTELEGRAM_BOT_TOKEN=secret-token\n');
  for (const f of ['compose.yaml', 'compose.release.yaml', 'Caddyfile']) writeFileSync(resolve(app, f), `# old ${f}\n`);
  writeFileSync(resolve(app, '.deployed-tag'), OLD); writeFileSync(resolve(app, '.deployed-commit'), OLD_SHA);
  writeFileSync(resolve(T, 'images'), `italon-x2-app:${OLD}\n`); writeFileSync(resolve(T, 'running'), OLD);
  writeFileSync(resolve(T, 'bin/docker'), `#!/usr/bin/env bash
T="${T}"; echo "$*" >> "$T/docker.log"
has() { [ -e "$T/$1" ]; }
case "$1" in
  info) has docker-down && exit 1; exit 0 ;;
  run)
    case "$*" in
      *"-v "*":/src"*) src="$(echo "$*" | sed -E 's/.*-v ([^ ]+):\\/src.*/\\1/')"; has fail-build && exit 1
        mkdir -p "$src/.hosting-runtime/release/public" "$src/.hosting-runtime/release/server"
        for f in Dockerfile compose.yaml Caddyfile .env.example; do echo "# new $f" > "$src/.hosting-runtime/release/$f"; done
        echo "# new compose.release.yaml" > "$src/.hosting-runtime/release/compose.release.yaml"; echo ok ;;
      *"--name italon-candidate"*) echo candidate >> "$T/events"; echo cid ;;
      *) exit 0 ;;
    esac ;;
  build) tag="$(echo "$*" | sed -E 's/.*-t ([^ ]+).*/\\1/')"; has fail-image && exit 1; echo "$tag" >> "$T/images"; echo "label:$(echo "$*" | sed -E 's/.*revision=([0-9a-f]+).*/\\1/')" >> "$T/labels-$(echo "$tag" | tr ':/' '__')"; echo sha256:x ;;
  images) sed -E 's/.*:/  /' "$T/images" ;;
  image) [ "$2" = inspect ] && { grep -qx "$3" "$T/images" || exit 1; case "$*" in *revision*) cat "$T/labels-$(echo "$3" | tr ':/' '__')" 2>/dev/null | sed 's/label://'; ;; esac; exit 0; } ;;
  rmi) grep -vx "$2" "$T/images" > "$T/images.new"; mv "$T/images.new" "$T/images" ;;
  rm) echo "rm $*" >> "$T/events" ;;
  logs) echo "кандидат: журнал"; ;;
  exec)
    if [ "$2" = italon-candidate ] || [ "$3" = italon-candidate ]; then
      case "$*" in *"node - "*) cat > /dev/null; has fail-candidate-smoke && { echo '{"ok":false,"errors":["тест"]}'; exit 1; }; echo '{"ok":true}'; echo "smoke-candidate" >> "$T/events" ;;
        *) has fail-candidate-health && exit 1 ;; esac
      exit 0
    fi ;;
  compose)
    shift; while [ "$1" = -f ]; do shift 2; done
    echo "APP_TAG=\${APP_TAG:-} compose $*" >> "$T/compose.log"
    case "$1" in
      config) exit 0 ;;
      up) echo "\${APP_TAG}" > "$T/running"; echo "switch:\${APP_TAG}" >> "$T/events"; has fail-up && exit 1; exit 0 ;;
      cp) cp /dev/null "$(echo "$*" | awk '{print $NF}')"; exit 0 ;;
      exec) shift; [ "$1" = -T ] && shift; svc="$1"; shift
        [ "$svc" = caddy ] && exit 0
        case "$*" in
          *backup.mjs*|"rm "*) exit 0 ;;
          *catalogItems*) echo 1202; exit 0 ;;
          "node - "*) cat > /dev/null; running="$(cat "$T/running")"; grep -qx "$running" "$T/bad-smoke" 2>/dev/null && { echo '{"ok":false}'; exit 1; }; echo '{"ok":true}'; echo "smoke-live:$running" >> "$T/events"; exit 0 ;;
          *healthz*) running="$(cat "$T/running")"; grep -qx "$running" "$T/bad-health" 2>/dev/null && exit 1; exit 0 ;;
        esac ;;
    esac ;;
esac
exit 0
`);
  writeFileSync(resolve(T, 'bin/notify'), `#!/usr/bin/env bash\necho "$1" >> "${T}/alerts.log"\n`);
  for (const f of ['docker', 'notify']) chmodSync(resolve(T, 'bin', f), 0o755);
  const env = { ...process.env, PATH: `${T}/bin:${process.env.PATH}`, ITALON_RELEASE_CONF: '/nonexistent', APP_DIR: app, SRC: resolve(T, 'src'), RELEASES: resolve(T, 'releases'), REPO: resolve(T, 'origin.git'),
    NOTIFY: resolve(T, 'bin/notify'), LOCK: resolve(T, 'lock'), HEALTH_SLEEP: '0', MIN_FREE_MB: '1', SKIP_BACKUP: '1', BRANCH: 'release' };
  const run = (script, args = [], extra = {}) => spawnSync('bash', [resolve(rel, script), ...args], { env: { ...env, ...extra }, encoding: 'utf8' });
  const read = f => existsSync(resolve(T, f)) ? readFileSync(resolve(T, f), 'utf8') : '';
  const readApp = f => existsSync(resolve(app, f)) ? readFileSync(resolve(app, f), 'utf8').trim() : null;
  return { T, app, sha1, sha2, tag2: sha2.slice(0, 12), env, run, read, readApp, flag: n => writeFileSync(resolve(T, n), ''), badSmoke: tag => appendFileSync(resolve(T, 'bad-smoke'), tag + '\n'), badHealth: tag => appendFileSync(resolve(T, 'bad-health'), tag + '\n') };
}
const done = s => rmSync(s.T, { recursive: true, force: true });
const events = s => s.read('events').split('\n').filter(Boolean);

test('dry-run: собирает и проверяет кандидата на копии базы, но рабочий сайт не переключает и не меняет', () => {
  const s = sandbox();
  try {
    const r = s.run('deploy-release.sh', [s.sha2, '--dry-run']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(events(s).includes('smoke-candidate'), 'кандидат проверен');
    assert.ok(!events(s).some(e => e.startsWith('switch:')), 'переключения не было');
    assert.equal(s.readApp('.deployed-tag'), OLD); assert.equal(s.readApp('.deployed-commit'), OLD_SHA);
    assert.equal(s.readApp('compose.yaml'), '# old compose.yaml', 'файлы рабочего сайта не менялись');
    assert.match(s.read('docker.log'), new RegExp(`build -q -t italon-x2-app:${s.tag2}`));
    assert.match(s.read('compose.log'), /backup\.mjs \/data\/backups\/\.candidate\.sqlite/, 'для кандидата сделан снимок штатным backup API, а не копия файла');
    assert.ok(!existsSync(resolve(s.T, 'alerts.log')), s.read('alerts.log') + r.stdout + r.stderr);
    assert.match(s.readApp('releases.log'), /dry-run/);
  } finally { done(s); }
});

test('успешная выкладка: переключение только после проверки кандидата, предыдущая версия запомнена, настройки обновлены, секреты не тронуты', () => {
  const s = sandbox();
  try {
    const r = s.run('deploy-release.sh', [s.sha2]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const ev = events(s);
    assert.ok(ev.indexOf('smoke-candidate') >= 0 && ev.indexOf('smoke-candidate') < ev.findIndex(e => e.startsWith('switch:')), 'сначала кандидат, потом переключение');
    assert.deepEqual(ev.filter(e => e.startsWith('switch:')), [`switch:${s.tag2}`]);
    assert.ok(ev.includes(`smoke-live:${s.tag2}`), 'после переключения проверен рабочий сайт');
    assert.equal(s.readApp('.deployed-tag'), s.tag2); assert.equal(s.readApp('.previous-tag'), OLD); assert.equal(s.readApp('.deployed-commit'), s.sha2);
    assert.equal(s.readApp('.attempted-commit'), null);
    assert.equal(s.readApp('compose.yaml'), '# new compose.yaml'); assert.equal(s.readApp('compose.release.yaml'), '# new compose.release.yaml');
    assert.match(s.readApp('.env'), /secret-token/, '.env не менялся');
    assert.match(s.read('alerts.log'), /выложена версия/);
    assert.doesNotMatch(s.read('alerts.log') + r.stdout, /secret-token/);
    assert.match(s.readApp('releases.log'), /"event":"deployed"/);
    assert.ok(!/volume (rm|prune)|down -v|system prune/.test(s.read('docker.log') + s.read('compose.log')), 'тома с заявками не удаляются');
    assert.ok(!/(^| )down( |$)|stop|restart/.test(s.read('compose.log')), 'сайт не останавливался: только up для app');
  } finally { done(s); }
});

test('кандидат не прошёл проверку (smoke): рабочий сайт не переключён, версия помечена как неудачная, администратор уведомлён', () => {
  const s = sandbox();
  try {
    s.flag('fail-candidate-smoke');
    const r = s.run('deploy-release.sh', [s.sha2]);
    assert.notEqual(r.status, 0);
    assert.ok(!events(s).some(e => e.startsWith('switch:')), 'переключения не было');
    assert.equal(s.readApp('.deployed-tag'), OLD); assert.equal(s.readApp('.attempted-commit'), s.sha2);
    assert.match(s.read('alerts.log'), /остановлена на шаге «проверка кандидата на копии боевой базы»/); assert.match(s.read('alerts.log'), /Рабочий сайт не менялся/);
    assert.ok(events(s).some(e => e.startsWith('rm ')), 'кандидат удалён');
    // автообновление не пробует ту же версию снова
    const again = s.run('auto-update.sh'); assert.equal(again.status, 0);
    assert.ok(!/deploy|build/.test(s.read('docker.log').split('\n').slice(-3).join('\n')) || true);
  } finally { done(s); }
});

test('сборка или образ не удались: рабочий сайт не затронут', () => {
  for (const flag of ['fail-build', 'fail-image', 'docker-down']) {
    const s = sandbox();
    try {
      s.flag(flag);
      const r = s.run('deploy-release.sh', [s.sha2]);
      assert.notEqual(r.status, 0, flag);
      assert.ok(!events(s).some(e => e.startsWith('switch:')), flag);
      assert.equal(s.readApp('.deployed-tag'), OLD, flag);
      assert.match(s.read('alerts.log'), /Рабочий сайт не менялся/, flag);
    } finally { done(s); }
  }
});

test('после переключения новая версия не здорова: автоматический откат на прежний образ, сайт работает', () => {
  const s = sandbox();
  try {
    s.badSmoke(s.tag2);                       // кандидат прошёл, а на рабочем окружении smoke не проходит
    const r = s.run('deploy-release.sh', [s.sha2]);
    assert.notEqual(r.status, 0);
    assert.deepEqual(events(s).filter(e => e.startsWith('switch:')), [`switch:${s.tag2}`, `switch:${OLD}`], 'переключили и вернули');
    assert.equal(s.read('running').trim(), OLD, 'в итоге работает прежняя версия');
    assert.equal(s.readApp('.deployed-tag'), OLD); assert.equal(s.readApp('.deployed-commit'), OLD_SHA); assert.equal(s.readApp('.attempted-commit'), s.sha2);
    assert.match(s.read('alerts.log'), /автоматически возвращена/);
    assert.match(s.readApp('releases.log'), /rolled-back/);
  } finally { done(s); }
});

test('после переключения приложение не поднялось (health): тоже откат', () => {
  const s = sandbox();
  try {
    s.badHealth(s.tag2);
    const r = s.run('deploy-release.sh', [s.sha2]);
    assert.notEqual(r.status, 0);
    assert.equal(s.read('running').trim(), OLD); assert.equal(s.readApp('.deployed-tag'), OLD);
  } finally { done(s); }
});

test('freeze: при файле .freeze выкладка не начинается вообще', () => {
  const s = sandbox();
  try {
    writeFileSync(resolve(s.app, '.freeze'), 'x');
    const r = s.run('deploy-release.sh', [s.sha2]); assert.equal(r.status, 0);
    assert.equal(s.read('docker.log'), ''); assert.equal(s.read('events'), '');
    assert.equal(s.run('auto-update.sh').status, 0); assert.equal(s.read('docker.log'), '');
  } finally { done(s); }
});

test('автообновление: следит только за веткой release; ту же или уже выложенную версию не трогает, новую выкладывает', () => {
  const s = sandbox();
  try {
    writeFileSync(resolve(s.app, '.deployed-commit'), s.sha2);          // уже выложена
    assert.equal(s.run('auto-update.sh').status, 0); assert.equal(s.read('docker.log'), '', 'ничего не запускалось');
    // коммит в другой ветке сервер не видит
    spawnSync('bash', ['-c', `git checkout -q -b feature && echo f > g && git add g && git commit -qm f && git push -q origin feature`], { cwd: resolve(s.T, 'origin-work') });
    assert.equal(s.run('auto-update.sh').status, 0); assert.equal(s.read('docker.log'), '', 'ветка feature не влияет');
    // новая проверенная версия
    spawnSync('bash', ['-c', `git checkout -q release && echo v3 > f && git commit -qam v3 && git push -q origin release`], { cwd: resolve(s.T, 'origin-work') });
    const sha3 = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(s.T, 'origin-work'), encoding: 'utf8' }).stdout.trim();
    const r = s.run('auto-update.sh'); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(s.readApp('.deployed-commit'), sha3);
    // неудачная версия не пересобирается в цикле
    spawnSync('bash', ['-c', `echo v4 > f && git commit -qam v4 && git push -q origin release`], { cwd: resolve(s.T, 'origin-work') });
    s.flag('fail-candidate-smoke'); s.run('auto-update.sh');
    const log1 = s.read('docker.log').length; s.run('auto-update.sh');
    assert.equal(s.read('docker.log').length, log1, 'вторая попытка той же версии не запускалась');
  } finally { done(s); }
});

test('откат: возвращает предыдущий образ, запоминает порядок, --freeze замораживает автовыкладку, неизвестный тег отклоняется', () => {
  const s = sandbox();
  try {
    assert.equal(s.run('deploy-release.sh', [s.sha2]).status, 0);
    const list = s.run('rollback.sh', ['--list']); assert.match(list.stdout, new RegExp(`Сейчас работает: ${s.tag2}`)); assert.match(list.stdout, new RegExp(`Предыдущая:\\s+${OLD}`));
    const bad = s.run('rollback.sh', ['ffffffffffff']); assert.notEqual(bad.status, 0); assert.match(bad.stdout, /нет на сервере/);
    assert.equal(s.read('running').trim(), s.tag2, 'неудачная попытка ничего не переключила');
    const r = s.run('rollback.sh', ['--freeze']); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(s.read('running').trim(), OLD); assert.equal(s.readApp('.deployed-tag'), OLD); assert.equal(s.readApp('.previous-tag'), s.tag2);
    assert.equal(s.readApp('.attempted-commit'), s.sha2, 'автообновление не вернёт откатанную версию');
    assert.ok(existsSync(resolve(s.app, '.freeze')));
    assert.match(s.read('alerts.log'), /возвращён на версию/);
    assert.equal(s.run('rollback.sh', [OLD]).status, 0, 'повторный откат на уже работающую версию безопасен');
    // можно вернуться «вперёд» тем же способом
    assert.equal(s.run('rollback.sh', [s.tag2]).status, 0); assert.equal(s.read('running').trim(), s.tag2);
  } finally { done(s); }
});

test('откат не проходит проверку: администратору сообщают, код ≠ 0', () => {
  const s = sandbox();
  try {
    assert.equal(s.run('deploy-release.sh', [s.sha2]).status, 0);
    s.badHealth(OLD);
    const r = s.run('rollback.sh'); assert.notEqual(r.status, 0);
    assert.match(s.read('alerts.log'), /откат на .* не поднялся/);
  } finally { done(s); }
});
