import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../worker/api.mjs';

const ORIGIN = 'https://italon-x2.ru', JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const env = () => { const calls = []; return { calls, TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1,2', fetch: async (url, init) => { calls.push({ url: String(url), body: init.body }); return new Response('{"ok":true}'); } }; };
const send = (e, fields = {}, { image = JPEG, origin = ORIGIN } = {}) => {
  const f = new FormData(); for (const [k, v] of Object.entries({ contact: '+7 918 000-11-22', consent: '1', spec: 'Терраса: 20 м²', ...fields })) if (v !== undefined) f.set(k, v);
  if (image) f.set('image', new Blob([image], { type: 'image/jpeg' }), 'x.jpg');
  return handleApi(new Request(ORIGIN + '/api/outdoor/send', { method: 'POST', headers: origin ? { Origin: origin } : {}, body: f }), e);
};

test('отправка проекта: текст и фото уходят всем получателям, без базы и регистрации', async () => {
  const e = env(), r = await send(e, { contact: '+7 918 000-11-22', name: 'Анна <b>', note: 'привет' });
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(e.calls.filter(c => /sendMessage/.test(c.url)).length, 2); assert.equal(e.calls.filter(c => /sendPhoto/.test(c.url)).length, 2);
  const msg = JSON.parse(e.calls[0].body).text; assert.match(msg, /\+79180001122/); assert.match(msg, /Анна &lt;b&gt;/); assert.match(msg, /Терраса: 20 м²/);
});
test('контакт: телефон или @telegram; мусор и пустое отклоняются', async () => {
  for (const contact of ['', 'abc', '123', '@a']) assert.equal((await send(env(), { contact })).status, 400, contact);
  assert.equal((await send(env(), { contact: '@client_name' })).status, 200);
});
test('нужны согласие, свой Origin и настоящий JPEG', async () => {
  assert.equal((await send(env(), { consent: undefined, contact: '+7 918 000-11-23' })).status, 400);
  assert.equal((await send(env(), { contact: '+7 918 000-11-24' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(env(), { contact: '+7 918 000-11-25' }, { image: new Uint8Array([1, 2, 3, 4]) })).status, 400);
});
test('повтор того же контакта подряд ограничен', async () => {
  assert.equal((await send(env(), { contact: '+7 918 000-11-26' })).status, 200);
  assert.equal((await send(env(), { contact: '+7 918 000-11-26' })).status, 429);
});
test('без Telegram в окружении честная ошибка, не «успех»', async () => {
  const r = await send({ fetch: async () => new Response('{}') }, { contact: '+7 918 000-11-27' }); assert.equal(r.status, 503);
});
