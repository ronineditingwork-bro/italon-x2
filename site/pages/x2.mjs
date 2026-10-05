// /x2/ — X2, 20 мм для открытых пространств: сценарии, 4 способа укладки, коллекции. Каркас этапа A.
import { esc, positions, ARROW } from '../shared/format.mjs';
import { pageHead, image, collectionCard } from '../shared/blocks.mjs';
import { x2Collections, outdoorSpaces, layingMethods, stats, collections } from '../data.mjs';

const col = id => collections.find(c => c.id === id);
export default {
  path: '/x2/',
  title: 'X2 · улица, 20 мм',
  description: `X2 — керамогранит 20 мм для террас, дорожек и зоны у бассейна: ${x2Collections.length} коллекций, ${stats.x2} позиций, 4 способа укладки.`,
  styles: ['x2'],
  render: ctx => `${pageHead(ctx, { crumbs: [['X2 · улица']], eyebrow: 'Керамогранит 20 мм', title: 'X2 — для открытых пространств', lead: `Террасы, садовые дорожки и зона у бассейна. ${x2Collections.length} коллекций, ${positions(stats.x2)} в прайсе.`,
    aside: `<a class="link-arrow" href="${ctx.url('/catalog/')}?section=x2">Все позиции X2 ${ARROW}</a>` })}
<section class="section" style="padding-top:0" aria-labelledby="spaces-title">
<div class="wrap"><h2 class="sr-only" id="spaces-title">Сценарии</h2>
<div class="tiles" style="--cols:3" data-reveal-group>${outdoorSpaces.map(s => { const c = col(s.collectionId); return `<a class="tile" href="${ctx.url(`/collections/${c.id}/`)}" data-reveal><figure class="media tile__media" style="--ratio:1">${image(ctx, c.image, `${s.label}: коллекция ${c.label}`)}</figure><span class="tile__title">${esc(s.label)} ${ARROW}</span><span class="tile__text">${esc(s.description)} На фото — ${esc(c.label)}.</span></a>`; }).join('')}</div>
</div></section>
<section class="section section--alt" aria-labelledby="laying-title">
<div class="wrap"><div class="section-head"><div class="section-head__text"><h2 class="t-h2" id="laying-title">Четыре способа укладки</h2><p class="t-body">Основание, уклоны и дренаж рассчитываются для конкретного проекта.</p></div></div>
<div class="tiles" style="--cols:4" data-reveal-group>${Object.entries(layingMethods).map(([id, m]) => `<button type="button" class="tile laying" data-laying="${esc(id)}" data-reveal aria-label="Увеличить фото: ${esc(m.label)}"><figure class="media tile__media" style="--ratio:4/3">${image(ctx, m.image, m.alt)}</figure><span class="tile__title">${esc(m.label)}</span><span class="tile__text">${esc(m.caption)}</span></button>`).join('')}</div>
<p class="media-note" style="margin-top:1.5rem">Фото из каталога Italon X2.</p>
</div></section>
<section class="section" aria-labelledby="x2c-title">
<div class="wrap"><div class="section-head"><h2 class="t-h2" id="x2c-title">Коллекции X2</h2></div>
<div class="collection-grid" data-reveal-group>${x2Collections.map(c => collectionCard(ctx, c)).join('')}</div></div></section>`,
};
