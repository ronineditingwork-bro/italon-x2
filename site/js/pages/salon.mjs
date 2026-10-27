// Салон: карта Яндекса по нажатию (до этого — запасная карточка), «сегодня» в часах работы
// (время Краснодара, Europe/Moscow), демонстрационная форма записи → готовое письмо (mailto:), без отправки на сервер.
const map = document.querySelector('[data-map]');
const load = map?.querySelector('[data-map-load]');
if (map && load) {
  load.hidden = false;
  load.addEventListener('click', () => {
    if (map.querySelector('iframe')) return;
    const frame = document.createElement('iframe');
    frame.src = map.dataset.src;
    frame.title = 'Карта: салон Italon Experience, Краснодар, ул. Бабушкина, 248';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    frame.addEventListener('load', () => map.classList.add('is-loaded'), { once: true });
    map.append(frame);
  });
}

// Часы: подсветка сегодняшнего дня и «Сейчас открыто / закрыто»
const hours = document.querySelector('[data-hours]');
const today = document.querySelector('[data-today]');
if (hours && today) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map(p => [p.type, p.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    const row = [...hours.querySelectorAll('[data-days]')].find(r => r.dataset.days.split(',').map(Number).includes(day));
    const m = row?.querySelector('dd')?.textContent.match(/(\d\d):(\d\d)\D+(\d\d):(\d\d)/);
    if (row && m) {
      row.classList.add('is-today');
      const open = +m[1] * 60 + +m[2], close = +m[3] * 60 + +m[4];
      const isOpen = minutes >= open && minutes < close;
      today.textContent = isOpen ? `Сейчас открыто · сегодня до ${m[3]}:${m[4]}` : `Сейчас закрыто · сегодня ${m[1]}:${m[2]} — ${m[3]}:${m[4]}`;
      today.classList.toggle('is-open', isOpen);
      today.hidden = false;
    }
  } catch { /* без Intl — просто таблица часов */ }
}

// Запись в салон: настоящая AJAX-заявка → API → Telegram.
// После успеха показываем подтверждение; не вызываем mailto:.
const form = document.getElementById('salon-form');
if (form) {
  const error = document.getElementById('sf-error');
  const success = document.getElementById('sf-success');
  const submit = document.getElementById('sf-submit');
  const fields = {
    name: document.getElementById('sf-name'),
    phone: document.getElementById('sf-phone'),
    date: document.getElementById('sf-date'),
    comment: document.getElementById('sf-comment'),
    consent: document.getElementById('sf-consent'),
  };
  let busy = false;
  const fail = (message, input) => {
    error.textContent = message; error.hidden = false; success.hidden = true;
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    error.hidden = true; success.hidden = true;
    for (const input of Object.values(fields)) input.removeAttribute('aria-invalid');
    const name = fields.name.value.trim(), phone = fields.phone.value.trim();
    if (name.length < 2) return fail('Укажите имя (не менее двух символов).', fields.name);
    if (phone.replace(/\D/g, '').length < 10) return fail('Укажите действующий номер телефона.', fields.phone);
    if (!fields.consent.checked) return fail('Нужно согласие на передачу контактных данных для записи.', fields.consent);
    const body = {
      name, phone, date: fields.date.value, comment: fields.comment.value.trim(),
      consent: true, website: form.elements.namedItem('website')?.value || '',
    };
    busy = true; submit.disabled = true; submit.textContent = 'Отправляем…';
    try {
      const response = await fetch(form.action, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Сервис записи временно недоступен. Позвоните в салон.');
      form.reset();
      success.textContent = 'Заявка отправлена! Менеджер свяжется с вами и подтвердит время визита.';
      success.hidden = false;
      window.Italon?.toast?.('Заявка в салон отправлена');
    } catch (e) { fail(e.message || 'Не удалось отправить заявку. Попробуйте позже.'); }
    finally { busy = false; submit.disabled = false; submit.textContent = 'Отправить заявку'; }
  });
}
