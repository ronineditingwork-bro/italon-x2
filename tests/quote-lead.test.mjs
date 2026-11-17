import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';
import { handleApi } from '../worker/api.mjs';
import { normalizePhone, sendTelegram } from '../worker/quote-lead.mjs';

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
  const env = { DB, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42, -100500', TELEGRAM_API_BASE: 'https://relay.example/', fetch: async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); } };
  const post = fields => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return handleApi(new Request('http://localhost/api/quote', { method: 'POST', body: form,
      headers: { Origin: 'http://localhost', Cookie: 'italon_cart_preview=' + token } }), env);
  };
  try {
    assert.equal((await post({ phone: '123' })).status, 400);
    const pdf = new Blob(['%PDF-1.7 test'], { type: 'application/pdf' });
    const ok = await post({ phone: '8 918 248 92 48', customer: 'Иванов Иван Иванович', address: 'Краснодар, ул. Красная, 1', pdf });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, sent: true, saved: true });
    assert.match(calls[0].url, /^https:\/\/relay\.example\/botT\/sendMessage/);
    const message = JSON.parse(calls[0].init.body);
    assert.equal(message.parse_mode, 'HTML');
    assert.match(message.text, /Для DAS/);
    assert.match(message.text, /Скидка для конечного покупателя: <b>2%<\/b>/);
    assert.match(message.text, /<code>Иванов Иван Иванович<\/code>/);
    assert.match(message.text, /<code>620110000263<\/code> — /);
    assert.doesNotMatch(message.text, /не хватает/);
    assert.match(message.text, /\+79182489248/);
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
    [0, 2, 2, 4, 5, 6, 7, 8, 10, 10, 10]);
  assert.equal(nextTier(40_000_00).percent, 2);
  assert.equal(nextTier(40_000_00).remainingKopecks, 10_000_00);
  assert.equal(volumePercent(399_999_00), 6); assert.equal(volumePercent(400_000_00), 7);
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

test('сообщение для DAS предупреждает, чего не хватает, и экранирует HTML', async () => {
  const { leadText } = await import('../worker/quote-lead.mjs');
  const { calculateCart } = await import('../src/catalog.mjs');
  const text = leadText({ createdAt: Date.now(), phone: '+79182489248', customer: '', address: '', project: '', note: '<b>x</b> & y' }, calculateCart([{ code: '620110000263', packs: 2 }]));
  assert.match(text, /не хватает: ФИО \/ название объекта, адрес/);
  assert.match(text, /&lt;b&gt;x&lt;\/b&gt; &amp; y/);
  assert.match(text, /Скидка для конечного покупателя: <b>0%<\/b>/);
});

test('заявка менеджеру: затирка и клей Mapei из прайса — артикул, упаковки, цена, склад и свой итог; в сумму плитки не входят', async () => {
  const { leadText } = await import('../worker/quote-lead.mjs');
  const { calculateCart, products } = await import('../src/catalog.mjs');
  const tile = products.find(p => p.section === 'italon' && p.format === '60X120' && p.canOrder);
  const cart = calculateCart([{ code: '600010001804', packs: 7 }, { code: tile.code, packs: 10 }]);   // Авангард Пьюр 120×120: затирка Italon, клея в таблицах нет — подбор по формату
  const text = leadText({ createdAt: Date.now(), phone: '+79182489248', customer: 'Иванов', address: 'Краснодар', project: '', note: '' }, cart);
  assert.match(text, /Затирка и клей Mapei — справочно, в сумму не входит \(шов 2 мм, склад Краснодар на \d\d\.\d\d\.\d{4}\)/);
  assert.match(text, /• <code>6011102A<\/code> Ultracolor Plus 111 «Светло-серый», 2 кг — \d+ уп\. × 959 ₽, склад \d+ \(к АВА\.ПЬЮР 120X120 РЕТ/);
  assert.match(text, /• <code>\d+<\/code> Keraflex (Extra|Maxi) S1, (серый|белый), 25 кг — \d+ меш\. × [\d\s ]+ ₽/);
  assert.match(text, /Итого Mapei: с цементной затиркой [\d\s ]+ ₽, с эпоксидной [\d\s ]+ ₽/); assert.match(text, /или эпоксидная <code>FG01311102<\/code> Kerapoxy 111/); assert.match(text, /Ultr(alite|aflex) S2, [а-я]+, \d+ кг — \d+ меш\..*АВА\.ПЬЮР 120X120 РЕТ\), подбор по формату плитки/);   // 120×120 — клей по ближайшему формату
  assert.ok(text.indexOf('Затирка и клей Mapei') < text.indexOf('Для контроля'), 'блок Mapei стоит до контрольной суммы');
  const prima = products.find(p => p.collectionId === 'prima' && p.canOrder && !p.grout && /^1/.test(p.format) === false && p.format === '120X278');
  if (prima) assert.doesNotMatch(leadText({ createdAt: Date.now(), phone: '+79182489248' }, calculateCart([{ code: prima.code, packs: 1 }])), /Затирка и клей Mapei/);
});

