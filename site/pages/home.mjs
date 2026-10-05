// Главная: герой → «Найдите своё решение» → «Характер — в деталях» → «Избранное из каталога»
// → «Идеи для вашего пространства» → салон. Всё содержимое — из данных (site/data.mjs).
import { esc, fmt, positions, productCard, productImage, collectionUrl, number, plural, ARROW } from '../shared/format.mjs';
import { collections, italonCollections, x2Collections, products, stats, salon, variantsOf, categoryOf } from '../data.mjs';

const col = id => collections.find(c => c.id === id);
const img = (ctx, image, alt, { eager = false, sizes = '' } = {}) =>
  `<img src="${ctx.media(image.src)}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${sizes ? ` sizes="${sizes}"` : ''}>`;
const listRu = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} и ${items.at(-1)}` : items[0] || '';

function hero(ctx) {
  return `<section class="hero" aria-labelledby="hero-title">
<div class="hero__media"><img src="${ctx.media('/media/terrace.webp')}" alt="Терраса с крупноформатным керамогранитом — архитектурная визуализация" width="1536" height="1024" fetchpriority="high" decoding="async"></div>
<div class="wrap hero__inner">
<div class="hero__content">
<p class="eyebrow hero__eyebrow" data-reveal>Плитка для каждого дня</p>
<h1 class="t-hero" id="hero-title" data-reveal data-reveal-delay="60">Пространство, в котором хочется быть</h1>
<p class="hero__text" data-reveal data-reveal-delay="120">Керамогранит Italon для интерьера и X2 толщиной 20&nbsp;мм для террас и дорожек. Форматы до&nbsp;${esc(fmt(stats.largestFormat))}&nbsp;см; поверхности натуральные, «люкс», «силк», патинированные и структурированные.</p>
<div class="btn-row" data-reveal data-reveal-delay="180"><a class="btn" href="${ctx.url('/collections/')}">Смотреть коллекции</a><a class="btn btn--outline-light" href="${ctx.url('/catalog/')}">Открыть каталог</a></div>
</div>
</div>
<p class="hero__caption">Архитектурная визуализация</p>
</section>`;
}

function solutions(ctx) {
  const maxi = products.filter(p => p.format === stats.largestFormat);
  const mosaic = products.filter(p => categoryOf(p) === 'mosaic');
  const cards = [
    { href: ctx.url('/catalog/') + '?section=italon', title: 'Italon · интерьер', text: `${italonCollections.length} коллекций · ${positions(stats.italon)}`, c: col('aura'), alt: 'Коллекция Аура в интерьере гостиной' },
    { href: ctx.url('/x2/'), title: 'X2 · улица, 20 мм', text: `${x2Collections.length} коллекций · ${positions(stats.x2)}`, c: col('x2-fossil'), alt: 'Коллекция Фоссил X2 у бассейна' },
    { href: ctx.url('/catalog/') + '?category=mosaic', title: 'Мозаика', text: `${positions(mosaic.length)} · на фото Боттега`, c: col('bottega'), alt: 'Мозаика Боттега на стене ванной комнаты' },
    { href: ctx.url('/catalog/') + `?format=${stats.largestFormat}`, title: `Макси-формат ${fmt(stats.largestFormat)}`, text: `${positions(maxi.length)} · на фото Стелларис`, c: col('stellaris'), alt: 'Крупноформатные плиты коллекции Стелларис в интерьере' },
  ];
  return `<section class="section" aria-labelledby="solutions-title">
