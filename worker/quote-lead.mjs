import { calculateCart } from '../src/catalog.mjs';
import { quoteDiscount } from '../src/discount.mjs';
import { QUOTE_JOINT_MM } from '../src/grouts.mjs';
import { mapeiMaterials, byNote } from '../src/mapei.mjs';

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
  const mats = mapeiMaterials(cart.lines), cards = [...mats.grout.map(c => ({ ...c, unit: 'уп.' })), ...mats.adhesive.map(c => ({ ...c, unit: 'меш.' }))];
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
    ...(cards.length ? ['', `<b>Затирка и клей Mapei — справочно, в сумму не входит (шов ${QUOTE_JOINT_MM} мм, склад Краснодар на ${mats.date.split('-').reverse().join('.')}):</b>`,
      ...cards.map(c => `• ${code(c.sku)} ${esc(c.title)} — ${c.packs ? `${c.packs} ${c.unit} × ${esc(rub(c.price * 100))}` : 'количество уточнить'}, склад ${c.stock} (к ${esc(c.for.join(', '))})${byNote(c) ? `, подбор ${esc(byNote(c))}` : ''}${c.epoxy ? `\n    или эпоксидная ${code(c.epoxy.sku)} ${esc(c.epoxy.title)} — ${c.epoxy.packs ? `${c.epoxy.packs} уп. × ${esc(rub(c.epoxy.price * 100))}` : 'количество уточнить'}, склад ${c.epoxy.stock}` : ''}`),
      `Итого Mapei: с цементной затиркой ${esc(rub(mats.totalRub * 100))}${mats.totalEpoxyRub !== mats.totalRub ? `, с эпоксидной ${esc(rub(mats.totalEpoxyRub * 100))}` : ''}`, ...(mats.noGrout.length ? [`Затирку подобрать: ${esc(mats.noGrout.join(', '))}`] : []), ...(mats.noAdhesive.length ? [`Клей подобрать: ${esc(mats.noAdhesive.join(', '))}`] : [])] : []),
    '',
    `Для контроля: сумма с НДС ${esc(rub(cart.totalKopecks))}, к оплате со скидкой ${esc(rub(discount.payableKopecks))}.`,
    'PDF коммерческого предложения — следующим сообщением.',
  ].filter(x => x !== false && x !== undefined && x !== 0).join('\n').slice(0, 4000);
}

const FILE_TIMEOUT_MS = 30000, RETRY_PAUSE_MS = 1000;

/**
 * Заявка в Telegram каждому получателю из TELEGRAM_CHAT_ID: текст, затем файл (PDF КП или картинка Outdoor Lab).
 * fileUrl — ссылка на этот же файл на сайте (PDF КП): тогда сервер шлёт Telegram только её, и Telegram скачивает файл сам —
 * загрузка файла с сервера до Telegram не проходит, а короткие запросы проходят. Без fileUrl файл загружается, как раньше.
 * У файла своё время ожидания (30 с) и вторая попытка при обрыве связи или ответе 429/5xx (после истечения времени
 * не повторяем — посетитель ждёт ответа сайта). Если файл так и не ушёл, в тот же чат приходит короткое предупреждение
 * с причиной, а для PDF по ссылке — и сама ссылка: менеджер скачает файл с сайта.
 */
export async function sendTelegram(env, text, pdf, filename, fetchImpl = fetch, media = { method: 'sendDocument', field: 'document', type: 'application/pdf' }, fileUrl = '') {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chats = String(env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!token || !chats.length) return false;
  // TELEGRAM_API_BASE — адрес ретранслятора, если сервер не достаёт до api.telegram.org напрямую.
  const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
  const api = method => `${base}/bot${token}/${method}`;
  const hide = value => token.length < 8 ? String(value) : String(value).split(token).join('***');   // токен бота — ни в журнал, ни в чат
  const message = (chat, body) => fetchImpl(api('sendMessage'), { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: body, parse_mode: 'HTML', disable_web_page_preview: true }) });
  async function upload(chat) {
    for (let attempt = 1; ; attempt++) {
      let reason, retry;
      try {
        let request;
        if (fileUrl) request = { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, [media.field]: fileUrl }) };
        else { const form = new FormData(); form.set('chat_id', chat); form.set(media.field, new Blob([pdf], { type: media.type }), filename); request = { body: form }; }
        const response = await fetchImpl(api(media.method), { method: 'POST', ...request, signal: AbortSignal.timeout(FILE_TIMEOUT_MS) });
        if (response.ok) return;
        reason = `ответ ${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`.trim();
        retry = response.status === 429 || response.status >= 500;
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError';
        reason = timedOut ? `нет ответа за ${FILE_TIMEOUT_MS / 1000} с` : `сбой связи: ${error?.cause?.code || error?.message || error}`;
        retry = !timedOut;
      }
      if (!retry || attempt === 2)
        throw Object.assign(new Error(hide(`telegram ${media.method}${fileUrl ? ' по ссылке' : ''} (pdf ${pdf.length} bytes, попыток: ${attempt}) ${reason}`)), { reason: hide(reason) });
      await new Promise(resolve => setTimeout(resolve, RETRY_PAUSE_MS));
    }
  }
  // Каждому получателю отдельно: сбой у одного не мешает остальным; ошибка, только если не дошло никому.
  const results = await Promise.allSettled(chats.map(async chat => {
    const response = await message(chat, text);
    if (!response.ok) throw new Error(hide('telegram sendMessage ' + response.status + ' ' + (await response.text().catch(() => '')).slice(0, 200)));
    if (!pdf) return;
    try { await upload(chat); } catch (error) {
      const lost = media.method === 'sendDocument'
        ? 'PDF коммерческого предложения к заявке выше. Клиент скачал КП у себя; позиции и суммы — в сообщении выше'
        : 'картинку к заявке выше. Спецификация — в сообщении выше';
      const download = fileUrl ? `\nСкачать PDF с сайта: <a href="${esc(fileUrl)}">${esc(filename)}</a> (ссылка действует сутки).` : '';
      await message(chat, `⚠️ Не удалось отправить ${lost}.\nПричина: ${esc(error.reason || error.message)}.${download}`).catch(() => {});
      throw error;
    }
  }));
  const failed = results.filter(r => r.status === 'rejected');
  failed.forEach(r => console.error('telegram_error', r.reason.message));
  if (failed.length === results.length) throw failed[0].reason;
  return true;
}

export { clean, calculateCart };
