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

// ---------- Страница коллекции /collections/<id>/ (этап B2) ----------
// Обложка (интерьерный кадр), линия, число позиций, форматы и отделки из прайса, текст только по данным,
// фильтры по формату и отделке без перезагрузки (site/js/pages/collection.mjs), сетка карточек,
// «Открыть в каталоге» с фильтром, соседние коллекции и «Следующая коллекция».
import { breadcrumbs as crumbsB } from '../shared/blocks.mjs';
import { esc as escB, positions as positionsB, productCard as cardB, money as moneyB, ARROW as ARROW_B } from '../shared/format.mjs';
import { finishInfo, formatLabel } from '../shared/product-view.mjs';
import { finishVariantsOf, categoryOf as categoryOfB } from '../data.mjs';

const listB = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} и ${items.at(-1)}` : items[0] || '';
const fmtB = f => formatLabel({ format: f }).replace(/ см$/, '');
const surfaceOf = p => finishInfo(p).surface || 'без отделки';
const femB = list => list.map(f => f.replace(/ый$/, 'ая'));
const capB = s => s ? s[0].toLocaleUpperCase('ru-RU') + s.slice(1) : '';

/** Краткий текст только из данных прайса. */
function collectionLead(c) {
  const kinds = [...new Set(c.items.map(categoryOfB))];
  const extra = [kinds.includes('mosaic') && 'мозаика', kinds.includes('decor') && 'декоративные элементы'].filter(Boolean);
  const what = c.section === 'x2' ? 'Керамогранит X2 толщиной 20&nbsp;мм для открытых пространств' : 'Керамогранит Italon для интерьера';
  const formats = c.plateFormats.length ? `${c.plateFormats.length > 1 ? 'форматы' : 'формат'} ${listB(c.plateFormats.map(fmtB))}&nbsp;см` : '';
  return `${what}: ${positionsB(c.count)} в прайсе${formats ? `, ${formats}` : ''}${extra.length ? `; ${listB(extra)}` : ''}. Поверхность — ${listB(femB(c.finishes))}${c.rectified ? ', кромка ректифицированная' : ''}.`;
}

function chipGroup(name, label, values, counts) {
  if (values.length < 2) return '';
  return `<div class="col-filter" role="group" aria-label="${escB(label)}"><span class="col-filter__label">${escB(label)}</span>
<div class="chips"><button type="button" class="chip" data-filter="${name}" data-value="" aria-pressed="true">Все</button>${values.map(v => `<button type="button" class="chip" data-filter="${name}" data-value="${escB(v.value)}" aria-pressed="false">${escB(v.label)} <small>${counts.get(v.value)}</small></button>`).join('')}</div></div>`;
}

function collectionPage(c, i, list) {
  const next = list[(i + 1) % list.length];
  const prev = list[(i - 1 + list.length) % list.length];
  const neighbours = [1, 2, 3, 4].map(k => list[(i + k) % list.length]).filter(x => x.id !== c.id).slice(0, 4);
  const x2 = c.section === 'x2';
  const line = x2 ? 'X2 · улица, 20 мм' : 'Italon · интерьер';
  const img = c.image;
  const alt = `Коллекция ${c.label} ${x2 ? 'в экстерьере' : 'в интерьере'}`;
  const formatCounts = new Map(), finishCounts = new Map();
  for (const p of c.items) {
    formatCounts.set(p.format, (formatCounts.get(p.format) || 0) + 1);
    finishCounts.set(surfaceOf(p), (finishCounts.get(surfaceOf(p)) || 0) + 1);
  }
  const formatValues = c.formats.map(f => ({ value: f, label: fmtB(f) }));
  const finishValues = [...finishCounts.keys()].map(f => ({ value: f, label: capB(f) }));
  const decor = [...new Set(c.formats.filter(f => !c.plateFormats.includes(f)).map(f => capB(f.split(' ')[0].toLocaleLowerCase('ru-RU'))))];
  const catalogHref = rel => `${rel('/catalog/')}?collection=${c.id}`;
  return {
    path: `/collections/${c.id}/`,
    name: 'collection',
    title: `Коллекция ${c.label}`,
    description: `Коллекция ${c.label} (${c.latin}): ${positionsB(c.count)}${c.plateFormats.length ? `, форматы ${c.plateFormats.map(fmtB).join(', ')} см` : ''}. Цены по прайсу от 01.07.2026.`,
    styles: ['collection'],
    scripts: ['collection'],
    render: ctx => `<div class="wrap">${crumbsB(ctx, [['Коллекции', '/collections/'], [c.label]])}</div>
