// Магазинная логика, общая для всех страниц: каталог (лениво), корзина (API /api/cart или
// запасной localStorage), диалоги товара/фото/корзины, КП в PDF. Публичный API — window.Italon.
//
// Разметка-триггеры (делегирование, работают на любой странице, в т.ч. в динамическом HTML):
//   [data-add="<код>"]        — добавить минимальное количество (если уже в корзине — открыть корзину)
//   [data-add-packs="<n>"]    — вместе с data-add: добавить n упаковок
//   [data-product="<код>"]    — быстрый просмотр товара в диалоге
//   [data-scene="<id>"]       — фото коллекции в диалоге (id коллекции)
//   [data-laying="<id>"]      — фото способа укладки X2 (grass|gravel|pedestals|adhesive)
//   [data-photo="<src>"]      — любое фото: data-photo-alt, data-photo-caption, data-photo-width/height
//   [data-cart-open]          — открыть корзину
import { esc, money, number, fmt, titleRu, lower, packLabel, minimumLabel, lineOf, productImage, productUrl, collectionUrl, priceHtml, normalize } from '../shared/format.mjs';
import { createPricing, MAX_PACKS } from '../../src/pricing.mjs';
import { quoteDiscount, nextTier } from '../../src/discount.mjs';
import { $, $$, ROOT, rootRel, openDialog, closeDialog, toast } from './ui.mjs';

const html = document.documentElement;
const STORAGE_KEY = 'italon-cart-v1';
const apiUrl = new URL('api/cart', ROOT).href;

// ---------------------------------------------------------------- каталог
let catalogPromise = null;
/** Загружает public/data/catalog.json один раз. Возвращает {products, productMap, collections, collectionMap, laying, pricing, priceInfo}. */
export function loadCatalog() {
  catalogPromise ||= fetch(new URL(`data/catalog.json?v=${html.dataset.build || ''}`, ROOT), { cache: 'force-cache' })
    .then(response => { if (!response.ok) throw new Error('Каталог временно недоступен.'); return response.json(); })
    .then(catalog => {
      catalog.productMap = new Map(catalog.products.map(p => [p.code, p]));
      catalog.collectionMap = new Map(catalog.collections.map(c => [c.id, c]));
      catalog.pricing = createPricing(catalog.productMap, catalog.priceInfo);
      return catalog;
    })
    .catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

// ---------------------------------------------------------------- состояние корзины
let cart = { lines: [], totalKopecks: 0, version: 0 };
let mode = location.protocol === 'file:' ? 'local' : null; // null — ещё не знаем; 'server' | 'local'
let loaded = false, loading = null, queue = Promise.resolve(), pending = 0, unsaved = null, exporting = false;

const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return Array.isArray(v.items) ? v.items : []; } catch { return []; } };
const writeLocal = items => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items })); } catch {} };

async function localCart(items) {
  const catalog = await loadCatalog();
  // в localStorage могли остаться коды, которых больше нет в прайсе — тихо отбрасываем
  const valid = items.filter(i => catalog.productMap.get(i?.code)?.canOrder && Number.isSafeInteger(i.packs))
    .map(i => ({ code: i.code, packs: Math.min(MAX_PACKS, Math.max(catalog.productMap.get(i.code).minPacks, i.packs)) }));
  return { ...catalog.pricing.calculateCart(valid), version: 0 };
}
function useLocal() {
  if (mode !== 'local') { mode = 'local'; }
}

/** Загружает корзину: сервер, а при недоступном API — localStorage. */
export function ensureCart(force = false) {
  if (loaded && !force) return Promise.resolve(cart);
  if (loading) return loading;
  loading = (async () => {
    if (mode !== 'local') {
      let response = null, data = null;
      try {
        response = await fetch(apiUrl, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        data = await response.json();
      } catch { response = null; }
      if (response && data && response.ok && Array.isArray(data.lines)) {
        mode = 'server'; cart = data; loaded = true; hideError(); render(); return cart;
      }
      // API отвечает, но с ошибкой хранилища — показываем ошибку, корзину не подменяем
      if (response && data && response.status >= 500 && data.error) { mode = 'server'; throw new Error(data.error); }
      useLocal(); // нет API (статический предпросмотр, 404, не-JSON)
    }
    cart = await localCart(readLocal()); loaded = true; hideError(); render(); return cart;
  })().catch(error => { showError(error.message || 'Корзина временно недоступна.'); throw error; })
    .finally(() => { loading = null; setExportState(); });
  return loading;
}

async function saveItems(items) {
  if (mode === 'local') {
    const next = await localCart(items);
    writeLocal(next.lines.map(({ code, packs }) => ({ code, packs })));
    cart = next; unsaved = null; loaded = true; hideError(); render(); return;
  }
  const response = await fetch(apiUrl, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: cart.version, items }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 409 && data.cart) { cart = data.cart; unsaved = null; render(); }
    else { unsaved = items; render(); }
    throw new Error(data.error || 'Изменения не сохранены. Повторите попытку.');
  }
  cart = data; unsaved = null; loaded = true; hideError(); render();
}

