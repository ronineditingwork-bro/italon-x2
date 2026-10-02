import { products, priceInfo, sections, calculateCart } from '../src/catalog.mjs';
import { cartStore } from './cart-store.mjs';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
export async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/catalog' && request.method === 'GET') return json({ products, priceInfo, sections });
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
