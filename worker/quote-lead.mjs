import { calculateCart } from '../src/catalog.mjs';
import { quoteDiscount } from '../src/discount.mjs';

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
  const discount = quoteDiscount(lead, cart.totalKopecks);
  const lines = cart.lines.map((l, i) =>
    `${i + 1}. ${l.product.name}\n   арт. ${l.code} · ${l.packs} ${l.product.orderUnit}` +
    (l.area ? ` · ${l.area} м²` : '') + ` · ${rub(l.totalKopecks)}`);
  return [
    '🧾 Новое КП — Italon Experience',
    `Время: ${new Date(lead.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`,
    `Телефон: ${lead.phone}`,
    lead.customer && `ФИО: ${lead.customer}`,
    lead.address && `Адрес объекта: ${lead.address}`,
    lead.project && `Объект: ${lead.project}`,
    lead.note && `Комментарий: ${lead.note}`,
    '', ...lines, '', `Сумма с НДС: ${rub(cart.totalKopecks)}`,
    discount.percent && `Скидка ${discount.percent}% (${discount.parts.map(r => r.label).join(', ')}): −${rub(discount.discountKopecks)}`,
    `К оплате: ${rub(discount.payableKopecks)}`,
  ].filter(x => x !== false && x !== undefined).join('\n').slice(0, 4000);
}

export async function sendTelegram(env, text, pdf, filename, fetchImpl = fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chats = String(env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!token || !chats.length) return false;
  // TELEGRAM_API_BASE — адрес ретранслятора, если сервер не достаёт до api.telegram.org напрямую.
  const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
  const api = method => `${base}/bot${token}/${method}`;
  const signal = () => AbortSignal.timeout(15000);
  // Каждому получателю отдельно: сбой у одного не мешает остальным; ошибка, только если не дошло никому.
  const results = await Promise.allSettled(chats.map(async chat => {
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
  }));
  const failed = results.filter(r => r.status === 'rejected');
  failed.forEach(r => console.error('telegram_error', r.reason.message));
  if (failed.length === results.length) throw failed[0].reason;
  return true;
}

export { clean, calculateCart };
