// /collections/ — индекс коллекций по линиям; /collections/<id>/ — страница каждой коллекции.
// Каркас этапа A: аккуратная базовая версия; этап B может расширить (фильтры, галереи).
import { esc, fmt, positions, productCard, money, ARROW } from '../shared/format.mjs';
import { pageHead, image, collectionCard } from '../shared/blocks.mjs';
import { collections, italonCollections, x2Collections, stats, variantsOf } from '../data.mjs';

const listRu = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} и ${items.at(-1)}` : items[0] || '';

const index = {
  path: '/collections/',
  title: 'Коллекции',
  description: `${stats.collections} коллекции керамогранита Italon и X2 с интерьерными фото.`,
  render: ctx => `${pageHead(ctx, { crumbs: [['Коллекции']], eyebrow: 'Italon и X2', title: 'Коллекции',
    lead: `${italonCollections.length} коллекции Italon для интерьера и ${x2Collections.length} коллекций X2 толщиной 20&nbsp;мм для открытых пространств.`,
    aside: `<a class="link-arrow" href="${ctx.url('/catalog/')}">Все ${stats.total} позиции ${ARROW}</a>` })}
<section class="section" id="italon" aria-labelledby="italon-title" style="padding-top:0">
<div class="wrap"><div class="section-head"><div class="section-head__text"><p class="eyebrow">Интерьер</p><h2 class="t-h2" id="italon-title">Italon</h2></div><span class="t-small">${positions(stats.italon)}</span></div>
<div class="collection-grid" data-reveal-group>${italonCollections.map((c, i) => collectionCard(ctx, c, { eager: i < 4 })).join('\n')}</div></div>
</section>
<section class="section section--alt" id="x2" aria-labelledby="x2-title">
<div class="wrap"><div class="section-head"><div class="section-head__text"><p class="eyebrow">Улица · 20 мм</p><h2 class="t-h2" id="x2-title">X2</h2></div><a class="link-arrow" href="${ctx.url('/x2/')}">Про X2 и укладку ${ARROW}</a></div>
<div class="collection-grid" data-reveal-group>${x2Collections.map(c => collectionCard(ctx, c)).join('\n')}</div></div>
</section>`,
};

function collectionPage(c, i, list) {
  const next = list[(i + 1) % list.length];
  const prev = list[(i - 1 + list.length) % list.length];
  return {
    path: `/collections/${c.id}/`,
    name: 'collection',
    title: `Коллекция ${c.label}`,
    description: `Коллекция ${c.label} (${c.latin}): ${positions(c.count)}, форматы ${c.plateFormats.map(fmt).join(', ')}. Цены по прайсу от 01.07.2026.`,
    styles: ['collection'],
    render: ctx => `${pageHead(ctx, { crumbs: [['Коллекции', '/collections/'], [c.label]], eyebrow: `${c.section === 'x2' ? 'X2 · улица, 20 мм' : 'Italon · интерьер'} · ${esc(c.latin)}`, title: esc(c.label),
      aside: `${positions(c.count)}${c.minPriceKopecks ? `<br>от ${money(c.minPriceKopecks)} за м²` : ''}` })}
<section class="section collection-intro" style="padding-top:0">
<div class="wrap grid">
<figure class="collection-intro__figure" data-reveal>
<button type="button" class="media media--hover collection-intro__media" data-scene="${esc(c.id)}" aria-label="Увеличить фото коллекции ${esc(c.label)}">${image(ctx, c.image, `Коллекция ${c.label} ${c.section === 'x2' ? 'в экстерьере' : 'в интерьере'}`, { eager: true })}</button>
${c.image?.caption ? `<figcaption class="media-note">${esc(c.image.caption)}</figcaption>` : ''}
</figure>
<div class="collection-intro__text" data-reveal>
<dl class="specs">
<div><dt>Позиций</dt><dd>${c.count}</dd></div>
${c.plateFormats.length ? `<div><dt>Форматы плит, см</dt><dd>${c.plateFormats.map(fmt).join(', ')}</dd></div>` : ''}
${c.formats.length > c.plateFormats.length ? `<div><dt>Мозаика и декор</dt><dd>${[...new Set(c.formats.filter(f => !c.plateFormats.includes(f)).map(f => f.split(' ')[0].toLocaleLowerCase('ru-RU')))].join(', ')}</dd></div>` : ''}
<div><dt>Поверхность</dt><dd>${esc(listRu(c.finishes))}${c.rectified ? '; ректифицированная кромка' : ''}</dd></div>
<div><dt>Раздел</dt><dd>${c.section === 'x2' ? 'X2 — 20 мм, для открытых пространств' : 'Italon — для интерьера'}</dd></div>
</dl>
<p class="t-small">Цены по прайсу от 01.07.2026, склад Краснодар, с НДС. Наличие, тон и калибр уточняются.</p>
<a class="btn btn--outline" href="${ctx.url('/catalog/')}?collection=${esc(c.id)}">Подобрать в каталоге</a>
</div>
</div>
</section>
<section class="section" aria-labelledby="items-title" style="padding-top:0">
<div class="wrap">
<div class="section-head"><h2 class="t-h3" id="items-title">Позиции коллекции</h2><span class="t-small">${positions(c.count)}</span></div>
<div class="product-grid">${c.items.map(p => productCard(p, ctx.root, { variants: variantsOf(p).length })).join('\n')}</div>
</div>
</section>
<nav class="section section--alt collection-next" aria-label="Другие коллекции">
<div class="wrap collection-next__grid">
<a class="collection-next__link" href="${ctx.url(`/collections/${prev.id}/`)}"><span class="eyebrow">Предыдущая</span><span class="t-h3">${esc(prev.label)}</span></a>
<a class="collection-next__link collection-next__link--next" href="${ctx.url(`/collections/${next.id}/`)}"><span class="eyebrow">Следующая коллекция</span><span class="t-h3">${esc(next.label)} ${ARROW}</span></a>
</div>
</nav>`,
  };
}

export default [index, ...italonCollections.map(collectionPage), ...x2Collections.map(collectionPage)];
