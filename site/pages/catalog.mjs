// /catalog/ — каталог с поиском и фильтрами. Каркас этапа A: без JS виден первый экран позиций,
// с JS (site/js/pages/catalog.mjs) — поиск, фильтры из адреса (?q, section, category, collection, format, finish), пагинация.
import { productCard, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { products, stats, variantsOf } from '../data.mjs';

export default {
  path: '/catalog/',
  title: 'Каталог',
  description: `Каталог Italon и X2: ${stats.total} позиции с ценами по прайсу от 01.07.2026, поиск по названию и артикулу.`,
  styles: ['catalog'],
  scripts: ['catalog'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Каталог']], title: 'Каталог', lead: `${stats.total} позиции: ${stats.italon} Italon и ${stats.x2} X2. Цены по прайсу от 01.07.2026, склад Краснодар, с НДС.` })}
<section class="section catalog" style="padding-top:0" aria-label="Позиции каталога">
<div class="wrap">
<form class="catalog__filters" id="catalog-filters" role="search" hidden>
<label class="field catalog__search"><span class="field__label">Поиск</span><input class="input" type="search" name="q" placeholder="Название, цвет или артикул" autocomplete="off"></label>
<label class="field"><span class="field__label">Раздел</span><select class="select" name="section"><option value="">Italon и X2</option><option value="italon">Italon · интерьер</option><option value="x2">X2 · улица</option></select></label>
<label class="field"><span class="field__label">Категория</span><select class="select" name="category"><option value="">Все</option></select></label>
<label class="field"><span class="field__label">Коллекция</span><select class="select" name="collection"><option value="">Все</option></select></label>
<label class="field"><span class="field__label">Формат</span><select class="select" name="format"><option value="">Все</option></select></label>
<label class="field"><span class="field__label">Отделка</span><select class="select" name="finish"><option value="">Все</option></select></label>
<button type="reset" class="btn btn--outline catalog__reset">Сбросить</button>
</form>
<p class="t-small catalog__count" id="catalog-count" role="status">Показаны первые 24 из ${stats.total} позиций</p>
<div class="product-grid" id="catalog-grid">${products.slice(0, 24).map(p => productCard(p, ctx.root, { variants: variantsOf(p).length })).join('\n')}</div>
<nav class="pagination" id="catalog-pages" aria-label="Страницы каталога"></nav>
<noscript><p class="t-small" style="margin-top:2rem">Поиск и фильтры работают при включённом JavaScript. Все позиции доступны на <a class="link" href="${ctx.url('/collections/')}">страницах коллекций</a>.</p></noscript>
</div>
</section>`,
};
