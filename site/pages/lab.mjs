// /lab/ — ITALON X2 · MATERIAL LAB: экспериментальная лаборатория керамогранита (свет, укладка, сравнение, съёмка).
// Страница пока без индексации (noindex) и без ссылки в меню — это прототип. Рендер — site/shared/lab/*, поведение — site/js/pages/lab.mjs.
import { esc, money, fmt, titleRu, media } from '../shared/format.mjs';
import { products } from '../data.mjs';
import { LAB_MATERIALS, resolveMaterials } from '../shared/lab/materials.mjs';
import { labMarkup } from '../shared/lab/ui.mjs';

export const labData = (root = './') => resolveMaterials(products).map(m => {
  const p = m.product;
  return { id: m.id, code: p.code, name: p.name.replace(/\s*\d+\s*РЕТ$/u, '').toLocaleLowerCase('ru-RU').replace(/(^|\s)\S/gu, c => c.toLocaleUpperCase('ru-RU')), collection: titleRu(p.collection), format: fmt(p.format), finish: String(p.finish || '').toLowerCase(),
    priceText: `${money(p.priceKopecks)} за м²`, canOrder: p.canOrder, image: media(root, p.image.src), path: `/product/${p.code}/`, href: `${root}product/${p.code}/`, tagline: m.tagline, surf: m.surf, photo: m.photo };
});

export default {
  path: '/lab/',
  name: 'lab',
  noindex: true,
  bodyClass: 'lab-body',
  title: 'ITALON X2 — Material Lab',
  description: 'Экспериментальная лаборатория керамогранита Italon X2: управляемый свет, укладка, сравнение материалов и ролик для соцсетей.',
  styles: ['lab'],
  scripts: ['lab'],
  render: ctx => {
    const data = labData(ctx.root || './');
    return `${labMarkup({ materials: data, shop: true, home: ctx.url('/') })}
<script type="application/json" id="lab-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  },
};
