// Согласие на обработку персональных данных (152-ФЗ): сервер, форма, страницы, защита от выкладки черновиков.
// Пока флаги PD_CONSENT / REQUIRE_CONSENT не включены, поведение сайта прежнее — это тоже проверяется.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';
import { handleApi } from '../worker/api.mjs';

const root = resolve(import.meta.dirname, '..');

async function harness(envExtra = {}) {
  const { DB, close } = localDatabase();
  const token = createHash('sha256').update(String(Math.random())).digest('hex'), id = createHash('sha256').update(token).digest('hex');
  await DB.prepare('INSERT INTO carts (id, items, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, JSON.stringify([{ code: '620110000263', packs: 2 }]), Date.now()).run();
  const calls = [];
  const env = { DB, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42', TELEGRAM_API_BASE: 'https://relay.example/', ...envExtra,
    fetch: async (url, init) => { calls.push({ url, init }); return new Response('{"ok":true}', { status: 200 }); } };
  let n = 0;
  const post = async fields => {
    const form = new FormData(); for (const [k, v] of Object.entries(fields)) form.set(k, v);
    // антиспам-пауза на одну корзину — 5 с; для проверки сдвигаем часы
    const realNow = Date.now; Date.now = () => realNow() + (++n) * 60_000;
    try { return await handleApi(new Request('http://localhost/api/quote', { method: 'POST', body: form, headers: { Origin: 'http://localhost', Cookie: 'italon_cart_preview=' + token } }), env); }
    finally { Date.now = realNow; }
  };
  const rows = async () => (await DB.prepare('SELECT phone, consent_at, consent_version FROM quotes ORDER BY id').all()).results;
  return { post, calls, rows, close };
}

test('по умолчанию (REQUIRE_CONSENT не включён) заявка без согласия принимается, как раньше; поле согласия пустое', async () => {
  const h = await harness();
  try {
    const r = await h.post({ phone: '8 918 248 92 48' });
    assert.equal(r.status, 200); assert.equal((await r.json()).saved, true);
    const [row] = await h.rows(); assert.equal(row.consent_at, null); assert.equal(row.consent_version, null);
    assert.doesNotMatch(JSON.parse(h.calls[0].init.body).text, /Согласие на обработку/);
    assert.equal(h.calls[0].init.headers['X-Relay-Key'], undefined, 'без TELEGRAM_RELAY_KEY заголовок не отправляется');
  } finally { h.close(); }
});

test('REQUIRE_CONSENT=1: без согласия заявка отклоняется и не сохраняется, с согласием — сохраняется с датой и версией текста', async () => {
  const h = await harness({ REQUIRE_CONSENT: '1', CONSENT_VERSION: '2026-11-01' });
  try {
    const no = await h.post({ phone: '8 918 248 92 48' });
    assert.equal(no.status, 400); assert.match((await no.json()).error, /согласие/i);
    assert.equal((await h.rows()).length, 0); assert.equal(h.calls.length, 0, 'в Telegram ничего не ушло');
    const no2 = await h.post({ phone: '8 918 248 92 48', consent: '0' });
    assert.equal(no2.status, 400);
    const ok = await h.post({ phone: '8 918 248 92 48', consent: '1', customer: 'Иванов И. И.' });
    assert.equal(ok.status, 200);
    const [row] = await h.rows(); assert.ok(row.consent_at > 0); assert.equal(row.consent_version, '2026-11-01');
    assert.match(JSON.parse(h.calls[0].init.body).text, /Согласие на обработку персональных данных получено/);
  } finally { h.close(); }
});

test('ключ ретранслятора отправляется, если задан TELEGRAM_RELAY_KEY (и для текста, и для PDF)', async () => {
  const h = await harness({ TELEGRAM_RELAY_KEY: 'secret-key' });
  try {
    const r = await h.post({ phone: '8 918 248 92 48', pdf: new Blob(['%PDF-1.7 x'], { type: 'application/pdf' }) });
    assert.equal(r.status, 200); assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(c => c.init.headers['X-Relay-Key'] === 'secret-key'));
  } finally { h.close(); }
});

