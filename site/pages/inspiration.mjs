// /inspiration/ — журнал: интерьерные кадры коллекций. Каркас этапа A (этап B — журнальная вёрстка).
import { esc, positions, ARROW } from '../shared/format.mjs';
import { pageHead, image } from '../shared/blocks.mjs';
import { collections } from '../data.mjs';

export default {
  path: '/inspiration/',
  title: 'Вдохновение',
  description: 'Интерьерные и уличные кадры коллекций Italon и X2.',
  styles: ['inspiration'],
  render: ctx => `${pageHead(ctx, { crumbs: [['Вдохновение']], eyebrow: 'Интерьерный журнал', title: 'Вдохновение', lead: 'Кадры коллекций в интерьере и на улице. Каждый ведёт к коллекции и её позициям.' })}
<section class="section" style="padding-top:0"><div class="wrap">
<div class="inspiration-grid" data-reveal-group>${collections.filter(c => c.image).map(c => `<a class="tile" href="${ctx.url(`/collections/${c.id}/`)}" data-reveal><figure class="media tile__media" style="--ratio:${c.image.width}/${c.image.height}">${image(ctx, c.image, `Коллекция ${c.label} ${c.section === 'x2' ? 'в экстерьере' : 'в интерьере'}`)}</figure><span class="tile__title">${esc(c.label)} ${ARROW}</span><span class="tile__text">${esc(c.image.caption || `${c.section === 'x2' ? 'X2 · улица' : 'Italon · интерьер'} · ${positions(c.count)}`)}</span></a>`).join('\n')}</div>
</div></section>`,
};