/** Изменение корзины через очередь: change(items) → новые items. */
function mutate(change, successText) {
  pending++; setExportState();
  queue = queue.then(async () => {
    await ensureCart();
    const current = unsaved || cart.lines.map(({ code, packs }) => ({ code, packs }));
    const next = change(current.map(x => ({ ...x })));
    try { await saveItems(next); if (successText) toast(successText); }
    catch (error) { if (!unsaved && !String(error.message).includes('другой вкладке')) { unsaved = next; render(); } throw error; }
  }).catch(error => { showError(error.message || 'Не удалось сохранить корзину.'); toast(error.message || 'Не удалось сохранить корзину.'); })
    .finally(() => { pending--; setExportState(); });
  return queue;
}

/** Добавить товар: packs упаковок (по умолчанию — минимальный заказ). */
export async function addToCart(code, packs) {
  let product = cart.lines.find(l => l.code === code)?.product;
  if (!product) { try { product = (await loadCatalog()).productMap.get(code); } catch { product = null; } }
  if (product && !product.canOrder) { toast('Позиция недоступна для заказа на сайте.'); return; }
  return mutate(items => {
    const line = items.find(x => x.code === code);
    if (line) line.packs = Math.min(MAX_PACKS, line.packs + (packs || 1));
    else items.push({ code, packs: packs || product?.minPacks || 1 });
    return items;
  }, 'Добавлено в корзину');
}
export const removeFromCart = code => mutate(items => items.filter(x => x.code !== code), 'Позиция удалена');
export const setPacks = (code, packs) => mutate(items => { const l = items.find(x => x.code === code); if (l) l.packs = packs; return items; });

export async function openCart() {
  openDialog('cart-dialog'); render();
  try { await ensureCart(); } catch {}
}

