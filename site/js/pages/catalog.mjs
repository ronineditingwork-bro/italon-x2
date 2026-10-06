// Каталог: поиск, фильтры, сортировка и «Показать ещё» на клиенте по public/data/catalog.json.
// Состояние — в адресе, поэтому ссылки вида catalog/?category=mosaic открывают каталог с фильтром:
//   ?q=<строка>&section=italon|x2&category=<id>&collection=<id>&finish=<отделка>&format=<формат>
//   &price_from=<₽>&price_to=<₽>&sort=price-asc|price-desc|name&page=<сколько порций показано>
// category, collection, finish и format можно повторять (несколько значений — «или»).
// finish — поверхность («люкс», «натуральный»…); старое значение из прайса («ЛЮКС И РЕТТИФИЦИРОВАННАЯ») тоже понимается.
// На ≤1023 px фильтры — панель-шторка (кнопка «Фильтры», фокус-ловушка, Esc, «Показать N позиций»).
import { loadCatalog } from '../shop.mjs';
import { $, $$, reducedMotion } from '../ui.mjs';
import { productCard, normalize, lower, number, plural, positions, esc, CLOSE } from '../../shared/format.mjs';

const PAGE = 24;
const LIMIT = 8;            // сколько вариантов показывать в длинных списках до «Показать все»
const MULTI = ['category', 'collection', 'finish', 'format'];
const SCROLL_KEY = 'italon-catalog-scroll';
const html = document.documentElement;

const layout = $('#catalog'), form = $('#catalog-filters'), grid = $('#catalog-grid'), count = $('#catalog-count');
const chipsBox = $('#catalog-chips'), more = $('#catalog-more'), aside = $('#catalog-aside'), backdrop = $('.catalog__backdrop');
const openButton = $('#catalog-filters-open'), applyButton = $('#catalog-apply');
const mobile = window.matchMedia ? window.matchMedia('(max-width: 63.99rem)') : { matches: false, addEventListener() {} };

let catalog, items = [], results = [], shown = 0, variantCount = new Map();
let state = blank();
const facets = {};          // id → { options: Map(value → {el, input, n}), groups }
const expanded = { collection: false, format: false };

function blank() { return { q: '', section: '', category: [], collection: [], finish: [], format: [], from: null, to: null, sort: '', page: 1 }; }

// ---------------------------------------------------------------- подписи
const cap = s => s.replace(/^./u, c => c.toLocaleUpperCase('ru-RU'));
const surfacesOf = finish => lower(finish).split(/\s+и\s+/).filter(f => f && !f.startsWith('реттиф')).map(f => f.replace(/ая$/, 'ый'));
// «МОЗАИКА 31.5X29.7» → «Мозаика 31,5 × 29,7» (без замены «Х» внутри слов, как в «ПАВЛИНИЙ ХВОСТ»)
const formatLabel = f => cap(lower(String(f).replace(/(\d)\s*[XХ]\s*(\d)/g, '$1 × $2').replace(/(\d)\.(\d)/g, '$1,$2')));
const isPlate = f => /^\d/.test(f);
const area = f => (f.match(/[\d.]+/g) || []).slice(0, 2).reduce((a, b) => a * Number(b), 1);
const SECTION_LABEL = { '': 'Italon и X2', italon: 'Italon · интерьер', x2: 'X2 · улица' };
const rub = v => `${number(v, 0)} ₽`;

