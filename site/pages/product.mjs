// /product/<код>/ — страница каждой позиции прайса (993). Каркас этапа A:
// фото товара и коллекции, артикул, варианты отделки (ссылки на соседние позиции), характеристики,
// цена, «В корзину», консультация (tel/mailto), связанные позиции. Этап B: живое переключение вариантов.
import { esc, fmt, lower, money, number, packLabel, priceHtml, productCard, productImage, titleRu, collectionUrl } from '../shared/format.mjs';
import { breadcrumbs, image } from '../shared/blocks.mjs';
import { products, collections, salon, variantsOf, categoryOf, categories } from '../data.mjs';

const collectionMap = new Map(collections.map(c => [c.id, c]));

function render(p) {
  return ctx => {
    const c = collectionMap.get(p.collectionId);
    const variants = variantsOf(p);
    const scene = p.image?.kind === 'collection';
    const related = (c?.items || []).filter(x => x.code !== p.code && !variants.includes(x)).slice(0, 4);
    const rows = [
      ['Артикул', p.code],
      ['Коллекция', c ? `${c.label} (${c.latin})` : titleRu(p.collection)],
      ['Категория', categories.find(x => x.id === categoryOf(p))?.label || '—'],
      ['Формат, см', p.format ? fmt(p.format) : '—'],
      ['Отделка', p.finish ? lower(p.finish) : '—'],
      ['Упаковка', packLabel(p) + (p.unit === 'м²' && p.boxed && p.piecesPerPack ? `, ${number(p.piecesPerPack)} шт` : '')],
      ['Минимальный заказ', `${p.minimum}${p.minPacks > 1 ? ` (${number(p.minPacks)} ${p.orderUnit})` : ''}`],
      ['Раздел', p.section === 'x2' ? 'X2 — 20 мм, улица' : 'Italon — интерьер'],
    ];
    return `<div class="wrap">${breadcrumbs(ctx, [['Каталог', '/catalog/'], ...(c ? [[c.label, `/collections/${c.id}/`]] : []), [p.name]])}</div>
<section class="section product" style="padding-top:var(--s-4)">
<div class="wrap grid product__grid">
<div class="product__gallery">
<figure class="product__photo${scene ? ' is-scene' : ''}">${productImage(p, ctx.root, 'detail')}</figure>
${scene ? '<p class="media-note">Фото артикула уточняется; показан пример коллекции.</p>' : ''}
${c?.image && !scene ? `<button type="button" class="media media--hover product__scene" data-scene="${esc(c.id)}" aria-label="Увеличить фото коллекции ${esc(c.label)}">${image(ctx, c.image, `Коллекция ${c.label} в интерьере`)}</button><p class="media-note">Коллекция ${esc(c.label)} в интерьере</p>` : ''}
</div>
<div class="product__info">
<p class="eyebrow">${esc(c ? c.label : titleRu(p.collection))}</p>
<h1 class="t-h2 product__title">${esc(p.name)}</h1>
<p class="t-small">Артикул ${esc(p.code)}</p>
${variants.length > 1 ? `<div class="product__variants"><p class="field__label" id="variants-label">Вариант отделки</p><div class="chips" role="group" aria-labelledby="variants-label">${variants.map(v => v.code === p.code
      ? `<span class="chip is-active" aria-current="true">${esc(lower(v.finish).replace(/ и реттифицированная/, ''))}</span>`
      : `<a class="chip" href="${ctx.url(`/product/${v.code}/`)}">${esc(lower(v.finish).replace(/ и реттифицированная/, ''))}</a>`).join('')}</div></div>` : ''}
<p class="product__price">${priceHtml(p)}</p>
<p class="t-small">Наличие, тон и калибр уточняются. Прайс от 01.07.2026, склад Краснодар, с НДС.</p>
<div class="btn-row product__actions"><button type="button" class="btn" data-add="${esc(p.code)}"${p.canOrder ? '' : ' disabled'}>В корзину</button>
${p.unit === 'м²' && p.canOrder ? `<a class="btn btn--outline" href="${ctx.url('/calculator/')}?code=${esc(p.code)}">Рассчитать количество</a>` : ''}</div>
<dl class="specs product__specs">${rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
<div class="product__consult"><h2 class="t-h4">Запросить консультацию</h2>
<p class="t-small">Салон Italon Experience, ${esc(salon.address)}. Подскажем по наличию, раскладке и сопутствующим позициям.</p>
<div class="btn-row"><a class="btn btn--outline btn--small" href="${salon.phoneHref}">${esc(salon.phone)}</a><a class="btn btn--outline btn--small" href="mailto:${salon.email}?subject=${encodeURIComponent(`Консультация: ${p.name}, арт. ${p.code}`)}">Написать на почту</a></div></div>
</div>
</div>
</section>
${related.length ? `<section class="section section--alt" aria-labelledby="related-title"><div class="wrap">
<div class="section-head"><h2 class="t-h3" id="related-title">Ещё в коллекции ${esc(c.label)}</h2><a class="link-arrow" href="${collectionUrl(ctx.root, c.id)}">Вся коллекция</a></div>
<div class="product-grid">${related.map(x => productCard(x, ctx.root, { variants: variantsOf(x).length })).join('\n')}</div></div></section>` : ''}`;
  };
}

export default products.map(p => ({
  path: `/product/${p.code}/`,
  name: 'product',
  title: `${p.name} — арт. ${p.code}`,
  description: `${p.name}, артикул ${p.code}. ${p.priceKopecks > 0 ? `${money(p.priceKopecks)} за ${p.unit}` : 'Цена уточняется'} по прайсу от 01.07.2026.`,
  styles: ['product'],
  render: render(p),
}));