// ---------------------------------------------------------------- отрисовка корзины
function showError(message) { const box = $('#cart-error'); if (!box) return; box.hidden = false; box.querySelector('span').textContent = message; }
function hideError() { const box = $('#cart-error'); if (box) box.hidden = true; }
function setExportState() {
  const button = $('#quote-download');
  if (button) button.disabled = !loaded || !cart.lines.length || pending > 0 || !!unsaved || exporting;
  const status = $('#cart-status');
  if (status) {
    status.textContent = pending ? 'Сохраняем…' : unsaved ? 'Есть несохранённые изменения.'
      : loaded ? (mode === 'local' ? 'Сохранено в браузере на этом устройстве.' : 'Корзина сохранена.')
      : ($('#cart-error')?.hidden === false ? 'Корзина временно недоступна.' : 'Загружаем корзину…');
  }
}
function shownCart() {
  if (!unsaved) return cart;
  try { const map = new Map(cart.lines.map(l => [l.code, l.product])); return { ...createPricing(map, cart.priceInfo).calculateCart(unsaved.filter(i => map.has(i.code))), version: cart.version }; }
  catch { return cart; }
}
function render() {
  const shown = shownCart();
  for (const el of $$('[data-cart-count]')) {
    el.textContent = String(shown.lines.length);
    el.classList.toggle('is-filled', shown.lines.length > 0);
  }
  const inCart = new Set(shown.lines.map(l => l.code));
  for (const button of $$('[data-add]')) {
    const on = inCart.has(button.dataset.add);
    button.classList.toggle('is-done', on);
    if (button.classList.contains('btn')) {
      button.dataset.label ||= button.textContent;
      button.textContent = on ? 'В корзине — открыть' : button.dataset.label;
    }
  }
  const total = $('#cart-total');
  if (total) total.textContent = money(shown.totalKopecks);
  renderDiscount();
  const list = $('#cart-list');
  if (list) list.innerHTML = shown.lines.length ? shown.lines.map(cartItem).join('') : `<div class="empty-state"><strong>Корзина пока пуста</strong><p>Добавьте позиции из каталога или сохраните расчёт из калькулятора.</p><a class="btn btn--outline" href="${rootRel}catalog/">Открыть каталог</a></div>`;
  setExportState();
  document.dispatchEvent(new CustomEvent('italon:cart', { detail: { cart: shown, mode } }));
}
function cartItem(line) {
  const p = line.product;
  const scene = p.image?.kind === 'collection';
  return `<article class="cart-item">
<div class="cart-item__photo${scene ? ' is-scene' : ''}">${productImage(p, rootRel, 'cart')}</div>
<div><h3 class="cart-item__name"><a href="${productUrl(rootRel, p.code)}">${esc(p.name)}</a></h3><p class="cart-item__meta">Арт. ${esc(p.code)} · ${esc(titleRu(p.collection))}${p.format ? ` · ${esc(fmt(p.format))}` : ''}</p></div>
<p class="cart-item__total">${money(line.totalKopecks)}<small>${number(line.quantity)} ${esc(p.unit)} × ${money(p.priceKopecks)}</small></p>
<div class="cart-item__controls">
<div class="qty" role="group" aria-label="Количество, ${esc(p.orderUnit)}">
<button type="button" data-qty-step="-1" data-code="${esc(p.code)}" aria-label="Уменьшить: ${esc(p.name)}"${line.packs <= p.minPacks ? ' disabled' : ''}>−</button>
<input type="number" inputmode="numeric" min="${p.minPacks}" max="${MAX_PACKS}" step="1" value="${line.packs}" data-qty="${esc(p.code)}" aria-label="Количество, ${esc(p.orderUnit)}: ${esc(p.name)}">
<button type="button" data-qty-step="1" data-code="${esc(p.code)}" aria-label="Увеличить: ${esc(p.name)}"${line.packs >= MAX_PACKS ? ' disabled' : ''}>+</button>
</div>
<span class="t-small">${esc(p.orderUnit)} · ${esc(minimumLabel(p))}</span>
<button type="button" class="remove-link" data-remove="${esc(p.code)}" aria-label="Удалить: ${esc(p.name)}">Удалить</button>
</div>
</article>`;
}

// ---------------------------------------------------------------- диалог товара
export async function openProduct(code) {
  let catalog;
  try { catalog = await loadCatalog(); } catch (error) { toast(error.message); return; }
  const p = catalog.productMap.get(code);
  if (!p) return;
  const scene = p.image?.kind === 'collection';
  const rows = [
    ['Цена с НДС', p.priceKopecks > 0 ? `${money(p.priceKopecks)} / ${p.unit}` : 'Уточнить стоимость'],
    ['Формат', p.format ? fmt(p.format) : '—'],
    ['Отделка', p.finish ? lower(p.finish) : '—'],
    ['Упаковка', packLabel(p) + (p.unit === 'м²' && p.piecesPerPack ? ` · ${number(p.piecesPerPack)} шт` : '')],
    ['Минимальный заказ', `${p.minimum}${p.minPacks > 1 ? ` (${number(p.minPacks)} ${p.orderUnit})` : ''}`],
    ['Раздел', p.section === 'x2' ? 'X2 · 20 мм, улица' : lineOf(p.section).short],
  ];
  $('#product-dialog-body').innerHTML = `<div class="product-detail">
<div class="product-detail__photo${scene ? ' is-scene' : ''}">${productImage(p, rootRel, 'detail')}</div>
<div><p class="eyebrow">${esc(titleRu(p.collection))}</p>
<h2 class="dialog__title" id="product-dialog-title">${esc(p.name)}</h2>
<p class="t-small">Артикул ${esc(p.code)}${scene ? ' · на фото — пример коллекции' : ''}</p>
<p class="product-detail__price">${priceHtml(p)}</p>
<dl class="specs">${rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
<div class="product-detail__actions"><button type="button" class="btn" data-add="${esc(p.code)}"${p.canOrder ? '' : ' disabled'}>В корзину</button><a class="btn btn--outline" href="${productUrl(rootRel, p.code)}">Страница товара</a></div>
<p class="t-small">Наличие, тон и калибр уточняются. Цены по прайсу от 01.07.2026, склад Краснодар, с НДС.</p>
${p.collectionId !== 'packaging' ? `<p><a class="link-arrow" href="${collectionUrl(rootRel, p.collectionId)}">Коллекция ${esc(titleRu(p.collection))}</a></p>` : ''}
</div></div>`;
  render();
  openDialog('product-dialog');
}

