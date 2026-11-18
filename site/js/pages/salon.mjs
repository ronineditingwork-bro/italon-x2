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

// 3D-модель салона: по нажатию открывается на весь экран; Three.js и сама сцена грузятся только тогда, при выходе сцена освобождается.
const sh = document.querySelector('[data-sh-root]'), enter = document.querySelector('[data-sh-start]');
if (sh && enter) {
  const box = sh.querySelector('[data-sh-box]'), loading = sh.querySelector('[data-sh="loading"]'), err = sh.querySelector('[data-sh="err"]');
  const fs = sh.querySelector('[data-sh-fs]'), root = document.documentElement;
  let scene = null, token = 0;
  if (fs && root.requestFullscreen) {
    fs.hidden = false;
    fs.addEventListener('click', () => { (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen()).catch(() => {}); });
    document.addEventListener('fullscreenchange', () => { fs.textContent = document.fullscreenElement ? 'Свернуть' : 'Во весь экран'; });
  }
  enter.addEventListener('click', async () => {
    const mine = ++token;
    loading.hidden = false; err.hidden = true;
    sh.showModal();
    try {
      const { startShowroom } = await import('../../shared/showroom3d.mjs');
      if (mine !== token || !sh.open) return;                                 // успели выйти, пока грузилась сцена
      const canvas = document.createElement('canvas'); canvas.setAttribute('data-sh', 'stage'); canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', 'Интерактивная 3D-модель салона по планировке: камера облетает салон, внутри работают сотрудники и ходят покупатели. Тяните, чтобы вращать, колесо мыши приближает.');
      box.prepend(canvas);
      scene = startShowroom(sh);
      loading.hidden = true;
      if (!scene) canvas.remove();                                            // WebGL недоступен: сообщение уже показано, выйти можно кнопкой
    } catch (error) {
      console.warn('3D-модель салона не загрузилась:', error);
      loading.hidden = true; err.textContent = 'Не удалось загрузить 3D-модель. Проверьте соединение и попробуйте ещё раз.'; err.hidden = false;
    }
  });
  sh.addEventListener('close', () => {
    token++; scene?.dispose(); scene = null; box.querySelector('canvas')?.remove();
    loading.hidden = false; err.hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    enter.focus({ preventScroll: true });
  });
}