// ---------------------------------------------------------------- адрес ↔ состояние
function fromParams(search) {
  const params = new URLSearchParams(search), s = blank();
  s.q = (params.get('q') || '').trim().slice(0, 100);
  s.section = ['italon', 'x2'].includes(params.get('section')) ? params.get('section') : '';
  for (const k of MULTI) s[k] = [...new Set(params.getAll(k).filter(Boolean))];
  // старый формат отделки — строка из прайса; переводим в поверхности
  s.finish = [...new Set(s.finish.flatMap(f => /[А-ЯЁ]/.test(f) ? surfacesOf(f) : [f]))];
  const price = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
  s.from = price(params.get('price_from')); s.to = price(params.get('price_to'));
  if (s.from != null && s.to != null && s.from > s.to) [s.from, s.to] = [s.to, s.from];
  s.sort = ['price-asc', 'price-desc', 'name'].includes(params.get('sort')) ? params.get('sort') : '';
  s.page = Math.min(50, Math.max(1, Math.floor(Number(params.get('page'))) || 1));
  return s;
}
function toParams(s, { withPage = true } = {}) {
  const params = new URLSearchParams();
  if (s.q) params.set('q', s.q);
  if (s.section) params.set('section', s.section);
  for (const k of MULTI) for (const v of s[k]) params.append(k, v);
  if (s.from != null) params.set('price_from', s.from);
  if (s.to != null) params.set('price_to', s.to);
  if (s.sort) params.set('sort', s.sort);
  if (withPage && s.page > 1) params.set('page', s.page);
  return params;
}
function syncUrl() {
  const params = toParams(state).toString();
  try { history.replaceState(history.state, '', `${location.pathname}${params ? `?${params}` : ''}`); } catch {}
}

// ---------------------------------------------------------------- отбор
let tokens = [];
function match(it, s, skip) {
  const p = it.p;
  if (skip !== 'section' && s.section && p.section !== s.section) return false;
  if (skip !== 'category' && s.category.length && !s.category.includes(p.category)) return false;
  if (skip !== 'collection' && s.collection.length && !s.collection.includes(p.collectionId)) return false;
  if (skip !== 'finish' && s.finish.length && !it.surfaces.some(f => s.finish.includes(f))) return false;
  if (skip !== 'format' && s.format.length && !s.format.includes(p.format)) return false;
  if (skip !== 'price' && ((s.from != null && it.price < s.from) || (s.to != null && it.price > s.to))) return false;
  return !tokens.length || tokens.every(t => it.text.includes(t));
}
const filtered = (s, skip) => { tokens = normalize(s.q).split(' ').filter(Boolean); return items.filter(it => match(it, s, skip)); };
function sorted(list, sort) {
  if (!sort) return list;
  const out = list.slice();
  if (sort === 'price-asc') out.sort((a, b) => a.price - b.price || a.i - b.i);
  else if (sort === 'price-desc') out.sort((a, b) => b.price - a.price || a.i - b.i);
  else out.sort((a, b) => a.p.name.localeCompare(b.p.name, 'ru', { numeric: true }) || a.i - b.i);
  return out;
}

