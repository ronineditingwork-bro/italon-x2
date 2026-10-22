// /inspiration/ — интерьерный журнал: кадры коллекций Italon и X2 крупной мозаикой (shared/mosaic.mjs).
// Только реальные фото и подписи из данных: никаких «проектов», авторов, адресов. Клик по кадру —
// диалог фото (window.Italon) со ссылками «Смотреть коллекцию» и «Позиции коллекции»; фильтр по линиям.
import { esc, fmt, positions, collectionUrl, ARROW } from '../shared/format.mjs';
import { pageHead } from '../shared/blocks.mjs';
import { mosaic } from '../shared/mosaic.mjs';
import { collections, italonCollections, x2Collections, stats } from '../data.mjs';

// Порядок «Все»: разворот с подписью, затем поток Italon и X2 (три к двум), второй разворот — в середине.
function order() {
  const withImg = list => list.filter(c => c.image);
  const features = withImg(italonCollections).filter(c => c.image.caption);
  const italon = withImg(italonCollections).filter(c => !c.image.caption);
  const x2 = withImg(x2Collections);
  const stream = [];
  while (italon.length || x2.length) {
    stream.push(...italon.splice(0, 3), ...x2.splice(0, 2));
  }
  const out = [features[0], ...stream];
  if (features[1]) out.splice(Math.round(out.length / 2), 0, features[1]);
  return [...out.filter(Boolean), ...features.slice(2)];
}

// неразрывный пробел после коротких слов, чтобы предлог не висел в конце строки
const nb = s => esc(s).replace(/(^|\s)([А-ЯЁа-яё]{1,2})\s/g, '$1$2&nbsp;');
const lineLabel = c => c.section === 'x2' ? 'X2 · улица' : 'Italon · интерьер';
const alt = c => c.image.caption ? `${c.image.caption}` : `Коллекция ${c.label} ${c.section === 'x2' ? 'в экстерьере' : 'в интерьере'}`;

function item(ctx, c, layout, n) {
  const href = collectionUrl(ctx.root, c.id);
  const catalog = `${ctx.url('/catalog/')}?collection=${encodeURIComponent(c.id)}`;
  const feature = layout.cls.includes('m-feature');
  const formats = c.plateFormats.length ? `${c.plateFormats.slice(0, 3).map(fmt).join(' · ')} см` : '';
  return `<figure class="insp ${layout.cls}" data-reveal data-line="${c.section}" data-w="${c.image.width}" data-h="${c.image.height}"${c.image.caption ? ' data-feature' : ''} style="--ratio:${layout.ratio};--nw:${c.image.width}px">
<a class="insp__media media" href="${href}" data-insp="${esc(c.id)}" aria-label="Открыть фото: коллекция ${esc(c.label)}"><img src="${ctx.media(c.image.src)}" alt="${esc(alt(c))}" width="${c.image.width}" height="${c.image.height}" ${n < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>
<figcaption class="insp__cap">
<span class="insp__top"><span class="insp__num t-num">${String(n + 1).padStart(2, '0')}</span><span>${esc(lineLabel(c))}</span></span>
<a class="insp__name" href="${href}">${esc(c.label)}</a>
${c.image.caption ? `<span class="insp__quote">${nb(c.image.caption)}</span>` : ''}
<span class="insp__meta">${positions(c.count)}${formats ? ` · ${esc(formats)}` : ''}</span>
${feature ? `<span class="insp__links"><a class="link-arrow" href="${href}">Смотреть коллекцию ${ARROW}</a><a class="link-arrow" href="${catalog}">Позиции коллекции ${ARROW}</a></span>` : ''}
</figcaption>
</figure>`;
}

export default {
  path: '/inspiration/',
  title: 'Вдохновение',
  description: 'Интерьерные и уличные кадры коллекций Italon и X2: фото, подписи, переход к коллекции и её позициям.',
  styles: ['collections', 'inspiration'],
  scripts: ['inspiration'],
  render: ctx => {
    const list = order();
    const layout = mosaic(list.map(c => ({ w: c.image.width, h: c.image.height, feature: !!c.image.caption })));
    const nItalon = list.filter(c => c.section === 'italon').length, nX2 = list.length - nItalon;
    return `${pageHead(ctx, { crumbs: [['Вдохновение']], eyebrow: 'Интерьерный журнал', title: 'Вдохновение',
      lead: `Кадры ${list.length} коллекций Italon и X2 — в интерьере и на улице. Откройте фото, чтобы рассмотреть фактуру, и перейдите к коллекции и её позициям.`,
      aside: `<a class="link-arrow" href="${ctx.url('/collections/')}">Все коллекции ${ARROW}</a>` })}
<div class="cx-bar">
<div class="wrap cx-bar__inner">
<div class="cx-switch" role="group" aria-label="Показать кадры линии" data-insp-filter hidden>
<button type="button" class="cx-switch__btn" data-line="all" aria-pressed="true">Все <span class="cx-switch__n">${list.length}</span></button>
<button type="button" class="cx-switch__btn" data-line="italon" aria-pressed="false">Italon<span class="cx-long"> · интерьер</span> <span class="cx-switch__n">${nItalon}</span></button>
<button type="button" class="cx-switch__btn" data-line="x2" aria-pressed="false">X2<span class="cx-long"> · улица</span> <span class="cx-switch__n">${nX2}</span></button>
</div>
<p class="cx-bar__facts t-small">Фото — кадры коллекций, не реализованные объекты</p>
</div>
</div>
<p class="sr-only" role="status" id="insp-status"></p>
<section class="section insp-section" aria-label="Кадры коллекций">
<div class="wrap">
<div class="insp-grid" id="insp-grid">
${layout.map(({ i, ...l }, n) => item(ctx, list[i], l, n)).join('\n')}
</div>
</div>
</section>
<section class="insp-end" aria-labelledby="insp-end-title">
<div class="wrap insp-end__inner">
<div><p class="eyebrow">Дальше</p><h2 class="t-h2" id="insp-end-title">Понравился кадр — посмотрите позиции</h2>
<p class="t-body">${stats.total} позиций прайса: форматы до ${fmt(stats.largestFormat)}&nbsp;см, мозаика и декор. Материалы можно сравнить вживую в салоне.</p></div>
<div class="btn-row"><a class="btn" href="${ctx.url('/catalog/')}">Открыть каталог</a><a class="btn btn--outline" href="${ctx.url('/salon/')}">Салон в Краснодаре</a></div>
</div>
</section>`;
  },
};
