// Защитные проверки самой выкладки: CI ничего не публикует, прежний механизм автообновления не изменён, миграции только добавляют.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const workflows = readdirSync(resolve(root, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)).map(f => [f, read('.github/workflows/' + f)]);
const LIVE_BRANCH = 'ccr-943f3ebb-rcco8n';

test('workflow-файлы не имеют доступа к серверу и секретам и не публикуют ничего наружу', () => {
  assert.ok(workflows.length >= 2);
  for (const [name, text] of workflows) {
    const code = text.replace(/^\s*#.*$/gm, '');
    assert.doesNotMatch(code, /secrets\.(?!GITHUB_TOKEN)/, `${name}: чужие секреты`);
    assert.doesNotMatch(code, /\b(ssh|scp|rsync|sshpass|appleboy|ssh-agent|docker push|docker login|gh release|gh-pages|wrangler|flyctl)\b/i, `${name}: команды выкладки`);
    assert.doesNotMatch(code, /pull_request_target/, `${name}: pull_request_target небезопасен`);
    assert.doesNotMatch(code, /italon-x2\.ru\/(?!\S*healthz)[^\s"']*\bcurl\b|curl[^\n]*5\.63\.152\.213/, `${name}: обращение к боевому серверу`);
    assert.ok(!code.includes(LIVE_BRANCH), `${name}: не должен упоминать боевую ветку ${LIVE_BRANCH}`);
  }
});

test('CI только читает код (contents: read), запускается на любые ветки и PR', () => {
  const ci = workflows.find(([n]) => n === 'ci.yml')[1];
  assert.match(ci, /permissions:\s*\n\s*contents: read/); assert.doesNotMatch(ci, /contents: write|id-token|packages: write/);
  assert.match(ci, /on:\s*\n\s*push:\s*\n\s*pull_request:/);
  for (const need of ['npm run check', 'npm run test:hosting', 'verify-catalog.mjs', 'docker build', 'tests/site-smoke.cjs', 'tests/backup.test.mjs', 'tests/release-scripts.test.mjs']) assert.ok(ci.includes(need), 'в CI нет шага: ' + need);
});

test('promote-release выключен без переменной RELEASE_PROMOTION, срабатывает только после успешного CI на main и пишет только в ветку release', () => {
  const p = workflows.find(([n]) => n === 'promote-release.yml')[1];
  assert.match(p, /workflow_run:[\s\S]*branches: \[main\]/);
  assert.match(p, /vars\.RELEASE_PROMOTION == 'true'/); assert.match(p, /conclusion == 'success'/);
  assert.doesNotMatch(p.replace(/^\s*#.*$/gm, ''), /\bon:\s*\n\s*(push|pull_request|schedule|workflow_dispatch)/);
  const pushes = [...p.matchAll(/git push[^\n]*/g)].map(m => m[0]);
  assert.ok(pushes.length >= 1);
  for (const line of pushes) assert.match(line, /refs\/heads\/release|--tags/, line);
  assert.doesNotMatch(p, /--force|-f\b|\+HEAD/, 'без принудительной записи');
});

test('новый автообновитель следит только за веткой release, прежний механизм не изменён (отпечатки файлов)', () => {
  const u = read('hosting/release/auto-update.sh'), lib = read('hosting/release/lib.sh');
  assert.match(lib, /BRANCH="\$\{BRANCH:-release\}"/); assert.ok(!u.includes(LIVE_BRANCH) && !lib.includes(LIVE_BRANCH));
  const pins = Object.fromEntries(read('ops/legacy-deploy.sha256').trim().split('\n').map(l => { const [h, f] = l.split(/\s+/); return [f, h]; }));
  assert.deepEqual(Object.keys(pins).sort(), ['hosting/auto-update.sh', 'hosting/deploy-reg-ru.sh']);
  for (const [f, h] of Object.entries(pins)) assert.equal(createHash('sha256').update(readFileSync(resolve(root, f))).digest('hex'), h,
    `${f} изменён: он работает на боевом сервере через прежнее автообновление. Если изменение намеренное, обновите ops/legacy-deploy.sha256 и опишите это в ops/release.md`);
});

test('миграции базы только добавляют (иначе откат на прежний образ небезопасен)', () => {
  const files = readdirSync(resolve(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.length >= 3);
  for (const f of files.filter(f => f >= '0002')) {
    const sql = read('drizzle/' + f).replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /\b(DROP|RENAME|TRUNCATE)\b|DELETE\s+FROM|\bUPDATE\s/i, `${f}: разрушающая операция`);
    for (const m of sql.matchAll(/ALTER TABLE[^;]*ADD[^;]*/gi)) if (/NOT NULL/i.test(m[0])) assert.match(m[0], /DEFAULT/i, `${f}: NOT NULL без DEFAULT`);
  }
});

test('резервные копии: расписание, ключ и хранилище не зашиты в код, персональные данные не попадают в уведомления', () => {
  const run = read('hosting/backup/backup-run.sh');
  assert.match(run, /node server\/backup\.mjs/, 'снимок делается штатным backup API');
  assert.doesNotMatch(run, /\bcp\b[^\n]*cart\.sqlite|\bsqlite3\b/, 'работающий файл не копируется напрямую');
  assert.match(run, /AGE" -R "\$AGE_RECIPIENTS"/); assert.doesNotMatch(run, /AGE_SECRET_KEY|identity|-i "/, 'закрытого ключа на сервере нет');
  assert.doesNotMatch(read('hosting/backup/notify.sh'), /phone|customer|quotes/i);
});
