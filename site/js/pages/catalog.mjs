// Каталог: поиск и фильтры на клиенте по public/data/catalog.json. Состояние — в адресе (?q=&section=…),
// поэтому ссылки вида catalog/?category=mosaic открывают каталог с предустановленным фильтром.
// Каркас этапа A; этап B: мобильная панель фильтров, фильтр цены, сортировка.
import { loadCatalog } from '../shop.mjs';
import { $, rootRel } from '../ui.mjs';
import { productCard, fmt, normalize, lower, plural, number } from '../../shared/format.mjs';

const PAGE = 24;
const form = $('#catalog-filters'), grid = $('#catalog-grid'), count = $('#catalog-count'), pager = $('#catalog-pages');
const keys = ['q', 'section', 'category', 'collection', 'format', 'finish'];
let catalog, page = 1;

const setOptions = (select, values, keep) => {
  const current = keep ?? select.value;
  select.innerHTML = `<option value="">Все</option>` + values.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  select.value = values.some(([v]) => v === current) ? current : '';
};
function state() { return Object.fromEntries(keys.map(k => [k, form.elements[k].value.trim()])); }
function sync() {
  const s = state(), params = new URLSearchParams();
  for (const k of keys) if (s[k]) params.set(k, s[k]);
  if (page > 1) params.set('page', page);
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}
function refreshOptions() {
  const s = state();
  const base = catalog.products.filter(p => !s.section || p.section === s.section);
  setOptions(form.elements.category, catalog.categories.filter(c => base.some(p => p.category === c.id)).map(c => [c.id, c.label]));
  setOptions(form.elements.collection, catalog.collections.filter(c => !s.section || c.section === s.section).map(c => [c.id, c.label]));
  const scoped = base.filter(p => (!s.collection || p.collectionId === s.collection) && (!s.category || p.category === s.category));
  setOptions(form.elements.format, [...new Set(scoped.map(p => p.format).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })).map(f => [f, fmt(f)]));
  setOptions(form.elements.finish, [...new Set(scoped.map(p => p.finish).filter(Boolean))].sort().map(f => [f, lower(f)]));
}
function render() {
  const s = state(), tokens = normalize(s.q).split(' ').filter(Boolean);
  const found = catalog.products.filter(p => (!s.section || p.section === s.section) && (!s.category || p.category === s.category)
    && (!s.collection || p.collectionId === s.collection) && (!s.format || p.format === s.format) && (!s.finish || p.finish === s.finish)
    && tokens.every(t => normalize(`${p.name} ${p.latin} ${p.code} ${p.collection} ${p.format} ${p.finish}`).includes(t)));
  const pages = Math.max(1, Math.ceil(found.length / PAGE));
  page = Math.min(Math.max(1, page), pages);
  const groups = new Map();
  for (const p of catalog.products) groups.set(p.variantKey, (groups.get(p.variantKey) || new Set()).add(p.finish));
  count.textContent = `Найдено: ${number(found.length, 0)} ${plural(found.length, ['позиция', 'позиции', 'позиций'])}`;
  grid.innerHTML = found.slice((page - 1) * PAGE, page * PAGE).map(p => productCard(p, rootRel, { variants: groups.get(p.variantKey)?.size || 1 })).join('')
    || `<div class="empty-state" style="grid-column:1/-1"><strong>Ничего не найдено</strong><p>Измените запрос или условия фильтра — например, уберите формат или отделку.</p><button type="button" class="btn btn--outline" data-catalog-reset>Сбросить фильтры</button></div>`;
  pager.innerHTML = found.length > PAGE ? `<button type="button" data-page="${page - 1}"${page === 1 ? ' disabled' : ''}>Назад</button><span>Страница ${page} из ${pages}</span><button type="button" data-page="${page + 1}"${page === pages ? ' disabled' : ''}>Далее</button>` : '';
  document.dispatchEvent(new CustomEvent('italon:cart-refresh'));
  sync();
}
function reset() { for (const k of keys) form.elements[k].value = ''; page = 1; refreshOptions(); render(); }

loadCatalog().then(c => {
  catalog = c;
  const params = new URLSearchParams(location.search);
  form.elements.q.value = params.get('q') || '';
  form.elements.section.value = params.get('section') || '';
  refreshOptions();
  for (const k of ['category', 'collection', 'format', 'finish']) {
    form.elements[k].value = params.get(k) || '';
    refreshOptions();
  }
  page = Number(params.get('page')) || 1;
  form.hidden = false;
  render();
  let timer;
  form.addEventListener('input', event => { if (event.target.name !== 'q') return; clearTimeout(timer); timer = setTimeout(() => { page = 1; render(); }, 150); });
  form.addEventListener('change', event => { if (event.target.name === 'q') return; page = 1; refreshOptions(); render(); });
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('reset', event => { event.preventDefault(); reset(); });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-catalog-reset]')) { reset(); return; }
    const button = event.target.closest('#catalog-pages [data-page]');
    if (button) { page = Number(button.dataset.page); render(); grid.scrollIntoView({ block: 'start' }); }
  });
}).catch(() => { count.textContent = 'Поиск временно недоступен: показаны первые позиции. Обновите страницу.'; });
