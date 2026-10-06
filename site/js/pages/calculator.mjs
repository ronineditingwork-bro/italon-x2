// Калькулятор упаковок: формулы src/pricing.mjs (calculateArea) на данных public/data/catalog.json.
// Материал выбирается поиском (combobox по шаблону WAI-ARIA: стрелки, Enter, Esc, Home/End в списке).
// Адрес хранит расчёт: ?code=<артикул>&mode=area|size&area=&length=&width=&reserve= — ссылки
// «Рассчитать количество» со страниц товара открывают калькулятор с выбранным материалом.
import { loadCatalog } from '../shop.mjs';
import { $, $$ } from '../ui.mjs';
import { esc, money, number, plural, normalize, titleRu, lower, productImage, productUrl, media } from '../../shared/format.mjs';

const html = document.documentElement;
const root = html.dataset.root || './';
const MAX_OPTIONS = 40;
const form = $('#calc-form'), input = $('#calc-material'), list = $('#calc-listbox'), clear = $('#calc-clear');
const picked = $('#calc-picked'), notice = $('#calc-notice'), out = $('#calc-output'), live = $('#calc-live');
const add = $('#calc-add'), productLink = $('#calc-product-link'), photo = $('#calc-photo');

let catalog, pricing, items = [], selected = null, result = null, options = [], active = -1;

// ---------------------------------------------------------------- числа
const parseNum = v => { const s = String(v ?? '').replace(/\s/g, '').replace(',', '.'); return s && /^\d*\.?\d+$|^\d+\.$/.test(s) ? Number(s) : NaN; };
const m2 = v => `${number(v, 2)} м²`;
const fmtSize = f => String(f || '').replace(/(\d)\s*[XХ]\s*(\d)/g, '$1 × $2');
const priceLine = p => `${money(p.priceKopecks)} <small>/ ${esc(p.unit)}</small>`;
const packWord = (p, n) => p.orderUnit === 'шт' ? `${number(n, 0)} шт.` : `${number(n, 0)} ${plural(n, ['коробка', 'коробки', 'коробок'])}`;

// ---------------------------------------------------------------- поиск материала (combobox)
function search(query) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return items;
  // сначала совпадения в названии и формате, потом — в артикуле и прочем
  const strong = [], weak = [];
  for (const it of items) if (tokens.every(t => it.text.includes(t))) (tokens.every(t => it.name.includes(t)) ? strong : weak).push(it);
  return strong.concat(weak);
}
function optionHtml(it, i) {
  const p = it.p;
  return `<li class="combo__option${selected?.code === p.code ? ' is-current' : ''}" id="calc-opt-${p.code}" role="option" aria-selected="false" data-index="${i}">
<span class="combo__thumb">${p.image ? `<img src="${esc(media(root, p.image.src))}" alt="" width="${p.image.width}" height="${p.image.height}" loading="lazy" decoding="async">` : ''}</span>
<span><span class="combo__name">${esc(p.name)}</span><span class="combo__meta">${esc(titleRu(p.collection))} · арт. ${esc(p.code)}${p.format ? ` · ${esc(fmtSize(p.format))}` : ''}</span></span>
<span class="combo__price">${priceLine(p)}</span></li>`;
}
function openList() {
  const found = search(input.value === selected?.name ? '' : input.value);
  options = found.slice(0, MAX_OPTIONS);
  list.innerHTML = options.length
    ? options.map(optionHtml).join('') + (found.length > MAX_OPTIONS ? `<li class="combo__info" role="presentation">Показаны ${MAX_OPTIONS} из ${number(found.length, 0)} — уточните запрос: коллекция, цвет, формат или артикул.</li>` : '')
    : `<li class="combo__info" role="presentation">Ничего не найдено. Калькулятор считает позиции с ценой за м²; мозаику и декор, которые продаются поштучно, добавляйте из <a class="link" href="${root}catalog/">каталога</a>.</li>`;
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  live.textContent = found.length ? `Найдено: ${number(found.length, 0)} ${plural(found.length, ['вариант', 'варианта', 'вариантов'])}` : 'Ничего не найдено';
  const current = options.findIndex(it => it.p.code === selected?.code);
  setActive(current >= 0 && input.value === selected?.name ? current : -1);
}
function closeList() {
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  active = -1;
}
function setActive(i) {
  const els = $$('.combo__option', list);
  els.forEach(el => el.setAttribute('aria-selected', 'false'));
  active = i;
  if (i < 0 || !els[i]) { input.removeAttribute('aria-activedescendant'); return; }
  els[i].setAttribute('aria-selected', 'true');
  input.setAttribute('aria-activedescendant', els[i].id);
  els[i].scrollIntoView?.({ block: 'nearest' });
}
function choose(p, { focus = true } = {}) {
  selected = p;
  input.value = p.name;
  clear.hidden = false;
  notice.hidden = true;
  closeList();
  renderPicked();
  update();
  if (focus) input.focus();
}
function renderPicked() {
  const p = selected;
  if (!p) { picked.hidden = true; photo.hidden = true; productLink.hidden = true; return; }
  const pack = p.boxed ? `${number(p.unitsPerPack, 3)} м² в коробке${p.piecesPerPack ? ` · ${number(p.piecesPerPack, 0)} шт.` : ''}` : `поштучно, ${number(p.unitsPerPack, 3)} м² в штуке`;
  picked.innerHTML = `<a class="calc-picked__photo${p.image?.kind === 'collection' ? ' is-scene' : ''}" href="${productUrl(root, p.code)}" tabindex="-1" aria-hidden="true">${productImage(p, root)}</a>
<div class="calc-picked__body"><p class="calc-picked__collection">${esc(titleRu(p.collection))}</p>
<p class="calc-picked__name">${esc(p.name)}</p>
<p class="calc-picked__meta">Арт. ${esc(p.code)}${p.format ? ` · ${esc(fmtSize(p.format))} см` : ''}${p.finish ? ` · ${esc(lower(p.finish))}` : ''}</p>
<p class="calc-picked__meta">${pack} · минимум: ${esc(lower(p.minimum))}</p>
<p class="calc-picked__price">${priceLine(p)}</p></div>`;
  picked.hidden = false;
  productLink.href = productUrl(root, p.code);
  productLink.hidden = false;
  // фото коллекции — в левой колонке (на широких экранах)
  const c = catalog.collectionMap.get(p.collectionId);
  if (c?.image) {
    const box = $('.calc-photo__media', photo);
    if (box.dataset.id !== c.id) {
      box.dataset.id = c.id;
      box.style.setProperty('--ratio', `${c.image.width}/${c.image.height}`);
      box.innerHTML = `<img src="${esc(media(root, c.image.src))}" alt="Коллекция ${esc(c.label)} в ${c.section === 'x2' ? 'экстерьере' : 'интерьере'}" width="${c.image.width}" height="${c.image.height}" loading="lazy" decoding="async">`;
      $('figcaption', photo).textContent = `Коллекция ${c.label} — фото коллекции, не конкретного артикула.`;
    }
    photo.hidden = false;
  } else photo.hidden = true;
}

