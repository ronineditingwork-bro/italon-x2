// /outdoor/ — X2 Outdoor Lab: визуализатор уличных покрытий Italon X2. Готовые сцены (дом с бассейном, сруб, фахверк) и «Мой участок» — примерка на своём фото.
// Материалы, форматы, артикулы, цены берутся из каталога сайта на этапе сборки; оригиналы текстур (если есть) — из data/lab-originals.json. Поведение — site/shared/outdoor/*.
import { products, layingMethods } from '../data.mjs';
import { buildMaterials } from '../shared/outdoor/materials.mjs';
import { outdoorMarkup } from '../shared/outdoor/ui.mjs';
import { SCENES } from '../shared/outdoor/scenes.mjs';

export const outdoorData = (root = './') => {
  const materials = buildMaterials(products, { root }).map(m => ({ ...m, variants: Object.fromEntries(Object.entries(m.variants).map(([f, v]) => { const { rawName, ...rest } = v; return [f, rest]; })) }));
  const laying = Object.entries(layingMethods || {}).map(([id, l]) => ({ id, label: l.label, caption: l.caption, image: l.image }));
  return { materials, laying, root };
};

export default {
  path: '/outdoor/',
  name: 'outdoor',
  bodyClass: 'outdoor-body',
  title: 'X2 Outdoor Lab — как плитка X2 будет выглядеть у вашего дома',
  description: 'Визуализатор уличных покрытий Italon X2: дом, терраса, дорожка и бассейн. Выберите плитку, формат, раскладку и шов — или примерьте керамогранит на фото своего участка.',
  styles: ['outdoor'],
  scripts: ['outdoor'],
  render: ctx => {
    const root = ctx.root || './', data = outdoorData(root);
    const scenes = SCENES.map(({ id, title, short, city, thumb, width, height }) => ({ id, title, short, city, thumb, width, height }));
    return `${outdoorMarkup({ scenes, root })}
<script type="application/json" id="outdoor-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  },
};