// ---------------------------------------------------------------- фильтры (строятся один раз; дальше — только счётчики)
function option(type, name, value, label) {
  const el = document.createElement('label');
  el.className = 'facet__option';
  el.innerHTML = `<input type="${type}" name="${name}" value="${esc(value)}"><span class="facet__label">${esc(label)}</span><span class="facet__n"></span>`;
  return el;
}
function buildFacets() {
  const values = {
    section: [['', 'Все разделы'], ['italon', SECTION_LABEL.italon], ['x2', SECTION_LABEL.x2]],
    category: catalog.categories.filter(c => items.some(it => it.p.category === c.id)).map(c => [c.id, c.label]),
    collection: catalog.collections.map(c => [c.id, c.label, c.section]),
    finish: [...items.flatMap(it => it.surfaces).reduce((m, f) => m.set(f, (m.get(f) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).map(([f]) => [f, cap(f)]),
    format: [...new Set(items.map(it => it.p.format).filter(Boolean))]
      .sort((a, b) => (isPlate(b) - isPlate(a)) || (isPlate(a) ? area(b) - area(a) : a.localeCompare(b, 'ru', { numeric: true })))
      .map(f => [f, formatLabel(f), isPlate(f) ? 'plate' : 'other']),
  };
  const groupLabel = { collection: { italon: 'Italon', x2: 'X2 · 20 мм' }, format: { plate: 'Плиты', other: 'Мозаика и декор' } };
  for (const [id, list] of Object.entries(values)) {
    const box = $(`[data-options="${id}"]`, form);
    const options = new Map(), groups = new Map();
    for (const [value, label, group] of list) {
      if (group && !groups.has(group)) {
        const head = document.createElement('p');
        head.className = 'facet__group'; head.textContent = groupLabel[id][group]; head.setAttribute('aria-hidden', 'true');
        box.append(head); groups.set(group, { head, options: [] });
      }
      const el = option(id === 'section' ? 'radio' : 'checkbox', id, value, label);
      box.append(el);
      const entry = { el, input: el.querySelector('input'), n: el.querySelector('.facet__n'), label, group };
      options.set(value, entry);
      if (group) groups.get(group).options.push(entry);
    }
    facets[id] = { options, groups, details: $(`[data-facet="${id}"]`, form) };
  }
}
function updateFacets() {
  for (const id of ['section', ...MULTI]) {
    const { options, groups, details } = facets[id];
    const counts = new Map();
    for (const it of filtered(state, id)) {
      const keys = id === 'section' ? ['', it.p.section] : id === 'collection' ? [it.p.collectionId] : id === 'finish' ? it.surfaces : [it.p[id]];
      for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const visible = [];
    for (const [value, o] of options) {
      const n = counts.get(value) || 0;
      const checked = id === 'section' ? state.section === value : state[id].includes(value);
      o.input.checked = checked;
      o.n.textContent = number(n, 0);
      o.el.classList.toggle('is-empty', !n);
      const show = id === 'section' || n > 0 || checked;
      o.el.hidden = !show;
      if (show) visible.push(o);
    }
    if (id in expanded) {
      const button = $(`[data-more="${id}"]`, form);
      const extra = visible.length - LIMIT;
      if (extra > 1) {
        if (!expanded[id]) visible.slice(LIMIT).forEach(o => { if (!o.input.checked) o.el.hidden = true; });
        button.hidden = false;
        button.textContent = expanded[id] ? 'Свернуть список' : `Показать все — ${visible.length}`;
        button.setAttribute('aria-expanded', String(expanded[id]));
      } else button.hidden = true;
    }
    for (const g of groups.values()) g.head.hidden = !g.options.some(o => !o.el.hidden);
    const active = id === 'section' ? (state.section ? 1 : 0) : state[id].length;
    $('[data-facet-count]', details).textContent = active ? `· ${active}` : '';
  }
  // цена: диапазон текущей выборки (без учёта самого фильтра цены)
  const prices = filtered(state, 'price').map(it => it.price);
  const lo = prices.length ? Math.floor(Math.min(...prices)) : 0, hi = prices.length ? Math.ceil(Math.max(...prices)) : 0;
  const from = form.elements.price_from, to = form.elements.price_to;
  if (document.activeElement !== from) from.value = state.from ?? '';
  if (document.activeElement !== to) to.value = state.to ?? '';
  from.placeholder = prices.length ? String(lo) : ''; to.placeholder = prices.length ? String(hi) : '';
  $('#catalog-price-hint').textContent = prices.length ? `В выборке: ${rub(lo)} — ${rub(hi)} за м² или за штуку, как в прайсе, с НДС.` : 'За м² или за штуку — как в прайсе, с НДС.';
  $('[data-facet="price"] [data-facet-count]', form).textContent = state.from != null || state.to != null ? '· 1' : '';
}

// ---------------------------------------------------------------- выбранные фильтры (чипы)
function activeList(s = state) {
  const list = [];
  const without = (key, value) => { const n = structuredCloneSafe(s); if (Array.isArray(n[key])) n[key] = n[key].filter(v => v !== value); else if (key === 'price') { n.from = null; n.to = null; } else n[key] = ''; return n; };
  if (s.q) list.push({ label: `«${s.q}»`, title: 'поиск', next: without('q') });
  if (s.section) list.push({ label: SECTION_LABEL[s.section], title: 'раздел', next: without('section') });
  for (const k of MULTI) for (const v of s[k]) list.push({ label: facets[k]?.options.get(v)?.label || v, title: { category: 'категория', collection: 'коллекция', finish: 'отделка', format: 'формат' }[k], next: without(k, v) });
  if (s.from != null || s.to != null) list.push({ label: `Цена ${s.from != null ? `от ${rub(s.from)} ` : ''}${s.to != null ? `до ${rub(s.to)}` : ''}`.trim(), title: 'цена', next: without('price') });
  return list;
}
function structuredCloneSafe(s) { return { ...s, category: [...s.category], collection: [...s.collection], finish: [...s.finish], format: [...s.format] }; }
let chipStates = [];
function renderChips(active) {
  chipStates = active.map(a => a.next);
  chipsBox.innerHTML = active.map((a, i) => `<li><button type="button" class="catalog__chip" data-chip="${i}" aria-label="Убрать фильтр: ${esc(a.title)} ${esc(a.label)}">${esc(a.label)}${CLOSE}</button></li>`).join('')
    + (active.length > 1 ? '<li><button type="button" class="catalog__chip catalog__chip--clear" data-catalog-reset>Сбросить всё</button></li>' : '');
  chipsBox.hidden = !active.length;
  const filtersOnly = active.filter(a => a.title !== 'поиск').length;
  const badge = $('[data-active-count]', openButton);
  badge.hidden = !filtersOnly; badge.textContent = filtersOnly;
  openButton.setAttribute('aria-label', filtersOnly ? `Фильтры, выбрано: ${filtersOnly}` : 'Фильтры');
  for (const b of $$('.filters__reset', form)) b.hidden = !active.length;
  // быстрый выбор в шапке: отметить совпадающую ссылку
  const current = toParams({ ...state, sort: '' }, { withPage: false }).toString();
  for (const a of $$('[data-catalog-link]')) a.setAttribute('aria-current', String(new URL(a.href).searchParams.toString() === current && !!current));
}

// ---------------------------------------------------------------- карточки
const card = it => productCard(it.p, html.dataset.root || './', { variants: variantCount.get(it.p.variantKey) || 1 });
function cardsHtml(list, animate) {
  if (!animate) return list.map(card).join('');
  return list.map((it, i) => card(it).replace('<article class="product-card"', `<article class="product-card is-new" style="--d:${Math.min(i, 8) * 35}ms"`)).join('');
}
function emptyHtml(active) {
  const hints = active.map(a => ({ a, n: filtered(a.next).length })).filter(h => h.n > 0).sort((x, y) => y.n - x.n).slice(0, 3);
  return `<div class="catalog__empty">
<h2>Ничего не найдено</h2>
<p>${state.q ? `По запросу «${esc(state.q)}»${active.length > 1 ? ' с выбранными фильтрами' : ''} позиций нет.` : 'С выбранными фильтрами позиций нет.'} Попробуйте убрать часть условий или искать по артикулу либо названию коллекции.</p>
${hints.length ? `<ul>${hints.map(h => `<li>${h.a.title === 'поиск' ? `без поиска ${esc(h.a.label)}` : `без «${esc(h.a.label)}»`} — ${positions(h.n)}</li>`).join('')}</ul>` : ''}
<div class="btn-row">${hints[0] ? `<button type="button" class="btn" data-chip="${active.indexOf(hints[0].a)}">${hints[0].a.title === 'поиск' ? 'Убрать поиск' : `Убрать «${esc(hints[0].a.label)}»`}</button>` : ''}<button type="button" class="btn ${hints[0] ? 'btn--outline' : ''}" data-catalog-reset>Сбросить фильтры</button></div>
</div>`;
}
function renderMore() {
  if (shown >= results.length) { more.hidden = true; more.innerHTML = ''; return; }
  const next = Math.min(PAGE, results.length - shown);
  more.hidden = false;
  more.innerHTML = `<div class="catalog__progress"><span>Показано ${number(shown, 0)} из ${number(results.length, 0)} ${plural(results.length, ['позиции', 'позиций', 'позиций'])}</span><span class="catalog__bar" aria-hidden="true"><span style="width:${(shown / results.length * 100).toFixed(1)}%"></span></span></div>
<button type="button" class="btn btn--outline" data-more-items>Показать ещё ${next}</button>`;
}

/** Полная перерисовка: адрес, счётчики фильтров, чипы, сетка с первых позиций. */
function update({ animate = true, scroll = false } = {}) {
  results = sorted(filtered(state), state.sort);
  shown = Math.min(results.length, state.page * PAGE);
  syncUrl();
  updateFacets();
  const active = activeList();
  renderChips(active);
  count.textContent = `Найдено: ${positions(results.length)}`;
  applyButton.textContent = results.length ? `Показать ${positions(results.length)}` : 'Нет подходящих позиций';
  grid.innerHTML = results.length ? cardsHtml(results.slice(0, shown), animate && !reducedMotion()) : emptyHtml(active);
  grid.classList.remove('is-pending');
  grid.removeAttribute('aria-busy');
  renderMore();
  document.dispatchEvent(new CustomEvent('italon:cart-refresh'));
  if (scroll && !mobile.matches) {
    const top = layout.getBoundingClientRect().top;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - (parseFloat(getComputedStyle(html).fontSize) * 5), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}
function showMore() {
  const from = shown;
  state.page += 1;
  shown = Math.min(results.length, state.page * PAGE);
  grid.insertAdjacentHTML('beforeend', cardsHtml(results.slice(from, shown), !reducedMotion()));
  syncUrl();
  renderMore();
  document.dispatchEvent(new CustomEvent('italon:cart-refresh'));
  // фокус — на первую новую карточку, без прокрутки: позиция страницы сохраняется
  grid.children[from]?.querySelector('.product-card__title a')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- панель фильтров на телефоне и планшете
let lastFocus = null, closeTimer;
const focusables = () => $$('a[href], button:not([disabled]), input:not([disabled]), select, summary, [tabindex]:not([tabindex="-1"])', aside).filter(el => el.offsetParent !== null && !el.closest('[hidden]'));
function onKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeFilters(); return; }
  if (event.key !== 'Tab') return;
  const list = focusables(); if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (event.shiftKey && (document.activeElement === first || !aside.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !aside.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
function openFilters() {
  if (!mobile.matches) { $('summary', aside)?.focus(); return; }
  clearTimeout(closeTimer);
  lastFocus = document.activeElement;
  aside.setAttribute('role', 'dialog'); aside.setAttribute('aria-modal', 'true');
  backdrop.hidden = false;
  requestAnimationFrame(() => { aside.classList.add('is-open'); backdrop.classList.add('is-open'); });
  html.classList.add('catalog-locked');
  openButton.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', onKey);
  setTimeout(() => $('.filters__close', aside).focus({ preventScroll: true }), 60);
}
function closeFilters({ restore = true, toResults = false } = {}) {
  if (!aside.classList.contains('is-open')) return;
  aside.classList.remove('is-open'); backdrop.classList.remove('is-open');
  aside.removeAttribute('role'); aside.removeAttribute('aria-modal');
  html.classList.remove('catalog-locked');
  openButton.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', onKey);
  closeTimer = setTimeout(() => { backdrop.hidden = true; }, 320);
  if (toResults) {
    const top = layout.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight) window.scrollTo({ top: window.scrollY + top - parseFloat(getComputedStyle(html).fontSize) * 5 });
  }
  if (restore) (lastFocus && document.contains(lastFocus) ? lastFocus : openButton).focus({ preventScroll: true });
}

// ---------------------------------------------------------------- события
function readPrice() {
  const parse = el => { const v = el.value.trim(); if (!v) return null; const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
  let from = parse(form.elements.price_from), to = parse(form.elements.price_to);
  if (from != null && to != null && from > to) [from, to] = [to, from];
  if (from === state.from && to === state.to) return false;
  state.from = from; state.to = to; return true;
}
function reset() {
  state = { ...blank(), sort: state.sort };
  form.elements.q.value = '';
  update({ scroll: true });
}
function bind() {
  let qTimer, priceTimer;
  form.addEventListener('submit', event => { event.preventDefault(); if (mobile.matches) form.elements.q.blur(); });
  form.addEventListener('input', event => {
    const { name } = event.target;
    if (name === 'q') { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = event.target.value.trim().slice(0, 100); state.page = 1; update(); }, 160); }
    if (name === 'price_from' || name === 'price_to') { clearTimeout(priceTimer); priceTimer = setTimeout(() => { if (readPrice()) { state.page = 1; update(); } }, 700); }
  });
  form.addEventListener('change', event => {
    const { name, value, checked } = event.target;
    if (name === 'q') return;
    if (name === 'price_from' || name === 'price_to') { clearTimeout(priceTimer); if (!readPrice()) return; }
    else if (name === 'section') state.section = value;
    else if (name === 'sort') state.sort = value;
    else if (MULTI.includes(name)) state[name] = checked ? [...state[name], value] : state[name].filter(v => v !== value);
    else return;
    state.page = 1;
    update({ scroll: true });
  });
  // Esc в поле поиска: очистить запрос (не закрывать ничего)
  form.elements.q.addEventListener('keydown', event => { if (event.key === 'Escape' && form.elements.q.value) { event.preventDefault(); form.elements.q.value = ''; state.q = ''; state.page = 1; update(); } });
  document.addEventListener('click', event => {
    const t = event.target;
    if (t.closest('[data-catalog-reset]')) { reset(); return; }
    const chip = t.closest('[data-chip]');
    if (chip) {
      const index = Number(chip.dataset.chip);
      const next = chipStates[index]; if (!next) return;
      state = { ...next, page: 1 };
      form.elements.q.value = state.q;
      update();
      // фокус — на соседний чип или в поле поиска
      ($(`[data-chip="${Math.min(index, chipStates.length - 1)}"]`, chipsBox) || form.elements.q).focus({ preventScroll: true });
      return;
    }
    const moreButton = t.closest('[data-more]');
    if (moreButton) { expanded[moreButton.dataset.more] = !expanded[moreButton.dataset.more]; updateFacets(); return; }
    if (t.closest('[data-more-items]')) { showMore(); return; }
    if (t.closest('#catalog-filters-open')) { openFilters(); return; }
    if (t.closest('[data-filters-close]')) { closeFilters({ toResults: t.closest('#catalog-apply') != null, restore: true }); return; }
    const quick = t.closest('[data-catalog-link]');
    if (quick && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      state = { ...fromParams(new URL(quick.href).search), sort: state.sort };
      form.elements.q.value = state.q;
      update();
      layout.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  });
  mobile.addEventListener?.('change', () => { if (!mobile.matches) closeFilters({ restore: false }); });
  window.addEventListener('pagehide', () => { try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ search: location.search, y: Math.round(window.scrollY) })); } catch {} });
}

// ---------------------------------------------------------------- запуск
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}
state = fromParams(location.search);
if (grid.classList.contains('is-pending')) grid.setAttribute('aria-busy', 'true');

loadCatalog().then(c => {
  catalog = c;
  const collectionText = new Map(c.collections.map(col => [col.id, `${col.label} ${col.latin}`]));
  items = c.products.map((p, i) => ({ p, i, price: (p.priceKopecks || 0) / 100, surfaces: surfacesOf(p.finish),
    text: normalize(`${p.name} ${p.latin} ${p.code} ${p.collection} ${collectionText.get(p.collectionId) || ''} ${p.format} ${p.finish}`) }));
  const groups = new Map();
  for (const p of c.products) groups.set(p.variantKey, (groups.get(p.variantKey) || new Set()).add(p.finish));
  variantCount = new Map([...groups].map(([k, set]) => [k, set.size]));
  buildFacets();
  form.elements.q.value = state.q;
  form.elements.sort.value = state.sort;
  form.hidden = false;
  layout.classList.add('is-ready');
  bind();
  update({ animate: grid.classList.contains('is-pending') });
  // возврат «Назад» со страницы товара: та же выборка — та же позиция прокрутки
  let nav = '';
  try { nav = performance.getEntriesByType('navigation')[0]?.type || ''; } catch {}
  if (nav === 'back_forward' || nav === 'reload') {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null');
      if (saved && saved.search === location.search && saved.y > 0) requestAnimationFrame(() => window.scrollTo(0, saved.y));
    } catch {}
  }
}).catch(() => {
  grid.classList.remove('is-pending');
  grid.removeAttribute('aria-busy');
  count.innerHTML = 'Поиск и фильтры временно недоступны — показаны первые позиции. <a class="link" href="">Обновить страницу</a>';
});
window.addEventListener('pageshow', event => { if (event.persisted) closeFilters({ restore: false }); });
