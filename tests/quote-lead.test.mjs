import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';
import { handleApi } from '../worker/api.mjs';
import { normalizePhone } from '../worker/quote-lead.mjs';

test('normalizePhone', () => {
  assert.equal(normalizePhone('8 (918) 24-89-248'), '+79182489248');
  assert.equal(normalizePhone('9182489248'), '+79182489248');
  assert.equal(normalizePhone('12345'), null);
});

test('/api/quote saves the lead and sends it to Telegram', async () => {
  const { DB, close } = localDatabase();
  const token = 'b'.repeat(64), id = createHash('sha256').update(token).digest('hex');
  await DB.prepare('INSERT INTO carts (id, items, version, updated_at) VALUES (?, ?, 1, ?)')
    .bind(id, JSON.stringify([{ code: '620110000263', packs: 2 }]), Date.now()).run();
  const calls = [];
  const env = { DB, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42, -100500', fetch: async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); } };
  const post = fields => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return handleApi(new Request('http://localhost/api/quote', { method: 'POST', body: form,
      headers: { Origin: 'http://localhost', Cookie: 'italon_cart_preview=' + token } }), env);
  };
  try {
    assert.equal((await post({ phone: '123' })).status, 400);
    const pdf = new Blob(['%PDF-1.7 test'], { type: 'application/pdf' });
    const ok = await post({ phone: '8 918 248 92 48', customer: 'Иван', pdf });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, sent: true, saved: true });
    assert.match(calls[0].url, /botT\/sendMessage/);
    assert.match(JSON.parse(calls[0].init.body).text, /\+79182489248/);
    assert.equal(calls.length, 4);
    assert.ok(calls.some(c => /sendDocument/.test(c.url)));
    assert.deepEqual(calls.filter(c => /sendMessage/.test(c.url)).map(c => JSON.parse(c.init.body).chat_id).sort(), ['-100500', '42']);
    assert.equal((await DB.prepare('SELECT telegram_ok FROM quotes').first()).telegram_ok, 1);
    assert.equal((await post({ phone: '89182489248' })).status, 429);
  } finally { close(); }
});

import { quoteDiscount, volumePercent, nextTier } from '../src/discount.mjs';
const full = { address: 'Краснодар, ул. Красная, 1', phone: '+7 918 248-92-48', customer: 'Иванов Иван Иванович' };
test('ступени скидки по сумме заказа', () => {
  const at = rub => volumePercent(rub * 100);
  assert.deepEqual([49_999, 50_000, 99_999, 100_000, 200_000, 300_000, 450_000, 500_000, 800_000, 1_000_000, 2_500_000].map(at),
    [0, 2, 2, 4, 5, 7, 7, 8, 10, 10, 10]);
  assert.equal(nextTier(40_000_00).percent, 2);
  assert.equal(nextTier(40_000_00).remainingKopecks, 10_000_00);
  assert.equal(nextTier(900_000_00), null);
});
test('скидка = ступень + 2% за ФИО, телефон и адрес (только если заполнено всё)', () => {
  assert.equal(quoteDiscount({}, 10_000_00).percent, 0);
  const a = quoteDiscount(full, 10_000_00);
  assert.equal(a.percent, 2); assert.equal(a.payableKopecks, 9_800_00);
  const b = quoteDiscount(full, 250_000_00);
  assert.equal(b.percent, 7); assert.equal(b.discountKopecks, 17_500_00); assert.equal(b.payableKopecks, 232_500_00);
  assert.equal(quoteDiscount({ ...full, address: '' }, 250_000_00).percent, 5);
  assert.equal(quoteDiscount({ ...full, customer: 'Иван' }, 250_000_00).percent, 5);
  assert.equal(quoteDiscount({ ...full, phone: '123' }, 250_000_00).percent, 5);
});
