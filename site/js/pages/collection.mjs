// Страница коллекции: лёгкие фильтры по формату и отделке без перезагрузки.
// Состояние — в адресе (?format=&finish=, history.replaceState); ссылка «Открыть в каталоге» получает те же фильтры.
import { $, $$ } from '../ui.mjs';
import { positions } from '../../shared/format.mjs';

const section = $('[data-collection]');
const panel = $('[data-col-filters]');
if (section && panel && panel.querySelector('[data-filter]')) {
  const items = $$('[data-format]', section);
  const status = $('[data-col-status]', section), empty = $('[data-col-empty]', section), catalogLink = $('[data-col-catalog]', section);
  const baseCatalog = catalogLink?.getAttribute('href') || '';
  const params = new URLSearchParams(location.search);
  const state = { format: params.get('format') || '', finish: params.get('finish') || '' };
  for (const key of Object.keys(state)) if (state[key] && !$(`[data-filter="${key}"][data-value="${CSS.escape(state[key])}"]`, panel)) state[key] = '';
  panel.hidden = false;

  const apply = (scroll = false) => {
    let shown = 0;
    for (const el of items) {
      const on = (!state.format || el.dataset.format === state.format) && (!state.finish || el.dataset.finish === state.finish);
      el.hidden = !on;
      if (on) shown++;
    }
    for (const chip of $$('[data-filter]', panel)) chip.setAttribute('aria-pressed', String(state[chip.dataset.filter] === chip.dataset.value));
    // недоступные сочетания — приглушаем (но не блокируем)
    for (const chip of $$('[data-filter][data-value]:not([data-value=""])', panel)) {
      const other = chip.dataset.filter === 'format' ? 'finish' : 'format';
      const possible = items.some(el => el.dataset[chip.dataset.filter] === chip.dataset.value && (!state[other] || el.dataset[other] === state[other]));
      chip.classList.toggle('is-muted', !possible);
    }
    const filtered = state.format || state.finish;
    status.textContent = filtered ? `Показано: ${positions(shown)} из ${items.length}` : positions(items.length);
    empty.hidden = shown > 0;
    const q = new URLSearchParams();
    if (state.format) q.set('format', state.format);
    if (state.finish) q.set('finish', state.finish);
    try { history.replaceState(history.state, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`); } catch {}
    if (catalogLink) catalogLink.href = baseCatalog + (state.format ? `&format=${encodeURIComponent(state.format)}` : '');
    window.Italon?.reveal?.(section);
    if (scroll) section.scrollIntoView({ block: 'start' });
  };

  panel.addEventListener('click', event => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    state[chip.dataset.filter] = chip.dataset.value;
    apply();
  });
  $('[data-col-reset]', section)?.addEventListener('click', () => { state.format = ''; state.finish = ''; apply(); });
  apply();
}
