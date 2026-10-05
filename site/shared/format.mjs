// Общие чистые функции форматирования и шаблоны разметки.
// Используются и при сборке (Node, site/pages/*), и в браузере (site/js/*),
// поэтому карточка товара выглядит одинаково в статическом HTML и в каталоге.

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Map();
export function number(value, max = 3) {
  if (!nf.has(max)) nf.set(max, new Intl.NumberFormat('ru-RU', { maximumFractionDigits: max }));
  return nf.get(max).format(value);
}
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
export const money = kopecks => rub.format(kopecks / 100);
/** «120X278» → «120 × 278» (неразрывные пробелы) */
export const fmt = value => String(value || '').replace(/[XХ]/g, ' × ');
export function plural(v, [one, few, many]) { const a = Math.abs(v) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; }
export const positions = n => `${number(n, 0)} ${plural(n, ['позиция', 'позиции', 'позиций'])}`;
export const lower = s => String(s || '').toLocaleLowerCase('ru-RU');
/** «АУРА X2» → «Аура X2» */
export const titleRu = s => lower(s).replace(/^./u, c => c.toLocaleUpperCase('ru-RU')).replace(/[xх]2/gi, 'X2');
export const normalize = s => lower(s).replace(/ё/g, 'е').replace(/[х×]/g, 'x').replace(/\s+/g, ' ').trim();
export const packLabel = p => p.boxed ? `${number(p.unitsPerPack)} ${p.unit} в коробке` : 'Поштучная продажа';
export const minimumLabel = p => `Минимум: ${p.minimum}${p.minPacks > 1 && p.boxed ? ` · ${number(p.minPacks)} кор.` : ''}`;

/** Путь медиа из данных («/media/…») → относительный к корню сайта. */
export const media = (root, src) => root + String(src || '').replace(/^\//, '');

export const ARROW = '<svg class="arrow" viewBox="0 0 26 10" aria-hidden="true"><path d="M0 5h24.5M20 .8 24.6 5 20 9.2"/></svg>';
export const CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1l14 14M15 1 1 15"/></svg>';

/** Фото товара: <img> или заглушка. place: card | detail | cart */
export function productImage(p, root, place = 'card') {
  const image = p.image;
  if (!image) return `<span class="media-missing">${p.collectionId === 'packaging' ? 'Транспортировочная упаковка' : 'Фото уточняется'}</span>`;
  const alt = image.kind === 'collection' ? `Пример коллекции ${titleRu(p.collection)}; фото артикула уточняется` : p.name;
  return `<img src="${esc(media(root, image.src))}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" loading="${place === 'detail' ? 'eager' : 'lazy'}" decoding="async" data-product-image>`;
}

export const CART_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5h2.2l2 10.2h10.6l1.9-7.4H7"/><circle cx="9.5" cy="19" r="1.1"/><circle cx="17" cy="19" r="1.1"/></svg>';
export const PLUS_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14"/></svg>';
/** Ссылка на страницу товара относительно корня. */
export const productUrl = (root, code) => `${root}product/${code}/`;
export const collectionUrl = (root, id) => `${root}collections/${id}/`;
/** Цена «12 345,00 ₽ / м²» или «Уточнить стоимость», если цены нет. */
export const priceHtml = p => p.priceKopecks > 0 ? `${money(p.priceKopecks)} <small>/\u00a0${esc(p.unit)}</small>` : 'Уточнить стоимость';

/**
 * Карточка товара (бриф: крупное фото целиком, название, коллекция, артикул, варианты отделки, цена).
 * Ссылки ведут на /product/<code>/; кнопка «+» добавляет в корзину через shop.mjs (data-add).
 * @param {object} p        товар из каталога
 * @param {string} root     относительный путь к корню сайта
 * @param {object} [o]      { headingLevel = 3, variants = 0 (число вариантов отделки), lazy = true }
 */
export function productCard(p, root, { headingLevel = 3, variants = 0, lazy = true } = {}) {
  const scene = p.image?.kind === 'collection';
  const h = `h${headingLevel}`;
  const href = productUrl(root, p.code);
  const img = productImage(p, root).replace(lazy ? '' : 'loading="lazy"', lazy ? '' : 'loading="eager"');
  return `<article class="product-card" data-code="${esc(p.code)}">
<a class="product-card__photo${scene ? ' is-scene' : ''}" href="${href}" tabindex="-1" aria-hidden="true">${img}${scene ? '<span class="product-card__badge">Фото коллекции</span>' : ''}</a>
<div class="product-card__body">
<p class="product-card__collection">${esc(titleRu(p.collection))}</p>
<${h} class="product-card__title"><a href="${href}">${esc(p.name)}</a></${h}>
<p class="product-card__code">Арт. ${esc(p.code)}${p.format ? `\u00a0· ${esc(fmt(p.format))}` : ''}</p>
<p class="product-card__spec">${esc(p.finish ? lower(p.finish) : 'Транспортировочная упаковка')}</p>
${variants > 1 ? `<p class="product-card__variants">${variants}\u00a0${plural(variants, ['вариант', 'варианта', 'вариантов'])} отделки</p>` : ''}
</div>
<div class="product-card__foot"><p class="product-card__price">${priceHtml(p)}</p>
<button type="button" class="product-card__add" data-add="${esc(p.code)}" aria-label="В корзину: ${esc(p.name)}"${p.canOrder ? '' : ' disabled'}>${PLUS_ICON}</button></div>
</article>`;
}
