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

// Форма записи: проверка и письмо через почтовую программу
const form = document.getElementById('salon-form');
if (form) {
  const error = document.getElementById('sf-error');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const bad = !name ? form.elements.name : phone.replace(/\D/g, '').length < 6 ? form.elements.phone : null;
    for (const f of [form.elements.name, form.elements.phone]) f.removeAttribute('aria-invalid');
    if (bad) {
      bad.setAttribute('aria-invalid', 'true');
      error.textContent = bad === form.elements.name ? 'Укажите имя.' : 'Укажите телефон для связи.';
      error.hidden = false;
      bad.focus();
      return;
    }
    error.hidden = true;
    const date = form.elements.date.value ? new Date(`${form.elements.date.value}T12:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }) : '';
    const body = [
      'Здравствуйте! Хочу записаться в салон Italon Experience.',
      '',
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      date ? `Когда удобно прийти: ${date}` : null,
      form.elements.comment.value.trim() ? `Что хочу посмотреть: ${form.elements.comment.value.trim()}` : null,
    ].filter(line => line !== null).join('\n');
    const [address, query] = form.getAttribute('action').split('?');
    location.href = `${address}?${query}&body=${encodeURIComponent(body)}`;
    window.Italon?.toast?.('Открываем почтовую программу с готовым письмом');
  });
}