// ---------------------------------------------------------------- доставка файла к заявке (PDF КП, картинка Outdoor Lab)
// Заглушка Telegram: ответ по очереди на каждый вызов метода (Response-параметры или исключение); по умолчанию — успех.
function telegramStub(plan = {}, failFor = () => null) {
  const calls = [];
  const fetch = async (url, init) => {
    const method = String(url).split('/').pop(), form = init.body instanceof FormData;
    const call = { method, chat: form ? init.body.get('chat_id') : JSON.parse(init.body).chat_id, text: form ? null : JSON.parse(init.body).text, timeoutSignal: !!init.signal };
    calls.push(call);
    const step = failFor(call) ?? (plan[method] || []).shift();
    if (step instanceof Error) throw step;
    return new Response(step?.body ?? '{"ok":true}', { status: step?.status ?? 200 });
  };
  return { calls, fetch };
}
const FILE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]), TG = { TELEGRAM_BOT_TOKEN: '123:SECRET-token', TELEGRAM_CHAT_ID: '42' };
const timeoutError = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
const quietly = async run => { const log = console.error, lines = []; console.error = (...a) => lines.push(a.join(' ')); try { await run(); } finally { console.error = log; } return lines; };

test('PDF к заявке: обрыв связи или 502 от ретранслятора — вторая попытка, и файл доходит без предупреждений', async () => {
  for (const first of [{ status: 502, body: 'Bad Gateway' }, { status: 429, body: '{"ok":false}' }, Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })]) {
    const t = telegramStub({ sendDocument: [first] });
    assert.equal(await sendTelegram(TG, 'заявка', FILE, 'kp.pdf', t.fetch), true);
    assert.deepEqual(t.calls.map(c => c.method), ['sendMessage', 'sendDocument', 'sendDocument']);
    assert.ok(t.calls.every(c => c.timeoutSignal), 'у каждого запроса есть ограничение по времени');
  }
});

test('PDF к заявке не ушёл — в тот же чат приходит предупреждение с причиной; токена нет ни в чате, ни в журнале', async () => {
  const slow = telegramStub({ sendDocument: [timeoutError()] }), bad = telegramStub({ sendDocument: [{ status: 400, body: '{"ok":false,"description":"Bad Request: <file> /bot123:SECRET-token/x"}' }] });
  const twice = telegramStub({ sendDocument: [{ status: 504 }, { status: 504 }] });
  const log = await quietly(async () => {
    await assert.rejects(sendTelegram(TG, 'заявка', FILE, 'kp.pdf', slow.fetch), /нет ответа за 30 с/);
    await assert.rejects(sendTelegram(TG, 'заявка', FILE, 'kp.pdf', bad.fetch), /ответ 400/);
    await assert.rejects(sendTelegram(TG, 'заявка', FILE, 'kp.pdf', twice.fetch), /попыток: 2\) ответ 504/);
  });
  assert.deepEqual(slow.calls.map(c => c.method), ['sendMessage', 'sendDocument', 'sendMessage'], 'после 30 с ожидания не повторяем: посетитель ждёт ответа сайта');
  assert.deepEqual(bad.calls.map(c => c.method), ['sendMessage', 'sendDocument', 'sendMessage'], 'ответ 400 повторять бесполезно');
  assert.deepEqual(twice.calls.map(c => c.method), ['sendMessage', 'sendDocument', 'sendDocument', 'sendMessage']);
  assert.equal(slow.calls[2].text, '⚠️ Не удалось отправить PDF коммерческого предложения к заявке выше. Клиент скачал КП у себя; позиции и суммы — в сообщении выше.\nПричина: нет ответа за 30 с.');
  assert.match(bad.calls[2].text, /Причина: ответ 400 \{"ok":false,"description":"Bad Request: &lt;file&gt; \/bot\*\*\*\/x"\}\.$/);
  for (const line of [...slow.calls, ...bad.calls, ...twice.calls].map(c => c.text).filter(Boolean).concat(log)) assert.doesNotMatch(line, /SECRET/);
  assert.equal(log.filter(l => /^telegram_error telegram sendDocument \(pdf 8 bytes/.test(l)).length, 3, 'причина и размер файла — в журнале, как раньше');
});

