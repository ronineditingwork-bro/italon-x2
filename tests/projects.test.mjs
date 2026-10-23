// Проекты X2 Outdoor Lab: проверка адреса (ГАР/ФИАС через DaData), SMS-подтверждение, закрытая карточка, защищённая ссылка «только просмотр», защита личных данных.
// Внешние сервисы (DaData, SMS, Telegram) заменены заглушками; база — настоящая SQLite с миграциями проекта.
import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase } from '../scripts/sqlite-adapter.mjs';
import { handleApi } from '../worker/api.mjs';
import { sanitizeJpeg, validateState, manualAddressOk, projectsConfig, LIMITS_FOR_TESTS as L } from '../worker/projects.mjs';

const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QAgRXhpZgAATU0AKgAAAAgAAEdQU0RBVEEtU0VDUkVU/9sAQwAKBwcIBwYKCAgICwoKCw4YEA4NDQ4dFRYRGCMfJSQiHyIhJis3LyYpNCkhIjBBMTQ5Oz4+PiUuRElDPEg3PT47/9sAQwEKCwsODQ4cEBAcOygiKDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7/8AAEQgAHgAoAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8AbRRRWJIUUUUAFFFFABRRRQAUUUUAFFFFAH//2Q==', 'base64'));
const ORIGIN = 'http://localhost', T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
const GOOD = { code: '610010004089', mount: 'adhesive', layout: 'offset', direction: 'along', joint: 'narrow' };
const sceneState = () => ({ scene: 'modern-pool', zone: 'terrace', zones: { terrace: GOOD, path: GOOD, pool: GOOD }, areas: { terrace: 24, path: 10 } });
const HOUSE = { value: 'г Краснодар, ул Красная, д 1', data: { fias_id: '11111111-1111-1111-1111-111111111111', fias_level: '8', region_with_type: 'Краснодарский край', city: 'Краснодар', city_fias_id: '7dfa745e-aa19-4688-b121-b655c3e04a6a', street: 'Красная', house: '1', geo_lat: '45.0355', geo_lon: '38.9753' } };
const PLOT = { value: 'Краснодарский край, СНТ Ромашка, уч 12', data: { fias_id: '22222222-2222-2222-2222-222222222222', fias_level: '75', city: 'Краснодар', city_fias_id: '7dfa745e-aa19-4688-b121-b655c3e04a6a', geo_lat: '45.1', geo_lon: '39.0' } };
const CITY = { value: 'г Краснодар', data: { fias_id: '7dfa745e-aa19-4688-b121-b655c3e04a6a', fias_level: '4', city: 'Краснодар', city_fias_id: '7dfa745e-aa19-4688-b121-b655c3e04a6a' } };
const STREET = { value: 'г Краснодар, ул Красная', data: { fias_id: '33333333-3333-3333-3333-333333333333', fias_level: '7', city: 'Краснодар', street: 'Красная' } };

