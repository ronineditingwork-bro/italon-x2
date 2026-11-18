import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../worker/api.mjs';

const URL = 'https://italon-x2.ru/api/salon/book';
const makeEnv = () => {
  const calls = [];
  const env = {
    TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: '42',
    fetch: async (url, init) => {
      calls.push({ url: String(url), text: JSON.parse(init.body).text });
      return new Response('{"ok":true}', { status: 200 });
    },
  };
  return { env, calls };
};
const submit = (env, changes = {}, origin = 'https://italon-x2.ru') =>
  handleApi(new Request(URL, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Александр', phone: '+7 918 000-09-91',
      date: '2030-04-17', comment: 'Плитка для террасы', consent: true, ...changes,
    }),
  }), env);

test('заявка на визит отправляется в Telegram и не требует почтового клиента', async () => {
  const { env, calls } = makeEnv();
  const res = await submit(env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /Заявка на визит/);
  assert.match(calls[0].text, /\+79180000991/);
  assert.match(calls[0].text, /17\.04\.2030/);
  assert.match(calls[0].text, /Плитка для террасы/);
  assert.match(calls[0].text, /НЕ подтверждены/);
});
test('валидируется телефон, имя, согласие, дата и Origin', async () => {
  const { env, calls } = makeEnv();
  assert.equal((await submit(env, { phone: '123' })).status, 400);
  assert.equal((await submit(env, { name: ' ' })).status, 400);
  assert.equal((await submit(env, { consent: false })).status, 400);
  assert.equal((await submit(env, { date: '2030-02-30' })).status, 400);
  assert.equal((await submit(env, {}, 'https://evil.example')).status, 403);
  assert.equal((await submit(env, { website: 'https://spam.invalid' })).status, 400);
  assert.equal(calls.length, 0);
});
test('дубли за минуту ограничены', async () => {
  const { env } = makeEnv();
  assert.equal((await submit(env, { phone: '+7 918 000-09-92' })).status, 200);
  assert.equal((await submit(env, { phone: '+7 918 000-09-92' })).status, 429);
});
test('при ошибке Telegram форма получает отказ вместо ложного успеха; повтор разрешён', async () => {
  const { env } = makeEnv();
  env.fetch = async () => new Response('fail', { status: 502 });
  assert.equal((await submit(env, { phone: '+7 918 000-09-93' })).status, 503);
  env.fetch = async () => new Response('{"ok":true}', { status: 200 });
  assert.equal((await submit(env, { phone: '+7 918 000-09-93' })).status, 200);
});
