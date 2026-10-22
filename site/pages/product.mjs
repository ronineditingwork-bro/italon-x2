// /product/<код>/ — страница каждой позиции прайса .
// Галерея (фото плитки + интерьерный кадр коллекции, увеличение в диалоге фото), название, артикул,
// варианты отделки с живым переключением (site/js/pages/product.mjs; без JS — ссылки на соседние позиции),
// цена и минимальный заказ, «В корзину», расчёт количества, консультация, характеристики, связанные позиции.
import { esc, priceHtml, productCard, titleRu, collectionUrl, ARROW, lineOf } from '../shared/format.mjs';
import { breadcrumbs } from '../shared/blocks.mjs';
import { productSpecs, specsHtml, surfaceLabel, minimumNote, consultSubject, consultBody, formatLabel, variantsCount } from '../shared/product-view.mjs';
import { products, collections, salon, finishVariantsOf as variantsOf, finishVariantKey as variantKey, categoryOf, categories, priceNote } from '../data.mjs';

const collectionMap = new Map(collections.map(c => [c.id, c]));
const ZOOM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M10.5 8v5M8 10.5h5"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4-2 1.5a11 11 0 0 0 6.4 6.4l1.5-2 4 1.4v2.6a1.6 1.6 0 0 1-1.7 1.6C10.6 18.5 5.5 13.4 5 5.2a1.6 1.6 0 0 1 1.6-1.7z"/></svg>';
const MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="1"/><path d="m4 6.5 8 6 8-6"/></svg>';

/** Название без маркеров формата/отделки — «цвет» позиции для подбора связанных. */
const colorBase = p => variantKey(p).split('|')[2];