function setup(over = {}) {
  const { DB, close } = localDatabase(), files = new Map(), sms = [], telegram = [], dadataCalls = [];
  let now = T0;
  const env = {
    DB, now: () => now, PROJECTS_SECRET: 's'.repeat(48), MANAGER_TOKEN: 'm'.repeat(32), SMS_PROVIDER: 'mock', ALLOW_MOCK_SMS: '1', sentSms: sms, DADATA_API_KEY: 'dadata-key', APP_ORIGIN: ORIGIN,
    TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42',
    PROJECT_FILES: { async put(n, b) { files.set(n, b); }, async get(n) { return files.get(n) || null; }, async delete(n) { files.delete(n); } },
    fetch: async (url, init) => {
      if (String(url).includes('dadata') || String(url).includes('suggestions')) { const body = JSON.parse(init.body); dadataCalls.push({ url: String(url), headers: init.headers, body }); const q = body.query.toLowerCase();
        const all = [HOUSE, PLOT, CITY, STREET]; const list = body.from_bound ? all.filter(x => ['4', '6'].includes(x.data.fias_level)) : all; return new Response(JSON.stringify({ suggestions: q.includes('qwerty') ? [] : list }), { status: 200 }); }
      telegram.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 });
    },
    ...over,
  };
  let cookie = '';
  const call = async (method, path, body, { raw, headers = {}, cookies = true, origin = ORIGIN } = {}) => {
    const init = { method, headers: { Origin: origin, ...(cookies && cookie ? { Cookie: cookie } : {}), ...headers } };
    if (body !== undefined) { init.body = raw ? body : JSON.stringify(body); init.headers['Content-Type'] = raw || 'application/json'; }
    const res = await handleApi(new Request(ORIGIN + path, init), env), set = res.headers.get('Set-Cookie');
    if (set && /italon_owner_preview=[a-f0-9]{64}/.test(set)) cookie = set.split(';')[0];
    const type = res.headers.get('Content-Type') || '';
    return { status: res.status, headers: res.headers, json: type.includes('json') ? await res.json() : null, bytes: type.includes('image') ? new Uint8Array(await res.arrayBuffer()) : null };
  };
  const login = async (phone = '+7 918 123-45-67') => {
    const s = await call('POST', '/api/projects/otp/send', { phone, consentPd: true }); assert.equal(s.status, 200, JSON.stringify(s.json));
    const code = sms.at(-1).text.match(/\d{6}/)[0]; const v = await call('POST', '/api/projects/otp/verify', { phone, code }); assert.equal(v.status, 200, JSON.stringify(v.json)); return v;
  };
  return { env, call, login, files, sms, telegram, dadataCalls, close, tick: ms => { now += ms; }, resetCookie: () => { cookie = ''; }, setCookie: c => { cookie = c; }, get cookie() { return cookie; } };
}
const suggest = async (h, body) => (await h.call('POST', '/api/projects/address/suggest', body)).json;
const create = (h, over = {}) => h.call('POST', '/api/projects', { title: 'Дача', kind: 'scene', state: sceneState(), consentPd: true, marketing: false, ...over });

