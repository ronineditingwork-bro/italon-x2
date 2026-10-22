// Проверка verify-ci.py на локальной заглушке GitHub API: сервер выкладывает коммит, только если проверки GitHub Actions успешны на ЭТОМ коммите
// и он входит в историю main. Настоящий GitHub не нужен.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SHA = 'a'.repeat(40);
const CHECKS = ['Тесты, сборка, целостность каталога', 'Образ Docker собирается и отвечает', 'Браузерные сценарии'];
const run = (name, conclusion = 'success', status = 'completed', slug = 'github-actions', id = Math.floor(Math.random() * 1e6)) => ({ id, name, status, conclusion, app: { slug } });

async function verdict({ compare = 'ahead', runs, httpCode = 200, env = {} }) {
  const server = http.createServer((req, res) => {
    if (httpCode !== 200) { res.statusCode = httpCode; return res.end('{}'); }
    res.setHeader('content-type', 'application/json');
    if (req.url.includes('/compare/')) return res.end(JSON.stringify({ status: compare }));
    if (req.url.includes('/check-runs')) return res.end(JSON.stringify({ check_runs: runs }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const child = spawn('python3', [resolve(root, 'hosting/release/verify-ci.py'), SHA], { env: { ...process.env, GITHUB_API: `http://127.0.0.1:${server.address().port}`, REPO: 'https://github.com/o/r.git', ...env } });
    let out = ''; child.stdout.on('data', d => out += d);
    const code = await new Promise(r => child.on('close', r));
    return { code, out };
  } finally { server.close(); }
}

test('все обязательные проверки успешны и коммит в main → можно выкладывать', async () => {
  assert.equal((await verdict({ runs: CHECKS.map(n => run(n)) })).code, 0);
  assert.equal((await verdict({ compare: 'identical', runs: CHECKS.map(n => run(n)) })).code, 0);
});

test('проверка ещё идёт или не запускалась → ждать (10); провалена → не выкладывать (11)', async () => {
  assert.equal((await verdict({ runs: [run(CHECKS[0]), run(CHECKS[1], null, 'in_progress'), run(CHECKS[2])] })).code, 10);
  assert.equal((await verdict({ runs: [run(CHECKS[0]), run(CHECKS[1])] })).code, 10, 'одной из проверок нет');
  assert.equal((await verdict({ runs: [] })).code, 10);
  const failed = await verdict({ runs: [run(CHECKS[0]), run(CHECKS[1], 'failure'), run(CHECKS[2])] });
  assert.equal(failed.code, 11); assert.match(failed.out, /failure/);
  assert.equal((await verdict({ runs: [run(CHECKS[0], 'cancelled'), run(CHECKS[1]), run(CHECKS[2])] })).code, 11);
});

test('повторный запуск проверки: учитывается последний (перезапущенный и ставший зелёным — проходит, и наоборот)', async () => {
  assert.equal((await verdict({ runs: [run(CHECKS[0], 'failure', 'completed', 'github-actions', 1), run(CHECKS[0], 'success', 'completed', 'github-actions', 2), run(CHECKS[1]), run(CHECKS[2])] })).code, 0);
  assert.equal((await verdict({ runs: [run(CHECKS[0], 'success', 'completed', 'github-actions', 1), run(CHECKS[0], 'failure', 'completed', 'github-actions', 2), run(CHECKS[1]), run(CHECKS[2])] })).code, 11);
});

test('проверки не от GitHub Actions (чужое приложение, статус «от руки») не принимаются', async () => {
  const code = (await verdict({ runs: CHECKS.map(n => run(n, 'success', 'completed', 'some-other-app')) })).code;
  assert.equal(code, 10, 'чужие проверки не засчитываются');
});

test('коммит не из истории main (в том числе из другой ветки) не принимается, даже если проверки зелёные', async () => {
  for (const compare of ['diverged', 'behind']) {
    const r = await verdict({ compare, runs: CHECKS.map(n => run(n)) });
    assert.equal(r.code, 11, compare); assert.match(r.out, /не входит в историю/);
  }
});

test('GitHub недоступен или лимит запросов → ждать (12), коммит не найден → 11; кривой sha отклоняется', async () => {
  assert.equal((await verdict({ httpCode: 500, runs: [] })).code, 12);
  assert.equal((await verdict({ httpCode: 403, runs: [] })).code, 12, 'лимит API');
  assert.equal((await verdict({ httpCode: 404, runs: [] })).code, 11);
  const bad = spawn('python3', [resolve(root, 'hosting/release/verify-ci.py'), 'main']);
  assert.equal(await new Promise(r => bad.on('close', r)), 11);
});

test('имена обязательных проверок совпадают с заданиями в ci.yml и не обрезаются GitHub (до 50 символов)', () => {
  const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  const py = readFileSync(resolve(root, 'hosting/release/verify-ci.py'), 'utf8');
  const jobNames = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map(m => m[1].trim());
  for (const name of CHECKS) {
    assert.ok(jobNames.includes(name), `в ci.yml нет задания «${name}»`);
    assert.ok(py.includes(`"${name}"`), `в verify-ci.py нет «${name}»`);
    assert.ok(name.length <= 50, `имя «${name}» длиннее 50 символов: GitHub обрежет его до «…» и проверка не найдёт`);
  }
  assert.equal(jobNames.length, CHECKS.length, 'в CI появилось задание, которого нет в списке обязательных (или наоборот)');
});
