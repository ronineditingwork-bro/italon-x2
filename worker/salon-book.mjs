// Реальная заявка на визит в салон через Telegram. Без почтового клиента и без регистрации.
// Время посещения согласовывается менеджером; API НЕ бронирует конкретный слот.
import { normalizePhone, sendTelegram, clean } from './quote-lead.mjs';

const recent = new Map();
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function handleSalonBook(request, env, url = new URL(request.url)) {
  if (request.method !== 'POST') return reply({ error: 'Метод не поддерживается.' }, 405);
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return reply({ error: 'Обновите страницу и повторите отправку.' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    return reply({ error: 'Некорректный формат заявки.' }, 415);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return reply({ error: 'Некорректные данные заявки.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Некорректные данные заявки.' }, 400);
  if (body.website) return reply({ error: 'Не удалось отправить заявку.' }, 400); // honeypot
  const name = clean(body.name, 80), phone = normalizePhone(body.phone), comment = clean(body.comment, 600);
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (name.length < 2 || !phone) return reply({ error: 'Укажите имя и корректный номер телефона.' }, 400);
  if (body.consent !== true) return reply({ error: 'Нужно согласие на обработку данных для записи в салон.' }, 400);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date))
    return reply({ error: 'Проверьте дату визита.' }, 400);
  const now = Date.now(), key = phone;
  if (now - (recent.get(key) || 0) < 60_000) return reply({ error: 'Заявка уже отправлялась. Подождите минуту.' }, 429);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply({ error: 'Запись сейчас недоступна. Позвоните в салон: +7 918 24 89 248.' }, 503);
  recent.set(key, now);
  if (recent.size > 1000) for (const [k, t] of recent) if (now - t > 120_000) recent.delete(k);
  const lines = [
    '📍 <b>Заявка на визит в салон Italon Experience</b>',
    'Имя: <b>' + escapeHtml(name) + '</b>',
    'Телефон: <code>' + escapeHtml(phone) + '</code>',
    'Предпочтительная дата: ' + (date ? escapeHtml(date.split('-').reverse().join('.')) : 'уточнить'),
    'Что хочет посмотреть: ' + (comment ? escapeHtml(comment) : 'не указано'),
    'Салон: Краснодар, ул. Бабушкина, 248',
    'Важно: дата и время ещё НЕ подтверждены. Связаться с клиентом.',
  ];
  try {
    const sent = await sendTelegram(env, lines.join('\n'), null, '', env.fetch);
    if (!sent) throw new Error('Telegram is not configured');
    return reply({ ok: true });
  } catch (error) {
    console.error('salon_booking_send_error', error.message);
    if (recent.get(key) === now) recent.delete(key);
    return reply({ error: 'Заявка не отправлена. Позвоните в салон: +7 918 24 89 248.' }, 503);
  }
}
