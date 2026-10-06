// /x2/ — X2, керамогранит 20 мм для открытых пространств: ключевые цифры, три сценария,
// четыре способа укладки (вкладки, увеличение фото), коллекции X2, переход в каталог.
// Только факты из данных: прайс (src/catalog.mjs), сцены (src/scenes.mjs), фото укладки и их источник.
import { esc, fmt, money, positions, plural, collectionUrl, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { collectionRows } from '../shared/collection-tiles.mjs';
import { x2Collections, outdoorSpaces, layingMethods, stats, collections } from '../data.mjs';
import provenance from '../../data/context-image-provenance.json' with { type: 'json' };

const col = id => collections.find(c => c.id === id);
const area = f => f.split('X').reduce((a, b) => a * Number(b), 1);
const plates = [...new Set(x2Collections.flatMap(c => c.plateFormats))].sort((a, b) => area(b) - area(a));
const finishes = [...new Set(x2Collections.flatMap(c => c.finishes))];
const minPrice = Math.min(...x2Collections.map(c => c.minPriceKopecks).filter(Boolean));
const MAX = 1.3; // фото укладки не растягиваем больше 1.3×

const img = (ctx, image, alt, extra = '') =>
  `<img src="${ctx.media(image.src)}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async"${extra}>`;

function intro() {
  const figures = [
    ['20 мм', 'толщина плиты X2'],
    [String(x2Collections.length), `${plural(x2Collections.length, ['коллекция', 'коллекции', 'коллекций'])} в прайсе`],
    [String(stats.x2), `${plural(stats.x2, ['позиция', 'позиции', 'позиций'])}, от ${money(minPrice)} за м²`],
    [String(Object.keys(layingMethods).length), 'способа укладки']
  ];
  return `<section class="x2-figures" aria-label="X2 в цифрах">
<div class="wrap"><dl class="x2-figures__list" data-reveal-group>${figures.map(([n, t]) => `<div data-reveal><dt class="x2-figures__n">${esc(n)}</dt><dd class="x2-figures__t">${esc(t)}</dd></div>`).join('')}</dl>
<p class="x2-figures__note t-small">Форматы плит: ${plates.map(f => `${fmt(f)}`).join(', ')}&nbsp;см. Поверхность: ${esc(finishes.join(', '))}. Цены по прайсу от 01.07.2026, склад Краснодар, с НДС.</p></div>
</section>`;
}

function scenes(ctx) {
  return `<section class="section x2-scenes" aria-labelledby="scenes-title">
<div class="wrap">
<div class="x2-head"><p class="eyebrow" data-reveal>Где укладывают X2</p><h2 class="t-h2" id="scenes-title" data-reveal>Три сценария для открытых пространств</h2></div>
<div class="x2-scenes__list">
${outdoorSpaces.map((s, i) => {
    const c = col(s.collectionId);
    return `<article class="x2-scene${i % 2 ? ' x2-scene--flip' : ''}" aria-labelledby="scene-${s.id}">
<a class="x2-scene__media media" href="${collectionUrl(ctx.root, c.id)}" tabindex="-1" aria-hidden="true" style="--nw:${c.image.width}px" data-reveal>${img(ctx, c.image, `${s.label}: коллекция ${c.label}`)}</a>
<div class="x2-scene__text" data-reveal>
<p class="x2-scene__num t-num">${String(i + 1).padStart(2, '0')}</p>
<h3 class="t-h2 x2-scene__title" id="scene-${s.id}">${esc(s.label)}</h3>
<p class="t-lead x2-scene__lead">${esc(s.description)}</p>
<dl class="specs x2-scene__specs">
<div><dt>На фото</dt><dd>${esc(c.label)}</dd></div>
<div><dt>Позиций</dt><dd>${c.count}</dd></div>
<div><dt>Форматы, см</dt><dd>${c.plateFormats.map(fmt).join(', ')}</dd></div>
<div><dt>Поверхность</dt><dd>${esc(c.finishes.join(', '))}</dd></div>
</dl>
<div class="x2-scene__links"><a class="btn" href="${collectionUrl(ctx.root, c.id)}">Коллекция ${esc(c.label)}</a><a class="link-arrow" href="${ctx.url('/catalog/')}?collection=${esc(c.id)}">Позиции в каталоге ${ARROW}</a></div>
</div>
</article>`;
  }).join('\n')}
</div>
</div>
</section>`;
}

function laying(ctx) {
  const entries = Object.entries(layingMethods);
  return `<section class="section section--alt x2-laying" aria-labelledby="laying-title">
<div class="wrap">
<div class="x2-laying__head">
<div class="x2-head"><p class="eyebrow" data-reveal>Монтаж</p><h2 class="t-h2" id="laying-title" data-reveal>Четыре способа укладки</h2></div>
<p class="t-body" data-reveal>Способы из каталога Italon X2: ${entries.map(([, m]) => m.label.toLocaleLowerCase('ru-RU').replace(' ', '&nbsp;')).join(', ').replace(/, ([^,]*)$/, ' и $1')}.</p>
</div>
<div class="x2-laying__grid" data-laying-tabs>
<div class="x2-laying__tabs" role="tablist" aria-label="Способ укладки" hidden>
${entries.map(([id, m], i) => `<button type="button" class="x2-tab" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="x2-tab__n t-num">${String(i + 1).padStart(2, '0')}</span><span class="x2-tab__label">${esc(m.label)}</span>${ARROW}</button>`).join('\n')}
</div>
<div class="x2-laying__panels">
${entries.map(([id, m], i) => {
    const p = provenance.laying?.[id];
    const w = Math.round(m.image.width * MAX);
    return `<section class="x2-panel" id="panel-${id}" role="tabpanel" aria-labelledby="tab-${id}" data-reveal>
<button type="button" class="x2-panel__frame" data-laying="${esc(id)}" aria-label="Увеличить фото: ${esc(m.label)}">
<span class="x2-panel__img" style="--w:${w}px;--ratio:${m.image.width}/${m.image.height}">${img(ctx, m.image, m.alt, i === 0 ? '' : '')}</span>
<span class="x2-panel__zoom"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm3.6 8.6 4.4 4.4M8.5 6v5M6 8.5h5"/></svg>Увеличить</span>
</button>
<div class="x2-panel__text">
<h3 class="t-h3"><span class="x2-panel__n t-num">${String(i + 1).padStart(2, '0')}</span> ${esc(m.label)}</h3>
<p class="t-body">${esc(m.caption)}</p>
${p ? `<p class="t-small">Фото: каталог Italon X2, с.&nbsp;${p.printedPage} · <a class="link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">источник (PDF)</a></p>` : ''}
</div>
</section>`;
  }).join('\n')}
</div>
</div>
<p class="x2-caveat" data-reveal><strong>Важно.</strong> Основание, уклоны, дренаж и несущую способность рассчитывают для конкретного проекта. Фото показывают принцип укладки, а не готовое решение для вашего участка.</p>
</div>
</section>`;
}

function list(ctx) {
  return `<section class="section x2-collections" id="x2-collections" aria-labelledby="x2c-title">
<div class="wrap">
<div class="x2-collections__head"><div class="x2-head"><p class="eyebrow" data-reveal>X2 · 20 мм</p><h2 class="t-h2" id="x2c-title" data-reveal>Коллекции X2</h2></div>
<a class="link-arrow" href="${ctx.url('/collections/')}?line=x2" data-reveal>Все коллекции ${ARROW}</a></div>
${collectionRows(ctx, x2Collections)}
</div>
</section>
<section class="x2-cta" aria-labelledby="cta-title">
<div class="wrap x2-cta__inner">
<div><p class="eyebrow">Каталог</p><h2 class="t-h2" id="cta-title">${positions(stats.x2)} X2 в&nbsp;прайсе</h2>
<p class="t-body">Фильтры по коллекции, формату и поверхности; расчёт упаковок по площади — в калькуляторе.</p></div>
<div class="btn-row"><a class="btn" href="${ctx.url('/catalog/')}?section=x2">Открыть каталог X2</a><a class="btn btn--outline" href="${ctx.url('/calculator/')}">Рассчитать упаковки</a></div>
</div>
</section>`;
}

export default {
  path: '/x2/',
  title: 'X2 · улица, 20 мм',
  description: `X2 — керамогранит 20 мм для террас, дорожек и зоны у бассейна: ${x2Collections.length} коллекций, ${stats.x2} позиций, 4 способа укладки.`,
  styles: ['collections', 'x2'],
  scripts: ['x2'],
  render: ctx => `${pageHead(ctx, { crumbs: [['X2 · улица']], eyebrow: 'Керамогранит 20 мм для улицы', title: 'X2 — для&nbsp;террас, дорожек и&nbsp;бассейна',
    lead: 'Плиты X2 толщиной 20&nbsp;мм — для открытых пространств: терраса и патио, садовые дорожки, зона у бассейна. Укладка на траву, гравий, опоры или клей.',
    aside: `<a class="link-arrow" href="${ctx.url('/catalog/')}?section=x2">Все позиции X2 ${ARROW}</a>` })}
${intro()}
${scenes(ctx)}
${laying(ctx)}
${list(ctx)}`,
};