<div class="wrap">
<div class="section-head"><div class="section-head__text"><h2 class="t-h2" id="solutions-title" data-reveal>Найдите своё решение</h2></div>
<a class="link-arrow" href="${ctx.url('/catalog/')}" data-reveal>Весь каталог ${ARROW}</a></div>
<div class="tiles" style="--cols:4" data-reveal-group>
${cards.map(card => `<a class="tile" href="${card.href}" data-reveal><figure class="media tile__media" style="--ratio:3/4">${img(ctx, card.c.image, card.alt)}</figure>
<span class="tile__title">${esc(card.title)} ${ARROW}</span><span class="tile__text">${esc(card.text)}</span></a>`).join('\n')}
</div>
</div>
</section>`;
}

function story(ctx) {
  const c = col('status');
  const colors = [...new Set(c.items.map(p => p.name.split(/\s+/)[1]).filter(w => w && !/^\d|МОЗАИКА/.test(w)))]
    .map(w => w[0] + w.slice(1).toLocaleLowerCase('ru-RU'));
  const swatches = ['АРТИК', 'ДЕЗЕРТ', 'КАРБОН', 'МОКА'].map(name => c.items.find(p => p.name.includes(name) && /60[XХ]120/.test(p.name))).filter(p => p?.image);
  const facts = [
    ['Позиций в прайсе', String(c.count)],
    ['Форматы', c.plateFormats.map(fmt).join(', ') + ' см'],
    ['Мозаика', listRu([...new Set(c.items.map(p => p.name.match(/МОЗАИКА\s+([А-ЯЁ]+)/)?.[1]).filter(Boolean))].map(w => w[0] + w.slice(1).toLocaleLowerCase('ru-RU')))],
    ['Поверхность', listRu(c.finishes) + (c.rectified ? ', ректифицированная кромка' : '')],
    ['Оттенки', colors.join(', ')],
  ];
  return `<section class="section section--alt story" aria-labelledby="story-title">