// ---------------------------------------------------------------- расчёт
const mode = () => form.elements.mode.value || 'area';
function fieldError(el, message) {
  el.setAttribute('aria-invalid', message ? 'true' : 'false');
  $(`#${el.id}-error`).textContent = message || '';
  return !message;
}
function readArea() {
  if (mode() === 'area') {
    const el = $('#calc-area'), v = parseNum(el.value);
    if (!el.value.trim()) return fieldError(el, 'Укажите площадь.') && null;
    if (!(v > 0)) return fieldError(el, 'Введите число больше нуля, например 12,5.') && null;
    if (v > 100000) return fieldError(el, 'Не больше 100 000 м².') && null;
    fieldError(el, '');
    return v;
  }
  let ok = true; const vals = [];
  for (const el of [$('#calc-length'), $('#calc-width')]) {
    const v = parseNum(el.value);
    const msg = !el.value.trim() ? 'Укажите размер.' : !(v > 0) ? 'Число больше нуля, например 3,6.' : v > 1000 ? 'Не больше 1 000 м.' : '';
    ok = fieldError(el, msg) && ok; vals.push(v);
  }
  const sum = $('#calc-size-sum');
  if (!ok) { sum.textContent = ''; return null; }
  const a = Math.round(vals[0] * vals[1] * 1000) / 1000;
  sum.textContent = `Площадь: ${number(vals[0], 3)} × ${number(vals[1], 3)} = ${m2(a)}`;
  return a > 100000 ? null : a;
}
let liveTimer;
function update() {
  const area = readArea();
  const reserve = Number(form.elements.reserve.value || 0);
  syncUrl();
  if (!selected) { result = null; out.innerHTML = '<p class="calc-empty">Выберите материал — здесь появится расчёт: упаковки, площадь, количество штук и сумма.</p>'; setAdd(); return; }
  if (area == null) { result = null; out.innerHTML = '<p class="calc-empty">Исправьте значения в полях выше — и расчёт обновится.</p>'; setAdd(); return; }
  try { result = pricing.calculateArea(selected.code, area, reserve); }
  catch (error) { result = null; out.innerHTML = `<p class="calc-notice">${esc(error.message)}</p>`; setAdd(); return; }
  const p = result.product, r = result;
  const before = Math.max(1, Math.ceil(r.target / p.unitsPerPack - 1e-9));
  const areaPacked = r.area ?? r.quantity;
  out.innerHTML = `<p class="calc-big"><strong>${number(r.packs, 0)}</strong><span>${p.orderUnit === 'шт' ? 'шт.' : plural(r.packs, ['коробка', 'коробки', 'коробок'])}</span>
<small>${m2(areaPacked)}${r.pieces && p.boxed ? ` · ${number(r.pieces, 0)} шт.` : ''} — целыми упаковками</small></p>
<dl class="specs">
<div><dt>Нужно по расчёту</dt><dd>${m2(r.areaRequested)}${reserve ? ` + ${reserve} % = ${m2(r.target)}` : ''}</dd></div>
<div><dt>В упаковке</dt><dd>${p.boxed ? `${m2(p.unitsPerPack)}${p.piecesPerPack ? `, ${number(p.piecesPerPack, 0)} шт.` : ''}` : `поштучно, ${m2(p.unitsPerPack)} в штуке`}</dd></div>
<div><dt>Цена</dt><dd>${money(p.priceKopecks)} за м²</dd></div>
<div><dt>Остаток сверх расчёта</dt><dd>${m2(Math.max(0, areaPacked - r.target))}</dd></div>
</dl>
${r.minimumApplied ? `<p class="calc-min">Учтён минимальный заказ из прайса — ${esc(lower(p.minimum))} (${packWord(p, p.minPacks)}). По площади хватило бы ${p.orderUnit === 'шт' ? `${number(before, 0)}\u00a0шт.` : `${number(before, 0)}\u00a0${plural(before, ['коробки', 'коробок', 'коробок'])}`}.</p>` : ''}
<div class="calc-total"><span>Сумма с НДС</span><strong>${money(r.totalKopecks)}</strong></div>`;
  setAdd();
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { live.textContent = `${number(r.packs, 0)} ${p.orderUnit === 'шт' ? 'шт.' : plural(r.packs, ['коробка', 'коробки', 'коробок'])}, ${number(areaPacked, 2)} м², сумма ${money(r.totalKopecks)}${r.minimumApplied ? ', учтён минимальный заказ' : ''}.`; }, 700);
}
function inCart(code) { try { return (window.Italon?.cart.get()?.lines || []).find(l => l.code === code); } catch { return null; } }
function setAdd() {
  add.disabled = !result;
  if (!result) { add.textContent = 'Добавить в корзину'; return; }
  const what = packWord(result.product, result.packs);
  const line = inCart(result.code);
  add.textContent = line ? (line.packs === result.packs ? `В корзине: ${what} — открыть` : `Заменить в корзине на ${what}`) : `Добавить в корзину: ${what}`;
}
function syncUrl() {
  const params = new URLSearchParams();
  if (selected) params.set('code', selected.code);
  if (mode() === 'size') { params.set('mode', 'size'); params.set('length', $('#calc-length').value.trim()); params.set('width', $('#calc-width').value.trim()); }
  else params.set('area', $('#calc-area').value.trim());
  params.set('reserve', form.elements.reserve.value);
  try { history.replaceState(history.state, '', `${location.pathname}?${params}`); } catch {}
}
function setMode(value) {
  for (const r of form.elements.mode) r.checked = r.value === value;
  $('#calc-area-row').hidden = value !== 'area';
  $('#calc-size-row').hidden = value !== 'size';
}