test('ретранслятор Cloudflare: с RELAY_KEY чужие запросы отклоняются, свои проходят; без ключа работает как раньше; ключ дальше не пересылается', async () => {
  const worker = (await import('../hosting/telegram-relay-worker.js')).default;
  const sent = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response('ok'); };
  try {
    const req = (path, key) => new Request('https://relay.example' + path, { method: 'POST', body: '{}', headers: key ? { 'X-Relay-Key': key } : {} });
    assert.equal((await worker.fetch(req('/botT/sendMessage'), {})).status, 200, 'без RELAY_KEY — как раньше');
    assert.equal((await worker.fetch(req('/botT/sendMessage'), { RELAY_KEY: 'k' })).status, 403);
    assert.equal((await worker.fetch(req('/botT/sendMessage', 'bad'), { RELAY_KEY: 'k' })).status, 403);
    assert.equal((await worker.fetch(req('/botT/sendMessage', 'k'), { RELAY_KEY: 'k' })).status, 200);
    assert.equal(sent.at(-1).init.headers.get('X-Relay-Key'), null, 'секрет не уходит в Telegram');
    assert.equal((await worker.fetch(req('/botT/getUpdates', 'k'), { RELAY_KEY: 'k' })).status, 404, 'только sendMessage и sendDocument');
  } finally { globalThis.fetch = realFetch; }
});

test('миграция 0002 только добавляет столбцы: старые заявки читаются без изменений', async () => {
  const sql = readFileSync(resolve(root, 'drizzle/0002_quote_consent.sql'), 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|UPDATE|RENAME|NOT NULL)\b/i);
  assert.equal([...sql.matchAll(/ALTER TABLE `quotes` ADD /g)].length, 2);
});

function build(env) {
  const out = mkdtempSync(resolve(tmpdir(), 'italon-legal-site-'));
  const r = spawnSync(process.execPath, [resolve(root, 'scripts/build-site.mjs'), '--quiet'], { encoding: 'utf8', env: { ...process.env, SITE_OUT_DIR: out, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return out;
}
const robots = html => /<meta name="robots" content="noindex/.test(html);

test('сборка без флагов: ни страниц /privacy/ и /consent/, ни галочки в форме', () => {
  const out = build({});
  try {
    assert.ok(!existsSync(resolve(out, 'privacy/index.html'))); assert.ok(!existsSync(resolve(out, 'consent/index.html')));
    const home = readFileSync(resolve(out, 'index.html'), 'utf8');
    assert.doesNotMatch(home, /quote-consent|privacy/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('сборка с PD_CONSENT=1: галочка в форме, страницы-черновики с плашкой и noindex, их нет в sitemap', () => {
  const out = build({ PD_CONSENT: '1' });
  try {
    const home = readFileSync(resolve(out, 'index.html'), 'utf8');
    assert.match(home, /id="quote-consent"/); assert.match(home, /href="privacy\/"/); assert.match(home, /href="consent\/"/);
    assert.doesNotMatch(home, /id="quote-consent"[^>]*checked|id="quote-consent"[^>]*required/, 'галочка не отмечена заранее');
    for (const p of ['privacy', 'consent']) {
      const html = readFileSync(resolve(out, p, 'index.html'), 'utf8');
      assert.match(html, /ЧЕРНОВИК/); assert.ok(robots(html), p + ' закрыта от индексации');
    }
    assert.doesNotMatch(readFileSync(resolve(out, 'sitemap.xml'), 'utf8'), /\/privacy\/|\/consent\//);
    assert.match(readFileSync(resolve(out, 'privacy/index.html'), 'utf8'), /\[\[/, 'места для заполнения помечены');
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('с PD_LEGAL_APPROVED=1 плашка черновика исчезает, страницы индексируются (для этого тексты должны быть заполнены — проверяет verify-catalog)', () => {
  const out = build({ PD_CONSENT: '1', PD_LEGAL_APPROVED: '1' });
  try {
    const html = readFileSync(resolve(out, 'privacy/index.html'), 'utf8');
    assert.doesNotMatch(html, /ЧЕРНОВИК|legal-draft/); assert.ok(!robots(html));
    assert.match(readFileSync(resolve(out, 'sitemap.xml'), 'utf8'), /\/privacy\//);
    assert.match(html, /\[\[/, 'в черновых текстах есть незаполненные места — verify-catalog при PD_LEGAL_APPROVED=1 такую сборку не пропустит');
  } finally { rmSync(out, { recursive: true, force: true }); }
});
