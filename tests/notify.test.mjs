// Уведомления администратору (backup/notify.sh): ключ ретранслятора передаётся заголовком, без ключа заголовка нет, текст уходит как есть.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const notify = resolve(import.meta.dirname, '../hosting/backup/notify.sh');
function run(envFile) {
  const T = mkdtempSync(resolve(tmpdir(), 'italon-notify-'));
  mkdirSync(resolve(T, 'bin')); mkdirSync(resolve(T, 'app'));
  writeFileSync(resolve(T, 'app/.env'), envFile);
  writeFileSync(resolve(T, 'bin/curl'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${T}/curl-args"\n`); chmodSync(resolve(T, 'bin/curl'), 0o755);
  const r = spawnSync('bash', [notify, '✅ проверка'], { env: { ...process.env, PATH: `${T}/bin:${process.env.PATH}`, APP_DIR: resolve(T, 'app'), ITALON_BACKUP_CONF: '/nonexistent' }, encoding: 'utf8' });
  const args = existsSync(resolve(T, 'curl-args')) ? readFileSync(resolve(T, 'curl-args'), 'utf8') : '';
  rmSync(T, { recursive: true, force: true });
  return { r, args };
}

test('с TELEGRAM_RELAY_KEY уведомление уходит с заголовком X-Relay-Key через TELEGRAM_API_BASE', () => {
  const { r, args } = run('TELEGRAM_BOT_TOKEN=123:abc\nTELEGRAM_CHAT_ID=-100,-200\nTELEGRAM_API_BASE=https://relay.example/\nTELEGRAM_RELAY_KEY=k3y\n');
  assert.equal(r.status, 0);
  assert.match(args, /X-Relay-Key: k3y/); assert.match(args, /https:\/\/relay\.example\/bot123:abc\/sendMessage/); assert.match(args, /"chat_id": "-100"/);
});

test('без ключа ретранслятора заголовка нет; без токена ничего не отправляется и ошибки нет', () => {
  const a = run('TELEGRAM_BOT_TOKEN=123:abc\nTELEGRAM_CHAT_ID=-100\n');
  assert.doesNotMatch(a.args, /X-Relay-Key/); assert.match(a.args, /api\.telegram\.org/);
  const b = run('TELEGRAM_CHAT_ID=-100\n');
  assert.equal(b.r.status, 0); assert.equal(b.args, '');
});
