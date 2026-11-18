// /lab/ — ITALON X2 · MATERIAL LAB: интерактивная лаборатория керамогранита для всего каталога (свет, сутки, укладка, сравнение, съёмка).
// Страница пока без индексации (noindex) и без ссылки в меню. Витрина из 8 материалов берётся из каталога сайта на этапе сборки; весь каталог лаборатория читает
// в браузере из data/catalog.json и data/picker.json — второго списка товаров нет. Поведение — site/shared/lab/*, точка входа — site/js/pages/lab.mjs.
import { products } from '../data.mjs';
import { toEntry } from '../shared/lab/catalog.mjs';
import { featuredEntries } from '../shared/lab/materials.mjs';
import { labMarkup } from '../shared/lab/ui.mjs';

export const labData = (root = './') => featuredEntries(products, p => toEntry(p, { root }));

export default {
  path: '/lab/',
  name: 'lab',
  noindex: true,
  bodyClass: 'lab-body',
  title: 'ITALON X2 — Material Lab',
  description: 'Интерактивная лаборатория керамогранита Italon X2: управляемый свет, сутки в комнате с окном, укладка, сравнение любых материалов каталога, снимок и ролик.',
  styles: ['lab'],
  scripts: ['lab'],
  render: ctx => {
    const featured = labData(ctx.root || './');
    return `${labMarkup({ featured, shop: true, home: ctx.url('/') })}
<script type="application/json" id="lab-data">${JSON.stringify({ featured, root: ctx.root || './' }).replace(/</g, '\\u003c')}</script>`;
  },
};