// ---------------------------------------------------------------- диалог фото
/** Открыть фото: {src (от корня сайта или абсолютный), alt, caption, width, height, link:{href,label}} */
export function openPhoto({ src, alt = '', caption = '', width, height, link } = {}) {
  if (!src) return;
  const url = /^(https?:|data:|blob:)/.test(src) ? src : rootRel + String(src).replace(/^\//, '');
  $('#photo-dialog-body').innerHTML = `<figure><img src="${esc(url)}" alt="${esc(alt)}"${width ? ` width="${width}" height="${height}"` : ''}>
<figcaption><span id="photo-dialog-title">${esc(caption || alt)}</span>${link ? ` <a class="link-arrow" href="${esc(link.href)}">${esc(link.label)}</a>` : ''}</figcaption></figure>`;
  openDialog('photo-dialog');
}
export async function openScene(id) {
  let catalog;
  try { catalog = await loadCatalog(); } catch (error) { toast(error.message); return; }
  const c = catalog.collectionMap.get(id);
  if (!c?.image) return;
  openPhoto({ ...c.image, alt: `Коллекция ${c.label} в ${c.section === 'x2' ? 'экстерьере' : 'интерьере'}`,
    caption: c.image.caption || `Коллекция ${c.label}`, link: { href: collectionUrl(rootRel, c.id), label: 'Смотреть коллекцию' } });
}
export async function openLaying(id) {
  let catalog;
  try { catalog = await loadCatalog(); } catch (error) { toast(error.message); return; }
  const m = catalog.laying[id];
  if (m) openPhoto({ ...m.image, alt: m.alt, caption: `${m.label}. ${m.caption} Фото из каталога Italon X2.` });
}

// ---------------------------------------------------------------- КП в PDF
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// Картинки позиций для PDF: pdf-lib понимает только JPEG/PNG, поэтому webp перерисовываем в jpeg (белый фон, до 360 px).
async function quoteImages(cart) {
  const images = new Map();
  await Promise.all(cart.lines.map(async line => {
    const src = line.product?.image?.src;
    if (!src || images.has(line.product.code)) return;
    try {
      const response = await fetch(new URL(src, ROOT));
      if (!response.ok) return;
      const bitmap = await createImageBitmap(await response.blob());
      const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob) images.set(line.product.code, { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpg' });
    } catch { /* без картинки позиция остаётся в КП, просто без миниатюры */ }
  }));
  return images;
}
function quoteDetails() {
  return { phone: $('#quote-phone').value, customer: $('#quote-customer').value, address: $('#quote-address').value,
    project: $('#quote-project').value, note: $('#quote-note').value };
}
function renderDiscount() {
  const out = $('#quote-discount'); if (!out) return;
  const total = shownCart().totalKopecks || 0, d = quoteDiscount(quoteDetails(), total), next = nextTier(total);
  const lines = [];
  if (d.percent) lines.push(`Ваша скидка ${d.percent}%: −${money(d.discountKopecks)}. К оплате ${money(d.payableKopecks)}.`);
  const byVolume = d.parts.find(p => p.key === 'volume');
  if (byVolume) lines.push(`За сумму заказа — ${byVolume.percent}%.`);
  if (next) lines.push(`До скидки ${next.percent}% за сумму заказа осталось ${money(next.remainingKopecks)}.`);
  if (!d.parts.some(p => p.key === 'data')) lines.push('Заполните ФИО, телефон и адрес объекта — ещё 2% скидки и регистрация защиты заказа.');
  out.textContent = lines.join(' ');
}

async function sendLead(quote, phone) {
  const form = new FormData();
  form.set('phone', phone); form.set('customer', $('#quote-customer').value); form.set('project', $('#quote-project').value);
  form.set('address', $('#quote-address').value);
  form.set('note', $('#quote-note').value); form.set('filename', quote.filename);
  form.set('pdf', new Blob([quote.bytes], { type: 'application/pdf' }), quote.filename);
  const response = await fetch(new URL('api/quote', ROOT), { method: 'POST', body: form, credentials: 'same-origin' });
  return response.ok && (await response.json()).saved;
}

async function exportQuote(event) {
  event.preventDefault();
  if (pending || unsaved || exporting || !cart.lines.length) return;
  const button = $('#quote-download');
  const phoneInput = $('#quote-phone');
  if (phoneInput.value.replace(/\D/g, '').length < 10) { phoneInput.focus(); showError('Укажите телефон для связи: не меньше 10 цифр.'); return; }
  hideError();
  exporting = true; setExportState(); button.textContent = 'Готовим PDF…';
  try {
    if (mode === 'server') await ensureCart(true);
    if (!cart.lines.length) throw new Error('Добавьте товары в корзину.');
    const [{ createQuote }, font] = await Promise.all([
      import('../../src/quote.mjs'),
      fetch(new URL('fonts/Inter-Quote.ttf', ROOT)).then(r => { if (!r.ok) throw new Error('Не удалось загрузить шрифт для PDF. Повторите попытку.'); return r.arrayBuffer(); }),
    ]);
    const images = await quoteImages(cart);
    const quote = await createQuote(cart, quoteDetails(), new Uint8Array(font), { images });
    download(quote.bytes, quote.filename, 'application/pdf');
    let sent = true;
    if (mode === 'server') sent = await sendLead(quote, phoneInput.value).catch(() => false);
    toast(sent ? 'Коммерческое предложение готово' : 'КП скачано. Заявку отправить не удалось — позвоните нам: +7 918 24 89 248');
  } catch (error) { showError(error.message || 'Не удалось сформировать PDF.'); }
  finally { exporting = false; button.textContent = 'Скачать КП в PDF'; setExportState(); }
}

// ---------------------------------------------------------------- события
function onClick(event) {
  const target = event.target.closest('[data-add],[data-product],[data-scene],[data-laying],[data-photo],[data-cart-open],[data-remove],[data-qty-step],#cart-retry');
  if (!target || target.disabled) return;
  const d = target.dataset;
  if (target.matches('[data-cart-open]')) { event.preventDefault(); openCart(); return; }
  if (d.add) {
    event.preventDefault();
    if (cart.lines.some(l => l.code === d.add) && !d.addPacks) openCart();
    else addToCart(d.add, d.addPacks ? Number(d.addPacks) : undefined);
    return;
  }
  if (d.product) { event.preventDefault(); openProduct(d.product); return; }
  if (d.scene) { event.preventDefault(); openScene(d.scene); return; }
  if (d.laying) { event.preventDefault(); openLaying(d.laying); return; }
  if (d.photo) { event.preventDefault(); openPhoto({ src: d.photo, alt: d.photoAlt, caption: d.photoCaption, width: d.photoWidth, height: d.photoHeight }); return; }
  if (d.remove) { removeFromCart(d.remove); return; }
  if (d.qtyStep) {
    const line = cart.lines.find(l => l.code === d.code);
    if (line) setPacks(d.code, Math.max(line.product.minPacks, Math.min(MAX_PACKS, line.packs + Number(d.qtyStep))));
    return;
  }
  if (target.id === 'cart-retry') { if (unsaved) mutate(() => unsaved.map(x => ({ ...x })), 'Корзина сохранена'); else ensureCart(true).catch(() => {}); }
}
function onChange(event) {
  const input = event.target.closest?.('[data-qty]');
  if (!input) return;
  const line = cart.lines.find(l => l.code === input.dataset.qty);
  if (!line) return;
  const value = Number(input.value), p = line.product;
  if (!Number.isSafeInteger(value) || value < p.minPacks || value > MAX_PACKS) { toast(`Укажите целое количество от ${p.minPacks} до ${MAX_PACKS} ${p.orderUnit}`); render(); return; }
  setPacks(p.code, value);
}

// при ошибке загрузки фото — аккуратная заглушка
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches('[data-product-image]')) return;
  const placeholder = document.createElement('span');
  placeholder.className = 'media-missing'; placeholder.textContent = 'Фото временно недоступно';
  image.replaceWith(placeholder);
}, true);

export function initShop() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  $('#quote-form')?.addEventListener('submit', exportQuote);
  $('#quote-form')?.addEventListener('input', renderDiscount);
  $('#quote-form')?.addEventListener('change', renderDiscount);
  document.addEventListener('italon:cart-refresh', () => render());
  render();
  ensureCart().catch(() => {});
  window.Italon = {
    cart: { add: addToCart, open: openCart, remove: removeFromCart, setPacks, get: () => shownCart(), ready: () => ensureCart(), get mode() { return mode; } },
    openProduct, openScene, openLaying, openPhoto, loadCatalog, toast,
    pricing: async () => (await loadCatalog()).pricing,
    root: rootRel,
    format: { esc, money, number, fmt, titleRu, normalize },
    closeDialog,
  };
  document.dispatchEvent(new CustomEvent('italon:ready'));
}