test('два получателя: у одного PDF не ушёл — предупреждение только ему, заявка доставлена; без файла (салон) — только текст', async () => {
  const t = telegramStub({}, call => call.method === 'sendDocument' && call.chat === '42' ? { status: 413, body: 'Request Entity Too Large' } : null);
  const log = await quietly(async () => assert.equal(await sendTelegram({ ...TG, TELEGRAM_CHAT_ID: '42, -100500' }, 'заявка', FILE, 'kp.pdf', t.fetch), true));
  const warnings = t.calls.filter(c => /^⚠️/.test(c.text || ''));
  assert.deepEqual(warnings.map(c => c.chat), ['42']); assert.equal(log.length, 1);
  assert.equal(t.calls.filter(c => c.method === 'sendDocument').length, 2);
  const text = telegramStub();
  assert.equal(await sendTelegram(TG, 'запись в салон', null, '', text.fetch), true);
  assert.deepEqual(text.calls.map(c => c.method), ['sendMessage']);
  const failedText = telegramStub({ sendMessage: [{ status: 403, body: 'Forbidden' }] });
  await quietly(async () => assert.rejects(sendTelegram(TG, 'заявка', FILE, 'kp.pdf', failedText.fetch), /sendMessage 403/));
  assert.deepEqual(failedText.calls.map(c => c.method), ['sendMessage'], 'текст не дошёл — файл и предупреждение не шлём');
});

test('Outdoor Lab: картинка не ушла (ретранслятор пропускает не всё) — предупреждение про картинку, посетитель видит честную ошибку', async () => {
  const t = telegramStub({ sendPhoto: [{ status: 404, body: 'Not found' }] });
  await quietly(async () => assert.rejects(sendTelegram(TG, 'проект', FILE, 'x.jpg', t.fetch, { method: 'sendPhoto', field: 'photo', type: 'image/jpeg' }), /sendPhoto/));
  assert.deepEqual(t.calls.map(c => c.method), ['sendMessage', 'sendPhoto', 'sendMessage']);
  assert.equal(t.calls[2].text, '⚠️ Не удалось отправить картинку к заявке выше. Спецификация — в сообщении выше.\nПричина: ответ 404 Not found.');
});

test('/api/quote: PDF не дошёл — заявка сохранена, текст и предупреждение в чате, в базе отметка «не доставлено»', async () => {
  const { DB, close } = localDatabase();
  const token = 'c'.repeat(64), id = createHash('sha256').update(token).digest('hex');
  await DB.prepare('INSERT INTO carts (id, items, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, JSON.stringify([{ code: '620110000263', packs: 2 }]), Date.now()).run();
  const t = telegramStub({ sendDocument: [timeoutError()] });
  const form = new FormData(); form.set('phone', '+7 900 000-00-00'); form.set('customer', 'ТЕСТ'); form.set('pdf', new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }), 'kp.pdf');
  try {
    let response;
    await quietly(async () => { response = await handleApi(new Request('http://localhost/api/quote', { method: 'POST', body: form, headers: { Origin: 'http://localhost', Cookie: 'italon_cart_preview=' + token } }), { DB, ...TG, fetch: t.fetch }); });
    assert.deepEqual(await response.json(), { ok: true, sent: false, saved: true });
    assert.deepEqual(t.calls.map(c => c.method), ['sendMessage', 'sendDocument', 'sendMessage']);
    assert.match(t.calls[0].text, /PDF коммерческого предложения — следующим сообщением/);
    assert.match(t.calls[2].text, /^⚠️ Не удалось отправить PDF/);
    assert.equal((await DB.prepare('SELECT telegram_ok FROM quotes').first()).telegram_ok, 0);
  } finally { close(); }
});