/** 4 связанные позиции: та же коллекция, другие форматы и отделки; сначала тот же цвет, без повторов формата. */
function relatedOf(p, c, group) {
  if (!c) return [];
  const skip = new Set(group.map(v => v.code));
  const base = colorBase(p);
  const seenKeys = new Set([variantKey(p)]);
  const pool = c.items.filter(x => !skip.has(x.code))
    .map((x, i) => ({ x, i, score: (colorBase(x) === base ? 4 : 0) + (x.format !== p.format ? 2 : 0) + (x.image?.kind === 'sku' ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const out = [], formats = new Set();
  for (const pass of [0, 1]) for (const { x } of pool) {
    if (out.length >= 4) break;
    if (out.includes(x) || seenKeys.has(variantKey(x))) continue;
    if (pass === 0 && formats.has(x.format)) continue;
    out.push(x); formats.add(x.format); seenKeys.add(variantKey(x));
  }
  return out;
}

/** Данные одного варианта для статической разметки и для переключения в браузере. */
function variantData(ctx, v, c) {
  const category = categories.find(x => x.id === categoryOf(v))?.label || '';
  const specs = productSpecs(v, { collectionLabel: c ? `${c.label} (${c.latin})` : '', categoryLabel: category });
  return {
    code: v.code,
    name: v.name,
    url: ctx.url(`/product/${v.code}/`),
    surface: surfaceLabel(v),
    format: formatLabel(v),
    price: priceHtml(v),
    minimum: minimumNote(v),
    canOrder: !!v.canOrder,
    calc: v.unit === 'м²' && v.canOrder ? `${ctx.url('/calculator/')}?code=${v.code}` : '',
    mail: `mailto:${salon.email}?subject=${encodeURIComponent(consultSubject(v))}&body=${encodeURIComponent(consultBody(v))}`,
    image: v.image ? { src: ctx.media(v.image.src), path: v.image.src.replace(/^\//, ''), width: v.image.width, height: v.image.height, scene: v.image.kind === 'collection',
      alt: v.image.kind === 'collection' ? `Пример коллекции ${titleRu(v.collection)}; фото артикула уточняется` : `${v.name} — фото плитки` } : null,
    tile: specsHtml(specs.tile),
    pack: specsHtml(specs.pack),
  };
}

function gallery(ctx, d, c) {
  const scene = c?.image;
  const img = d.image;
  const sceneAlt = c ? `Коллекция ${c.label} ${c.section === 'x2' ? 'в экстерьере' : 'в интерьере'}` : '';
  // фото плитки небольшие (до 341 px по высоте) — показываем не крупнее ~1.3× (переменные --w/--h)
  const tileView = img
    ? `<a class="pdp__view pdp__view--tile${img.scene ? ' is-cover' : ''} is-active" href="${esc(img.src)}" data-view="tile" data-photo="${esc(img.path)}" data-photo-alt="${esc(img.alt)}" data-photo-caption="${esc(`${d.name}, арт. ${d.code}`)}" data-photo-width="${img.width}" data-photo-height="${img.height}" aria-label="Увеличить фото: ${esc(d.name)}">
<img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}" style="--w:${img.width}px;--h:${img.height}px" fetchpriority="high" decoding="async" data-product-image data-v-img>
${img.scene ? '<span class="pdp__badge">Фото коллекции</span>' : ''}<span class="pdp__zoom">${ZOOM}<span>Увеличить</span></span></a>`
    : `<div class="pdp__view pdp__view--tile pdp__view--empty is-active" data-view="tile"><span class="media-missing">${c ? 'Фото уточняется' : 'Транспортировочная упаковка'}</span></div>`;
  const sceneView = scene
    ? `<a class="pdp__view pdp__view--scene${scene.width < 600 ? ' is-small' : ''}" href="${ctx.media(scene.src)}" data-view="scene" data-photo="${esc(scene.src.replace(/^\//, ''))}" data-photo-alt="${esc(sceneAlt)}" data-photo-caption="${esc(scene.caption || `Коллекция ${c.label} (${c.latin})`)}" data-photo-width="${scene.width}" data-photo-height="${scene.height}" aria-label="Увеличить фото коллекции ${esc(c.label)}">
<img src="${ctx.media(scene.src)}" alt="${esc(sceneAlt)}" width="${scene.width}" height="${scene.height}" style="--w:${scene.width}px;--h:${scene.height}px" loading="lazy" decoding="async">
<span class="pdp__badge">Коллекция ${esc(c.label)} ${c.section === 'x2' ? 'на улице' : 'в интерьере'}</span><span class="pdp__zoom">${ZOOM}<span>Увеличить</span></span></a>`
    : '';
  const thumbs = scene && img ? `<div class="pdp__thumbs" role="group" aria-label="Фото позиции">
<button type="button" class="pdp__thumb" data-show="tile" aria-pressed="true"><span class="pdp__thumb-media is-tile"><img src="${esc(img.src)}" alt="" width="${img.width}" height="${img.height}" decoding="async" data-v-thumb></span><span>Плитка</span></button>
<button type="button" class="pdp__thumb" data-show="scene" aria-pressed="false"><span class="pdp__thumb-media"><img src="${ctx.media(scene.src)}" alt="" width="${scene.width}" height="${scene.height}" loading="lazy" decoding="async"></span><span>${c.section === 'x2' ? 'На улице' : 'В интерьере'}</span></button>
</div>` : '';
  return `<div class="pdp__gallery">
<div class="pdp__stage">${tileView}${sceneView}</div>
${thumbs}
${img && c ? `<p class="pdp__note">${img.scene ? 'Фото артикула уточняется; показан пример коллекции. ' : ''}Цвет на экране может отличаться от плитки — сравните образцы в салоне.</p>` : ''}
</div>`;
}

function render(p) {
  return ctx => {
    const c = collectionMap.get(p.collectionId);
    const group = variantsOf(p);
    // варианты — в постоянном порядке (как в прайсе), чтобы кнопки не прыгали при переключении
    const ordered = [...group].sort((a, b) => products.indexOf(a) - products.indexOf(b));
    const data = ordered.map(v => variantData(ctx, v, c));
    const d = data.find(x => x.code === p.code);
    const related = relatedOf(p, c, group);
    const line = lineOf(p.section).label.replace('20 мм', '20&nbsp;мм');
    const crumbs = [['Каталог', '/catalog/'], ...(c ? [[c.label, `/collections/${c.id}/`]] : []), [p.name]];
    const variantsBlock = data.length > 1 ? `<div class="pdp__variants">
<p class="pdp__label" id="variants-label">Отделка: <span data-v="surface">${esc(d.surface)}</span></p>
<div class="pdp__options" role="group" aria-labelledby="variants-label">${data.map(v => `<a class="pdp__option" href="${v.url}" data-variant="${v.code}"${v.code === p.code ? ' aria-current="true"' : ''}>
<span class="pdp__option-name">${esc(v.surface)}</span><span class="pdp__option-price">${v.price}</span></a>`).join('')}</div>
<p class="pdp__hint">${variantsCount(data.length)} одного цвета и формата — у каждого свой артикул и цена.</p>
</div>` : '';
    const buyButton = cls => `<button type="button" class="btn ${cls}" data-add="${esc(p.code)}" data-v-add${p.canOrder ? '' : ' disabled'}>В корзину</button>`;
    return `<div class="wrap">${breadcrumbs(ctx, crumbs)}</div>
<section class="pdp" aria-label="Товар" data-pdp>
<div class="wrap pdp__grid">
${gallery(ctx, d, c)}
<div class="pdp__info">
<p class="eyebrow pdp__eyebrow">${c ? `<a href="${collectionUrl(ctx.root, c.id)}">${esc(c.label)}</a>` : esc(titleRu(p.collection))}${c ? `<span aria-hidden="true">·</span>${line}` : ''}</p>
<h1 class="pdp__title" data-v="name">${esc(p.name)}</h1>
<p class="pdp__code">Артикул <span data-v="code">${esc(p.code)}</span>${d.format ? `<span aria-hidden="true">·</span>${esc(d.format)}` : ''}</p>
${variantsBlock}
<div class="pdp__buy" data-pdp-buy>
<p class="pdp__price" data-v="price">${d.price}</p>
<p class="pdp__fine">${esc(priceNote)}</p>
<ul class="pdp__facts" role="list">
<li data-v="minimum">${esc(d.minimum)}</li>
<li>Наличие и сроки уточняются</li>
</ul>
<div class="pdp__actions">${buyButton('pdp__add')}</div>
</div>
<a class="pdp__calc" href="${d.calc || ctx.url('/calculator/')}" data-v-calc${d.calc ? '' : ' hidden'}>
<span class="pdp__calc-title">Рассчитать количество ${ARROW}</span>
<span class="pdp__calc-text">Площадь → целые коробки с запасом на подрезку и минимальным заказом</span></a>
<div class="pdp__consult">
<h2 class="pdp__consult-title">Запросить консультацию</h2>
<p>Салон Italon Experience, ${esc(salon.address)}. ${salon.hours.map(([a, b]) => `${esc(a)} ${esc(b)}`).join(', ')}.</p>
<div class="pdp__contact"><a class="pdp__contact-link" href="${salon.phoneHref}">${PHONE}<span>${esc(salon.phone)}</span></a>
<a class="pdp__contact-link" href="${esc(d.mail)}" data-v-mail>${MAIL}<span>Написать с артикулом</span></a></div>
</div>
</div>
</div>
</section>
<section class="section pdp-specs" aria-labelledby="specs-title">
<div class="wrap grid">
<div class="pdp-specs__head" data-reveal><h2 class="t-h2" id="specs-title">Характеристики и&nbsp;размеры</h2>
<p class="t-small">По прайсу от 01.07.2026. Тон и калибр партии уточняются при заказе.</p></div>
<div class="pdp-specs__col" data-reveal><h3 class="pdp-specs__title">${c ? 'Плитка' : 'Позиция'}</h3><dl class="specs" data-v="tile">${d.tile}</dl></div>
<div class="pdp-specs__col" data-reveal data-reveal-delay="70"><h3 class="pdp-specs__title">Упаковка и заказ</h3><dl class="specs" data-v="pack">${d.pack}</dl></div>
</div>
</section>
${related.length ? `<section class="section section--alt" aria-labelledby="related-title"><div class="wrap">
<div class="section-head"><div class="section-head__text"><p class="eyebrow" data-reveal>${line}</p><h2 class="t-h2" id="related-title" data-reveal>Ещё в коллекции ${esc(c.label)}</h2></div>
<a class="link-arrow" href="${collectionUrl(ctx.root, c.id)}" data-reveal>Вся коллекция · ${c.count} ${ARROW}</a></div>
<div class="product-grid pdp-related" data-reveal-group>${related.map(x => `<div data-reveal>${productCard(x, ctx.root, { variants: variantsOf(x).length })}</div>`).join('\n')}</div></div></section>` : ''}
<div class="pdp-bar" data-pdp-bar role="region" aria-label="Цена и покупка" inert>
<div class="pdp-bar__text"><p class="pdp-bar__price" data-v="price">${d.price}</p><p class="pdp-bar__meta"><span data-v="code">${esc(p.code)}</span>${data.length > 1 ? ` · <span data-v="surface">${esc(d.surface)}</span>` : ''}</p></div>
${buyButton('btn--small pdp-bar__add')}
</div>
${data.length > 1 ? `<script type="application/json" id="pdp-variants">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}`;
  };
}

export default products.map(p => ({
  path: `/product/${p.code}/`,
  name: 'product',
  title: `${p.name} — арт. ${p.code}`,
  description: `${p.name}, артикул ${p.code}. ${p.priceKopecks > 0 ? `Цена ${priceHtml(p).replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ')}` : 'Цена уточняется'} по прайсу от 01.07.2026, склад Краснодар.`,
  styles: ['product'],
  scripts: ['product'],
  render: render(p),
}));