<section class="col-hero${x2 ? ' col-hero--x2' : ''}" aria-labelledby="col-title">
<div class="wrap col-hero__grid">
<div class="col-hero__text">
<p class="eyebrow" data-reveal>${escB(line)}</p>
<h1 class="t-hero col-hero__title" id="col-title" data-reveal data-reveal-delay="60">${escB(c.label)}</h1>
<p class="col-hero__latin" data-reveal data-reveal-delay="90">${escB(c.latin)}</p>
<p class="t-lead col-hero__lead" data-reveal data-reveal-delay="120">${collectionLead(c)}</p>
<div class="btn-row" data-reveal data-reveal-delay="180"><a class="btn" href="${catalogHref(ctx.url)}">Открыть в каталоге</a><a class="btn btn--outline" href="#items">Позиции коллекции</a></div>
</div>
<figure class="col-hero__figure" data-reveal>
${img ? `<button type="button" class="media media--hover col-hero__media" data-scene="${escB(c.id)}" style="--w:${img.width}px;--ratio:${img.width}/${img.height}" aria-label="Увеличить фото коллекции ${escB(c.label)}"><img src="${ctx.media(img.src)}" alt="${escB(alt)}" width="${img.width}" height="${img.height}" fetchpriority="high" decoding="async"></button>` : '<span class="media-missing">Фото уточняется</span>'}
<figcaption class="media-note">${escB(img?.caption || `Коллекция ${c.label} (${c.latin}) ${x2 ? 'на улице' : 'в интерьере'}`)}</figcaption>
</figure>
</div>
</section>
<section class="col-facts" aria-label="Коллекция в цифрах">
<div class="wrap"><dl class="col-facts__list" data-reveal-group>
<div data-reveal><dt>Позиций в прайсе</dt><dd>${c.count}</dd></div>
<div data-reveal><dt>${c.plateFormats.length > 1 ? 'Форматы плит, см' : c.plateFormats.length ? 'Формат плит, см' : 'Форматы, см'}</dt><dd>${escB((c.plateFormats.length ? c.plateFormats : c.formats).map(fmtB).join(' · '))}${decor.length ? `<small>${escB(listB(decor))}</small>` : ''}</dd></div>
<div data-reveal><dt>Поверхность</dt><dd>${escB(capB(listB(femB(c.finishes))))}${c.rectified ? '<small>Кромка ректифицированная</small>' : ''}${x2 ? '<small>Толщина 20 мм</small>' : ''}</dd></div>
<div data-reveal><dt>Цена</dt><dd>${c.minPriceKopecks ? `от ${moneyB(c.minPriceKopecks)}<small>за м², с НДС, прайс от 01.07.2026</small>` : 'Уточнить стоимость'}</dd></div>
</dl></div>
</section>
<section class="section col-items" id="items" aria-labelledby="items-title" data-collection="${escB(c.id)}">
<div class="wrap">
<div class="section-head"><div class="section-head__text"><h2 class="t-h2" id="items-title" data-reveal>Позиции коллекции</h2>
<p class="t-small col-items__status" data-col-status aria-live="polite">${positionsB(c.count)}</p></div>
<a class="link-arrow" href="${catalogHref(ctx.url)}" data-col-catalog data-reveal>Открыть в каталоге ${ARROW_B}</a></div>
<div class="col-filters" data-col-filters hidden>
${chipGroup('format', 'Формат', formatValues, formatCounts)}
${chipGroup('finish', 'Отделка', finishValues, finishCounts)}
</div>
<div class="product-grid col-grid" data-col-grid>
${c.items.map(p => `<div class="col-grid__item" data-format="${escB(p.format)}" data-finish="${escB(surfaceOf(p))}">${cardB(p, ctx.root, { variants: finishVariantsOf(p).length })}</div>`).join('\n')}
</div>
<div class="empty-state" data-col-empty hidden><strong>Нет позиций с такими параметрами</strong><p>Измените формат или отделку.</p><button type="button" class="btn btn--outline" data-col-reset>Сбросить фильтры</button></div>
</div>
</section>
<section class="section section--alt col-more" aria-labelledby="more-title">
<div class="wrap">
<div class="section-head"><div class="section-head__text"><p class="eyebrow" data-reveal>${escB(line)}</p><h2 class="t-h2" id="more-title" data-reveal>Соседние коллекции</h2></div>
<a class="link-arrow" href="${ctx.url('/collections/')}" data-reveal>Все коллекции ${ARROW_B}</a></div>
<div class="collection-grid" data-reveal-group>${neighbours.map(n => collectionCard(ctx, n)).join('\n')}</div>
</div>
</section>
<nav class="col-next" aria-label="Соседние коллекции: предыдущая и следующая">
<div class="wrap col-next__grid">
<a class="col-next__prev" href="${ctx.url(`/collections/${prev.id}/`)}"><span class="eyebrow">← Предыдущая</span><span class="col-next__prev-name">${escB(prev.label)}</span></a>
<a class="col-next__next" href="${ctx.url(`/collections/${next.id}/`)}">
<span class="col-next__text"><span class="eyebrow">Следующая коллекция</span><span class="col-next__name">${escB(next.label)} ${ARROW_B}</span><span class="col-next__meta">${escB(next.latin)} · ${positionsB(next.count)}</span></span>
${next.image ? `<span class="media col-next__media"><img src="${ctx.media(next.image.src)}" alt="" width="${next.image.width}" height="${next.image.height}" loading="lazy" decoding="async"></span>` : ''}
</a>
</div>
</nav>`,
  };
}

export default [index, ...italonCollections.map(collectionPage), ...x2Collections.map(collectionPage)];
