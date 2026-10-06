import { calculateCart } from '../src/catalog.mjs';

const rub = kopecks => (kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

/** Нормализует телефон: оставляет цифры, 10–15 штук; возвращает «+7…» либо null. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 11 && digits[0] === '8') return '+7' + digits.slice(1);
  if (digits.length === 10) return '+7' + digits;
  return '+' + digits;
}

/** Текст заявки для Telegram. Цены и позиции берутся из корзины на сервере, а не от браузера. */
export function leadText(lead, cart) {
  const lines = cart.lines.map((l, i) =>
    `${i + 1}. ${l.product.name}\n   арт. ${l.code} · ${l.packs} ${l.product.orderUnit}` +
    (l.area ? ` · ${l.area} м²` : '') + ` · ${rub(l.totalKopecks)}`);
  return [
    '🧾 Новое КП — Italon Experience',
    `Время: ${new Date(lead.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`,
    `Телефон: ${lead.phone}`,
    lead.customer && `Получатель: ${lead.customer}`,
    lead.project && `Объект: ${lead.project}`,
    lead.note && `Комментарий: ${lead.note}`,
    '', ...lines, '', `Итого с НДС: ${rub(cart.totalKopecks)}`,
  ].filter(x => x !== false && x !== undefined).join('\n').slice(0, 4000);
}

export async function sendTelegram(env, text, pdf, filename, fetchImpl = fetch) {
  const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const api = method => `https://api.telegram.org/bot${token}/${method}`;
  const signal = () => AbortSignal.timeout(15000);
  let response = await fetchImpl(api('sendMessage'), { method: 'POST', signal: signal(),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
  if (!response.ok) throw new Error('telegram sendMessage ' + response.status);
  if (pdf) {
    const form = new FormData();
    form.set('chat_id', chat);
    form.set('document', new Blob([pdf], { type: 'application/pdf' }), filename);
    response = await fetchImpl(api('sendDocument'), { method: 'POST', body: form, signal: signal() });
    if (!response.ok) throw new Error('telegram sendDocument ' + response.status);
  }
  return true;
}

export { clean, calculateCart };
