// /collections/ — индекс коллекций по линиям; /collections/<id>/ — страница каждой коллекции.
// Каркас этапа A: аккуратная базовая версия; этап B может расширить (фильтры, галереи).
import { esc, fmt, positions, plural, productCard, money, ARROW } from '../shared/format.mjs';
import { pageHead, image, collectionCard } from '../shared/blocks.mjs';
import { collectionRows } from '../shared/collection-tiles.mjs';
import { collections, italonCollections, x2Collections, stats, variantsOf } from '../data.mjs';

const listRu = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} и ${items.at(-1)}` : items[0] || '';

// ---------- Индекс: журнальное вступление, переключатель линий без перезагрузки, асимметричная сетка ----------
const maxPlate = list => list.flatMap(c => c.plateFormats).sort((a, b) => b.split('X').reduce((x, y) => x * y, 1) - a.split('X').reduce((x, y) => x * y, 1))[0];
const LINES = [
  { id: 'italon', list: italonCollections, eyebrow: 'Интерьер', title: 'Italon', count: stats.italon,
    text: 'Керамогранит для полов и стен: крупные плиты, мозаика и декор в одной гамме.', link: ['/catalog/', 'Позиции Italon в каталоге'], query: '?section=italon' },
  { id: 'x2', list: x2Collections, eyebrow: 'Улица · 20 мм', title: 'X2', count: stats.x2,
    text: 'Плиты толщиной 20 мм для террас, садовых дорожек и зоны у бассейна. Четыре способа укладки.', link: ['/x2/', 'Про X2 и способы укладки'] },
];
const index = {
  path: '/collections/',
  title: 'Коллекции',
  description: `${stats.collections} коллекции керамогранита Italon и X2 с интерьерными фото.`,
  styles: ['collections'],
  scripts: ['collections'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Коллекции']], eyebrow: 'Italon и X2', title: 'Коллекции',
    lead: `${stats.collections} коллекции: ${italonCollections.length} — Italon для интерьера, ${x2Collections.length} — X2 толщиной 20&nbsp;мм для открытых пространств. В&nbsp;каждой — форматы, отделки и все позиции прайса.`,
    aside: `<a class="link-arrow" href="${ctx.url('/catalog/')}">Все ${stats.total} позиции ${ARROW}</a>` })}
<div class="cx-bar">
<div class="wrap cx-bar__inner">
<div class="cx-switch" role="group" aria-label="Показать коллекции линии" data-cx-switch hidden>
<button type="button" class="cx-switch__btn" data-line="all" aria-pressed="true">Все <span class="cx-switch__n">${stats.collections}</span></button>
${LINES.map(l => `<button type="button" class="cx-switch__btn" data-line="${l.id}" aria-pressed="false">${l.id === 'x2' ? 'X2<span class="cx-long"> · улица</span> 20&nbsp;мм' : 'Italon<span class="cx-long"> · интерьер</span>'} <span class="cx-switch__n">${l.list.length}</span></button>`).join('\n')}
</div>
<nav class="cx-jump" aria-label="Линии коллекций" data-cx-jump>${LINES.map(l => `<a class="link-arrow" href="#${l.id}">${l.title} · ${l.list.length}</a>`).join('')}</nav>
<p class="cx-bar__facts t-small">${positions(stats.total)} · форматы до ${fmt(stats.largestFormat)}&nbsp;см</p>
</div>
</div>
<p class="sr-only" role="status" id="cx-status"></p>
${LINES.map((l, i) => `<section class="section cx-line${i ? ' section--alt' : ''}" id="${l.id}" data-line-section="${l.id}" aria-labelledby="${l.id}-title">
<div class="wrap">
<div class="cx-line__head">
<div class="cx-line__title"><p class="eyebrow" data-reveal>${l.eyebrow}</p><h2 class="t-h2" id="${l.id}-title" data-reveal>${l.title}</h2></div>
<div class="cx-line__text" data-reveal><p class="t-body">${esc(l.text)}</p>
<p class="cx-line__facts t-small">${l.list.length} ${plural(l.list.length, ['коллекция', 'коллекции', 'коллекций'])} · ${positions(l.count)} · форматы до ${fmt(maxPlate(l.list))}&nbsp;см</p>
<a class="link-arrow" href="${ctx.url(l.link[0])}${l.query || ''}">${l.link[1]} ${ARROW}</a></div>
</div>
${collectionRows(ctx, l.list, { eagerFirst: i ? 0 : 2 })}
</div>
</section>`).join('\n')}`,
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
