// Ретранслятор Telegram Bot API для Cloudflare Workers.
// Нужен, когда сервер сайта не может подключиться к api.telegram.org напрямую.
// Пропускает только отправку сообщений и документов; токен бота в Worker не хранится.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !/^\/bot[^/]+\/(sendMessage|sendDocument)$/.test(url.pathname))
      return new Response('Not found', { status: 404 });
    return fetch('https://api.telegram.org' + url.pathname, { method: 'POST', headers: request.headers, body: request.body });
  },
};