<div class="wrap grid story__grid">
<figure class="story__figure" data-reveal>
<div class="media story__media">${img(ctx, c.image, `Коллекция ${c.label} в интерьере гостиной`)}</div>
<figcaption class="media-note">Коллекция ${esc(c.label)} (${esc(c.latin)}) в интерьере</figcaption>
</figure>
<div class="story__text">
<p class="eyebrow" data-reveal>Коллекция ${esc(c.label)}</p>
<h2 class="t-h2" id="story-title" data-reveal>Характер — в&nbsp;деталях</h2>
<p class="t-body" data-reveal>Керамогранит с натуральной поверхностью: крупные плиты до ${esc(fmt(c.plateFormats[0]))}&nbsp;см для пола и стен, мозаика из тех же оттенков для акцентов.</p>
<dl class="specs story__specs" data-reveal>${facts.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
<ul class="story__swatches" role="list" data-reveal aria-label="Оттенки коллекции, формат 60 × 120">${swatches.map(p => `<li><a href="${ctx.url(`/product/${p.code}/`)}"><span class="story__swatch">${productImage(p, ctx.root)}</span><span>${esc(p.name.split(/\s+/)[1][0] + p.name.split(/\s+/)[1].slice(1).toLocaleLowerCase('ru-RU'))}</span></a></li>`).join('')}</ul>
<a class="btn" href="${collectionUrl(ctx.root, c.id)}" data-reveal>Познакомиться с коллекцией</a>
</div>
</div>
</section>`;
}

function featured(ctx) {
  // «Избранное» без данных о продажах: по одной позиции с фото артикула из разных коллекций,
  // приоритет — позициям с несколькими вариантами отделки; одна позиция — X2.
  const pick = [];
  const used = new Set();
  const good = p => p.image?.kind === 'sku' && p.canOrder && p.priceKopecks > 0 && /^\d/.test(p.format);
  for (const id of ['stellaris', 'charme-deluxe', 'avantgarde']) {
    const p = products.find(x => x.collectionId === id && good(x) && variantsOf(x).length > 1) || products.find(x => x.collectionId === id && good(x));
    if (p) { pick.push(p); used.add(id); }
  }
  const x2 = products.find(x => x.collectionId === 'x2-fossil' && good(x)) || products.find(x => x.section === 'x2' && good(x));
  if (x2) pick.push(x2);
  return `<section class="section" aria-labelledby="featured-title">
<div class="wrap">
<div class="section-head"><div class="section-head__text"><h2 class="t-h2" id="featured-title" data-reveal>Избранное из каталога</h2>
<p class="t-body" data-reveal>Позиции из разных коллекций. Цены по прайсу от 01.07.2026, склад Краснодар, с НДС.</p></div>
<a class="link-arrow" href="${ctx.url('/catalog/')}" data-reveal>Все ${number(stats.total, 0)} позиции ${ARROW}</a></div>
<div class="product-grid featured-grid" data-reveal-group>
${pick.map(p => `<div data-reveal>${productCard(p, ctx.root, { variants: variantsOf(p).length })}</div>`).join('\n')}
</div>
</div>
</section>`;
}

function ideas(ctx) {
  const items = [
    { c: col('bottega'), title: 'Мозаика на стене, тёплый пол', alt: 'Ванная комната: мозаика Боттега на стенах, Вельвет на полу' },
    { c: col('surface-wall-project'), title: 'Светлая ванная в одной гамме', alt: 'Ванная комната: Серфейс на стенах, Статус на полу' },
    { c: col('x2-magma'), title: 'Терраса у дома', alt: 'Терраса с плитами Магма X2' },
  ];
  return `<section class="section ideas" aria-labelledby="ideas-title">
<div class="wrap">
<div class="section-head"><div class="section-head__text"><h2 class="t-h2" id="ideas-title" data-reveal>Идеи для вашего пространства</h2>
<p class="t-body" data-reveal>Интерьерные кадры коллекций: что на стенах и на полу, и где посмотреть все позиции.</p></div>
<a class="link-arrow" href="${ctx.url('/inspiration/')}" data-reveal>Вдохновение ${ARROW}</a></div>
<div class="ideas__grid" data-reveal-group>
${items.map((item, i) => `<a class="tile ideas__item ideas__item--${i + 1}" href="${collectionUrl(ctx.root, item.c.id)}" data-reveal>
<figure class="media tile__media">${img(ctx, item.c.image, item.alt)}</figure>
<span class="tile__title">${esc(item.title)} ${ARROW}</span>
<span class="tile__text">${esc(item.c.image.caption || `Коллекция ${item.c.label}: ${positions(item.c.count)}`)}</span></a>`).join('\n')}
</div>
</div>
</section>`;
}

function showroom(ctx) {
  const c = col('metropolis');
  return `<section class="section section--alt showroom" aria-labelledby="salon-title">
<div class="wrap grid showroom__grid">
<div class="showroom__text">
<p class="eyebrow" data-reveal>Салон Italon Experience</p>
<h2 class="t-h2" id="salon-title" data-reveal>Увидеть. Прикоснуться. Выбрать.</h2>
<p class="t-body" data-reveal>Монобрендовый салон Italon в Краснодаре. Коллекции показаны готовыми интерьерными решениями — приходите сравнить поверхности и отделки вживую.</p>
<dl class="specs showroom__specs" data-reveal>
<div><dt>Адрес</dt><dd><address>${esc(salon.address)}</address></dd></div>
${salon.hours.map(([d, t]) => `<div><dt>${esc(d)}</dt><dd>${esc(t)}</dd></div>`).join('')}
<div><dt>Телефон</dt><dd><a class="link" href="${salon.phoneHref}">${esc(salon.phone)}</a></dd></div>
<div><dt>Парковка</dt><dd>Есть</dd></div>
</dl>
<div class="btn-row" data-reveal><a class="btn" href="${salon.maps.yandex}" target="_blank" rel="noopener noreferrer">Построить маршрут</a><a class="btn btn--outline" href="${salon.phoneHref}">Записаться в салон</a></div>
<p class="t-small" data-reveal>Запись — по телефону или по почте <a class="link" href="mailto:${salon.email}">${esc(salon.email)}</a>.</p>
</div>
<figure class="showroom__figure" data-reveal>
<div class="media showroom__media">${img(ctx, c.image, `Коллекция ${c.label} в интерьере`)}</div>
<figcaption class="media-note">На фото — коллекция ${esc(c.label)}, не интерьер салона</figcaption>
</figure>
</div>
</section>`;
}

export default {
  path: '/',
  title: '',
  description: `Салон Italon Experience в Краснодаре: керамогранит Italon и X2 20 мм для улицы. ${stats.total} позиции прайса, ${stats.collections} коллекции, расчёт упаковок и КП в PDF.`,
  styles: ['home'],
  render: ctx => [hero(ctx), solutions(ctx), story(ctx), featured(ctx), ideas(ctx), showroom(ctx)].join('\n'),
};
