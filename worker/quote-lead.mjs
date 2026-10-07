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

const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const qty = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 }).replace(/\u00a0|\u202f/g, ' ');

/**
 * Текст заявки для Telegram в порядке полей формы DAS (полуавтомат: менеджер вносит заявку в DAS).
 * Формат HTML: значения в <code> копируются нажатием. Цены DAS подставляет сам, поэтому здесь они только для контроля.
 * Позиции и суммы берутся из корзины на сервере, а не от браузера.
 */
export function leadText(lead, cart) {
  const discount = quoteDiscount(lead, cart.totalKopecks);
  const missing = [];
  if (!lead.customer) missing.push('ФИО / название объекта');
  if (!lead.address) missing.push('адрес');
  const objectName = [lead.project, lead.customer].filter(Boolean).join(' / ');
  const comment = [lead.note, `Тел. ${lead.phone}`].filter(Boolean).join('. ');
  const reason = discount.parts.map(r => `${r.label} ${r.percent}%`).join(' + ');
  const code = value => `<code>${esc(value)}</code>`;
  const lines = cart.lines.map((l, i) => `${i + 1}. ${code(l.code)} — ${esc(qty(l.quantity))} ${esc(l.product.unit)}\n    ${esc(l.product.name)}`);
  return [
    '🧾 <b>Новая заявка с сайта — Italon Experience</b>',
    `Время: ${new Date(lead.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`,
    `Телефон клиента: ${code(lead.phone)}`,
    '',
    '<b>Для DAS (Новая заявка):</b>',
    `• Скидка для конечного покупателя: <b>${discount.percent}%</b>${reason ? ` (${esc(reason)})` : ''}`,
    '• Интернет заказ: да',
    `• Название объекта / ФИО заказчика: ${objectName ? code(objectName) : '— не указано'}`,
    `• Адрес объекта: ${lead.address ? code(lead.address) : '— не указан'}`,
    `• Комментарий: ${code(comment)}`,
    missing.length && `⚠️ Для DAS не хватает: ${esc(missing.join(', '))}. Уточните у клиента по телефону.`,
    '',
    '<b>Артикулы (количество):</b>', ...lines,
    '',
    `Для контроля: сумма с НДС ${esc(rub(cart.totalKopecks))}, к оплате со скидкой ${esc(rub(discount.payableKopecks))}.`,
    'PDF коммерческого предложения — следующим сообщением.',
  ].filter(x => x !== false && x !== undefined && x !== 0).join('\n').slice(0, 4000);
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
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }) });
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