// ---------------------------------------------------------------- события
function bind() {
  input.addEventListener('input', () => { clear.hidden = !input.value; openList(); });
  input.addEventListener('focus', () => { if (input.value === selected?.name) input.select(); });
  input.addEventListener('click', () => { if (list.hidden) openList(); });
  input.addEventListener('keydown', event => {
    const n = options.length;
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); if (list.hidden) openList(); else if (n) setActive(active < n - 1 ? active + 1 : 0); break;
      case 'ArrowUp': event.preventDefault(); if (list.hidden) openList(); else if (n) setActive(active > 0 ? active - 1 : n - 1); break;
      case 'Home': case 'End': if (!list.hidden && n && event.ctrlKey) { event.preventDefault(); setActive(event.key === 'Home' ? 0 : n - 1); } break;
      case 'PageDown': if (!list.hidden && n) { event.preventDefault(); setActive(Math.min(n - 1, active + 8)); } break;
      case 'PageUp': if (!list.hidden && n) { event.preventDefault(); setActive(Math.max(0, active - 8)); } break;
      case 'Enter':
        event.preventDefault();
        if (!list.hidden && active >= 0 && options[active]) choose(options[active].p);
        else if (!list.hidden && options.length === 1) choose(options[0].p);
        break;
      case 'Escape':
        if (!list.hidden) { event.preventDefault(); closeList(); if (selected) input.value = selected.name; }
        else if (input.value && input.value !== selected?.name) { event.preventDefault(); input.value = selected?.name || ''; }
        break;
      case 'Tab': if (!list.hidden) { if (active >= 0 && options[active]) choose(options[active].p, { focus: false }); else closeList(); } break;
    }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (list.contains(document.activeElement) || document.activeElement === input) return;
    closeList();
    if (selected && input.value !== selected.name) input.value = selected.name;
    clear.hidden = !input.value;
  }, 120));
  list.addEventListener('mousedown', event => { if (event.target.closest('.combo__option')) event.preventDefault(); });
  list.addEventListener('click', event => { const li = event.target.closest('.combo__option'); if (li) choose(options[Number(li.dataset.index)].p); });
  list.addEventListener('mousemove', event => { const li = event.target.closest('.combo__option'); if (li && Number(li.dataset.index) !== active) setActive(Number(li.dataset.index)); });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; input.focus(); openList(); });
  document.addEventListener('click', event => { if (!event.target.closest('#calc-combo')) closeList(); });

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('change', event => {
    if (event.target.name === 'mode') { setMode(event.target.value); update(); }
    if (event.target.name === 'reserve') update();
  });
  let timer;
  form.addEventListener('input', event => { if (['area', 'length', 'width'].includes(event.target.name)) { clearTimeout(timer); timer = setTimeout(update, 120); } });

  add.addEventListener('click', async () => {
    if (!result || !window.Italon) return;
    const { code, packs } = result;
    const cart = window.Italon.cart;
    add.disabled = true;
    try {
      await cart.ready().catch(() => {});
      const line = inCart(code);
      if (line && line.packs === packs) { cart.open(); return; }
      if (line) { await cart.setPacks(code, packs); window.Italon.toast(`Количество в корзине обновлено: ${packWord(result.product, packs)}`); }
      else await cart.add(code, packs);
    } catch (error) { window.Italon.toast(error?.message || 'Не удалось сохранить корзину. Повторите попытку.'); }
    finally { add.disabled = !result; setAdd(); }
  });
  document.addEventListener('italon:cart', setAdd);
}