test('функция выключена честно, пока не заданы секрет, хранилище и SMS-провайдер', async () => {
  const h = setup({ PROJECTS_SECRET: undefined });
  const s = await h.call('GET', '/api/projects/status'); assert.equal(s.status, 200); assert.equal(s.json.enabled, false);
  assert.equal((await h.call('POST', '/api/projects/otp/send', { phone: '+79181234567', consentPd: true })).status, 503);
  assert.equal(projectsConfig({ PROJECTS_SECRET: 'x'.repeat(40), PROJECT_FILES: {}, SMS_PROVIDER: 'mock' }).enabled, false, 'mock без явного разрешения не включается');
  assert.equal(projectsConfig({ PROJECTS_SECRET: 'short', PROJECT_FILES: {}, SMS_PROVIDER: 'smsru', SMS_API_KEY: 'k' }).enabled, false, 'короткий секрет не годится');
  assert.equal(projectsConfig({ PROJECTS_SECRET: 'x'.repeat(40), PROJECT_FILES: {}, SMS_PROVIDER: 'smsru', SMS_API_KEY: 'k' }).enabled, true);
  h.close();
});
test('SMS-код: только российский мобильный, согласие обязательно, лимиты, неверные попытки, срок жизни', async () => {
  const h = setup();
  assert.equal((await h.call('POST', '/api/projects/otp/send', { phone: '123', consentPd: true })).status, 400);
  assert.equal((await h.call('POST', '/api/projects/otp/send', { phone: '+7 861 234-56-78', consentPd: true })).status, 400, 'городской номер не принимается');
  assert.equal((await h.call('POST', '/api/projects/otp/send', { phone: '+79181234567' })).status, 400, 'без согласия нельзя');
  const ok = await h.call('POST', '/api/projects/otp/send', { phone: '8 (918) 123-45-67', consentPd: true }); assert.equal(ok.status, 200); assert.equal(h.sms.length, 1); assert.match(h.sms[0].text, /Italon X2: код подтверждения \d{6}/);
  assert.ok(!JSON.stringify(ok.json).match(/\d{6}/), 'код не должен возвращаться в ответе');
  const again = await h.call('POST', '/api/projects/otp/send', { phone: '+79181234567', consentPd: true }); assert.equal(again.status, 429); assert.ok(again.json.retryAfter > 0);
  const code = h.sms[0].text.match(/\d{6}/)[0], bad = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) { const r = await h.call('POST', '/api/projects/otp/verify', { phone: '+79181234567', code: bad }); assert.equal(r.status, i < 4 ? 400 : 400); }
  assert.equal((await h.call('POST', '/api/projects/otp/verify', { phone: '+79181234567', code })).status, 429, 'после пяти ошибок верный код тоже не принимается');
  h.tick(61_000); await h.call('POST', '/api/projects/otp/send', { phone: '+79181234567', consentPd: true }); const code2 = h.sms[1].text.match(/\d{6}/)[0];
  h.tick(L.otpTtl + 1000); assert.equal((await h.call('POST', '/api/projects/otp/verify', { phone: '+79181234567', code: code2 })).status, 400, 'просроченный код');
  for (let i = 0; i < 6; i++) { h.tick(61_000); const r = await h.call('POST', '/api/projects/otp/send', { phone: '+79181234567', consentPd: true }); if (r.status === 429) { assert.ok(i >= 2); break; } assert.notEqual(i, 5, 'лимит запросов кода не сработал'); }
  h.close();
});
test('вход: правильный код выдаёт сессию (HttpOnly), без сессии проекты закрыты, выход закрывает доступ', async () => {
  const h = setup();
  assert.equal((await h.call('GET', '/api/projects/me')).status, 401);
  const v = await h.login(); assert.match(v.headers.get('Set-Cookie'), /HttpOnly/); assert.match(v.headers.get('Set-Cookie'), /SameSite=Lax/); assert.match(v.json.phone, /\*\*\*/); assert.ok(!JSON.stringify(v.json).includes('1234567'));
  const me = await h.call('GET', '/api/projects/me'); assert.equal(me.status, 200); assert.equal(me.json.projects.length, 0);
  assert.equal((await h.call('POST', '/api/projects/logout', {})).status, 200); h.resetCookie(); assert.equal((await h.call('GET', '/api/projects/me')).status, 401);
  assert.equal((await h.call('GET', '/api/projects/me', undefined, { headers: { Cookie: 'italon_owner_preview=' + 'a'.repeat(64) }, cookies: false })).status, 401, 'поддельная сессия');
  h.close();
});
test('запросы с чужого сайта отклоняются (проверка Origin)', async () => {
  const h = setup(); await h.login();
  assert.equal((await h.call('POST', '/api/projects', { title: 'x' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.call('POST', '/api/projects/otp/send', { phone: '+79181234567', consentPd: true }, { origin: 'https://evil.example' })).status, 403);
  h.close();
});
test('подсказки адреса: ключ DaData уходит только на сервер, возвращаются подписанные токены нужного уровня; «qwerty» ничего не находит', async () => {
  const h = setup(); const city = await suggest(h, { query: 'краснодар', mode: 'city' });
  assert.deepEqual(city.items.map(i => i.level), [4]); assert.ok(h.dadataCalls[0].headers.Authorization.includes('dadata-key')); assert.ok(!JSON.stringify(city).includes('dadata-key'));
  const house = await suggest(h, { query: 'красная 1', mode: 'house', cityToken: city.items[0].token }); assert.deepEqual(house.items.map(i => i.level), [8]); assert.equal(h.dadataCalls.at(-1).body.locations[0].city_fias_id, CITY.data.fias_id);
  const plot = await suggest(h, { query: 'ромашка', mode: 'plot' }); assert.deepEqual(plot.items.map(i => i.level), [75]);
  assert.deepEqual((await suggest(h, { query: 'qwerty', mode: 'house' })).items, []);
  assert.deepEqual((await suggest(h, { query: 'к', mode: 'house' })).items, []);
  const off = setup({ DADATA_API_KEY: '' }); const r = await off.call('POST', '/api/projects/address/suggest', { query: 'краснодар', mode: 'city' }); assert.equal(r.status, 503); assert.equal(r.json.manual, true);
  h.close(); off.close();
});
test('проект с адресом из справочника подтверждается; поддельные идентификаторы и произвольный текст — нет', async () => {
  const h = setup(); await h.login();
  const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const ok = await create(h, { address: { token: house.token } }); assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.addressStatus, 'verified'); assert.match(ok.json.id, /^OUT-[A-Z2-9]{8}$/);
  const fake = { token: 'eyJ2IjoicXdlcnR5IiwiZmlkIjoiMTExMTExMTEtMTExMS0xMTExLTExMTEtMTExMTExMTExMTExIiwibHZsIjo4LCJleHAiOjk5OTk5OTk5OTk5OTl9.AAAA' };
  const f = await create(h, { address: fake }); assert.equal(f.status, 400); assert.match(f.json.error, /списка подсказок/);
  const forged = house.token.split('.')[0] + '.' + 'x'.repeat(43); assert.equal((await create(h, { address: { token: forged } })).status, 400, 'подпись не подходит');
  const city = (await suggest(h, { query: 'краснодар', mode: 'city' })).items[0]; assert.equal((await create(h, { address: { token: city.token } })).status, 400, 'город — не адрес объекта');
  const street = { value: 'г Краснодар, ул Красная', data: STREET.data }; void street;
  h.tick(L.tokenTtl + 1000); assert.equal((await create(h, { address: { token: house.token } })).status, 400, 'просроченная подсказка');
  assert.equal((await create(h, { address: { manual: { text: 'qwerty', city: 'x' } } })).status, 400, 'qwerty не принимается даже как ручной адрес');
  assert.equal((await create(h, { address: { manual: { text: 'qwerty qwerty qwerty', city: 'x' } } })).status, 400, 'латиница без смысла');
  assert.equal((await create(h, { address: { manual: { text: 'аааааааааааа ббббббб', city: 'Краснодар' } } })).status, 400, 'повторяющиеся символы');
  assert.equal((await create(h, {})).status, 400, 'адрес обязателен');
  assert.equal((await create(h, { address: { token: house.token }, consentPd: false })).status, 400, 'нужно согласие');
  h.close();
});
test('адрес, которого нет в справочнике (СНТ), сохраняется со статусом «ждёт проверки», а не «подтверждён»', async () => {
  const h = setup(); await h.login(); const city = (await suggest(h, { query: 'краснодар', mode: 'city' })).items[0];
  const r = await create(h, { address: { cityToken: city.token, manual: { text: 'СНТ Ромашка, участок 12, второй въезд от трассы', lat: 45.1, lon: 39.0 } } });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.addressStatus, 'pending_address_review');
  const mine = await h.call('GET', '/api/projects/' + r.json.id); assert.equal(mine.json.addressStatus, 'pending_address_review'); assert.equal(mine.json.address.source, 'manual'); assert.equal(mine.json.address.cityFiasId, CITY.data.fias_id);
  const plot = (await suggest(h, { query: 'ромашка', mode: 'plot' })).items[0]; const p = await create(h, { title: 'Участок', address: { token: plot.token } }); assert.equal(p.json.addressStatus, 'verified', 'земельный участок (уровень 75) тоже допустим');
  h.close();
});
test('проверка состояния: только артикулы X2, допустимые параметры; сцена и поверхности проверяются', async () => {
  assert.ok(validateState('scene', sceneState()));
  assert.equal(validateState('scene', { ...sceneState(), scene: 'nope' }), null);
  assert.equal(validateState('scene', { ...sceneState(), zones: { terrace: { ...GOOD, code: '600180000076' } } }), null, 'слэб 120×278 — не X2');
  assert.equal(validateState('scene', { ...sceneState(), zones: { terrace: { ...GOOD, mount: 'magic' } } }), null);
  assert.equal(validateState('scene', { ...sceneState(), zones: {} }), null);
  const plot = { w: 800, h: 600, surfaces: [{ id: 's1', label: 'Дорожка', type: 'path', ring: [[10, 10], [700, 20], [650, 500], [30, 480]], holes: [] }], zones: { s1: GOOD }, areas: { s1: 12.34 }, exposure: 1 };
  const v = validateState('plot', plot); assert.ok(v); assert.equal(v.areas.s1, 12.3); assert.equal(v.surfaces[0].mode, 'quad');
  assert.equal(validateState('plot', { ...plot, w: 100 }), null); assert.equal(validateState('plot', { ...plot, surfaces: [{ ...plot.surfaces[0], ring: [[0, 0], [1, 1]] }] }), null, 'контур из двух точек');
  assert.equal(validateState('plot', { ...plot, surfaces: [{ ...plot.surfaces[0], ring: Array.from({ length: 500 }, () => [1, 1]) }] }), null, 'слишком много точек');
  assert.equal(validateState('plot', { ...plot, surfaces: [{ ...plot.surfaces[0], ring: [[10, 10], [99999, 20], [650, 500]] }] }), null, 'точки вне кадра');
  assert.ok(!JSON.stringify(validateState('plot', { ...plot, photo: 'data:image/jpeg;base64,AAAA', phone: '+79181234567' })).includes('base64'), 'лишние поля отбрасываются');
  assert.ok(manualAddressOk('СНТ Ромашка, участок 12') && !manualAddressOk('qwerty') && !manualAddressOk('12345 67890'));
});
test('JPEG: метаданные (EXIF, GPS) удаляются, чужие и повреждённые файлы отклоняются', () => {
  assert.ok(Buffer.from(JPEG).includes('GPSDATA-SECRET'));
  const clean = sanitizeJpeg(JPEG, 1e6); assert.ok(clean); assert.ok(!Buffer.from(clean).includes('GPSDATA-SECRET')); assert.ok(!Buffer.from(clean).includes('Exif')); assert.deepEqual([...clean.slice(0, 2)], [0xff, 0xd8]); assert.ok(clean.length < JPEG.length);
  assert.equal(sanitizeJpeg(Uint8Array.from(Buffer.from('GIF89a' + 'x'.repeat(300))), 1e6), null); assert.equal(sanitizeJpeg(JPEG.slice(0, 300), 1e6), null, 'обрезанный файл'); assert.equal(sanitizeJpeg(JPEG, 100), null, 'больше лимита');
  assert.equal(sanitizeJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 1, 2, 0xff, 0xd9]), 1e6), null, 'нет кадра изображения');
});
test('фото и результат: только владелец, только с согласием, без EXIF, с лимитами; закрытое хранилище', async () => {
  const h = setup(); await h.login(); const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const noPhoto = await create(h, { address: { token: house.token } }); const id = noPhoto.json.id;
  assert.equal((await h.call('PUT', `/api/projects/${id}/photo`, JPEG, { raw: 'image/jpeg' })).status, 403, 'без согласия фото не принимается');
  const withPhoto = await create(h, { id, address: { token: house.token }, photoConsent: true }); assert.equal(withPhoto.status, 200); assert.equal(withPhoto.json.id, id, 'обновление не создаёт новый проект');
  const up = await h.call('PUT', `/api/projects/${id}/photo`, JPEG, { raw: 'image/jpeg' }); assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.ok(!Buffer.from(h.files.get(`${id}.photo.jpg`)).includes('GPSDATA-SECRET'), 'на диск попадает копия без метаданных');
  assert.equal((await h.call('PUT', `/api/projects/${id}/photo`, Uint8Array.from(Buffer.from('not a jpeg'.repeat(40))), { raw: 'image/jpeg' })).status, 400);
  assert.equal((await h.call('PUT', `/api/projects/${id}/photo`, JPEG, { raw: 'image/png' })).status, 415);
  assert.equal((await h.call('PUT', `/api/projects/${id}/result`, JPEG, { raw: 'image/jpeg' })).status, 200);
  const got = await h.call('GET', `/api/projects/${id}/photo`); assert.equal(got.status, 200); assert.equal(got.headers.get('Cache-Control'), 'private, no-store');
  h.resetCookie(); assert.equal((await h.call('GET', `/api/projects/${id}/photo`)).status, 401, 'без входа фото закрыто');
  h.close();
});
test('чужой проект недоступен: ни просмотр, ни правка, ни удаление, ни ссылки, ни фото', async () => {
  const h = setup(); await h.login('+7 918 111-11-11'); const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const a = await create(h, { address: { token: house.token }, photoConsent: true }); const id = a.json.id; await h.call('PUT', `/api/projects/${id}/photo`, JPEG, { raw: 'image/jpeg' });
  h.resetCookie(); h.tick(61_000); await h.login('+7 918 222-22-22');
  assert.equal((await h.call('GET', `/api/projects/${id}`)).status, 404); assert.equal((await h.call('GET', `/api/projects/${id}/photo`)).status, 404); assert.equal((await h.call('DELETE', `/api/projects/${id}`)).status, 404);
  assert.equal((await h.call('POST', `/api/projects/${id}/shares`, { days: 7 })).status, 404); assert.equal((await create(h, { id, address: { token: house.token } })).status, 404);
  assert.equal((await h.call('GET', '/api/projects/me')).json.projects.length, 0);
  assert.equal((await h.call('GET', '/api/projects/OUT-AAAAAAAA')).status, 404, 'выдуманный ID');
  assert.equal((await h.call('GET', '/api/projects/../../etc/passwd')).status, 404);
  h.close();
});
test('ссылка «только просмотр»: длинный случайный токен, без телефона и точного адреса, отзыв и срок действия', async () => {
  const h = setup(); await h.login('+7 918 123-45-67'); const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const c = await create(h, { title: 'Дом у бассейна', address: { token: house.token } }); const id = c.json.id; await h.call('PUT', `/api/projects/${id}/result`, JPEG, { raw: 'image/jpeg' });
  const s = await h.call('POST', `/api/projects/${id}/shares`, { days: 3 }); assert.equal(s.status, 200); assert.match(s.json.token, /^[A-Za-z0-9_-]{43}$/); assert.match(s.json.url, /\/p\/#/); assert.ok(!s.json.url.includes('?'), 'токен — во фрагменте адреса, он не попадает в логи и Referer');
  assert.ok(!JSON.stringify((await h.call('GET', `/api/projects/${id}/shares`)).json).includes(s.json.token), 'в списке токен не показывается');
  h.resetCookie();                                                                           // зритель без входа
  const view = await h.call('POST', '/api/p/open', { token: s.json.token }, { cookies: false }); assert.equal(view.status, 200);
  const text = JSON.stringify(view.json); for (const secret of ['1234567', '918', 'Красная', '45.0355', '38.9753', '1111', 'fias', 'GPSDATA', 'dadata']) assert.ok(!text.includes(secret), `в публичном ответе утечка: ${secret}`);
  assert.equal(view.json.city, 'Краснодар'); assert.equal(view.json.title, 'Дом у бассейна'); assert.equal(view.json.scene, 'modern-pool'); assert.ok(view.json.items.length >= 1); assert.equal(view.headers.get('Cache-Control'), 'private, no-store'); assert.equal(view.headers.get('X-Robots-Tag'), 'noindex'); assert.equal(view.headers.get('Referrer-Policy'), 'no-referrer');
  const img = await h.call('POST', '/api/p/image', { token: s.json.token }, { cookies: false }); assert.equal(img.status, 200); assert.ok(!Buffer.from(img.bytes).includes('GPSDATA-SECRET'));
  assert.equal((await h.call('POST', '/api/p/open', { token: 'a'.repeat(43) }, { cookies: false })).status, 404, 'выдуманный токен'); assert.equal((await h.call('POST', '/api/p/open', { token: s.json.token.slice(0, 20) }, { cookies: false })).status, 404);
  assert.equal((await h.call('POST', '/api/p/open', { token: s.json.token })).status, 200); assert.equal((await h.call('POST', '/api/p/open', { token: s.json.token, extra: 1 })).status, 200);
  assert.equal((await h.call('PUT', `/api/projects/${id}/photo`, JPEG, { raw: 'image/jpeg' }, { cookies: false })).status, 401, 'по ссылке править нельзя');
  assert.equal((await h.call('GET', `/api/projects/${id}`, undefined, { cookies: false })).status, 401);
  // отзыв и срок
  h.tick(61_000); await h.login('+7 918 123-45-67');
  const list = (await h.call('GET', `/api/projects/${id}/shares`)).json.shares; assert.equal(list[0].views >= 2, true);
  assert.equal((await h.call('DELETE', `/api/projects/${id}/shares/${list[0].id}`)).status, 200); assert.equal((await h.call('POST', '/api/p/open', { token: s.json.token }, { cookies: false })).status, 404, 'отозванная ссылка не работает');
  const s2 = await h.call('POST', `/api/projects/${id}/shares`, { days: 1 }); h.tick(2 * 86400e3); assert.equal((await h.call('POST', '/api/p/open', { token: s2.json.token }, { cookies: false })).status, 404, 'срок истёк');
  h.close();
});
test('закрытая карточка менеджера: только по токену, видны телефон и адрес, решение по адресу, история', async () => {
  const h = setup(); await h.login('+7 918 123-45-67'); const city = (await suggest(h, { query: 'краснодар', mode: 'city' })).items[0];
  const c = await create(h, { address: { cityToken: city.token, manual: { text: 'СНТ Ромашка, участок 12, у реки' } } }); const id = c.json.id;
  assert.equal((await h.call('GET', `/api/manager/projects/${id}`, undefined, { cookies: false })).status, 401); assert.equal((await h.call('GET', `/api/manager/projects/${id}`, undefined, { cookies: false, headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await h.call('GET', `/api/manager/projects/${id}`, undefined, { headers: { Authorization: 'Bearer ' + 'm'.repeat(32) } })).status, 200, 'владелец без токена менеджера не пройдёт, менеджер — пройдёт');
  const card = await h.call('GET', `/api/manager/projects/${id}`, undefined, { cookies: false, headers: { Authorization: 'Bearer ' + 'm'.repeat(32) } }); assert.equal(card.status, 200); assert.equal(card.json.phone, '+79181234567'); assert.equal(card.json.addressStatus, 'pending_address_review'); assert.ok(card.json.history.length >= 2);
  const rv = await h.call('POST', `/api/manager/projects/${id}/review`, { status: 'verified', note: 'проверено по кадастровой карте' }, { cookies: false, headers: { Authorization: 'Bearer ' + 'm'.repeat(32) } }); assert.equal(rv.json.status, 'verified_by_manager');
  assert.equal((await h.call('GET', `/api/projects/${id}`)).json.addressStatus, 'verified_by_manager');
  const none = setup({ MANAGER_TOKEN: '' }); assert.equal((await none.call('GET', '/api/manager/projects/OUT-AAAAAAAA', undefined, { cookies: false, headers: { Authorization: 'Bearer ' } })).status, 401, 'пустой токен менеджера не открывает доступ'); none.close();
  h.close();
});
test('одна заявка менеджеру на проект: правки не плодят заявки; в Telegram нет телефона и адреса', async () => {
  const h = setup(); await h.login('+7 918 123-45-67'); const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const c = await create(h, { address: { token: house.token } }); assert.equal(c.json.lead, true); assert.equal(h.telegram.length, 1);
  const msg = h.telegram[0].text; assert.match(msg, new RegExp(c.json.id)); assert.match(msg, /manager\/#OUT-/); assert.match(msg, /610010004089/);
  for (const secret of ['+7918', '9181234567', 'Красная', 'Краснодар', '45.0']) assert.ok(!msg.includes(secret), `в Telegram лишнее: ${secret}`);
  await create(h, { id: c.json.id, title: 'Дача 2', address: { token: house.token } }); assert.equal(h.telegram.length, 1, 'повторной заявки нет');
  h.close();
});
test('удаление проекта владельцем стирает личные данные, фото и ссылки', async () => {
  const h = setup(); await h.login('+7 918 123-45-67'); const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const c = await create(h, { address: { token: house.token }, photoConsent: true }); const id = c.json.id; await h.call('PUT', `/api/projects/${id}/photo`, JPEG, { raw: 'image/jpeg' }); await h.call('PUT', `/api/projects/${id}/result`, JPEG, { raw: 'image/jpeg' });
  const s = await h.call('POST', `/api/projects/${id}/shares`, {}); assert.equal((await h.call('DELETE', `/api/projects/${id}`)).status, 200);
  assert.equal(h.files.size, 0, 'файлы удалены'); assert.equal((await h.call('POST', '/api/p/open', { token: s.json.token }, { cookies: false })).status, 404);
  const row = await h.env.DB.prepare('SELECT phone, title, address_json, state_json FROM outdoor_projects WHERE id = ?').bind(id).first(); assert.deepEqual([row.phone, row.title, row.address_json, row.state_json], ['', '', '{}', '{}']);
  assert.equal((await h.call('GET', '/api/projects/me')).json.projects.length, 0);
  h.close();
});
test('срок хранения: фото старше 180 дней удаляется автоматически', async () => {
  const h = setup(); await h.login('+7 918 123-45-67'); const house = (await suggest(h, { query: 'красная', mode: 'house' })).items[0];
  const c = await create(h, { address: { token: house.token }, photoConsent: true }); await h.call('PUT', `/api/projects/${c.json.id}/photo`, JPEG, { raw: 'image/jpeg' }); assert.equal(h.files.size, 1);
  h.tick(181 * 86400e3); h.resetCookie(); await h.call('GET', '/api/projects/status'); h.tick(0); await h.login('+7 918 123-45-67'); h.tick(11 * 60e3); await h.call('GET', '/api/projects/me'); await new Promise(r => setTimeout(r, 50));
  assert.equal(h.files.has(`${c.json.id}.photo.jpg`), false, 'просроченное фото удалено');
  h.close();
});
