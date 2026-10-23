// Окно «Все материалы»: поиск по всему каталогу, фильтры (коллекция, цвет, фактура, формат), сортировка, карточки с ленивой загрузкой фото.
// Данные не хранятся здесь: loader.catalog() отдаёт записи из каталога сайта, loader.features() — признаки подбора для цвета и фактуры.
import { esc } from '../format.mjs';
import { search, filterEntries, facetsOf, sortEntries } from './catalog.mjs';
import { plural } from '../format.mjs';

const PAGE = 48;
const $ = (r, s) => r.querySelector(s);

export function createCatalogUI(root, { loader, featuredCodes = [], onPick, getCurrent = () => null, getSecond = () => null }) {
  const el = $(root, '[data-cat]'), grid = $(el, '[data-cat-grid]'), qInput = $(el, '[data-cat-q]'), count = $(el, '[data-cat-count]'), more = $(el, '[data-cat-more]'), resetBtn = $(el, '[data-f-reset]');
  const sel = k => $(el, `[data-f="${k}"]`), sortSel = $(el, '[data-sort]');
  let data = null, attrs = null, facets = null, scope = null, mode = 'main', shown = PAGE, results = [], extra = 0, timer = 0, opener = null, loading = null, token = 0;
  const filters = { collection: '', color: '', look: '', format: '' };

  async function ensure() {
    if (data) return data;
    loading ||= (async () => {
      count.textContent = 'Загружаю каталог…';
      try { data = await loader.catalog(); } catch (e) { count.textContent = 'Не удалось загрузить каталог: ' + e.message; loading = null; throw e; }
      refacet(); render();
      loader.features().then(a => { attrs = a; refacet(); render(); }).catch(() => { for (const k of ['color', 'look']) { const s = sel(k); s.disabled = true; s.closest('label').title = 'Признаки цвета и фактуры недоступны'; } });
      return data;
    })();
    return loading;
  }
  const inScope = e => !scope?.format || e.formatKey === scope.format;
  const scoped = () => (scope?.format ? data.eligible.filter(inScope) : data.eligible);
  function refacet() { facets = facetsOf(scope?.format ? data.entries.filter(inScope) : data.entries, attrs || new Map()); fillSelects(); const fl = sel('format').closest('label'); fl.hidden = !!scope?.format; }
  function fillSelects() {
    const fill = (k, items, label) => { const s = sel(k), cur = s.value; s.replaceChildren(new Option('Все', '')); for (const it of items) s.append(new Option(`${label ? label(it) : it.label} · ${it.n}`, it.id)); s.value = [...s.options].some(o => o.value === cur) ? cur : ''; };
    fill('collection', facets.collections); fill('format', facets.formats); fill('color', facets.colors); fill('look', facets.looks);
    for (const k of ['color', 'look']) sel(k).disabled = !attrs;
  }
  const anyFilter = () => Object.values(filters).some(Boolean);
  function compute() {
    const q = qInput.value.trim(), t0 = performance.now(); let list, extraN = 0;
    if (q) {
      const found = search(data.index, q, { limit: 600 }).filter(inScope), ok = found.filter(e => e.eligible), no = found.filter(e => !e.eligible);
      const f = filterEntries(ok, filters, attrs || new Map());
      list = anyFilter() ? f : [...f, ...no]; extraN = anyFilter() ? 0 : no.length;
      list = sortBySearch(list, found);
    } else {
      list = sortEntries(filterEntries(scoped(), filters, attrs || new Map()), sortSel.value, scope?.order || featuredCodes);
    }
    root.dataset.searchMs = (performance.now() - t0).toFixed(2);
    return { list, extraN, q };
  }
  const sortBySearch = (list, found) => { if (sortSel.value === 'popular') return list; const how = sortSel.value; return how === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru')) : [...list].sort((a, b) => a.code.localeCompare(b.code)); };
  function render(reset = true) {
    if (!data) return;
    if (reset) { shown = PAGE; grid.scrollTop = 0; el.querySelector('.lab-cat__box').scrollTop = 0; }
    const { list, extraN, q } = compute(); results = list; extra = extraN;
    const n = list.filter(e => e.eligible).length;
    count.textContent = `Найдено ${n} ${plural(n, ['товар', 'товара', 'товаров'])}${extraN ? ` · ещё ${extraN} без фото для лаборатории` : ''}${q || anyFilter() ? '' : ` из ${scoped().length} доступных для лаборатории`}`;
    resetBtn.hidden = !anyFilter() && !q;
    paint();
  }
  function paint() {
    const cur = getCurrent()?.code, sec = getSecond()?.code, cmp = mode === 'second';
    const slice = results.slice(0, shown);
    grid.innerHTML = slice.map(e => e.eligible
      ? `<button type="button" class="lab-card${e.code === (cmp ? sec : cur) ? ' is-current' : ''}" data-pick="${esc(e.code)}"><span class="lab-card__img"><img src="${esc(e.image)}" alt="" loading="lazy" decoding="async" width="160" height="160" draggable="false">${e.quality === 'hd' ? '<em>Полная симуляция</em>' : '<em class="is-lite">Упрощённо</em>'}</span><b>${esc(e.name)}</b><small>${esc(e.collection)} · ${esc(e.format)}</small><small>арт. ${esc(e.code)}</small></button>`
      : `<a class="lab-card is-off" href="${esc(e.href)}" target="_blank" rel="noopener"><span class="lab-card__img"><img src="${esc(e.image || '')}" alt="" loading="lazy" decoding="async" width="160" height="160" ${e.image ? '' : 'hidden'}><em class="is-off">Нет в лаборатории</em></span><b>${esc(e.name)}</b><small>${esc(e.reason)}</small><small>арт. ${esc(e.code)}</small></a>`).join('');
    more.hidden = results.length <= shown;
    if (!results.length) grid.innerHTML = `<p class="lab-cat__empty">${scoped().length ? 'Ничего не найдено. Измените запрос или сбросьте фильтры.' : 'В каталоге нет позиций для лаборатории.'}</p>`;
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => render(), 120); };
  qInput.addEventListener('input', schedule);
  el.addEventListener('change', e => { const f = e.target.dataset?.f; if (f) { filters[f] = e.target.value; render(); } else if (e.target === sortSel) render(); });
  resetBtn.addEventListener('click', () => { for (const k of Object.keys(filters)) { filters[k] = ''; sel(k).value = ''; } qInput.value = ''; render(); qInput.focus({ preventScroll: true }); });
  more.addEventListener('click', () => { shown += PAGE; paint(); });
  grid.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; const code = b.dataset.pick, entry = data.byCode.get(code); if (entry) { close(); onPick(entry, mode); } });
  $(el, '[data-cat-close]').addEventListener('click', () => close());
  el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); e.stopPropagation(); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button:not([hidden]):not(:disabled), input, select:not(:disabled), a[href]')].filter(x => x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  });
  function open(m = 'main', from, sc = null) {
    mode = m; opener = from || document.activeElement; el.hidden = false; root.classList.add('has-cat'); const changed = (scope?.format || '') !== (sc?.format || ''); scope = sc; el.dataset.scope = sc?.format ? 'slabs' : '';
    if (changed) { for (const k of Object.keys(filters)) { filters[k] = ''; sel(k).value = ''; } qInput.value = ''; }
    $(el, '[data-cat-title]').textContent = m === 'second' ? 'Второй материал для сравнения' : (sc?.title || 'Каталог материалов');
    $(el, '[data-cat-sub]').textContent = m === 'second' ? (sc?.format ? 'Выберите любой слэб — он появится справа от линии' : 'Выберите любую позицию каталога — она появится справа от линии') : (sc?.sub || 'Фильтры и поиск по всему каталогу Italon-X2');
    ensure().then(() => { refacet(); render(false); }).catch(() => {});
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => qInput.focus({ preventScroll: true }), 30);
    if (data) { refacet(); render(false); }
  }
  function close() { if (el.hidden) return; el.hidden = true; root.classList.remove('has-cat'); try { opener?.focus?.({ preventScroll: true }); } catch {} }
  return { open, close, ensure, get isOpen() { return !el.hidden; }, get data() { return data; }, get attrs() { return attrs; }, setQuery(q) { qInput.value = q; return ensure().then(() => render()); }, results: () => results };
}
