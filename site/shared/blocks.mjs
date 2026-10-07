// Общие блоки страниц (используются при сборке в site/pages/*.mjs).
import { esc, ARROW, positions, collectionUrl } from './format.mjs';

/** Хлебные крошки: items = [[label, path|null], …]; последний — текущая страница. */
export function breadcrumbs(ctx, items) {
  const all = [['Главная', '/'], ...items];
  return `<nav class="breadcrumbs" aria-label="Навигация по разделам"><ol>${all.map(([label, path], i) =>
    `<li>${i < all.length - 1 && path ? `<a href="${ctx.url(path)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}</li>`).join('')}</ol></nav>`;
}

/** Шапка внутренней страницы: крошки, eyebrow, заголовок h1, вводный текст, справа — произвольный HTML. */
export function pageHead(ctx, { crumbs = [], eyebrow = '', title, lead = '', aside = '' }) {
  return `<header class="page-head">
<div class="wrap">
${breadcrumbs(ctx, crumbs)}
<div class="page-head__grid">
<div class="page-head__text">${eyebrow ? `<p class="eyebrow" data-reveal>${eyebrow}</p>` : ''}
<h1 class="t-h1" data-reveal>${title}</h1>
${lead ? `<p class="t-lead page-head__lead" data-reveal>${lead}</p>` : ''}</div>
${aside ? `<div class="page-head__aside" data-reveal>${aside}</div>` : ''}
</div>
</div>
</header>`;
}

/** <img> из данных ({src,width,height}) с lazy по умолчанию. */
export function image(ctx, img, alt, { eager = false } = {}) {
  if (!img) return '<span class="media-missing">Фото уточняется</span>';
  return `<img src="${ctx.media(img.src)}" alt="${esc(alt)}" width="${img.width}" height="${img.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

/** Карточка коллекции: фото 4:5, название, число позиций. */
export function collectionCard(ctx, c, { eager = false } = {}) {
  return `<a class="collection-card" href="${collectionUrl(ctx.root, c.id)}" data-reveal>
<figure class="media collection-card__media">${image(ctx, c.image || c.cover, c.image ? `Коллекция ${c.label} ${c.section === 'x2' ? 'в экстерьере' : 'в интерьере'}` : `Образец плитки коллекции ${c.label}`, { eager })}</figure>
<span class="collection-card__name">${esc(c.label)}</span>
<span class="collection-card__meta">${esc(c.latin)} · ${positions(c.count)}</span></a>`;
}

export { ARROW };
