// /catalog/ — каталог: поиск по названию и артикулу, фильтры (раздел, категория, коллекция, отделка,
// формат, цена), сортировка, «Показать ещё». Без JS виден первый экран позиций (статический HTML);
// с JS (site/js/pages/catalog.mjs) — фильтры из адреса: ?q=&section=&category=&collection=&finish=&format=&price_from=&price_to=&sort=&page=
// (category, collection, finish, format можно повторять: ?format=60X120&format=80X160).
import { productCard, fmt, positions, esc, CLOSE } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { products, stats, variantsOf, categoryOf } from '../data.mjs';

const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const FILTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11M18 7h3M3 17h4M11 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>';

const facet = (id, title, body, { open = true } = {}) => `<details class="facet" data-facet="${id}"${open ? ' open' : ''}>
<summary class="facet__summary"><span class="facet__title">${title}</span><span class="facet__count" data-facet-count></span></summary>
<fieldset class="facet__body"><legend class="sr-only">${title}</legend>${body}</fieldset>
</details>`;

export default {
  path: '/catalog/',
  title: 'Каталог',
  description: `Каталог Italon, X2, Coliseum и Контракт: ${stats.total} позиции с ценами по прайсу от 01.07.2026, поиск по названию и артикулу, фильтры по коллекции, формату, отделке и цене.`,
  styles: ['catalog'],
  scripts: ['catalog'],
  render: ctx => {
    const mosaic = products.filter(p => categoryOf(p) === 'mosaic').length;
    const maxi = products.filter(p => p.format === stats.largestFormat).length;
    const quick = [
      ['?section=italon', 'Italon · интерьер', stats.italon],
      ['?section=x2', 'X2 · улица', stats.x2],
      ['?section=coliseum', 'Coliseum', stats.coliseum],
      ['?section=contract', 'Контракт', stats.contract],
      ['?category=mosaic', 'Мозаика', mosaic],
      [`?format=${stats.largestFormat}`, `Макси-формат ${fmt(stats.largestFormat)}`, maxi],
    ];
    const base = ctx.url('/catalog/');
    return `${pageHead(ctx, {
      crumbs: [['Каталог']],
      eyebrow: 'Прайс от 01.07.2026 · склад Краснодар',
      title: 'Каталог',
      lead: `${positions(stats.total)}: ${stats.italon} Italon для интерьера, ${stats.x2} X2 толщиной 20&nbsp;мм для улицы, ${stats.coliseum} Coliseum и ${stats.contract} Контракт. Ищите по названию или артикулу, отбирайте по коллекции, формату, отделке и цене.`,
      aside: `<nav class="catalog-quick" aria-label="Быстрый выбор"><p class="eyebrow">Быстрый выбор</p><ul role="list">${quick.map(([q, label, n]) =>
        `<li><a href="${base}${q}" data-catalog-link>${esc(label)} <span>${n}</span></a></li>`).join('')}</ul></nav>`,
    })}
<section class="catalog" aria-label="Позиции каталога">
<div class="wrap catalog__layout" id="catalog">
<form class="catalog__form" id="catalog-filters" role="search" aria-label="Поиск и фильтры каталога" hidden>
<div class="catalog__toolbar">
<label class="catalog__search"><span class="sr-only">Поиск по названию или артикулу</span>${SEARCH}<input class="catalog__search-input" type="search" name="q" placeholder="Название, цвет или артикул" autocomplete="off" enterkeyhint="search" aria-describedby="catalog-count"></label>
<button type="button" class="catalog__filters-btn" id="catalog-filters-open" aria-controls="catalog-aside" aria-expanded="false" aria-haspopup="dialog">${FILTER}<span>Фильтры</span><span class="catalog__badge" data-active-count hidden></span></button>
<label class="catalog__sort"><span class="catalog__sort-label">Сортировка</span><select class="select" name="sort"><option value="">По умолчанию</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="name">По названию, А — Я</option></select></label>
</div>
<aside class="catalog__aside" id="catalog-aside" aria-labelledby="catalog-filters-title">
<div class="filters">
<div class="filters__head"><h2 class="filters__title" id="catalog-filters-title">Фильтры</h2>
<button type="button" class="filters__reset" data-catalog-reset hidden>Сбросить всё</button>
<button type="button" class="filters__close" data-filters-close aria-label="Закрыть фильтры">${CLOSE}</button></div>
<div class="filters__body">
${facet('section', 'Раздел', '<div class="facet__options" data-options="section"></div>')}
${facet('category', 'Категория', '<div class="facet__options" data-options="category"></div>')}
${facet('collection', 'Коллекция', '<div class="facet__options" data-options="collection"></div><button type="button" class="facet__more" data-more="collection" hidden></button>')}
${facet('finish', 'Отделка', '<div class="facet__options" data-options="finish"></div>')}
${facet('format', 'Формат, см', '<div class="facet__options" data-options="format"></div><button type="button" class="facet__more" data-more="format" hidden></button>')}
${facet('price', 'Цена, ₽', `<div class="facet__price"><label class="field"><span class="field__label">от</span><input class="input" type="number" name="price_from" inputmode="numeric" min="0" step="1" aria-describedby="catalog-price-hint"></label>
<label class="field"><span class="field__label">до</span><input class="input" type="number" name="price_to" inputmode="numeric" min="0" step="1" aria-describedby="catalog-price-hint"></label></div>
<p class="field__hint" id="catalog-price-hint">За м² или за штуку — как в прайсе, с НДС.</p>`)}
</div>
<div class="filters__foot"><button type="button" class="btn btn--outline" data-catalog-reset>Сбросить</button><button type="button" class="btn" data-filters-close id="catalog-apply">Показать</button></div>
</div>
</aside>
</form>
<div class="catalog__backdrop" data-filters-close hidden></div>
<div class="catalog__summary">
<p class="catalog__count" id="catalog-count" role="status">${positions(stats.total)} · показаны первые 24</p>
<ul class="catalog__chips" id="catalog-chips" role="list" aria-label="Выбранные фильтры" hidden></ul>
</div>
<div class="product-grid catalog__grid" id="catalog-grid">${products.slice(0, 24).map(p => productCard(p, ctx.root, { variants: variantsOf(p).length })).join('\n')}</div>
<script>(function(){var s=location.search.replace(/^\\?/,'').split('&').filter(function(x){return x&&!/^page=/.test(x)});if(s.length)document.getElementById('catalog-grid').classList.add('is-pending')})();</script>
<div class="catalog__more" id="catalog-more" hidden></div>
<noscript><p class="t-small catalog__noscript">Поиск и фильтры работают при включённом JavaScript. Все позиции доступны на <a class="link" href="${ctx.url('/collections/')}">страницах коллекций</a>.</p></noscript>
</div>
</section>`;
  },
};
