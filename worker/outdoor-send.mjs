// POST /api/outdoor/send — «Отправить проект менеджеру» из X2 Outdoor Lab. Без регистрации, адреса и SMS: контакт, согласие, картинка результата и спецификация уходят
// в тот же Telegram-бот, что и заявки КП (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Ничего не сохраняется ни в базе, ни в журнале: данные только в чате менеджеров.
import { normalizePhone, sendTelegram, clean } from './quote-lead.mjs';

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MAX_IMAGE = 2_200_000, recent = new Map();
let hourStart = 0, hourCount = 0;

export async function handleOutdoorSend(request, env, url, json) {
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'POST' });
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Запрос отклонён.' }, 403);
  let form; try { form = await request.formData(); } catch { return json({ error: 'Некорректный запрос.' }, 400); }
  if (form.get('consent') !== '1') return json({ error: 'Нужно согласие на передачу данных менеджеру.' }, 400);
  const raw = clean(form.get('contact'), 60), phone = normalizePhone(raw), tg = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(raw) ? '@' + raw.replace(/^@/, '') : '';
  if (!phone && !tg) return json({ error: 'Укажите телефон или имя в Telegram (например, @name), чтобы менеджер мог ответить.' }, 400);
  // Validate the snapshot before charging the rate limiter. Otherwise one bad upload
  // blocks a corrected retry, and the Telegram lead can arrive without the promised image.
  const file = form.get('image');
  if (!file || typeof file !== 'object' || !file.size)
    return json({ error: 'Не удалось получить изображение проекта. Сделайте снимок ещё раз.' }, 400);
  if (file.size > MAX_IMAGE) return json({ error: 'Изображение слишком большое.' }, 400);
  const image = new Uint8Array(await file.arrayBuffer());
  if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff)
    return json({ error: 'Изображение должно быть в формате JPEG.' }, 400);
  const contact = phone || tg, now = Date.now();
  if (now - hourStart > 3600_000) { hourStart = now; hourCount = 0; }
  if (now - (recent.get(contact) || 0) < 20_000 || hourCount >= 60) return json({ error: 'Подождите немного и повторите.' }, 429);
  recent.set(contact, now); hourCount++;
  if (recent.size > 2000) for (const [k, t] of recent) if (now - t > 60_000) recent.delete(k);
  const name = clean(form.get('name'), 80), note = clean(form.get('note'), 500), kind = form.get('kind') === 'plot' ? 'Мой участок (фото клиента)' : 'готовая сцена';
  const spec = String(form.get('spec') ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r/g, '').slice(0, 2800);
  const text = ['🏡 <b>Проект из X2 Outdoor Lab</b>', `Время: ${new Date(now).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`,
    `Контакт: <code>${esc(contact)}</code>`, name ? `Имя: ${esc(name)}` : false, `Источник: ${esc(kind)}`, note ? `Комментарий: ${esc(note)}` : false,
    '', '<b>Спецификация (данные посетителя, площади не проверены):</b>', `<pre>${esc(spec)}</pre>`, 'Картинка результата — следующим сообщением.'].filter(x => x !== false).join('\n').slice(0, 4000);
  try {
    const sent = await sendTelegram(env, text, image, 'italon-x2-outdoor.jpg', env.fetch || fetch, { method: 'sendPhoto', field: 'photo', type: 'image/jpeg' });
    if (!sent) return json({ error: 'Отправка временно недоступна. Позвоните в салон или запросите расчёт через корзину.' }, 503);
    return json({ ok: true });
  } catch (e) { console.error('outdoor_send_error', e.message.replace(/bot[^/]+/, 'bot…').slice(0, 160)); return json({ error: 'Не удалось отправить. Повторите позже или позвоните в салон.' }, 503); }
}
