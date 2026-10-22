// Ретранслятор Telegram Bot API для Cloudflare Workers.
// Нужен, когда сервер сайта не может подключиться к api.telegram.org напрямую.
// Пропускает только отправку сообщений и документов; токен бота в Worker не хранится.
// Если в Worker задана переменная RELAY_KEY, запросы без заголовка X-Relay-Key с тем же значением отклоняются (сервер сайта
// отправляет его из TELEGRAM_RELAY_KEY): так ретранслятором не воспользуются посторонние. Без RELAY_KEY работает как прежде.
// ВАЖНО для 152-ФЗ: через этот Worker проходят телефоны и ФИО клиентов. Не включайте в Cloudflare «Workers Logs/Logpush»
// и не добавляйте console.log с телом запроса: тело не должно сохраняться (см. ops/legal/pd-audit.md).
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !/^\/bot[^/]+\/(sendMessage|sendDocument)$/.test(url.pathname))
      return new Response('Not found', { status: 404 });
    if (env.RELAY_KEY && request.headers.get('X-Relay-Key') !== env.RELAY_KEY) return new Response('Forbidden', { status: 403 });
    const headers = new Headers(request.headers); headers.delete('X-Relay-Key');
    return fetch('https://api.telegram.org' + url.pathname, { method: 'POST', headers, body: request.body });
  },
};
