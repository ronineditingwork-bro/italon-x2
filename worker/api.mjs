import { products, priceInfo, sections, calculateCart } from '../src/catalog.mjs';
import { cartStore } from './cart-store.mjs';
import { normalizePhone, leadText, sendTelegram, clean } from './quote-lead.mjs';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
export async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/catalog' && request.method === 'GET') return json({ products, priceInfo, sections });
  if (url.pathname === '/api/quote') return handleQuote(request, env, url);
  if (url.pathname !== '/api/cart') return json({ error: 'Адрес не найден.' }, 404);
  if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'GET, PUT' });
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Запрос отклонён.' }, 403);
  if (request.method === 'PUT' && (request.headers.get('Origin') !== url.origin ||
      !request.headers.get('Content-Type')?.startsWith('application/json')))
    return json({ error: 'Обновите страницу и повторите действие.' }, 403);
  const secure = url.protocol === 'https:';
  const cookieName = secure ? '__Host-italon_cart' : 'italon_cart_preview';
  const cookies = (request.headers.get('Cookie') || '').split(';').map(x => x.trim());
  let token = cookies.find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const fresh = !/^[a-f0-9]{64}$/.test(token || '');
  if (fresh && request.method === 'PUT') return json({ error: 'Откройте корзину, чтобы продолжить.' }, 401);
  if (fresh) token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const id = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
  const headers = { 'Set-Cookie': `${cookieName}=${token}; Path=/; Max-Age=7776000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}` };
  try {
    const store = cartStore(env);
    let row = await store.load(id);
    if (!row) row = await store.create(id);
    if (request.method === 'PUT') {
      if (Number(request.headers.get('Content-Length')) > 20000) return json({ error: 'Слишком большая корзина.' }, 413);
      const bodyText = await request.text();
      if (bodyText.length > 20000) return json({ error: 'Слишком большая корзина.' }, 413);
      let body;
      try {
        body = JSON.parse(bodyText);
        if (!Number.isSafeInteger(body.version) || body.version < 0) throw new Error('Некорректная версия корзины.');
        calculateCart(body.items);
      } catch (e) { return json({ error: e.message || 'Проверьте количество товаров.' }, 400); }
      const items = body.items.map(({ code, packs }) => ({ code, packs }));
      if (!await store.replace(id, items, body.version)) {
        row = await store.load(id);
        return json({ error: 'Корзина изменилась в другой вкладке. Показана актуальная версия; повторите действие.', cart: { ...calculateCart(JSON.parse(row.items)), version: row.version } }, 409, headers);
      }
      row = { items: JSON.stringify(items), version: body.version + 1 };
    }
    return json({ ...calculateCart(JSON.parse(row.items)), version: row.version }, 200, headers);
  } catch (e) {
    console.error('cart_storage_error', e.message);
    return json({ error: 'Корзина временно недоступна. Попробуйте ещё раз: выбранные товары останутся на экране.' }, 503);
  }
}

const rateLimit = new Map();
async function handleQuote(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'POST' });
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return json({ error: 'Запрос отклонён.' }, 403);
  const cookieName = url.protocol === 'https:' ? '__Host-italon_cart' : 'italon_cart_preview';
  const token = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!/^[a-f0-9]{64}$/.test(token || '')) return json({ error: 'Откройте корзину, чтобы продолжить.' }, 401);
  const id = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
  const now = Date.now();
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Некорректный запрос.' }, 400); }
  const phone = normalizePhone(form.get('phone'));
  if (!phone) return json({ error: 'Укажите телефон для связи.' }, 400);
  if (now - (rateLimit.get(id) || 0) < 5000) return json({ error: 'Подождите несколько секунд и повторите.' }, 429);
  rateLimit.set(id, now);
  if (rateLimit.size > 5000) for (const [k, t] of rateLimit) if (now - t > 60000) rateLimit.delete(k);
  const file = form.get('pdf');
  let pdf = null;
  if (file && typeof file === 'object' && file.size) {
    pdf = new Uint8Array(await file.arrayBuffer());
    if (pdf.length > 2_500_000 || String.fromCharCode(...pdf.slice(0, 4)) !== '%PDF') return json({ error: 'Некорректный PDF.' }, 400);
  }
  try {
    const row = await cartStore(env).load(id);
    const cart = calculateCart(JSON.parse(row?.items || '[]'));
    if (!cart.lines.length) return json({ error: 'Корзина пуста.' }, 400);
    console.log('quote_received', 'pdf_bytes=' + (pdf ? pdf.length : 0));
    const lead = { createdAt: now, phone, customer: clean(form.get('customer'), 100), project: clean(form.get('project'), 150), address: clean(form.get('address'), 200), note: clean(form.get('note'), 500) };
    const items = JSON.stringify(cart.lines.map(({ code, packs, totalKopecks }) => ({ code, packs, totalKopecks })));
    const saved = await env.DB.prepare('INSERT INTO quotes (created_at, customer, phone, project, note, items, total_kopecks) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(now, lead.customer, phone, lead.project, lead.note, items, cart.totalKopecks).run();
    let sent = false;
    try { sent = await sendTelegram(env, leadText(lead, cart), pdf, clean(form.get('filename'), 80).replace(/[^\w.\-]/g, '_') || 'KP-Italon-Experience.pdf', env.fetch); }
    catch (e) { console.error('telegram_error', e.message); }
    if (sent) await env.DB.prepare('UPDATE quotes SET telegram_ok = 1 WHERE created_at = ? AND phone = ?').bind(now, phone).run();
    return json({ ok: true, sent, saved: saved.meta.changes === 1 });
  } catch (e) {
    console.error('quote_error', e.message);
    return json({ error: 'Не удалось сохранить заявку.' }, 503);
  }
}
