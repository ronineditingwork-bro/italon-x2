// Панель сравнения «Как сейчас / С новыми эффектами» — только в тестовой сборке (SITE_PREVIEW=1). Переключает слой движения на месте, без перезагрузки: позиция прокрутки сохраняется.
const KEY = 'italon-motion-preview';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* приватный режим */ } };

export function mountPanel(api) {
  const q = new URLSearchParams(location.search), saved = read();
  let on = q.get('motion') ? q.get('motion') !== 'off' : saved.on !== false;
  let amp = q.get('amp') ? q.get('amp') === '1' : saved.amp !== false;       // в тестовой сборке показ по умолчанию усилен: на телефоне иначе разницу не разглядеть
  let open = saved.open !== false, info = innerWidth >= 960;
  const el = document.createElement('aside'); el.className = 'motion-panel'; el.setAttribute('aria-label', 'Сравнение эффектов');
  document.body.appendChild(el);

  const note = () => {
    if (api.state().reduced) return 'В системе включено «уменьшить движение», поэтому эффекты отключены — так и должно быть на рабочем сайте.';
    if (!on) return 'Показан сайт без нового слоя движения: так он выглядит сейчас.';
    const desk = matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)').matches;
    const what = desk ? 'плавная прокрутка, сдвиг фото главного экрана, магнитные кнопки, подсветка карточек под курсором' : 'мягкий сдвиг фото главного экрана, появление блоков, отклик на нажатие кнопок и карточек (вспышка света, «пружина»)';
    return `Включено: ${what}.${amp ? ' Показ усилен для наглядности — в рабочей версии движение слабее.' : ' Силы эффектов как в рабочей версии.'}`;
  };
  const apply = () => {
    api.stop(); if (on) api.start({ amp }); write({ on, amp, open });
    render();
  };
  function render() {
    el.classList.toggle('is-closed', !open);
    el.innerHTML = open
      ? `<div class="motion-panel__head"><b>Тестовая версия</b><span>не рабочий сайт</span><button type="button" class="motion-panel__x" data-mp-close aria-label="Свернуть панель">×</button></div>
<div class="motion-panel__seg" role="group" aria-label="Режим"><button type="button" data-mp-mode="off" aria-pressed="${!on}">Как сейчас</button><button type="button" data-mp-mode="on" aria-pressed="${on}">С новыми эффектами</button></div>
<label class="motion-panel__amp"><input type="checkbox" data-mp-amp ${amp ? 'checked' : ''} ${on ? '' : 'disabled'}><span>Усилить для наглядности</span></label>
<button type="button" class="motion-panel__info" data-mp-info aria-expanded="${info}">Что включено?</button>${info ? `<p class="motion-panel__note" role="status">${note()}</p>` : ''}`
      : `<button type="button" class="motion-panel__open" data-mp-open aria-label="Открыть панель сравнения эффектов">Эффекты: ${on ? 'вкл' : 'выкл'}</button>`;
  }
  el.addEventListener('click', e => {
    const m = e.target.closest('[data-mp-mode]'); if (m) { on = m.dataset.mpMode === 'on'; apply(); return; }
    if (e.target.closest('[data-mp-info]')) { info = !info; render(); return; }
    if (e.target.closest('[data-mp-close]')) { open = false; write({ on, amp, open }); render(); }
    if (e.target.closest('[data-mp-open]')) { open = true; write({ on, amp, open }); render(); }
  });
  el.addEventListener('change', e => { if (e.target.matches('[data-mp-amp]')) { amp = e.target.checked; apply(); } });
  apply();
}