// ---------------------------------------------------------------- запуск
function start() {
  input.disabled = true;
  input.placeholder = 'Загружаем каталог…';
  loadCatalog().then(c => {
    catalog = c; pricing = c.pricing;
    items = c.products.filter(p => p.unit === 'м²' && p.canOrder).map(p => {
      const col = c.collectionMap.get(p.collectionId);
      return { p, name: normalize(`${p.name} ${p.format} ${col ? `${col.label} ${col.latin}` : ''}`), text: normalize(`${p.name} ${p.latin} ${p.code} ${p.collection} ${col ? `${col.label} ${col.latin}` : ''} ${p.format} ${p.finish}`) };
    });
    input.disabled = false;
    input.placeholder = 'Коллекция, цвет или артикул';
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'size') setMode('size');
    for (const [name, id] of [['area', 'calc-area'], ['length', 'calc-length'], ['width', 'calc-width']]) if (params.get(name)) $(`#${id}`).value = params.get(name).slice(0, 12);
    if (['0', '5', '10', '15', '20'].includes(params.get('reserve'))) for (const r of form.elements.reserve) r.checked = r.value === params.get('reserve');
    const code = (params.get('code') || '').trim();
    const wanted = code && c.productMap.get(code);
    if (wanted && wanted.unit === 'м²' && wanted.canOrder) choose(wanted, { focus: false });
    else {
      if (code) {
        notice.innerHTML = wanted
          ? `«${esc(wanted.name)}» (арт. ${esc(code)}) продаётся поштучно — калькулятор считает плитку с ценой за м². Количество для неё выберите на <a href="${productUrl(root, code)}">странице товара</a>.`
          : `Артикул ${esc(code)} не найден в прайсе. Найдите материал по названию или артикулу.`;
        notice.hidden = false;
      }
      update();
    }
    bind();
    if (window.Italon?.cart) window.Italon.cart.ready().then(setAdd, () => {});
  }).catch(() => {
    input.placeholder = 'Каталог не загрузился';
    out.innerHTML = `<p class="calc-notice">Не удалось загрузить каталог для расчёта. Проверьте соединение и <button type="button" class="link" id="calc-retry">повторите попытку</button>.</p>`;
    $('#calc-retry').addEventListener('click', () => { out.innerHTML = '<p class="calc-empty">Загружаем каталог…</p>'; start(); }, { once: true });
  });
}
start();
