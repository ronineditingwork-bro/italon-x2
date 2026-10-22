// Сценарий проверки VPS (ops/vps/preflight.sh) должен быть строго «только чтение». Проверяем двумя способами:
// 1) запускаем с заглушками docker/systemctl/curl/git/..., которые записывают КАЖДЫЙ вызов, и сверяем вызовы с белым списком чтения;
// 2) проверяем, что скрипт не меняет дерево файлов песочницы и не содержит команд изменения.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'ops/vps/preflight.sh');

function tree(dir) { const out = []; for (const n of readdirSync(dir).sort()) { const p = join(dir, n); const st = statSync(p); out.push(n + ':' + st.size + ':' + st.mtimeMs + (st.isDirectory() ? '[' + tree(p) + ']' : createHash('md5').update(readFileSync(p)).digest('hex'))); } return out.join('|'); }

function sandbox() {
  const T = mkdtempSync(resolve(tmpdir(), 'italon-preflight-'));
  const app = resolve(T, 'app'), bin = resolve(T, 'bin'), data = resolve(T, 'vol');
  for (const d of [app, bin, data]) mkdirSync(d, { recursive: true });
  writeFileSync(resolve(app, '.env'), 'DOMAIN=italon-x2.ru\nTELEGRAM_BOT_TOKEN=123456:SECRET-TOKEN-VALUE\nTELEGRAM_CHAT_ID=-100\nTELEGRAM_API_BASE=https://relay.example.workers.dev/path\nTELEGRAM_RELAY_KEY=\n');
  writeFileSync(resolve(app, 'compose.yaml'), 'services: {}\n');
  writeFileSync(resolve(app, '.deployed-commit'), 'a'.repeat(40) + '\n');
  writeFileSync(resolve(data, 'cart.sqlite'), 'x'.repeat(4096));
  const log = resolve(T, 'calls.log');
  const stub = (name, body) => { writeFileSync(resolve(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${log}"\n${body}\n`); chmodSync(resolve(bin, name), 0o755); };
  stub('docker', `case "$1" in
  --version) echo "Docker version 27.0.0";; info) echo /var/lib/docker;; ps|images|system) ;;
  compose) case "$2" in version) echo "Docker Compose v2";; ps) if [ "$3" = -q ]; then echo cid-$4; else :; fi;; exec) cat >/dev/null; echo '{"quotes":3}';; *) exit 77;; esac;;
  inspect) case "$*" in *Mounts*) echo "${data}";; *) echo "running health=healthy перезапусков=0 запущен=x";; esac;;
  *) exit 77;; esac`);
  stub('systemctl', `case "$1" in list-timers) echo "NEXT  italon-autoupdate.timer";; is-active) [ "$2" = italon-autoupdate.timer ] && echo active || echo inactive;; is-enabled) echo enabled;; *) exit 77;; esac`);
  stub('curl', `case "$*" in *rate_limit*) echo '{"resources":{"core":{"remaining":59,"limit":60}}}';; *auth.docker.io*) echo '{"token":"t"}';; *) :;; esac`);
  stub('git', `[ "$1" = ls-remote ] && echo "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb	refs/heads/main" || exit 77`);
  stub('openssl', 'exit 1'); stub('timedatectl', 'echo "System clock synchronized: yes"'); stub('dmesg', 'exit 0'); stub('getent', 'echo "140.82.121.4 github.com"'); stub('swapon', 'echo "/swapfile file 2G 0B -2"');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, APP_DIR: app };
  return { T, app, data, log, env, run: args => spawnSync('bash', [script, ...args], { env, encoding: 'utf8' }), calls: () => readFileSync(log, 'utf8').trim().split('\n') };
}

const READ_ONLY = {
  docker: /^docker (--version|info|ps|images|system df|inspect |compose (version|ps)|compose exec -T app node -e )/,
  systemctl: /^systemctl (list-timers|is-active|is-enabled) /,
  git: /^git ls-remote /,
  curl: /^curl -sS(I)? -m \d+ (?!.*(-X|-d |--data|-T |--upload|-o [^/]|--output))/,
};

test('preflight: только чтение — все вызовы внешних команд из белого списка, файлы не меняются, секреты не печатаются', () => {
  const s = sandbox();
  try {
    const before = tree(s.T.replace(/$/, '')).replace(/calls\.log:[^|]*\|?/, '');
    const r = s.run(['--db']);
    assert.equal(r.status, 0, r.stderr);
    for (const line of s.calls()) {
      const cmd = line.split(' ')[0];
      if (!READ_ONLY[cmd]) continue;
      assert.match(line, READ_ONLY[cmd], 'недопустимый вызов: ' + line);
    }
    assert.ok(s.calls().some(l => l.startsWith('docker compose exec')), 'с --db чтение базы выполняется');
    assert.match(readFileSync(s.log, 'utf8'), /docker compose exec[^]*readOnly:true/, 'база открывается только на чтение');
    const after = tree(s.T).replace(/calls\.log:[^|]*\|?/, '');
    assert.equal(after, before, 'файлы песочницы не изменились');
    assert.doesNotMatch(r.stdout + r.stderr, /SECRET-TOKEN-VALUE/, 'токен бота не печатается');
    assert.match(r.stdout, /TELEGRAM_BOT_TOKEN: задана/); assert.match(r.stdout, /TELEGRAM_RELAY_KEY: ПУСТА/);
    assert.match(r.stdout, /https:\/\/relay\.example\.workers\.dev/); assert.doesNotMatch(r.stdout, /relay\.example\.workers\.dev\/path/, 'путь ретранслятора (может содержать секрет) не печатается');
    assert.match(r.stdout, /прежнее автообновление работает/); assert.match(r.stdout, /Итог/);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('preflight: без --db базу не открывает; --no-net не ходит в сеть; неизвестный параметр отклоняется', () => {
  const s = sandbox();
  try {
    assert.equal(s.run(['--no-net']).status, 0);
    const calls = s.calls();
    assert.ok(!calls.some(l => l.startsWith('docker compose exec')), 'без --db чтение базы не выполнялось');
    assert.ok(!calls.some(l => l.startsWith('git ')) && !calls.some(l => /https:\/\/(github|api\.github|registry|auth|api\.telegram|storage)/.test(l)), 'сеть не проверялась');
    assert.equal(s.run(['--oops']).status, 2);
  } finally { rmSync(s.T, { recursive: true, force: true }); }
});

test('preflight: в тексте скрипта нет команд изменения', () => {
  const code = readFileSync(script, 'utf8').split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(code, /\b(rm|mv|cp|chmod|chown|tee|truncate|dd|mkdir|touch|apt-get|apt|systemctl\s+(start|stop|restart|enable|disable|reload|daemon-reload|mask|kill)|docker\s+(run|rm|rmi|build|pull|push|stop|start|restart|kill|tag|prune|network|volume\s+rm)|compose\s+(up|down|restart|stop|start|build|pull|run|rm)|git\s+(clone|fetch|pull|checkout|reset|push|commit)|sed\s+-i|swapoff|swapon\s+\/)\b/, 'команда изменения в preflight.sh');
  assert.doesNotMatch(code, />>|>\s*\/(?!dev\/null)|>\s*\$|>\s*"/, 'запись в файл');
});
